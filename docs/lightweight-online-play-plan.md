# Lightweight online play — implementation plan

Prepared September 9, 2026 against `87afbee962d98b2d96f0a0c081b893bd79d55c9a`. Inputs: the [online-play vision](lightweight-online-play-vision.md), [architecture review](project-review-2026-09-09.md), current source, and repository maintenance guidance. This is a proposed implementation plan, not authorization to start implementation or a claim that these features exist.

Target workflow: architecture/planning at **Astra / High**; implementation at **Astra / Medium**. The packages below specify decisions, boundaries, and observable acceptance criteria so implementation need not repeat the architectural design. This document does not change the active model settings.

## Scope and readiness decision

Implement online play in the **existing debug harness first**, then build the production UI against the resulting session interface. Two trusted people create/join a temporary room, receive opposite sides, exchange complete records, and independently replay them in browser engines. The relay contains no rules implementation and stores no game record.

The new vision supersedes the earlier review's recommendation for server adjudication, authenticated actors, durable server command deduplication, and pinned historical rules implementations. Those were recommendations for an authoritative server, not prerequisites for this relay. Preserve the three useful contracts in this smaller form:

| Earlier contract | First online version |
| --- | --- |
| Session boundary | A client session owns engine access, action permissions, updates, synchronization, and connection lifecycle. The relay owns room membership and temporary seat tokens only. |
| Persistence/recovery | A versioned complete record and browser-local recovery envelope, replayed into a fresh engine before adoption. No database or server recovery history. |
| Lifecycle/outcomes | Structured board outcomes, separate connection state, and explicit disabling of play when disconnected or unsynchronized. Disconnection does not award a win. |

Ship: create/join, creator-selected side, remote moves, full-record verification, status/error display, refresh/reconnect, retained local record, copy and explicit local continuation. Local play remains available without a relay.

Defer: production UI redesign, online resignation controls, undo negotiation, rematches, chat/latency UI, AI, custom online starts, joining existing local games, clocks, no-move rule changes, accounts, spectators, anti-cheat, server persistence, and automatic room recreation. Typed peer messages leave room for these later; do not implement placeholder controllers or generic event infrastructure for them now. Existing local import/resignation semantics remain supported.

## Decisions to carry into implementation

These are recommended first-version defaults, not new hard product requirements. A concrete implementation obstacle may justify a documented adjustment; do not broaden scope merely because another design is possible.

### A. Runtime and ownership

- Keep the current Node 24/TypeScript repository. Add `server/` for a separately built relay and `src/session/`, `src/online/` for client logic. Use a small `shared/` directory for transport envelopes with no engine or DOM imports. A monorepo/package extraction is unnecessary.
- Use native browser WebSocket and a Node WebSocket server using `ws`; pin the selected dependency during implementation. `ws` documents the server API and use of native WebSocket in browsers in its [maintainer documentation](https://github.com/websockets/ws). Do not add a framework, Socket.IO, WebRTC signaling, or a database.
- The server keeps only room/seat/token/socket/activity data in memory. It validates envelope shape, membership, and size; it forwards opaque typed peer bodies without interpreting moves, revisions, outcomes, or acknowledgements.
- Relay identity is room membership, not an account. Give each seat an opaque reconnect token that never enters the peer payload. The relay supplies sender identity from the socket association; clients do not choose a sender seat in the forwarded envelope.
- Keep board rendering unaware of sockets and room policies. It obtains action availability from the session. Selection and apply must use a session-local state generation so a click or async result from an old board cannot mutate a newer session.

### B. Complete game record

Use one explicit JSON record, shared by transmission and local recovery:

```ts
type OnlineGameRecordV1 = {
    formatVersion: 1
    gameId: string                 // random instance ID, distinct from room code
    setup: 'standard-11-v1'         // opening layout identifier, not rules version
    revision: number               // equals moves.length in v1
    moves: string[]                // complete ordered canonical move commands
    stateCheck: {
        positionKey: string        // reconstructed board + engine currentPlayer
        outcome: GameOutcome | null
    }
}
```

`GameOutcome` is defined in P1. A zero-move record is valid. Online v1 contains board moves only; no `---`, arbitrary setup, metadata-driven rules, or history edits. This avoids making the portable text grammar a prerequisite for saving a just-created game. Use the existing parser/resolver; do not invent a third move grammar. Canonical commands use uppercase coordinates and the complete actual captures, sorted by coordinate for stable comparison rather than capture discovery order. Make this a record adapter; do not change legacy engine history ordering.

Decode unknown JSON through runtime checks, bounded strings/arrays, and a fresh engine. Apply each move to that candidate, check its resolved captures against the record's canonical command, then compare the final `stateCheck`. Only successful complete replay can replace the active engine/record. Do not expose a state setter or use non-atomic `applyMoveSequence` on the active engine. `stateCheck` is a deterministic diagnostic equality check, not a security signature. Repetition history and counters are reconstructed rather than accepted from the sender.

The transport carries `protocolVersion`, `messageId`, and sender `clientVersion` from package metadata; record/storage schemas have their own versions. Unsupported wire/record schemas fail clearly. Software version differences alone are allowed; show a nonblocking warning on major-version differences. Successful replay plus matching reconstructed state is the compatibility gate. Do not maintain old rule engines or a compatibility matrix. If replay fails after a deployment, preserve the stored record for export instead of deleting or silently migrating it.

### C. Peer synchronization policy

Full records are the only game-data messages. Small control messages may request synchronization or acknowledge a received record. A successful socket send is **not** peer acceptance.

| Incoming record compared with local canonical history | Client action |
| --- | --- |
| Equal, with matching reconstruction | Acknowledge; do not reapply, append, or redraw as a new move. |
| Strictly extends local history and replays successfully | Adopt atomically, persist, publish a session update, acknowledge. |
| Is a strict prefix of local history | Never roll back; send the current full record. |
| Neither is a prefix, including unequal histories of equal length | Enter synchronization error; retain both records for diagnosis/export; disable online play. |
| Wrong game ID, malformed input, unsupported schema, or replay/state-check mismatch | Reject without modifying current game; show a useful error. |

Revision alone is not evidence of ancestry. Compare canonical move arrays. During established play, expect exactly one extension from the peer controlling the side to move. A larger extension switches to the recovery exchange before adoption; recovery may accept multiple moves only under the prefix/replay policy. Do not reject a recovery suffix simply because it contains both players' past moves.

On joining/reconnecting, both peers exchange records and acknowledge the same current record before enabling moves. Correlate acknowledgements with a specific sent message and record identity, and scope pending work to the current connection generation. An acknowledgement for an old message/connection must not release a new pending move. A bounded timeout requests/resends the current full record, then reports unsynchronized status; never retries an engine move command. No growing offline message queue.

Apply a permitted local move once, retain the updated record, and send it. It can appear locally while awaiting acknowledgement; indicate that state and block further local moves. The receiver may adopt and immediately reply with a move; a valid extending record also proves acceptance of its prefix. Cover this case so acknowledgement timing cannot deadlock play. Loss of connection before acknowledgement retains the local extension for reconciliation; do not silently undo it.

Pause online moves whenever the peer is absent or synchronization is incomplete. Prefer a longer verified prefix-extension regardless of which browser refreshed. A continuously connected peer with a *shorter* record must not erase a move saved just before a disconnect. True branches stop with an error. This is a specific simple policy within the vision's suggested recovery latitude.

### D. Rooms, recovery, and lifecycle

- Creator chooses attackers or defenders; joiner receives the other seat. Use a human-friendly case-insensitive six-character room code with collision retry, and an independent random game instance ID. Only new standard games can create rooms.
- Use typed control requests for create/join/resume/leave and typed responses for assignment/presence/errors. Initial join claims only a never-claimed seat. After both seats are claimed, disconnection reserves each seat for its token; a third client cannot claim a disconnected player's place with the room code.
- Reject a second live connection using the same seat token with an explicit `seat_in_use` error. A refresh can retry while heartbeat detection releases a dead socket. Do not silently evict a live browser or allow two tabs to play one seat. Avoid automatic retry loops on a genuinely duplicated tab.
- Proposed operational defaults: 30-second heartbeat, dead connection after two missed checks, room expiry after 30 minutes with no active sockets, and 24-hour maximum room lifetime. Make these configurable and inject the clock for tests. Heartbeats do not extend the maximum lifetime. Show expiry as a room failure, not a game result. Explicit leave closes the room for online play and notifies the peer; a disconnected socket alone does not.
- Persist a bounded local envelope after every adopted/local move and when room credentials change: storage version, relay endpoint, room/game IDs, seat/token, client version, complete record, and save time. Use a fixed bounded recent-session slot for v1, with explicit replacement; do not build a game library. Never put the token in URLs, copy-game output, or logs.
- Treat storage as untrusted input and replay before restore. Catch unavailable/quota/corruption errors. Keep the current in-memory game usable, visibly report when refresh recovery is unavailable, and preserve export access. Do not fabricate a successful save. An incompatible envelope must not be overwritten automatically by a blank game.
- After refresh, show the recovered game immediately in a non-playable reconnecting state. Resume the same room/seat and run synchronization. Both peers can refresh: local records plus retained in-memory room seats are sufficient while the relay is alive.
- After relay restart/expiry, keep the local game. Offer Copy Game and explicit Continue Locally, which disposes the online session and lets one browser control both sides. It never resumes sending that locally continued branch. Recreating an online room from an old game is deferred.
- Separate `connection` (waiting/connecting/syncing/ready/disconnected/error/closed) from `outcome`. Board endings are derived by replay; connection loss, leave, expiry, and incompatibility never create a win. Both clients stop accepting board moves after a terminal outcome. Final records remain locally recoverable.

### E. Limits and hosting boundary

Use modest configurable limits: initial defaults of 64 KiB per message, 2,048 move entries, 100 simultaneous rooms, and a small per-connection request rate/burst limit. Keep client and relay size limits consistent, check UTF-8 bytes, and reject a local move before committing if its prospective record cannot be sent. Bound slow-socket buffers and clear timers/listeners on shutdown. These are basic resource limits, not an abuse-prevention project.

Keep GitHub Pages for the existing static frontend. Add a configured relay URL; absence of that setting preserves local play. A hosted HTTPS frontend needs a secure WebSocket endpoint; use TLS at the hosting reverse proxy, following [browser WebSocket guidance](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications). Select the actual host after the relay is runnable. Plan a single long-lived process, documented start/build/health commands, and allowed frontend origins. No automatic horizontal scaling or serverless redesign.

Deployment configuration and a local two-browser test are in scope. Provisioning a paid host or publishing to a new account is a separate concrete decision once hosting requirements and artifacts are available; it does not block P1–P7.

## Work packages

Each package below is intended as one focused implementation session. P5 and P7 have explicit fallback splits if their failure-path work grows. Use **eight planned sessions, with two reserved continuations**, as a conservative scheduling estimate rather than promising the previous three-session pace. Scope and acceptance gates are the sizing mechanism; no fixed subscription token allowance is assumed or guaranteed.

Do packages in order. P4 depends on P2 but does not need UI work; this is a dependency observation, not a request for parallel agents. Do not combine P5/P7 with unrelated cleanup. Preserve passing build/type checks at every stopping point.

### P1 — Structured engine outcomes

Restored September 13 from the agreed package scope after the original appendix write was interrupted.

**Depends on:** nothing. **Result:** existing wins have explicit machine-readable causes without changing legality or terminal precedence.

Add `GameOutcome = { winner: Player; reason: ... }` and `GameState.outcome: GameOutcome | null`. Reasons: king capture, king escape, exit fort, encirclement, repetition, and resignation. Introduce an outcome-returning board evaluator in `src/rules.ts`; preserve `getGameStatusAfterMove` as a compatibility wrapper. The resolver evaluates once, preserves existing board-win/repetition precedence, and carries the outcome into the engine. Keep `GameStatus` and existing method signatures available; derive status from the outcome. Reset sets a null outcome; load/replay reconstructs it; resignation retains its existing API/grammar restrictions. Clone the new outcome object in detached snapshots.

**Acceptance:** existing ending scenarios report the expected reason/winner; repetition and immediate-win precedence remain unchanged; resignation and load/save round-trip preserve outcome; mutating a returned outcome cannot change engine state; failed commands retain the old outcome. Add assertions to existing scenarios rather than duplicating the fort suite. No no-legal-move policy change.

**Stop:** engine/contracts/tests/documentation only. No transport, session, or new UI controls. Run tests, source/config type checks, tooling formatting check, and production build. Record results and the next checkpoint in [online-play progress](online-play-progress.md).

### P2 — Complete-record codec and protocol contracts

Restored from the agreed scope on September 14. Depends on P1. Implement pure,
bounded record encoding/decoding with zero-move support, canonical resolved
captures, fresh-engine replay, final position/outcome checks, and prefix
comparison. Failed decoding must not mutate an active engine. Retain the existing
portable format and engine history ordering.

Define runtime-checked room control/assignment/presence/error envelopes and an
opaque typed peer envelope in engine-independent shared code. Client-owned bodies
cover synchronization requests, full game records, and correlated acknowledgements.
Include package-derived client version separately from protocol/record versions;
major software differences warn without rejecting valid replay. Document samples
and acknowledgement connection-generation responsibilities in `docs/online-protocol.md`.

Acceptance covers empty/capture/terminal records, stable canonical comparisons,
invalid/partial replay, omitted captures, bounds, versions, opaque future messages,
and acknowledgement mismatches. Run repository tests/checks/build. Stop before
sockets, server implementation, storage, or P3's session/UI adaptation.

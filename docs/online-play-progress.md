# Online-play implementation progress

## P1 — Complete (September 13, 2026)

Implemented structured outcomes only. No UI, transport, session, rules-policy, dependency, or notation changes.

### Contracts and files

- `src/types.ts`: added `GameOutcome` and required `GameState.outcome`. Outcome is null while in progress, otherwise `{ winner, reason }`; reasons are `king_capture`, `king_escape`, `exit_fort`, `encirclement`, `repetition`, and `resignation`.
- `src/rules.ts`: added `getGameOutcomeAfterMove` for post-capture board evaluation and `statusForOutcome`. Retained `getGameStatusAfterMove` as a compatibility wrapper. Evaluation ordering is unchanged.
- `src/validator.ts`: successful `MoveResolution` includes outcome. Board outcome is evaluated once; repetition supplies an attacker outcome only when no immediate board win exists. Legacy validation result shapes remain unchanged.
- `src/HnefataflEngine.ts`: initialization/reset clear outcome; moves and resignation install it; reads and successful results clone it. Atomic loading reconstructs it through replay. Existing resignation restrictions and terminal current-player semantics remain unchanged.
- Existing engine/transition/game-format/state tests now assert causes, replay and precedence; five added snapshot cases cover reads, single moves, sequences, imports, and resignation. Failed commands/imports/resets preserve completed outcomes; successful reset clears them without changing prior snapshots.
- README documents API migration and new rule helpers. Restored P1's package scope in the plan; the original P2–P8 detailed appendix was not present on disk after the earlier tool interruption.

### Verification

Node `v24.19.0`, installed dependencies. npm was unavailable in PATH, so the documented direct equivalents were used:

| Check | Result |
| --- | --- |
| `node node_modules/vitest/vitest.mjs run` | 432 tests passed, 13 files |
| `node node_modules/typescript/bin/tsc --noEmit` | Passed |
| `node node_modules/typescript/bin/tsc --project tsconfig.node.json` | Passed |
| `node node_modules/prettier/bin/prettier.cjs --check package.json package-lock.json 'tsconfig*.json' vite.config.ts .prettierrc '.github/workflows/*.yml'` | Passed |
| `node node_modules/vite/bin/vite.js build` | Passed, 25 modules |

Tests/build initially hit the documented sandbox Vite configuration-access error; the permitted filesystem-access retries passed. No browser check was needed because no UI code changed. No fresh dependency installation or hosted CI run was performed. No unresolved implementation/test failures.

### Handoff after P1 (historical)

Implement complete-record codec and protocol contracts under sections B/C of [the plan](lightweight-online-play-plan.md). Restore the detailed P2 scope before coding: zero-move records, canonical resolved captures, bounded runtime decoding, fresh-engine atomic replay, final state/outcome checks, prefix comparison, independent software/schema versions, room envelopes, generic opaque peer messages, and correlated sync acknowledgements. Add pure tests and a protocol reference; no sockets/storage yet. Preserve the browser-engine/opaque-relay boundary. Stop before P3's local session/UI adaptation.

## P2 — Complete (September 14, 2026)

Implemented pure complete-record codecs and runtime-checked protocol contracts.
No sockets, server, online session, storage, or UI changes. Restored P2's detailed
scope in the plan; P3–P8's detailed appendix remains absent from the interrupted
planning write and should be restored package-by-package from the agreed scope.

### Contracts and files

- `shared/json.ts`: detached JSON decoding with UTF-8 byte limits and shared
  result/identifier helpers; no engine/Node imports.
- `shared/relayProtocol.ts`: create/join/resume/leave/peer requests and assignment,
  presence/relayed/error responses. Generic peer bodies remain opaque to this
  module. Runtime schema checks are separate from future socket membership checks.
  Protocol version is independent of software version; major software differences
  produce a nonblocking diagnostic.
- `src/online/record.ts`: standard-opening command encoder, independent full
  record decoder/replay, stable capture ordering, and canonical ancestry comparison.
  Empty games are supported. Receivers require every actual capture and verify
  reconstructed position/currentPlayer/outcome. Candidate engines are returned
  only after complete success; no active engine is passed in or changed.
- `src/online/messages.ts`: client-owned synchronization requests, record replay,
  and exact message/game/revision/sync-ID acknowledgement correlation. The caller
  still must enforce connection-generation identity in P5. Unknown typed peer
  features return an unsupported result; malformed core messages fail.
- `src/online/clientVersion.ts` and Vite config: package-derived version injection
  without a browser-side Node import. Type-check root now includes repository-level
  `shared/`; source/config checks and the browser entry remain functional.
- Three test files add 61 cases covering records, protocol envelopes and peer
  decoding. Includes a real standard-opening multiple-capture replay, repetition
  recovery, malformed/oversized records, omission of captures, independent ownership,
  software/protocol version distinctions, future payloads, and ack mismatches.
- [Protocol reference](online-protocol.md) documents APIs, samples and integration
  responsibilities; README and maintenance guidance describe the new boundaries.

Implementation detail added to the plan's limits: records are capped at **60 KiB**
inside a **64 KiB** wire limit, reserving room for relay/peer envelopes. Total byte
limits remain authoritative even under the 2,048-move/512-character command caps.
P4/P5 must preflight their complete forwarded/outbound envelopes too.

### Verification

Node 24 / installed dependencies, using the same direct executable equivalents as
P1 because npm was unavailable in this environment:

| Check | Result |
| --- | --- |
| Full Vitest suite | **493 passed**, 16 files |
| Record tests after final sparse-array input correction | **29 passed** |
| Source and Vite configuration TypeScript checks | Passed, including after final correction |
| Tooling formatting check | Passed |
| Vite production build | Passed, 25 modules; browser output unchanged |
| Diff whitespace check | Passed |

Tests/build used permitted filesystem-access execution for the previously
documented Vite configuration sandbox restriction. A parameterized test-input
construction error was corrected during focused verification; no unresolved
failures remain. No fresh install, hosted CI, browser or server test was run;
P2 adds no UI/socket behavior. New online modules are not yet wired into the app.

### Handoff after P2 (historical)

Restore P3's detailed scope: introduce a local `GameSession` interface/implementation
with detached views, subscriptions, action capabilities, async move submission,
local import/export, state-generation guards and disposal. Adapt existing debug
commands/selection to this interface and render from session updates, preserving
all current local interaction behavior. Clear stale selection/async work when the
session changes; do not reset the engine implicitly when binding UI. Verify the
existing browser smoke paths. No online controls or AI hierarchy yet; P4 later
implements the ephemeral relay against P2's shared protocol.

## P3 — Complete (September 14, 2026)

Restored the P3 package scope and implemented the local session boundary plus
debug UI adaptation. No online controls, relay, AI hierarchy, or rules changes.

### Contracts and files

- `src/session/GameSession.ts`: detached `SessionView`, action capabilities,
  subscription/unsubscribe, generation-checked commands, async `submitMove`,
  local import/export/reset and disposal. `SessionResult` includes generation.
- `src/session/LocalGameSession.ts`: private engine ownership; both sides local;
  one initial subscription view and updates on successful changes. Failed actions
  leave state/generation unchanged. Import/reset/disposal invalidate queued moves.
  Views, subscriber data and command results are independent. Closed sessions
  disable actions and release observers; callback exceptions cannot fail a commit.
- `src/ui/commands.ts` and `selection.ts`: use the session interface. Subscription
  updates render and clear stale selection. Capability checks guard controls and
  session methods. Manual rejection retains highlights, automatic rejection clears
  them, and Auto Apply retains precedence. Async results/old board callbacks cannot
  overwrite a newer view/binding. Rebinding removes old UI callbacks without
  resetting the supplied game; caller remains responsible for session disposal.
- `src/ui/main.ts` and `src/vite-env.d.ts`: explicit local session bootstrap and
  Vite hot-replacement cleanup. Board rendering remains independent of mode/sockets.
- `LocalGameSession.test.ts`: 11 new cases for generations, duplicate queued
  submissions, import/reset/disposal cancellation, observer ownership, failures,
  export eligibility, observer errors and cleanup. README/maintenance guidance
  document the contract and its ownership requirements.

### Verification

Node 24, installed dependencies; documented direct executable equivalents used:

| Check | Result |
| --- | --- |
| Full Vitest suite | **504 passed**, 17 files |
| Source and Vite config TypeScript checks | Passed |
| Tooling formatting | Passed |
| Production build | Passed, 26 modules |
| Diff whitespace | Passed |

Tests/build/dev server used permitted filesystem access for the known Vite
configuration sandbox restriction. No dependencies or configuration versions
changed; no fresh install or hosted CI run.

Browser smoke at the local `/hnefatafl/` URL passed: 121-square initial board,
attacker-first manual move, highlights and clear-on-success, both-toggles Auto
Apply precedence, automatic capture validation, highlight visibility toggling,
capture counters/history after import, invalid import preserving selection/state,
manual rejection preserving highlights, canonical Copy Game, repetition terminal
controls/history, and modal open/close. No browser console errors observed.

A temporary browser fixture using the actual bindings and controlled delayed
sessions also passed six checks: binding an already-loaded game does not reset it;
old callbacks/results cannot alter a replacement; old cleanup cannot remove new
handlers; import invalidates a delayed submission/result; automatic rejection
clears selection and shows its error; unsubscribing removes callbacks and stops
rendering. The temporary fixture was removed after verification. This is browser
verification evidence, not a new permanent browser-test runner (P8 remains later).

No unresolved failures at the P3 checkpoint. P4 is now complete below.

### Handoff after P3 — P4 (historical)

Restore P4's detailed scope from the agreed plan: a separately runnable Node 24
ephemeral relay implementing P2's engine-independent envelopes. In-memory rooms,
side assignment, room/game IDs, private reconnect tokens, socket-bound sender
identity, seat reservation, presence, explicit leave, heartbeat/expiry and basic
resource limits. Add deterministic room tests plus real two-client opaque relay
tests, server build/typecheck scripts and separate output directory. No engine
imports, stored game records, public deployment or online UI work. P5 later supplies
the online session implementation of P3's interface.

## P4 — Complete (September 14, 2026)

Implemented the standalone ephemeral relay, with no engine imports or online UI
integration. Existing P3 changes remain in the working tree.

- `server/rooms.ts`: room/game identifiers, random private seat tokens, creator
  side selection, opposite-side join, reserved disconnected seats, token resume,
  duplicate-live-seat refusal, socket-bound forwarding, presence, leave, idle and
  absolute expiry. Room metadata never retains peer bodies. Expiry cannot assign
  a new room to a connection that is already being closed.
- `server/relay.ts`: HTTP health and WebSocket upgrade endpoints, exact browser
  origin checks, bounded messages/output buffers/connections/rates, heartbeat and
  unjoined socket timeout, explicit startup/shutdown. Unknown peer body types pass
  through unchanged; incoming identity claims cannot redirect messages. Failed
  sends report delivery failure; client acknowledgements remain necessary.
- `server/config.ts` / `main.ts`: validated environment settings, package-derived
  server version, shutdown signal handlers, no payload/token logging.
- Pinned `ws` 8.21.3 and `@types/ws` 8.18.1; added server build/start/test scripts,
  NodeNext server type checking/output, and CI server compilation. Browser Pages
  deployment still uploads only `dist/`. Shared relay imports now use a `.js`
  extension for emitted Node ESM compatibility.
- [Relay operation](relay.md) documents local startup, all environment settings,
  protocol limits, token/presence semantics, restart loss and deployment boundaries.

### Verification

Node `v24.19.0`; dependencies/lockfile installed with scripts disabled. The npm
launcher initially selected Node 20 and reported the repository engine warning;
installation was repeated successfully using the explicit Node 24 runtime and
npm CLI. Direct repository check equivalents were used.

| Check | Result |
| --- | --- |
| Full Vitest suite | **521 passed**, 19 files |
| Final server regression run after adding expiry guard/test | **18 passed**, 2 files (522 total tests now present) |
| Source/tests, Vite config and server TypeScript checks | Passed |
| Tooling formatting | Passed |
| Vite production build | Passed, 26 modules |
| Node server build | Passed |
| Compiled CLI smoke | Started on ephemeral loopback port; GET health returned 200/ok; child process cleaned up |

Deterministic room tests cover both sides, reservation/resume, version pinning,
cross-room isolation, opaque bodies, leave/expiry, capacity/code collisions and
rate/config validation. Real WebSocket tests cover forwarding both directions,
third-seat refusal, reconnect, origins/path/health, connection cap, malformed and
binary/oversized messages, final envelope growth, buffer bound, heartbeat/unjoined
timeouts, timer expiry, full/idempotent shutdown, and restart loss/port reuse.

Initial validation caught a close-handler termination that suppressed ws's 1009
oversize close code; fixed and verified. Short wall-clock expiry tests were flaky
under full-suite CPU contention; injected clocks now control those deadlines
while real sockets and interval callbacks exercise the transport. No unresolved
test failures. Tests/build used permitted filesystem access for Vite's known
configuration loader restriction. No public deployment or hosted CI execution.
P4 changes no browser UI behavior, so P3's browser smoke was not repeated.

### Handoff after P4 — P5 (historical)

Implement the online `GameSession` using P2 records/envelopes and P3's interface:
connection generations, seat/capability gating, complete-record synchronization,
atomic replay/adoption, stale/duplicate/branch handling and correlated peer
acknowledgements. Restore the detailed P5 scope before starting. At this checkpoint P5 was not started;
the debug UI continues to run locally.

## P5 — Complete (September 14, 2026)

Implemented `OnlineGameSession` behind the existing session interface. Restored
the package scope from the agreed plan's synchronization and lifecycle decisions.
No debug UI controls, browser storage or public deployment were added.

- Native WebSocket adapter with listener cleanup and injectable transport/timers.
  Create/join/resume, explicit reconnect, leave and dispose. Replaced connections
  invalidate callbacks, pending acknowledgements and timers.
- Detached state/status, credential-free online view, explicit private recovery
  snapshot access and retained competing-record access. Recovered records replay
  before connecting; invalid recovery input throws without creating a blank game.
- Seat/turn/outcome/readiness capability checks, async generation checks, candidate
  replay and both-envelope size preflight before local commit. Send failures retain
  the local extension. Online import/reset are rejected; portable export survives
  loss of the room for nonempty games.
- Complete-record exchange, atomic prefix extension, equal-record deduplication,
  no rollback, branch retention/error, correlated current-connection acceptance,
  immediate peer replies, one-move/side checking in established play, and requested
  multi-move recovery. Unknown features are harmless; major versions warn.
- A 5-second default deadline permits one record resynchronization attempt and
  then stops unsynchronized. No offline queue or engine-command retries. Peer
  absence/room errors never set a board outcome.
- [Online session API](online-session.md) documents lifecycle, command semantics,
  private recovery data, timeout behavior and the P6/P7 integration boundaries.

### Verification

| Check | Result |
| --- | --- |
| Full Vitest suite, explicit Node 24 | **534 passed**, 20 files |
| Source/tests and Vite config TypeScript checks | Passed |
| Server type check/build | Passed |
| Tooling formatting | Passed |
| Browser production build | Passed, 26 modules |
| Diff whitespace | Passed |

Twelve P5 tests cover controlled message ordering/loss, exact/stale acks, duplicate
records, immediate reply, requested recovery, divergent/malformed/foreign/out-of-turn
records, detached snapshots/subscriptions, capabilities, absence/room loss, timeout
budgets, send failure, wire preflight, disposal and terminal restore. Real native
WebSocket pairs exercise the actual relay: both sides move, a shorter restored
browser catches up, a retained unacknowledged move survives reconnect to a
continuously connected shorter peer, both peers refresh, and explicit leave
preserves the record.

An initial integration run selected the elevated shell's older Node executable,
which lacks native WebSocket. The explicit supported Node 24 executable passed;
no application workaround or dependency was added. Tests/build used permitted
filesystem access for Vite's known configuration-loader restriction. No fresh
dependency installation or hosted CI run. Browser UI behavior is unchanged; no
browser UI smoke was repeated. No unresolved check failures.

### Handoff after P5 — P6 (historical)

Wire create/join/side selection and online status into the existing debug UI using
the session boundary. Keep board rendering transport-independent and preserve
local mode when no relay is configured. Restore the detailed P6 package scope
before implementation. Storage-envelope persistence/refresh UX remains P7;
P5 supplies the detached recovery API but does not persist anything automatically.

## P6 — Complete (September 14, 2026)

Added the existing debug UI's online flow: chosen-side create, case-insensitive
join, copy room code, assigned side, connection/acceptance/error/warning status,
deliberate reconnect, leave, new local game and explicit local continuation.
`bindSessionControls` owns replacement and cleanup; board commands remain on
`GameSession`. Nonempty game replacement and leaving/continuing online games use
inline confirmation with cancellation. Continuation prepares a local replay before
disposing the online source. Online load input follows import capability.

Added optional `VITE_RELAY_URL`, `.env.example`, ignored local overrides and setup
documentation. Missing/invalid configuration preserves local play. Tokens never
enter the controls or clipboard. The UI explicitly states that refresh recovery
is not yet available; no storage or public deployment was added.

Browser testing found P5's default timer functions were invoked with an options
object receiver, which browsers reject. Defaults now call timers through wrapper
functions; actual browser creation/join/synchronization verifies the fix.

### Verification

| Check | Result |
| --- | --- |
| Full Vitest suite, explicit Node 24 | **534 passed**, 20 files |
| Source/tests, Vite config, server TypeScript/build | Passed |
| Tooling formatting | Passed |
| Browser production build | Passed, 34 modules |
| Browser UI checks | Passed, details below |

Two actual browser tabs against the relay verified both creator-side choices,
opposite-side join, readiness/turn gating, three moves including a capture,
matching history/counters, 121-square board, selection/highlight toggling and
Auto Apply precedence with both toggles checked. Reserved disconnected seats
reject a fresh join. Leave closes online play and retains the board. Continue
Locally cancellation preserves the online session; confirmation retains moves,
restores local import/control and leaves the peer waiting. Copy Room Code was
read back as the six-character code only; Copy Game reports success.

Relay shutdown disables moves while leaving Copy Game available. Restart followed
by Reconnect reports room_not_found without losing history. Local-only configuration
disables online setup, keeps local controls available, and supports validated
import, invalid-import preservation, terminal repetition display/disabled moves,
new-game replacement and modal open/close. Screenshot inspection found the new
controls readable within the existing debug layout. No peer console errors observed.

The browser workflow was interrupted by an automatic-review model usage limit;
verification resumed after the user's continuation request. All checks above
completed afterward. Tests/build used the established Vite filesystem permission
retry. No dependency changes or hosted CI run. Permanent browser automation remains
P8; these were direct browser acceptance checks.

### Handoff after P6 — P7 (historical)

Add bounded versioned browser recovery storage, validated restore and refresh/resume
UX, save-failure reporting and preserved incompatible records. Use P5's recovery
snapshot and P6's session owner without exposing tokens. Restore the detailed P7
scope before starting. No P7 work has started.

## P7 — Complete (September 14, 2026)

Implemented bounded version-1 browser recovery in `src/online/recovery.ts` and
connected it to the UI session owner. One localStorage slot per origin retains
endpoint, seat credentials, client version, save time, complete record, resume
intent and optional conflicting history. It saves room assignment/zero moves,
local unacknowledged commits, adopted records and lifecycle intent. Neither the
engine nor relay knows about storage.

Untrusted saves are bounded and independently replayed before restoration. Active
saves resume only against the matching configured relay; other valid saves open
for inert review. `OnlineGameSession.autoConnect: false` supports that path.
Leave/new-local/continuation disables automatic resume of the saved online record.
Continue Locally retains the prior online snapshot for review; local continuation
moves are explicitly not autosaved and never sent online.

Incompatible data remains byte-for-byte available through a clearly labeled private
backup download. New online sessions require confirmation before replacing a saved
slot, and only replace it after assignment. Storage getter/read/write/quota/readback
failures show recovery warnings without disabling in-memory play. Stale-write and
prefix/seat guards protect existing saves; unchanged restores do not rewrite
timestamps or disrupt the original tab. These are bounded stale-write safeguards,
not transactional multi-tab storage. Branch conflicts remain in private backups
with automatic reconnect disabled, including when reviewing/continuing them.

See [browser recovery](browser-recovery.md) for API, limits, one-origin behavior,
backup privacy and refresh/local-continuation semantics.

### Verification

| Check | Result |
| --- | --- |
| Full Vitest suite, explicit Node 24 | **547 passed**, 21 files |
| Source/tests, Vite configuration and server TypeScript/build | Passed |
| Tooling formatting | Passed |
| Browser production build | Passed, 35 modules |
| Diff whitespace | Passed |

Thirteen new recovery tests cover empty/capture/terminal records, metadata/schema/
endpoint/credential/replay rejection, incompatible-byte preservation and explicit
replacement, detached snapshots, newer/shorter/divergent/other-seat writes, duplicate
restores, repeated invalid loads, access/quota/silent-write failures, retained
branches, and review-only sessions that never create sockets.

Actual browser clients on `127.0.0.1` and `localhost` (separate localStorage origins)
verified assignment save, one-player refresh, both-player refresh after a capture,
matching histories and resumed turns. A same-origin duplicate tab reports
seat_in_use while the first tab continues saving moves. Continue Locally marks the
online snapshot inactive; refresh opens local mode and Review Saved Game opens the
four-move record without reconnect capability. Relay restart followed by refresh
reports room_not_found while retaining all four moves and Copy Game; local
continuation still works. No browser error logs observed on the checked peer.

The private backup file was generated and its schema/revision/inactive flag were
verified without logging credentials. The browser download-event wait timed out,
but the resulting file was present and valid; the test backup was removed afterward.
Storage fault paths were verified with injected storage tests, not browser quota
exhaustion. Test tabs and owned relay/Vite processes were cleaned up. No dependencies,
public deployment or hosted CI changed. No unresolved check failures.

### Handoff after P7 — P8 (historical)

Restore the final integration/hardening package from the plan: repeatable browser
acceptance coverage, deployment/run guidance and end-to-end failure-path review.
Keep production UI redesign and additional game-server features outside this work.
Public hosting still requires its separate concrete deployment decision. P8 has
not started.

## P8 — Complete (September 15, 2026)

Added a repeatable development browser acceptance entry using the actual debug
markup, command bindings, session owner, native WebSockets and local relay.
Scoped element lookup and optional session-owner dependencies let fixtures use
independent memory storage and controlled failures while production defaults
remain unchanged. The runner is invoked manually in a browser and is not part
of Vitest or hosted CI. It adds no dependency and is absent from `dist/`.

Final contract review corrected a concrete mismatch: UI/session relay addresses
could contain queries that recovery storage rejected. All three now share bounded
endpoint validation; HTTPS pages additionally require WSS. Existing tests plus
the new endpoint test cover the affected contracts.

Added the acceptance matrix/manual release gate and single-process relay
deployment/rollback guide. The Pages build accepts optional public Actions
variable `VITE_RELAY_URL`. No repository variable, public host or deployment was
created. Hosting and cross-network validation remain a separate deployment step.

### Verification

- Explicit Node 24: **548 tests passed across 22 files**.
- Source/tests, Vite configuration and server TypeScript checks passed.
- Tooling formatting and both builds passed; browser build transformed 36 modules.
- Browser runner: **9 passed; 0 failed**, with no browser error logs observed.
  Cases cover local selection/auto-apply/imports, two-player capture play, saved
  owner remounts, quota failure, duplicate seats, changed endpoints, incompatible
  save replacement, local continuation and lost acceptance timeout.
- Inspected production output: only app HTML and bundled JS/CSS, no test entry.

Checks used installed dependencies and the established Vite filesystem-access
retry. P6/P7 entries retain the actual two-origin refresh, relay-restart and
private-backup evidence; owner remount tests do not claim full browser navigation
or process-crash coverage. Hosted CI and public-network checks were not run.

### Handoff after P8

P1–P8 are complete for the trusted lightweight online-play scope. Production UI
development can build on `GameSession`, capabilities, detached views, structured
outcomes and the recovery contracts. Keep rules, synchronization and persistence
outside board rendering. The final review found no further major architectural
blocker within this scope. One-origin storage, ephemeral rooms, local-continuation
save limits and future server requirements remain explicit in the
[acceptance handoff](online-acceptance.md) and [deployment guide](relay-deployment.md).

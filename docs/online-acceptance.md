# Online-play acceptance and handoff

Production online controls are now implemented. See
[the production online guide](production-online-client.md) and the online section
of `client-acceptance.html` for the new consumer's checks. The P1–P8 debug-harness
baseline and historical release handoff below remain useful reference evidence.

P1–P8 implement lightweight trusted two-player play in the debug UI. The browser
owns the rules and complete record; the relay only owns ephemeral room membership.
The production UI can use `GameSession` without taking ownership of the engine,
transport or persistence policy. This is not an authoritative public game platform.

## Repeatable browser checks

Use Node 24. In one terminal:

```sh
npm run build:server
npm run start:server
```

In another run `npm run dev`. Open
`http://localhost:5173/acceptance.html`, enter the local relay endpoint
(default `ws://127.0.0.1:8787/relay`) and click **Run acceptance checks**. If Vite
chooses a different port, configure that exact origin in `RELAY_ORIGINS` and restart
the relay. The expected result is **9 passed; 0 failed**. Failed rows describe the
condition that timed out or violated the contract. A wrong origin/port causes
assignment failures and is not evidence of a game-rule defect.

The checked-in runner uses the actual `public/debug.html` markup, board commands,
session controls, browser timers, native WebSockets and live relay. UI instances
are mounted with scoped element lookup and independent memory-backed storage ports.
It never reads/replaces the user's localStorage, copies credentials or downloads
files. Quota failures and dropped peer sends are injected explicitly. Each case
closes its sessions and fixtures, including after failure. Only loopback relay
addresses are accepted by this runner. It is a development entry, omitted from
the normal `dist/` build, and adds no browser-test dependency.

The runner is invoked in a browser, not by `npm test` or hosted CI. Owner remounts
exercise teardown and restoration using only saved data; they do not simulate a
browser process crash or a full navigation. Real refresh and clipboard/download
behavior still have the small manual gate below. No claim of cross-browser or
public-network coverage follows from a single browser run.

| Contract | Repeatable evidence |
| --- | --- |
| Local mode, imports, auto-apply precedence, selection clearing | Browser runner plus local-session tests |
| Assignment, side/turn gating, captures, same full record | Browser runner and real relay session tests |
| Refresh-style recovery, reserved seats, duplicate tab | Browser runner and reconnect tests |
| Storage quota, incompatible saves, replacement confirmation | Browser runner plus recovery fault tests |
| Changed endpoint cannot receive saved credentials | Browser runner and endpoint/review tests |
| Local continuation disables automatic resume | Browser runner and recovery tests |
| Lost acceptance never replays an engine command | Browser runner and controlled timeout/ack tests |
| Branches, malformed records, stale acks/callbacks, terminal records | Session, record and recovery unit tests |
| Room lifetime/idle expiry, heartbeat, byte/buffer/rate/capacity limits | Room and real WebSocket relay tests |

## Release gate

Run `npm test`, `npm run typecheck`, `npm run format:check`, `npm run build` and
`npm run build:server`. Then run the browser acceptance page. Inspect `dist/` to
confirm it contains the app only, with no acceptance page or test entry.

Before an actual release, use two clean profiles/origins with independent storage:

1. Create/join in the debug harness (`debug.html`; production online wiring is a
   later client milestone). Apply moves on each side and one capture. Confirm
   equal history, turn gating, capture display and successful recovery saves.
2. Refresh one player, then both. Confirm the same room/side/history is recovered
   and moves remain disabled until synchronization. Duplicate a live seat and
   confirm refusal rather than eviction.
3. Copy Game and Copy Room Code; check notation/code only. Download a private
   recovery backup locally and keep it private. Confirm invalid import preserves
   local state and terminal games disable moves.
4. Stop/restart the relay. Reconnect or refresh must preserve the game, report room
   loss, and retain export/local continuation. Continue Locally must not send new
   moves or automatically resume the online branch after refresh.
5. Check local play with no configured relay. On a deployed HTTPS frontend check
   the actual WSS endpoint and allowed origin from two independent networks.

P6/P7 progress entries record the full local manual gate already exercised. P8
adds the repeatable browser gate; hosting/network validation remains pending until
a host is selected and deployment is explicitly authorized.

## Readiness and limits

The useful architecture contracts are established: detached session views and
capabilities, replay-validated versioned recovery, explicit board outcomes, and
connection-generation-scoped acceptance. The final integration review found one
concrete mismatch: UI/session URLs could contain queries that storage refused.
`validRelayEndpoint` now applies the same bounded no-credentials/no-query/no-fragment
contract across all three, with HTTPS-page WSS gating in the UI.

Known limits remain intentional: one recent online identity per browser origin,
local continuation is not autosaved, no private-backup import/library, no server
game history, and room loss on server restart. Storage stale-write checks are not
a transactional cross-tab lock. Client software may differ; replay is the rules
compatibility gate, not an old-engine registry. Public abuse prevention, accounts,
matchmaking, clocks and server adjudication remain future requirements.

The first local production client now lives at the default entry; see
[local client development](production-client.md). Online controls remain in
`debug.html` until integrated into the production client. Keep the debug harness
and acceptance runner as reference consumers. See
[deployment handoff](relay-deployment.md), [session API](online-session.md) and
[browser recovery](browser-recovery.md).

# Lightweight online relay

P4 supplies the standalone relay. P5 implements the [online session](online-session.md);
P6 connects the debug UI's room controls to it.
The server forwards opaque peer messages and owns only room/connection metadata.
It does not import the game engine, validate moves, store records, or acknowledge
that an opponent applied a move. See [the protocol](online-protocol.md).

## Run locally

Use Node 24.x. From the repository root:

```sh
npm ci
npm run build:server
npm run start:server
```

The default endpoints are `ws://127.0.0.1:8787/relay` and
`http://127.0.0.1:8787/health`. GET health returns `{"status":"ok"}` without
room details. Other paths return 404. `npm run test:server` runs deterministic
room tests and loopback WebSocket integration tests; `npm test` includes them.
`npm run typecheck` checks browser/tests, Vite configuration, and server code.

The NodeNext server build emits `server/` and engine-independent `shared/` modules
under ignored `dist-server/`. Keep that directory beside the root `package.json`
and installed production dependencies when running it. `start:server` uses the
compiled entry and reads the package version; rebuild after source changes.
The browser build remains in `dist/`. CI builds both, but only uploads the browser
artifact to Pages. No server hosting is configured.

## Debug UI setup

Copy `.env.example` to `.env.local`, or set `VITE_RELAY_URL` before running Vite:

```powershell
$env:VITE_RELAY_URL = 'ws://127.0.0.1:8787/relay'
npm run dev
```

The URL is a public build-time setting, never a place for tokens. Restart Vite
after changing it; production builds need the setting at build time. No URL (or
an invalid URL) disables Create/Join while leaving local play available. HTTPS
pages require a `wss://` endpoint. If Vite uses another port, include its exact
origin in `RELAY_ORIGINS` before starting the relay.

Open the UI in two tabs. Choose a side and Create Room in one, then enter the
six-character code and Join Room in the other. Each browser controls its assigned
side only after synchronization. Status distinguishes waiting, synchronization,
turn, disconnection and room errors; board outcome remains separate. Load is
disabled online. Copy Room Code copies only the code; Copy Game copies notation.

Reconnect retries the current room/seat after a connection error. A relay restart
loses rooms and displays an error while retaining the board. Leave Room explicitly
closes online play for both players. Continue Locally replays the current game
into a local session, disconnects this browser and enables control of both sides;
subsequent local moves are never sent. New Local Game starts a fresh board.
Replacement/continuation/leave actions ask for confirmation when appropriate.

P6 does not save browser recovery data. Keep the tab open during play; Copy Game
before refreshing if you want to retain the moves. Refresh/resume storage and UX
are P7. Public hosting and the production UI redesign remain later work.

## Configuration

Set environment variables before starting. Integer limits must be positive;
port 0 selects an ephemeral port. The process fails startup for invalid settings.

| Variable | Default | Meaning |
| --- | --- | --- |
| `RELAY_HOST` | `127.0.0.1` | Bind address |
| `RELAY_PORT` | `8787` | TCP port, 0–65535 |
| `RELAY_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated exact browser origins; empty rejects all browser origins |
| `RELAY_MAX_CONNECTIONS` | `250` | Concurrent WebSocket cap |
| `RELAY_MAX_ROOMS` | `100` | In-memory room cap |
| `RELAY_MAX_BUFFER_BYTES` | `262144` | Per-socket buffered output plus next message limit |
| `RELAY_RATE` | `10` | Messages refilled per second per socket |
| `RELAY_BURST` | `30` | Initial/maximum message budget |
| `RELAY_HEARTBEAT_MS` | `30000` | Ping/sweep interval; two intervals without pong terminate a socket |
| `RELAY_HANDSHAKE_MS` | `60000` | Maximum connected time without occupying a room seat |
| `RELAY_ROOM_IDLE_MS` | `1800000` | Room expiry after both players disconnect |
| `RELAY_ROOM_LIFETIME_MS` | `86400000` | Absolute room lifetime, including active games |

Expiry and unjoined-connection cleanup run at heartbeat intervals. Requests also
sweep expired rooms before handling. A live player prevents idle expiry; absolute
expiry always applies. An unjoined connection that responds to pings still times
out. Browser origins include scheme and port, without paths or trailing slashes.
Clients without an Origin header are allowed for native clients and diagnostics;
the allowlist is not authentication. Malformed requests consume the rate budget.

For PowerShell, for example:

```powershell
$env:RELAY_PORT = '8788'
$env:RELAY_ORIGINS = 'http://localhost:5173'
npm run start:server
```

The shared protocol caps UTF-8 JSON messages at 64 KiB. Binary frames are rejected
and compression is disabled. Relayed envelopes add identity fields, so an incoming
message near the cap can produce `delivery_failed` if its outgoing envelope is
too large. A slow socket exceeding the output buffer limit is terminated. Rate
violations close with 1008, binary frames with 1003, oversized frames with 1009.
Abrupt/heartbeat/buffer disconnects may be observed as 1006 by the client.

## Room and restart behavior

Create chooses the creator's side, allocates a random six-character code, an
independent game UUID and a private 256-bit reconnect token. Join gets the other
side and a separate token. A claimed seat remains reserved after disconnect;
the code cannot reclaim it. Resume requires the code, game ID and seat token.
A live seat rejects duplicate resume. Tokens travel only in assignments to their
owner and resume requests; do not put them in invitation URLs or logs.

Each socket can occupy one seat. Forwarded sender side/game ID come from that
membership. The client version is pinned until reconnect. Presence reports the
other socket's connection, not successful game synchronization. Forwarding has
no queue/history for an absent opponent. Clients must use P2's correlated peer
acknowledgements and synchronize their records after reconnect.

Explicit leave closes the entire room and notifies both connected players with
`room_closed`. Idle/absolute expiry does the same. SIGINT/SIGTERM closes listeners,
timers and connections. All room metadata disappears on restart; old invitations
and tokens cannot recover it. Even if a short code is later reused, the game UUID
prevents resuming the wrong game. Clients retain their game records separately.

This is a single-process trusted-play relay. Running multiple instances requires
additional routing/shared metadata design. Public deployment, TLS termination,
accounts, matchmaking, durable games, authoritative rules and abuse protection
beyond these basic limits remain outside P4. Any future public browser deployment
needs WSS and an explicitly configured production origin.

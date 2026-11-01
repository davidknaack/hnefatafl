# Relay deployment

The browser app is hosted by Coolify at `https://tafl.ac0kg.org/`. The relay runs
as a separate service. Use one long-lived Node 24 process with
TLS termination for browser WSS connections. The process has no database or game
history to migrate. Restarting or replacing it discards every room and token.

## Artifacts and configuration

Build from the reviewed commit with `npm ci`, the repository checks, and
`npm run build:server`. Keep `dist-server/` beside `package.json` and the lockfile;
install runtime dependencies with `npm ci --omit=dev`. Start with
`npm run start:server`. The entry reads the root package version. The server does
not serve the browser app; Coolify deploys the static browser artifact from `dist/`.

Set `RELAY_HOST`/`RELAY_PORT` for the host's private listener, and `RELAY_ORIGINS`
to the exact frontend origin (scheme, hostname, port; no path). Forward `/relay`
WebSocket upgrades through the TLS proxy, and route `/health` to the process.
Keep proxy idle timeouts comfortably above the configured heartbeat intervals.
Compression is disabled; enforce limits at least as strict as the documented
server ceilings where the hosting platform allows it. The process defaults and
complete environment list are in [relay operation](relay.md).

Set `VITE_RELAY_URL` to the final `wss://…/relay` endpoint in Coolify's browser
build environment before building the app. CI separately accepts the repository's
public Actions variable of the same name for its validation build. No value
leaves local mode available with online setup disabled.
This URL is public bundle configuration, not a secret; it must contain no userinfo,
query or fragment. Changing it requires rebuilding the browser artifact. No
repository or hosting setting is provisioned by the build itself.

## Operate and verify

Have the service manager start the process, capture ordinary startup/error logs,
and stop it with SIGTERM during maintenance. Do not add message-body/token logging.
`GET /health` returns HTTP 200 and `{"status":"ok"}`; it verifies process liveness,
not room synchronization. A two-client create/join/move check verifies the latter.
Configure room/connection ceilings and heartbeat/expiry values deliberately using
the settings already supported by the server.

Run the [release gate](online-acceptance.md) against the local artifact first, then
validate HTTPS/WSS, exact-origin access and two independent networks on the actual
host. Public publication, account actions and paid hosting are separate decisions.
Verify the deployed browser app and relay directly; passing CI checks alone does
not establish deployment completion.

## Restart, rollback and incompatibility

Tell connected players to retain/export their games before planned maintenance.
Replacing the server ends rooms; clients retain their records but must continue
locally or create a new standard game. There is no automatic room recreation,
graceful transfer between instances, or load-balanced/shared room store.

Keep the previous browser and compiled relay artifacts for rollback. Redeploy the
selected previous artifacts/configuration, accepting that any relay restart loses
rooms. Do not delete browser saves to make an older build load: incompatible
recovery remains preserved for private backup/export. Rollback does not guarantee
older rules can replay newer games. Never clear client storage as a deployment step.

The static frontend and relay can be deployed independently only while the wire
contract remains compatible. Protocol/storage schema changes require an explicit
migration or incompatibility plan; software-version warnings alone are not one.

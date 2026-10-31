# Relay deployment handoff

No public host is provisioned by P8. The runnable artifact and required settings
are ready for a concrete hosting choice. Use one long-lived Node 24 process with
TLS termination for browser WSS connections. The process has no database or game
history to migrate. Restarting or replacing it discards every room and token.

## Artifacts and configuration

Build from the reviewed commit with `npm ci`, the repository checks, and
`npm run build:server`. Keep `dist-server/` beside `package.json` and the lockfile;
install runtime dependencies with `npm ci --omit=dev`. Start with
`npm run start:server`. The entry reads the root package version. The server does
not serve the browser app; deploy only `dist/` to Pages.

Set `RELAY_HOST`/`RELAY_PORT` for the host's private listener, and `RELAY_ORIGINS`
to the exact frontend origin (scheme, hostname, port; no path). Forward `/relay`
WebSocket upgrades through the TLS proxy, and route `/health` to the process.
Keep proxy idle timeouts comfortably above the configured heartbeat intervals.
Compression is disabled; enforce limits at least as strict as the documented
server ceilings where the hosting platform allows it. The process defaults and
complete environment list are in [relay operation](relay.md).

Set the repository's public Actions variable `VITE_RELAY_URL` to the final
`wss://…/relay` endpoint before a Pages build. The build job passes this optional
variable to Vite. No value leaves local mode available with online setup disabled.
This URL is public bundle configuration, not a secret; it must contain no userinfo,
query or fragment. Changing it requires rebuilding the browser artifact. No
repository variable has been set by this implementation.

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
Do not infer deployment completion from passing local tests or a Pages build.

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

# Client and relay deployment

The repository includes a Git-backed Coolify Docker Compose deployment. Nginx
serves the static Vite client and proxies `/relay` and `/health` to a separate
Node 24 container. Both containers use the same Git revision. The public URL is
`https://tafl.ac0kg.org/`; browsers connect to `wss://tafl.ac0kg.org/relay`.
There is no database or server-side game history to migrate.

## Container artifacts

`Dockerfile` has `web` and `relay` runtime targets. The web builder sets
`VITE_RELAY_URL=/relay`; the browser resolves that exact opt-in against its own
hostname and HTTP/HTTPS scheme before validating or saving the absolute endpoint.
Thus the same configuration works on production and PR preview domains. Missing
or invalid settings still disable online setup and preserve local play. Absolute
WS/WSS overrides remain available for non-container development/builds.

The relay builder emits `dist-server/`. Its final image contains compiled
server/shared modules, root package metadata, and production dependencies only.
It runs directly as the Node user and receives SIGTERM. Nginx preserves the
upgrade path and Origin header, disables WebSocket buffering, uses 300-second
proxy timeouts, and re-resolves the relay's Docker DNS name after replacement.
Health requests never fall back to frontend HTML. Each container has a Docker
health check; the web check establishes static-page liveness independently of
relay availability.

`compose.yaml` publishes no host ports. Coolify routes only the `web` service's
internal port 80. The relay listens on `0.0.0.0:8787` inside the stack network.
Do not attach multiple deployments to a shared external network or assign fixed
container names. Container logs rotate; the initial resource limits are 128 MiB
for web and 256 MiB for relay, each with a 0.5 CPU ceiling. Revisit these limits
using observed production and concurrent-preview load.

## Coolify configuration

Create an **Application from the GitHub repository**, using the existing GitHub
App source. Select the **Docker Compose** build pack, base directory `/`, Compose
location `/compose.yaml`, and production branch `main`. A pasted Docker Compose
Service does not provide the required Git webhook/PR preview lifecycle.

Assign `https://tafl.ac0kg.org` to **web**, internal port **80**, with no path.
Do not assign a domain to relay. Enable automatic deployments and PR previews.
Use preview template `https://tafl-pr-{{pr_id}}.ac0kg.org`. Validate the generated
web domain and both containers on an actual PR before relying on the preview
configuration. Keep public fork deployments disabled.

Coolify 4.5.3 injects `SERVICE_URL_WEB` into the relay using the current deployment's
web domain, including PR previews. The relay reads this value directly; do not
copy the production value to a separate preview variable. The value must contain
the public HTTP(S) URL, without credentials, query, fragment, or a non-root path.
Coolify removes internal target-port overrides from this generated URL. The
relay normalizes it to one exact browser origin; it never enables wildcard
origins. Missing/invalid public URL configuration fails production startup.

For a standalone deployment, `RELAY_PUBLIC_URL` can supply the public web URL.
An explicit comma-separated `RELAY_ORIGINS` overrides URL-derived origins;
explicitly empty origins reject all browser origins. Keep these overrides unset
in Coolify unless deliberately replacing automatic per-preview configuration.
The existing room, connection, byte, rate, heartbeat and expiry defaults remain
in force; see [relay configuration](relay.md). Configure supported `RELAY_*`
runtime overrides in Coolify when changing limits.

The owner confirmed that `*.ac0kg.org` tunnels to `http://localhost:80` without an
HTTP Host Header override. **Disable Coolify's HTTP-to-HTTPS redirect for this
application**: the tunnel reaches the proxy over HTTP while Cloudflare provides
browser HTTPS/WSS. No extra tunnel route, public port, or subdomain is required
for the relay. Preserve the original Host and allow WebSocket upgrades; verify
the actual WSS connection rather than assuming successful page loading proves it.

Use a temporary first-level domain, such as `tafl-online.ac0kg.org`, and distinct
preview template while testing alongside the old static application. At cutover,
move domain ownership to the Compose application, set its production branch to
`main`, and transfer automatic/preview deployment responsibility from the old
application. Retain the old image/settings as a local-play rollback option; do
not leave competing resources routing the same root domain.

## Local container and hosted verification

Use Node 24 and Docker Compose v2 or later:

```sh
npm ci
npm test
npm run typecheck
npm run format:check
npm run build
npm run build:server
docker compose -f compose.yaml -f deploy/compose.smoke.yaml up --build --detach --wait
node scripts/smoke-deployment.mjs
docker compose -f compose.yaml -f deploy/compose.smoke.yaml down
```

The smoke override publishes web only on `127.0.0.1:8080` and supplies that exact
origin to relay. Do not add this override to the Coolify deployment. CI runs the
same container smoke test in addition to the repository gates. It checks actual
Nginx/static content, JSON health, disallowed-origin rejection, and two real
WebSockets creating/joining, forwarding, resuming and leaving a room. It does not
validate game rules or the full browser UI.

For a hosted deployment, run `node scripts/smoke-deployment.mjs https://HOSTNAME`.
The script creates a temporary room and never prints seat tokens. Health must be
HTTP 200, JSON content type, and `{"status":"ok"}`; HTML with status 200 is a
failure. GitHub CI passing does not prove the deployed revision or public network
path is correct. Coolify webhooks also do not wait for GitHub CI by themselves.

Run the local browser acceptance checks in
[production online play](production-online-client.md). Then use two browser
profiles/networks on the public host to verify create/join, moves, capture,
comments, turn gating, refresh recovery, duplicate-seat refusal, and an idle game
through multiple heartbeat intervals. Confirm a PR has its own relay/origin and
cannot join production rooms; verify updates and close/merge cleanup. Relay
restart must report room loss while preserving browser records and local/export
options. Never log peer payloads or private recovery data.

## Restart and rollback

One relay process owns all rooms and tokens in memory. **Every relay restart or
replacement discards them.** Room interruption during deployment is accepted for
this initial version. Use a stop/start replacement with one relay instance per
deployment; overlapping independent instances can split players between room
stores. Do not claim zero downtime. Client-only changes may still replace relay;
verify actual container reuse before assuming otherwise.

Keep previous compatible web/relay images and configuration for rollback. Restore
both when protocol compatibility requires it, accepting another loss of rooms.
Players retain browser records and can export or continue locally, but old room
codes/tokens cannot recover a restarted room. Never clear browser storage as a
deployment step. Durable rooms, graceful handoff, and safe multi-instance routing
require a later state-management design.

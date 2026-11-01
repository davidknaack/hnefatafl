# Coolify online-play deployment plan

Original inspection: November 1, 2026. This document records the original
proposal and inspection baseline. Implementation and current operational steps
are documented in [client and relay deployment](relay-deployment.md).
The owner accepts room interruption and unrestricted cutover for this initial
version, and confirmed HTTP tunnel upstream `http://localhost:80` without a Host
header override.

## Findings

- Coolify 4.5.3 has one Hnefatafl application in the production environment, on
  its single reachable Docker server. It deploys `davidknaack/hnefatafl`, branch
  `main`, using Railpack, serving `/app/dist` on internal port 80.
- Production is `https://tafl.ac0kg.org`; the preview template is
  `https://tafl-pr-{{pr_id}}.ac0kg.org`. Recent deployment history confirms push
  and PR webhook deployments. No previews are currently retained.
- Traefik is running. The application health check is disabled. The application's
  only listed environment key is `RAILPACK_SPA_OUTPUT_DIR`, present for both
  production and previews. There is no `VITE_RELAY_URL` in either group and no
  repository Actions variables.
- There are no relay applications, Compose services, or databases in this team.
- The public site loads over HTTPS. Its compiled client has an undefined relay
  endpoint. `GET /health` currently returns the frontend HTML with HTTP 200,
  rather than relay health JSON.
- The client is Vite with TypeScript/DOM bindings, rather than React; no framework
  change is needed. Production online controls already exist in `src/client`.
- `server/main.ts` starts a Node 24 WebSocket relay. Existing scripts compile to
  `dist-server/` and start `dist-server/server/main.js`. The runtime needs root
  `package.json`, compiled modules, and the production `ws` dependency.
- The relay accepts upgrades at exactly `/relay`, serves JSON at exactly
  `/health`, and otherwise returns 404. It defaults to loopback binding and local
  browser origins; both settings need explicit production configuration.
- Rooms and reconnect credentials live in one process. Restart loses all rooms;
  there is no database, shared state, or safe multi-instance deployment strategy.
  The browser owns game rules and saved records.

The API token does not expose sensitive application/proxy configuration. The
external Cloudflare tunnel configuration is not available through these tools.
Its wildcard forwarding is supplied by the project owner; the upstream scheme,
port, Host handling, and edge settings still need verification. No local builds
were run during this inspection; Node/npm are unavailable on this shell's PATH.

## Recommended deployment

Use one **Git-backed Docker Compose application** with two containers:

- `web`: build the existing Vite static artifact and serve it with Nginx on 80.
  Serve `/` and assets normally. Proxy `/relay` and `/health`, preserving their
  paths, to `relay:8787`. These locations must take precedence over SPA fallback.
- `relay`: compile and run the existing server using Node 24, listening on
  `0.0.0.0:8787`. Keep it internal to the stack network, with one instance.

Only `web` has a Coolify public domain. Cloudflare Tunnel forwards to Traefik;
Traefik routes the hostname to `web`. Browsers use
`wss://tafl.ac0kg.org/relay` and health is
`https://tafl.ac0kg.org/health`. No additional public port or production subdomain
is needed.

This keeps the client statically served while making one Git revision the unit
of production/preview deployment. Coolify supports Git-triggered Compose
applications and previews; a pasted Compose Service does not provide that Git
lifecycle. Each preview should receive its own web and relay containers/network.

A second independent relay application is also viable for production, using
Traefik routes for `/relay` and `/health` with prefix stripping disabled. Compose
is recommended here to avoid coordinating two separate applications' preview
creation, domains, origin configuration, revisions, and cleanup.

## Implementation sequence

1. **Verify the existing ingress before changing it.** Record the current app's
   build settings, domain settings, preview template, Git source, and redirect
   behavior for rollback. Confirm the wildcard tunnel reaches Traefik, retains
   the requested hostname, and permits WebSocket upgrades. Determine whether
   cloudflared connects to HTTP port 80 or HTTPS port 443. An HTTP upstream needs
   Coolify's HTTP-to-HTTPS redirect disabled for the application to avoid loops;
   browser HTTPS/WSS remains provided by Cloudflare. Preserve an already-working
   HTTPS upstream if that is the current configuration. The Coolify server's
   tunnel integration flag is false, so do not assume Coolify manages this tunnel.

2. **Add reproducible container packaging.** Add a multi-stage Dockerfile with
   web and relay targets, a `.dockerignore`, Nginx configuration, and a
   repository-owned Compose file. Use Node 24 and lockfile-based installs.
   Compile the relay with dev dependencies in the builder; install only runtime
   dependencies in its final image. Run Node directly as a non-root user so
   SIGTERM reaches the existing shutdown handler. Exclude environment files,
   local artifacts, Git metadata, and tests from runtime images. Do not configure
   a database or persistent volume for ephemeral rooms.

3. **Configure the internal proxy and checks.** Forward HTTP/1.1 WebSocket
   Upgrade/Connection headers and preserve Origin and `/relay`. Disable buffering
   for the WebSocket location and set timeouts comfortably above the 30-second
   heartbeat, for example 300 seconds. Proxy `/health` directly without HTML
   fallback or caching. Ensure proxy DNS resolution survives relay container
   replacement. Add a relay container health check for `/health`, web liveness,
   and a separate end-to-end check of the proxied JSON response.

4. **Make endpoint configuration work on every hostname.** Extend client
   configuration to accept an explicit same-origin setting, such as
   `VITE_RELAY_URL=/relay`, resolving it to an absolute `ws:`/`wss:` URL using
   the browser's location before session/recovery validation. Retain explicit
   absolute URL overrides for development and preserve missing/invalid-setting
   local-only behavior. Build production and preview web artifacts with `/relay`.
   Persist the resolved absolute endpoint so existing credential protections
   continue to apply. Add focused tests for HTTPS, preview hostnames, invalid
   settings, and recovery endpoint matching.

5. **Supply exact per-deployment server origins.** Set runtime `RELAY_HOST` to
   `0.0.0.0`, `RELAY_PORT` to `8787`, and production `RELAY_ORIGINS` to
   `https://tafl.ac0kg.org`. For previews, derive the exact browser origin from
   the web service's Coolify-generated URL, using its `SERVICE_URL_WEB` value
   through validated startup configuration. Strip paths/internal target ports
   when normalizing the public URL; the browser origin has no trailing slash.
   Verify the actual generated value on Coolify 4.5.3 before relying on it.
   Fail deployment if a required public origin is missing or invalid. Do not
   allow all `*.ac0kg.org` origins or reuse production origins in preview relays.

6. **Set operational defaults explicitly.** Start with the existing limits:
   250 connections, 100 rooms, 64 KiB messages, 256 KiB socket output buffering,
   10 messages/second with burst 30, heartbeat 30 seconds, unassigned handshake
   timeout 60 seconds, disconnected-room idle expiry 30 minutes, and absolute
   room lifetime 24 hours. Set container resource limits after checking host
   capacity for production plus concurrent previews. Capture startup/errors,
   without payloads, seat tokens, or private recovery data.

7. **Validate in Coolify on a temporary hostname.** Create a Git-backed Compose
   application using the existing Git source, and assign a temporary first-level
   hostname under `ac0kg.org` only to `web:80`. Keep the current production app
   serving `tafl.ac0kg.org`. Validate domain-to-service assignment and runtime
   origin generation, then exercise an actual PR preview with both containers
   from that PR. Confirm preview N cannot join production or preview M rooms,
   updating a PR replaces its own stack, and closing it removes its containers
   and network. Avoid fixed container names, host-port bindings, and shared
   external networks. Retain the existing preview hostname format at cutover;
   use a distinct temporary template while both applications coexist.

8. **Complete validation and cut over production.** Run `npm ci`, `npm test`,
   `npm run typecheck`, `npm run format:check`, `npm run build`, and
   `npm run build:server` with Node 24. Add CI validation of the Compose/container
   artifacts and a real WebSocket smoke test through Nginx. Run the existing
   local browser acceptance pages as described in the production online guide.
   Promote the tested Compose configuration to the production domain by moving
   domain ownership from the static app; never leave both resources routing the
   same root hostname. Transfer production/PR webhook responsibility, keeping
   the old app's settings/image available for rollback. Coolify webhooks do not
   establish that GitHub CI passed, so explicitly verify the chosen revision's
   checks before the initial production deployment.

## Release acceptance

- HTTPS loads the expected revision; local play works with relay unavailable.
- `/health` returns HTTP 200, JSON content type, and `{"status":"ok"}` through
  Cloudflare and Nginx. HTML with HTTP 200 is a failure.
- `/relay` upgrades successfully from the exact allowed browser origin. A
  disallowed Origin is rejected; a normal HTTP GET is not a WebSocket test.
- Two independent browser profiles/networks create and join, play both sides,
  capture, and synchronize names/comments/history. Refresh resumes the same
  seat and game after synchronization; duplicate live-seat resume is refused.
- An idle connected game survives multiple heartbeat periods. Test connection
  loss/reconnect as well as relay restart: restart reports room loss while
  preserving browser records and export/local-continuation options.
- A real PR preview has its own WSS endpoint, correct exact origin, isolated room
  store, matching frontend/backend commit, and verified close/merge cleanup.

## Deployment and rollback policy

Every replacement of the relay is disruptive. Use one relay replica and an
explicit stop/start replacement rather than overlapping load-balanced relay
instances. Session affinity alone would not make independent room stores safe.
Do not claim zero-downtime online games. A Compose deployment may replace the
relay even for a client change; verify container reuse behavior, and document
maintenance expectations. Preserving rooms across deployments requires a
separate shared-state/draining design.

Retain the previous compatible web/relay images and configuration. Roll back
both when protocol compatibility requires it, accepting another loss of rooms.
The old static deployment is also a fallback that restores local play. Never
clear browser storage as part of deployment or rollback. Update the existing
relay deployment documentation and stale hosting notes after the final design
is verified.

## References

- [Repository relay requirements](relay-deployment.md)
- [Relay configuration and limits](relay.md)
- [Production online behavior and acceptance](production-online-client.md)
- [Coolify Git-backed Compose applications](https://coolify.io/docs/applications/builds/docker-compose)
- [Coolify previews](https://coolify.io/docs/applications/deployments/preview-deployments)
- [Coolify environment variables](https://coolify.io/docs/applications/configuration/environment-variables)
- [Coolify path routing and prefix stripping](https://coolify.io/docs/core/networking/domains)
- [Coolify wildcard Cloudflare tunnel setup](https://coolify.io/docs/integrations/networking/cloudflare/tunnels/all-resource)
- [Cloudflare WebSocket support and heartbeat guidance](https://developers.cloudflare.com/network/websockets/)

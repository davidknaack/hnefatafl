# Production client readiness — October 17, 2026

Reviewed local branch `online-play` at
`cba80828a39212ec0c4f9b83aa964f71e27937e7`. The working tree was clean before
this review. This document records an assessment and proposed defaults, not an
implemented client or newly approved product requirements.

## Assessment

**Ready to begin production-client implementation.** No further general engine
cleanup or architectural design phase is needed for the existing trusted,
two-player scope. A short client brief should establish the player experience
and release scope before substantial UI work. Public online release still needs
relay hosting and deployment validation.

The [online-play plan](lightweight-online-play-plan.md) deliberately implemented
online play in the debug harness before the production UI. Its P1–P8 work is
complete in this branch. The older September 9 review's server-authority and
durable-server recommendations were superseded by that plan; they are not
outstanding prerequisites.

## Foundation that is ready

| Foundation | Evidence and implication |
| --- | --- |
| Rules and state ownership | Engine validation/application share resolved transitions; snapshots are detached; imports replay atomically. UI work need not own or duplicate rules. |
| Session boundary | `src/session/GameSession.ts` supplies subscriptions, capabilities, generation guards, asynchronous move submission and detached views for local and online sessions. |
| Result presentation | `GameState.outcome` supplies winner and reason; connection state remains separate. The client can explain endings without inferring them from board geometry. |
| Online synchronization | `OnlineGameSession` handles seat/turn gating, complete-record replay, correlated acceptance, reconnection and divergence. A successful local submission can still await peer acceptance. |
| Online recovery | Bounded browser storage, refresh recovery, retained records, save-failure reporting and explicit local continuation are implemented. Preserve these behaviors during UI replacement. |
| Validation | Unit/integration tests and a development browser acceptance runner exist. The runner covers the debug consumer, not a future production client. |

See [session contracts](online-session.md), [recovery behavior](browser-recovery.md)
and the [acceptance handoff](online-acceptance.md).

## Decisions for the client brief

These are focused product choices, not reasons to redesign the foundation.
Recommended defaults allow the first implementation slice to proceed.

| Choice | Recommended initial default | Consequence of a broader requirement |
| --- | --- | --- |
| Release scope | Local two-person play and the existing create/join online flow, import/export, rules help and recovery. | AI, analysis, negotiated undo, rematches, chat and clocks need separate scope. |
| Board interaction | Select a piece, show legal destinations, select a destination to commit; allow reselection and cancellation. Remove manual validate/apply modes from the normal play flow. | Move confirmation, drag input or other interaction modes add behavior and acceptance cases. |
| Devices and access | Responsive desktop and phone layouts, touch and keyboard operation, visible focus, labeled squares, and move/result announcements. Fixed initial orientation with visible coordinates is sufficient. | Decide separately whether rotation, side-dependent orientation or extra animation is required. |
| Presentation | Agree on a lightweight board/piece style and the start, playing, waiting/reconnecting and finished states before detailed styling. | No production visual specification, asset system or component framework has been selected in the repository. |
| Finishing and playing again | Explicitly choose whether v1 includes resignation and an agreed rematch. Otherwise retain board endings, export, leave and creation of a fresh game. | Neither `GameSession` nor online record v1 supports a resignation command. Leave does not concede a game. Online resignation needs lifecycle/record/protocol decisions; it is not just a button calling the engine. |
| Saving local games | Preserve current online recovery and explicit local export initially; clearly explain local save limits. | Local games and locally continued moves are not autosaved. Autosave, backup import and a game library need their own storage and replacement policies. |

Keeping the current TypeScript/DOM/Vite stack is a reasonable implementation
default. A framework migration is not required to use the existing contracts.

The engine also has no pass or no-legal-move terminal check. Retaining the current
documented rules does not block starting the client. Settle that gameplay policy
before promising complete conformance to a named external variant; the earlier
review did not establish a reachable standard-opening deadlock. Do not introduce
an arbitrary winner or a new rule in presentation code.

## Concrete migration work

1. Preserve the debug harness at a development-only entry and make the production
   client the normal entry when its first playable slice is ready. The existing
   browser runner fetches `./index.html` in `src/test/browserAcceptance.ts`; update
   that source explicitly when moving the harness. Verify both developer entries
   remain absent from the production output.
2. Separate the necessary session ownership/recovery orchestration from debug
   presentation. `src/ui/sessionControls.ts` currently owns replacement, restore,
   save status and confirmation, but imports `bindCommands` and the complete
   debug `UIElements` shape. Reuse that lifecycle behavior through a small shared
   owner/controller rather than copying it or requiring hidden debug controls.
   This is focused implementation work, not a new generic application framework.
3. Build the local production board and shell against `GameSession`. Existing
   board cells are clickable `div`s, with fixed sizing and no keyboard behavior;
   the HTML has no viewport metadata. Accessibility and responsive layout require
   implementation, not just new colors. Preserve focus deliberately across
   updates; current rendering replaces every cell on each session publication.
4. Wire the same production board to online sessions and recovery. Present turn,
   waiting, synchronization, disconnection and save status as distinct states.
   Retain generation guards and capability checks. Show human-readable outcome
   reasons rather than raw `state.status` values and JSON result logs.
5. Add production-client browser acceptance coverage. Retaining harness coverage
   protects the old consumer, but cannot establish that the replacement's controls,
   focus behavior, layout or lifecycle wiring work.

The first reviewable slice should be the shared lifecycle seam plus an accessible,
responsive local game: select/move/capture, turn and outcome display, history,
new-game confirmation, help and import/export. Then integrate existing online and
recovery behavior into that shell. Agreeing the brief and implementing this slice
does not require public hosting.

## Release work that does not block starting

- Select and provision a public relay host, configure TLS/WSS and exact allowed
  origins, set the Pages relay variable, and validate two independent networks.
  The repository documents this handoff; this review did not inspect a hosting
  account or live deployment.
- Keep the current recovery limitations visible: one recent online identity per
  origin, ephemeral rooms lost on relay restart, and no automatic room recreation.
  Broader durability would change the agreed product scope.
- Base the next work on the online implementation. Local `main` and the cached
  `origin/main` are at `87afbee`, before P1–P8; `online-play` includes those changes
  and is one commit ahead of cached `origin/online-play`. These are local Git
  observations, not a fresh remote/PR status check. No branch was merged or pushed.

## Verification and limits

Reran on October 17 with Node `v24.19.0`, using installed dependencies and the
documented direct Node commands because `npm` was not in this shell's PATH:

- Vitest: **548 tests passed across 22 files**.
- Source/test, Vite configuration and server TypeScript checks: passed.
- Tooling formatting check: passed.
- Browser production build: passed, 37 modules; output contains only app HTML
  and bundled JS/CSS, with no acceptance entry.
- Relay TypeScript build: passed.

No runtime source or dependencies changed. No fresh installation, browser runner,
manual browser check, hosted CI, remote branch refresh or public-network check
was performed for this review. P6–P8 browser results remain dated evidence in the
[progress log](online-play-progress.md), not checks repeated today. This is a
targeted client-readiness review, not an exhaustive rules or security audit.

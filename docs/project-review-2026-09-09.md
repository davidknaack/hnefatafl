# Architecture readiness review — September 9, 2026

Baseline: `87afbee962d98b2d96f0a0c081b893bd79d55c9a`; working tree clean before this document. Quick, targeted review of the previous review, maintenance guidance, engine facade, transition resolver, state/result types, repetition, terminal rules, game interchange, UI command/selection wiring, and relevant regression tests. This is not an exhaustive rules audit or a server implementation review: no server exists in the reviewed source.

## Assessment

The engine is ready to support production UI development. No broad architectural rewrite is warranted. The prior work materially improved the foundation: validation and application share resolved transitions, legal move generation uses that resolver, snapshots protect state ownership, and game loading replays atomically. The domain remains independent of DOM and networking.

Before wiring the production UI and synchronization, agree on the three contracts below. These are next-phase architectural gaps, not regressions in the debug harness. Implement them as a small vertical slice alongside the new UI/server work; they do not require another general cleanup phase.

## 1. Establish an authoritative game-session boundary

Evidence: [UI commands](../src/ui/commands.ts), [selection](../src/ui/selection.ts), [engine commands](../src/HnefataflEngine.ts).

The UI invokes a concrete, synchronous engine and renders after its own commands. Selection caches possible moves without identifying the state they describe. The engine accepts moves for the current side but knows nothing about the requesting user, game identity, revision, or duplicate requests. This is appropriate for a local engine, but insufficient as a network contract.

A delayed command could otherwise be evaluated against a later state; retries cannot be distinguished from new requests; remote moves have no existing update path to invalidate selection. These are integration risks if the current wiring is copied into the production UI, not demonstrated failures of a current network system.

Recommended boundary:

- Put an application/session service between UI and engine, with state subscriptions and asynchronous command results. A local adapter can wrap the existing engine first.
- Submit commands containing `gameId`, `commandId`, `expectedRevision`, and intent such as move coordinates or resignation. Derive the actor from the authenticated session; authorize their seat on the server.
- Serialize commands per game and atomically persist the accepted change, revision, and deduplication result. Check duplicate IDs before treating a retry as stale; reject reuse with a different payload.
- Publish authoritative revisioned state after commit. Clients ignore older updates, recover gaps by requesting current state, and clear/recompute selection when the revision changes. Begin with full snapshots; incremental updates and optimistic play can wait.
- Keep reset/import as explicitly separate application operations rather than exposing every facade method as a player command. In particular, `applyMoveSequence` intentionally commits a legal prefix on failure and should not become a supposedly atomic network batch.

Acceptance: two commands for the same revision cannot both advance the game; a retry returns the original outcome without another move; a spectator cannot move; reconnect and out-of-order updates converge to the authoritative state; an opponent move invalidates stale highlights.

## 2. Define a versioned persistence and recovery record

Evidence: [state types](../src/types.ts), [load/save and reset](../src/HnefataflEngine.ts), [game format](../src/gameFormat.ts), [repetition keys](../src/repetition.ts).

`getState()` supplies a detached snapshot, but there is no supported inverse operation to restore one. `saveGame()` cannot represent an empty game or custom setup; `loadGame()` always replays the standard opening. Tags are opaque, and there is no enforced rules version. Thus portable notation is useful interchange, but is not a complete server save record. A displayed board alone also cannot recover repetition semantics, which depend on history and side to move.

Start with a versioned game record containing game identity, rules version, initial setup, ordered accepted commands/events, session outcome, and revision. Replay through the same engine is sufficient initially; explicitly support a zero-command record. Keep request deduplication durable as part of the session persistence design. Add validated checkpoints only if measured replay cost warrants them, preserving repetition history and all required state. Do not add an unchecked public state setter.

Pin the rules version when a game is created. Decide how deployments resume older games before changing rules: retain the matching implementation, explicitly migrate compatible records, or reject unsupported versions. The package's `1.0.0` and opaque notation tags do not currently provide this guarantee.

Acceptance: restart restores a new game, a normal midgame, and a position one occurrence away from repetition loss; resumed and uninterrupted play produce identical outcomes. Unknown record/rules versions fail explicitly. Custom setups need persistence support only if they are offered in production.

## 3. Separate match lifecycle from board outcomes, and retain outcome reasons

Evidence: [GameStatus and GameState](../src/types.ts), [terminal rules](../src/rules.ts), [repetition resolution](../src/validator.ts), [resignation](../src/HnefataflEngine.ts).

State records only in-progress/attacker-win/defender-win. King capture, escape, fort, encirclement, and repetition collapse to the same winner values. Resignation is distinguished through a notation token, is restricted to the side to move, and is prohibited before the first move because of the file grammar. At a board win, `currentPlayer` retains the mover, so it must not be treated as an active turn after termination.

This leaves a production UI unable to reliably explain the result from structured state. A server will also need to distinguish board completion from any supported waiting, cancellation, timeout, or abandonment states. A player resigning out of turn cannot be represented by calling the existing `resign()` safely.

Return structured board outcome information from the place that determines it, including winner and reason; preserve it through replay. Let the session own player identity and any external termination policy, including who may resign and when. Keep notation constraints in the interchange adapter rather than allowing them to dictate online match lifecycle. Define the relationship between a terminal session and its possibly still-in-progress board state.

Before promising a particular rules variant, explicitly settle the documented absence of a no-legal-move terminal rule. The current engine has no pass and can report in-progress without checking that the next side can move. This review did not reproduce a reachable standard-game deadlock or establish an external rules interpretation; it is an open gameplay-policy decision, not a newly proven standard-game defect.

Acceptance: each supported ending has a stable reason and winner; the UI disables play after any session ending; permitted resignation works for the authenticated conceding player regardless of whose board turn it is; externally ended games survive restart; the selected no-move policy has a focused regression case.

## Suggested order and deferred work

1. Agree on the command/update envelope, durable game record, and lifecycle/outcome contract.
2. Build the production UI against a local session adapter, keeping the existing debug harness available.
3. Connect a server adapter and prove a two-client move, duplicate retry, stale command rejection, restart, and reconnect end to end before expanding UI features.

Keep one shared rules implementation for browser previews and server adjudication; the server remains authoritative. A source-level module boundary is enough initially. A published engine package, monorepo conversion, generic variant framework, event bus, incremental network diffs, and broad performance work are unnecessary prerequisites. Profile legal-move generation on target devices before introducing caching or workers: it resolves terminal rules for each candidate, but this review measured no interaction-latency problem.

## Verification and limits

- Vitest: **427 tests passed across 13 files**, using installed dependencies. The initial sandbox run could not load Vite configuration because of filesystem access; the permitted retry passed.
- Source TypeScript check and separate Vite configuration TypeScript check: **passed** (`tsc --noEmit`, `tsc --project tsconfig.node.json`).
- Existing tests cover snapshot isolation, resolved transitions, repetition, parsing boundaries, and load/save replay. They do not establish network ordering, persistence, authorization, or reconnect behavior.
- No runtime source, dependencies, or tests changed. No browser smoke check, production build, fresh install, benchmark, or external rules research was performed for this targeted review.

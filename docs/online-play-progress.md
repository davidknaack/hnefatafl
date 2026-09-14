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

### Next checkpoint — P3, not started

Restore P3's detailed scope: introduce a local `GameSession` interface/implementation
with detached views, subscriptions, action capabilities, async move submission,
local import/export, state-generation guards and disposal. Adapt existing debug
commands/selection to this interface and render from session updates, preserving
all current local interaction behavior. Clear stale selection/async work when the
session changes; do not reset the engine implicitly when binding UI. Verify the
existing browser smoke paths. No online controls or AI hierarchy yet; P4 later
implements the ephemeral relay against P2's shared protocol.

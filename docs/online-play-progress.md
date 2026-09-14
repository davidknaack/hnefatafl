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

### Next checkpoint — P2, not started

Implement complete-record codec and protocol contracts under sections B/C of [the plan](lightweight-online-play-plan.md). Restore the detailed P2 scope before coding: zero-move records, canonical resolved captures, bounded runtime decoding, fresh-engine atomic replay, final state/outcome checks, prefix comparison, independent software/schema versions, room envelopes, generic opaque peer messages, and correlated sync acknowledgements. Add pure tests and a protocol reference; no sockets/storage yet. Preserve the browser-engine/opaque-relay boundary. Stop before P3's local session/UI adaptation.

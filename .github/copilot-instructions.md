# Hnefatafl maintenance instructions

This repository is a browser application with a synchronous TypeScript engine
and a plain HTML/TypeScript debug UI, bundled with Vite. Read the
[README](../README.md) for current rules, API, notation, and layout semantics.
Use source and configuration to verify these notes when making changes.

The [September 5, 2026 review](../docs/project-review-2026-09-05.md) records the
baseline, defects B1–B8, tooling issue T1, and work packages W1–W8. W1 is
documentation only. Preserve the distinction between behavior-preserving
extraction and selected functional/API corrections; do not fix deferred defects
incidentally or encode known bad behavior as the desired rules.

## Commands and runtime

Use Node 24.x and `npm ci` for a fresh lockfile-based install. `package.json`
declares the supported major and CI reads `.nvmrc`, which also selects Node 24
for development. The September 2026 checks used Node `v24.19.0`. The Vite config
uses `defineConfig` from `vitest/config`; Node 24 supplies `crypto.hash` directly,
so no compatibility shim is needed.

| Command | Purpose |
| --- | --- |
| `npm test` | One Vitest run |
| `npm run testlive` | Vitest watch mode |
| `npm run typecheck` | Source/tests plus Vite/Vitest configuration type check |
| `npm run format` | Format tooling/configuration files |
| `npm run format:check` | Check tooling/configuration formatting without writing |
| `npm run build` | Vite browser build into ignored `dist/` |
| `npm run dev` | Development server; normally `http://localhost:5173/hnefatafl/` |
| `npm run preview` | Serve an existing build; normally `http://localhost:4173/hnefatafl/` |

Vite may choose a different port when one is occupied. `npm run repomix` runs
`npx repomix@latest`; it is an optional repository export, not validation.
Prettier is an exact-version development dependency using `.prettierrc`. Format
scripts cover package/lock metadata, TypeScript configs, `vite.config.ts`,
`.prettierrc`, and workflow YAML. Source, tests, UI, and Markdown retain their
existing style; broad formatting is separate work. No ESLint dependency or lint
command is declared.

If the environment exposes Node but no npm launcher, equivalent checks using
already installed dependencies are:

```sh
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
node node_modules/typescript/bin/tsc --project tsconfig.node.json
node node_modules/prettier/bin/prettier.cjs --check package.json package-lock.json "tsconfig*.json" vite.config.ts .prettierrc ".github/workflows/*.yml"
node node_modules/vite/bin/vite.js build
```

`tsconfig.json` covers `src` and tests. `tsconfig.node.json` inherits its strict
compiler options and checks `vite.config.ts` without emitting files; this keeps
the source project's `rootDir` unchanged. `npm run typecheck` runs both checks.
The extracted browser code under `src/ui` is included in the source check.
`public/main.js` only imports that checked entry for Vite's public root.
Vite's build is not a type check.

## Validation baseline and expectations

The September 5 review used baseline
`7b6f3b32db076610712875c02d17a2bae5bf4047` plus the existing HTML warning removal.
For W1 on September 6, 2026, the test, source type-check, and build commands were rerun:

- All 238 Vitest tests passed across seven files, using Vitest `3.2.4`.
- The project TypeScript check passed.
- The Vite `7.0.6` production build passed and transformed 15 modules.

These are dated observations, not fixed expected counts or a coverage percentage.
There are no known baseline failing fort tests or facade import errors to ignore.
Investigate new failures. Installed dependencies were used without a fresh
install, and Node 18 CI was not executed. The separate config check reported two
errors in the September 5 review (T1). The production browser smoke check from
that review loaded the board and applied an opening move, and reproduced B4/B8;
a browser check was not repeated for W1's documentation-only changes.

For W2 on September 6, Node `v24.19.0` and npm `11.6.0` passed a fresh
`npm ci --no-audit --no-fund`, `npm run typecheck` (including the config),
`npm run format:check`, all 238 tests, and the Vite production build (15 modules).
Tests/build required the same filesystem-access retry. The hosted Actions
workflow and browser smoke check were not run. T1's runtime/config errors are
resolved; browser type checking was subsequently completed in W3. See the review's dated
W2 follow-up for scope and environment details.

For code/tooling changes, run tests, `npm run typecheck`, `npm run format:check`,
and the build.
For UI changes or extraction, also check the browser: initial board, selection and
possible-move highlights, validate/apply paths, capture display, input-mode
precedence, history, and invalid notation. B4 is fixed in W6; distinguish the
remaining B8 history-label defect from regressions. Documentation-only edits need source/signature/command/link
verification; a browser rerun is unnecessary unless UI behavior is changed.
Record commands, runtime, and actual results instead of assuming this baseline
still holds. Do not add tests solely for prose edits.

An esbuild configuration-load error caused by sandbox directory access is an
environmental startup failure. It occurred in both the review and W1; the tests
and build passed when rerun with the necessary filesystem access. Resolve access
before drawing conclusions about tests or builds; do not modify game code to
mask it.

## Module boundaries and contracts

| Location | Responsibility |
| --- | --- |
| `src/HnefataflEngine.ts` | State, move commands, counters, history, turns |
| `src/board.ts` | Layout transformation/initialization, position cloning/application, defender projection, edge extraction |
| `src/validator.ts` | Shared resolved transition: validation, captures, repetition, post-move board/status |
| `src/repetition.ts` | Full-board/side-to-move keys; three occurrences lose for defenders |
| `src/moveGenerator.ts` | Candidate destinations and captures for one piece; no repetition context |
| `src/captures.ts` | Ordinary/king/shieldwall captures and hostility; shared with fort analysis |
| `src/rules.ts` | Terminal status; compatibility capture exports |
| `src/exitFort.ts` | Structural exit-fort evaluation |
| `src/parser.ts`, `src/patterns.ts` | Move/sequence parsing and notation regexes |
| `src/coordinates.ts` | Fixed 11×11 notation/coordinate conversion |
| `src/movement.ts` | Shared ownership, restricted-destination, path, and coordinate predicates |
| `src/encirclement.ts`, `src/debug.ts` | Escape connectivity and text rendering, respectively |
| `src/utils.ts` | Compatibility exports for coordinates, encirclement, debug rendering, and forts |
| `src/types.ts` | Exported state, piece, move, and result types |
| `src/ui/` | Checked DOM bindings, board/history rendering, selection/highlighting, commands, modal wiring, and CSS |
| `public/index.html` | HTML entry and modal content |
| `public/main.js` | Minimal Vite bootstrap importing `src/ui/main.ts` |

The facade methods are `reset`, `getState`, `validateMove`, `applyMove`,
`applyMoveSequence`, and `getPossibleMoves(from)`. The lower-level
`generatePossibleMoves` is not a facade method. Capture arrays contain
`Coordinate` objects, not notation strings. State uses `position: Square[][]`,
not `board`; squares use `isRestricted`, not `isCorner`.

W5 guarantees unique captures, preview/apply equivalence, and legal facade move
generation against the same state/history. W7 returns detached snapshots from
`getState` and successful move/sequence commands; edits cannot change engine state.
Board clones and layout transformations also copy occupants. W6 enforces strict notation, 11×11
game layouts, no passes, and guarded coordinate boundaries. W5 replaces defender projections with `positionHistory` keys and the
raw validator's fifth argument with `string[]`; consumers should replay old games.
Sequence application commits its valid prefix; UI Load Game only displays parsed
notation. Initialization starts with the attacker.

Preserve the [exit-fort documentation](../docs/exit-fort.md) and symmetry/non-mutation
tests. Low-level layout fixtures can use smaller boards and custom mappings;
the game notation still assumes 11×11. Without an explicit uppercase `T`, the
king's layout square becomes the throne. `edgeSquares` includes both the physical
perimeter and non-throne restricted squares; shieldwall code must filter for
physical edges. Keep compatibility exports until consumers are deliberately
migrated. No framework rewrite or Rust-rule port is implied by the work packages.

## Follow-up boundaries

- W2 is implemented: Node 24 alignment, config typing, explicit checking/formatting
  commands, and CI checks. The browser application is `private` and the stale
  `main: index.js` is removed. See the review's W2 follow-up for validation evidence.
- W3 is implemented: UI/domain extraction with existing exports and interaction
  branches retained. See the review's W3 follow-up for browser checks and validation.
- W4 is implemented: discriminated result unions, readonly owner/type-consistent
  pieces, explicit shared fixture helpers, and public command/parser/layout checks.
  Compile-only consumer checks in `src/test/type-contracts.ts` run through the
  source type check; Vitest alone does not check their expected compiler errors.
  See the README for exported-type compatibility and the review for validation.
- W5 is implemented: B1–B3 capture uniqueness, preview/commit agreement, and legal
  facade move generation. Full-board/side-to-move repetition allows a second
  occurrence and applies the third as an attacker win. Captures restart history;
  no defender-only anti-stalling rule remains. Board wins take precedence.
  Counters are calculated locally; W7 adds runtime state isolation. See the
  review's W5 follow-up for tests, browser verification, and API migration.
- W6 is implemented: B4/B6/B7 strict capture parsing, canonical history, indexed
  sequence failures, guarded source/destination/capture coordinates, and exactly
  11×11 production layouts with a supported alphabet and one transformed king.
  Passes are rejected. Sequence application retains legal-prefix commits; the
  parser now returns a discriminated result with a parsed prefix and zero-based
  failure index. Load Game reports errors and still only views notation. Flexible
  low-level fixtures retain their size/mapping/king conventions. See the README
  for API migration and the review for validation.
- W7 is implemented: B5 state protection uses detached, mutable snapshots from
  reads and successful commands, with independent board/piece/counter/history
  objects. Layout pieces and cloned occupants are independent too. State/result
  types retain their shapes; consumers must fetch a new snapshot to observe play.
  See the README for ownership/migration and the review for validation.
- W8: B8 history labels; select Load Game and accessibility changes separately.

Use the review's acceptance criteria and reproduction fixtures for selected
fixes. Parser tests cover strict syntax, indexed failures, and serialization.
There is no dedicated browser test suite. The large fort test count does not
establish the deferred public contracts.

## Deployment

[deploy.yml](workflows/deploy.yml) runs `npm ci`, type and tooling-format checks,
tests, and the build on pushes to
`main` and pull requests targeting `main`, then uploads `dist/` as a Pages artifact.
The deploy job requires `github.ref == 'refs/heads/main'`; pull requests validate
but do not deploy. There is no `workflow_dispatch` trigger. The application base
path is `/hnefatafl/`, configured in `vite.config.ts`.

The package is a private application, with no library entry point or supported
exports/types entry. Node/RL packaging is future scope. Do not
describe an npm engine package as available.

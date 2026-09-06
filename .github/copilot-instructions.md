# Hnefatafl maintenance instructions

This repository is a browser application with a synchronous TypeScript engine
and a plain HTML/JavaScript debug UI, bundled with Vite. Read the
[README](../README.md) for current rules, API, notation, and layout semantics.
Use source and configuration to verify these notes when making changes.

The [September 5, 2026 review](../docs/project-review-2026-09-05.md) records the
baseline, defects B1–B8, tooling issue T1, and work packages W1–W8. W1 is
documentation only. Preserve the distinction between behavior-preserving
extraction and selected functional/API corrections; do not fix deferred defects
incidentally or encode known bad behavior as the desired rules.

## Commands and runtime

Use `npm ci` for a fresh lockfile-based install. Installed Vite 7 requires Node
`^20.19.0 || >=22.12.0`; the September 2026 checks used Node `v24.19.0`.
CI still selects Node 18. Runtime declarations and removal/review of the config's
crypto shim belong to W2.

| Command | Purpose |
| --- | --- |
| `npm test` | One Vitest run |
| `npm run testlive` | Vitest watch mode |
| `npx tsc --noEmit` | Project TypeScript check |
| `npm run build` | Vite browser build into ignored `dist/` |
| `npm run dev` | Development server; normally `http://localhost:5173/hnefatafl/` |
| `npm run preview` | Serve an existing build; normally `http://localhost:4173/hnefatafl/` |

Vite may choose a different port when one is occupied. `npm run repomix` runs
`npx repomix@latest`; it is an optional repository export, not validation.
There is no declared ESLint or Prettier dependency, and no lint, format, or
type-check script. `.prettierrc` is formatting configuration only. Follow the
surrounding style until explicit tooling is added in W2.

If the environment exposes Node but no npm launcher, equivalent checks using
already installed dependencies are:

```sh
node node_modules/vitest/vitest.mjs run
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
```

The project TypeScript check covers `src` and tests, but excludes `vite.config.ts`
and inline browser JavaScript. Vite's build is not a type check. The separate
configuration check below exposes T1's crypto shim and `test` property typing
errors:

```sh
node node_modules/typescript/bin/tsc --noEmit --target ES2020 --module ESNext --moduleResolution Bundler --strict --esModuleInterop --skipLibCheck vite.config.ts
```

## Validation baseline and expectations

The September 5 review used baseline
`7b6f3b32db076610712875c02d17a2bae5bf4047` plus the existing HTML warning removal.
For W1 on September 6, 2026, the three direct Node commands above were rerun:

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

For code/tooling changes, run tests, the project TypeScript check, and build.
For UI changes or extraction, also check the browser: initial board, selection and
possible-move highlights, validate/apply paths, capture display, input-mode
precedence, history, and invalid notation. Distinguish known B3/B4/B8 failures
from regressions. Documentation-only edits need source/signature/command/link
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
| `src/validator.ts` | Raw move validation, repetition, status preview |
| `src/moveGenerator.ts` | Candidate destinations and captures for one piece; no repetition context |
| `src/captures.ts` | Ordinary/king/shieldwall captures and hostility; shared with fort analysis |
| `src/rules.ts` | Terminal status; compatibility capture exports |
| `src/exitFort.ts` | Structural exit-fort evaluation |
| `src/parser.ts`, `src/patterns.ts` | Move/sequence parsing and notation regexes |
| `src/utils.ts` | Coordinates, encirclement connectivity, debug rendering, fort re-export |
| `src/types.ts` | Exported state, piece, move, and result types |
| `public/index.html` | Actual entry, styles, inline module script, DOM/event handling |
| `public/main.js` | Legacy file not referenced by the HTML entry |

The facade methods are `reset`, `getState`, `validateMove`, `applyMove`,
`applyMoveSequence`, and `getPossibleMoves(from)`. The lower-level
`generatePossibleMoves` is not a facade method. Capture arrays contain
`Coordinate` objects, not notation strings. State uses `position: Square[][]`,
not `board`; squares use `isRestricted`, not `isCorner`.

Read the README's API caveats before depending on preview/apply equivalence,
fully legal generated moves, strict parsing, exception-free coordinates, or
stable state snapshots: these are pending contracts, not current guarantees.
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

- W2: runtime alignment, config typing, explicit checking/formatting commands.
  Also resolve A6's browser-app metadata decision: whether to set `private` and
  remove nonexistent `main: index.js`. W1 leaves package/lockfile metadata intact.
- W3–W4: bounded extraction, result/type and fixture contracts, targeted checks.
  Preserve behavior and review exported-type compatibility.
- W5: B1–B3 capture uniqueness, preview/commit agreement, and legal move generation.
- W6: B4/B6/B7 parsing and layout boundaries; decide board-size/pass policy first.
- W7: B5 state protection; select the ownership contract first.
- W8: B8 history labels; select Load Game and accessibility changes separately.

Use the review's acceptance criteria and reproduction fixtures for selected
fixes. The current suite has no dedicated parser or browser test files; the
large fort test count does not establish those public contracts.

## Deployment

[deploy.yml](workflows/deploy.yml) runs `npm ci`, tests, and the build on pushes to
`main` and pull requests targeting `main`, then uploads `dist/` as a Pages artifact.
The deploy job requires `github.ref == 'refs/heads/main'`; pull requests validate
but do not deploy. There is no `workflow_dispatch` trigger. The application base
path is `/hnefatafl/`, configured in `vite.config.ts`.

The package is currently an application, with no supported library exports/types
entry and a stale `main: index.js`. Node/RL packaging is future scope. Do not
describe an npm engine package as available.

# Hnefatafl Game Engine

**[Play the game online](https://davidknaack.github.io/hnefatafl/)**

A browser-based Hnefatafl game with a synchronous TypeScript engine and an
interactive 11×11 board. Attackers move first. Defenders win by moving the king
to a restricted non-throne square (a corner on the standard board), or by forming
an exit fort. Attackers win by capturing the king or encircling the defenders.

This is an experimental project built largely with AI coding assistance. The
current target is a browser application bundled by Vite for static hosting.
Reusing the engine for reinforcement learning is a possible future direction,
not a supported distribution today. There are no production package dependencies.

## Run locally

Use a Node runtime satisfying the installed Vite 7 requirement:
`^20.19.0 || >=22.12.0`. Node `v24.19.0` was used for the September 2026 checks.
The repository does not yet declare a development runtime, and CI still selects
Node 18; aligning these is pending work package W2.

```sh
npm ci
npm run dev
```

Vite opens the browser and normally serves the app at
`http://localhost:5173/hnefatafl/`. It may select another port if that one is busy.

| Command | Purpose |
| --- | --- |
| `npm test` | Run the Vitest suite once |
| `npm run testlive` | Run Vitest in watch mode |
| `npx tsc --noEmit` | Check `src` and test TypeScript using the current project config |
| `npm run build` | Bundle the browser app into ignored `dist/` output |
| `npm run preview` | Serve the existing build, normally at `http://localhost:4173/hnefatafl/` |

The build does not perform TypeScript checking. The current TypeScript scope
excludes `vite.config.ts` and the UI's inline JavaScript. There are no declared
lint, format, or type-check scripts; `.prettierrc` exists, but Prettier is not a
declared dependency. See the [maintenance instructions](.github/copilot-instructions.md)
for validation details and the dated baseline.

## Current rules and behavior

These describe the implementation, not conformance to an external named variant.
The [project review](docs/project-review-2026-09-05.md) records known defects and
rules decisions that remain open.

- Pieces move orthogonally any distance along an unobstructed path. They cannot
  jump occupied squares. Only the king may stop on restricted squares; other
  pieces may pass through an empty restricted square.
- Captures resulting from a move are mandatory and applied automatically.
  Omitting capture notation does not decline captures, and there is no rule
  requiring a player to choose a capturing move over another legal move.
- Ordinary pieces are captured by orthogonal sandwiching against hostile
  support. Restricted squares provide hostile support; a throne occupied by the
  king is hostile to attackers but not defenders. Physical-edge shieldwalls can
  capture multiple non-king pieces, so captures are not limited to four per move.
  See [capture implementation](src/captures.ts) for the exact predicates.
- King capture requires all four neighboring squares to be on the board and
  occupied by attackers or marked throne/restricted. A board boundary does not
  substitute for a hostile neighbor; shieldwalls exclude the king.
- A king move to a restricted non-throne square wins for the defenders. Simply
  reaching an ordinary edge square does not win. The separate
  [exit-fort rule](docs/exit-fort.md) evaluates a mobile edge king and a formation
  that survives structural capture analysis.
- After an attacker move, encirclement wins if no defender or king has an
  orthogonal route through empty or defender-occupied squares to a physical edge
  or non-throne restricted square unoccupied by an attacker. This is connectivity
  analysis, not a search for a sequence of playable escape moves.
- Repetition prevention applies only to the defender/king layout, ignoring
  attackers. Defender moves are checked against stored layouts. Any capture
  clears that history and records the resulting layout; the repetition check
  currently happens before that reset. The intended ordering remains open.
- There is no engine pass command or explicit no-legal-move terminal check.
  The notation sequence parser recognizes `P`, but engine application rejects it.

Capture aggregation can return the same piece twice, overcounting captures and
duplicating history coordinates (B1). Validation previews and generated moves
also have known consistency defects (B2–B3). These rules describe current
mechanisms, not a claim that those contracts are already correct.

## Engine API

Import the class from [src/HnefataflEngine.ts](src/HnefataflEngine.ts) in a
TypeScript/bundler consumer. The UI's actual entry is the module script in
[public/index.html](public/index.html). `public/main.js` is not referenced there.

```ts
import { HnefataflEngine } from './src/HnefataflEngine'

const engine = new HnefataflEngine()
const preview = engine.validateMove('D11-D10')
if (preview.isValid) {
    const result = engine.applyMove('D11-D10')
    if (result.success && result.newState) {
        console.log(result.newState.currentPlayer) // 'defender'
    }
}
```

| Method | Current contract |
| --- | --- |
| `reset(boardLayout?: string[]): void` | Initialize the standard or supplied layout; reset counters/history/status and start with the attacker. Invalid layouts can throw. |
| `getState(): GameState` | Return the live internal state. Treat it as read-only; it is not a protected snapshot. |
| `validateMove(moveStr: string): MoveValidationResult` | Parse and validate without committing. Return `isValid`, optional `reason`, `expectedCaptures: Coordinate[]`, and `status`. Preview status can disagree with application when capture notation is omitted (B2). |
| `applyMove(moveStr: string): ApplyMoveResult` | Revalidate and apply automatically discovered captures. Return `{ success: true, newState }` or `{ success: false, error }`. Advance the turn only while the resulting game remains in progress. |
| `applyMoveSequence(moveList: string): ApplyMoveResult` | Split on commas and apply in order to the current game. Stop at the first failure, retaining all earlier successful moves. Does not reset or roll back the sequence. |
| `getPossibleMoves(from: Coordinate): PossibleMove[]` | Return destinations and capture coordinates for one current-player piece. Does not check repetition (B3); returns `[]` after game end. Invalid coordinates can throw (B6). |

There are no facade methods named `getGameState` or `generatePossibleMoves`.
`generatePossibleMoves` is a lower-level function in `src/moveGenerator.ts`.

The source of truth for exported types is [src/types.ts](src/types.ts):

```ts
interface GameState {
    position: Square[][]
    currentPlayer: Player
    captured: { attacker: number; defender: number }
    moveHistory: string[]
    defenderPositions: string[][]
    status: GameStatus
}

interface Square {
    occupant: Piece | null
    isThrone: boolean
    isRestricted: boolean
}

interface Piece {
    owner: Player
    type: PieceType
}
```

`Player` values are `attacker` and `defender`; `PieceType` additionally includes
`king`. `GameStatus` values are `in_progress`, `attacker_win`, and `defender_win`.
Capture counters count pieces lost by the named side, including the king as a
defender. `Coordinate` is `{ x: number, y: number }`, indexed as `position[y][x]`:
`A11` is `{ x: 0, y: 0 }`, and `K1` is `{ x: 10, y: 10 }`.
`PossibleMove` contains `to: Coordinate` and `captures: Coordinate[]`.

Returned states and piece objects are mutable and shared. A saved state can have
its capture counters changed by a later move; shallow board clones also share
pieces (B5). Do not rely on snapshot isolation until W7 establishes it.

## Notation and layouts

Moves use files A–K and ranks 1–11: `D11-D10`. Optional capture annotations contain
concatenated coordinates, such as `D11-C11(B11)` or `D6-D8(D7E7)` (syntax examples;
legality depends on the position). A nonempty parsed capture list is checked
against discovered captures. Use uppercase coordinates: lowercase capture text,
out-of-range captures, and trailing junk are parsed inconsistently today (B4).
The parser does not reliably reject all malformed capture text.

The engine appends discovered captures to history when the input has no `(`;
otherwise it retains the supplied notation. History is not canonically
serialized. `parseMoveSequence` from [src/parser.ts](src/parser.ts) uppercases
tokens, recognizes `P` as `'pass'`, and silently drops unparseable tokens. It is
not used by `applyMoveSequence`, which stops at invalid input instead.

In the UI, **Load Game** parses notation into a selectable move list. It does not
reset or replay the engine. Current history labels start with the defender even
though the engine starts with the attacker (B8).

Custom layouts are arrays of square-board rows, ordered top to bottom:

| Character | Current default transformation |
| --- | --- |
| `A` / `a` | Attacker |
| `D` / `d` | Defender |
| `K` / `k` | Defender-owned king; also a restricted throne if no uppercase `T` occurs anywhere in the layout |
| `T` | Empty restricted throne; when present, the king's square is not implicitly a throne |
| `R` | Empty restricted non-throne square |
| Space / `.` | Empty ordinary square |
| Any other character | Silently treated as empty by the default mapping |

`initializeGame` checks for exactly one uppercase `K` before transformation.
A lowercase-only king is rejected, but a layout with both `K` and `k` can produce
two kings (B7). `transformLayoutToPosition` supports custom character mappings
and flexible fixtures without that king-count check.
Although initialization accepts other square sizes, notation is fixed to 11×11
and can throw on smaller layouts (B6). For current engine use, keep layouts
11×11 with one uppercase `K` and no lowercase `k`. This is usage guidance pending
W6, not an enforced size/alphabet contract.

## Maintenance and next work

- [Maintenance instructions](.github/copilot-instructions.md): commands, validation,
  module boundaries, and deployment behavior.
- [September 5 project review](docs/project-review-2026-09-05.md): B1–B8 defects,
  T1 tooling gaps, reproduction fixtures, and W1–W8 work packages.
- [Exit-fort notes](docs/exit-fort.md): structural semantics and regression examples.

W1 updates guidance only. W2 aligns runtime/configuration/check commands; W3–W4
cover bounded extraction and contracts. Functional corrections belong in W5–W8.
Resolve board-size/pass policy before W6 and state ownership before W7. Treat
Load Game semantics and accessibility changes as separate decisions within W8.
Do not infer the intended variant from the Rust reference project.

Package metadata still names a nonexistent `index.js` entry and declares no
library exports/types entry. W1 documents the browser-application target without
changing package metadata. In the next tooling package, decide whether to mark
the application `private` and remove the stale `main`; an engine distribution
should wait until reuse is explicitly in scope.

GitHub Actions runs installation, tests, and the build for pushes to `main` and
pull requests targeting `main`. The deployment job runs only for the `main` ref
and publishes `dist/` to GitHub Pages. A pull request does not deploy the site.

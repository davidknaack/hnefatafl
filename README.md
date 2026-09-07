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

Use Node 24.x, declared in `package.json` and `.nvmrc`. CI reads `.nvmrc` as
well. With nvm, run `nvm install` and `nvm use`; otherwise install Node 24 using
your preferred runtime manager. Node `v24.19.0` was used for the September 2026 checks.

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
| `npm run typecheck` | Check source/tests and the Vite/Vitest configuration |
| `npm run format` | Format tooling/configuration files with pinned Prettier |
| `npm run format:check` | Check tooling/configuration formatting without writing |
| `npm run build` | Bundle the browser app into ignored `dist/` output |
| `npm run preview` | Serve the existing build, normally at `http://localhost:4173/hnefatafl/` |

The build does not perform TypeScript checking; run `npm run typecheck` separately.
CI runs type checking, formatting checks, tests, and the build. Browser code in
`src/ui` is included in type checking. Formatting currently covers
package/lock metadata, TypeScript configs, `vite.config.ts`, `.prettierrc`, and
workflow YAML. Source, tests, UI, and Markdown are outside this initial formatting
scope to keep W2 focused; expand that scope in separately reviewed work. No
lint command is declared. See the [maintenance instructions](.github/copilot-instructions.md)
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
- Repetition compares full piece placement (attackers, defenders, and king)
  plus the side to move. The initial position counts once. After any capture,
  history restarts with the resulting position; otherwise each resulting position
  is appended. A second occurrence is allowed; the third ends the game as an
  attacker win, whichever side moved. The move is applied and recorded.
  Immediate board wins take precedence over repetition. There is no separate
  defender-only anti-stalling rule. Terrain is fixed within a game.
  These key/threshold choices make the project's repetition policy explicit;
  the [published Copenhagen rule 8](https://aagenielsen.dk/copenhagen_rules.php)
  assigns perpetual repetition to a defender loss without specifying either.
- There is no engine pass command or explicit no-legal-move terminal check.
  The notation sequence parser recognizes `P`, but engine application rejects it.

Capture coordinates are unique even when ordinary and shieldwall rules overlap.
Validation and application use the same resolved captures, post-move board, and
status. The facade's generated moves pass through that same resolver with the
current repetition history. These W5 corrections resolve B1–B3; they do not
establish full Copenhagen conformance for every other rule.

## Engine API

Import the class from [src/HnefataflEngine.ts](src/HnefataflEngine.ts) in a
TypeScript/bundler consumer. [public/index.html](public/index.html) loads a minimal
[bootstrap](public/main.js) for Vite's public root. The checked UI lives in
[src/ui](src/ui/main.ts): board and history rendering, selection/highlighting,
command handling, DOM bindings, and the extracted stylesheet.

```ts
import { HnefataflEngine } from './src/HnefataflEngine'

const engine = new HnefataflEngine()
const preview = engine.validateMove('D11-D10')
if (preview.isValid) {
    const result = engine.applyMove('D11-D10')
    if (result.success) {
        console.log(result.newState.currentPlayer) // 'defender'
    }
}
```

| Method | Current contract |
| --- | --- |
| `reset(boardLayout?: string[]): void` | Initialize the standard or supplied layout; reset counters/history/status and start with the attacker. Invalid layouts can throw. |
| `getState(): GameState` | Return the live internal state. Treat it as read-only; it is not a protected snapshot. |
| `validateMove(moveStr: string): MoveValidationResult` | Parse and validate without committing. Return `isValid`, optional `reason`, `expectedCaptures: Coordinate[]`, and `status`. Captures and status agree with application against the same state, with or without capture notation. |
| `applyMove(moveStr: string): ApplyMoveResult` | Revalidate and apply automatically discovered captures. Return `{ success: true, newState }` or `{ success: false, error }`. Advance the turn only while the resulting game remains in progress. |
| `applyMoveSequence(moveList: string): ApplyMoveResult` | Split on commas and apply in order to the current game. Stop at the first failure, retaining all earlier successful moves. Does not reset or roll back the sequence. |
| `getPossibleMoves(from: Coordinate): PossibleMove[]` | Return destinations and capture coordinates for one current-player piece using the same resolver/history as validation/application. Includes legal moves that end the game; returns `[]` after game end. Invalid coordinates can throw (B6). |

There are no facade methods named `getGameState` or `generatePossibleMoves`.
`generatePossibleMoves` is a lower-level geometry/capture function in
`src/moveGenerator.ts`, without game status or repetition context.
`generateMoveCandidates` exposes geometry alone; use the facade for legal moves.

The source of truth for exported types is [src/types.ts](src/types.ts):

```ts
interface GameState {
    position: Square[][]
    currentPlayer: Player
    captured: { attacker: number; defender: number }
    moveHistory: string[]
    positionHistory: string[]
    status: GameStatus
}

interface Square {
    occupant: Piece | null
    isThrone: boolean
    isRestricted: boolean
}

type Piece =
    | { readonly owner: Player.Attacker; readonly type: PieceType.Attacker }
    | { readonly owner: Player.Defender; readonly type: PieceType.Defender | PieceType.King }
```

`Player` values are `attacker` and `defender`; `PieceType` additionally includes
`king`. `GameStatus` values are `in_progress`, `attacker_win`, and `defender_win`.
Capture counters count pieces lost by the named side, including the king as a
defender. `Coordinate` is `{ x: number, y: number }`, indexed as `position[y][x]`:
`A11` is `{ x: 0, y: 0 }`, and `K1` is `{ x: 10, y: 10 }`.
`PossibleMove` contains `to: Coordinate` and `captures: Coordinate[]`.

Result types are discriminated unions: `success: true` guarantees `newState`,
and `success: false` guarantees `error: string`. Validation always includes
`expectedCaptures` and `status`; `isValid: false` guarantees `reason: string`.
Success branches exclude error/reason strings and application failures exclude
a committed state. Narrow on `success` or `isValid` before consuming branch data.

W4 tightens exported TypeScript contracts without changing returned object shapes.
Consumers constructing results must supply a literal discriminant and its required
payload. `Piece` and result types are now aliases rather than extensible interfaces.
Pieces require matching owner/type pairs, and their fields are readonly; replace
a square's occupant instead of editing a piece. Custom `charMap` occupants use
the same `Piece` type. Predeclared piece objects may need a `Piece` annotation or
`satisfies Piece` to retain enum literals. Existing repository consumers type-check.

W5 replaces `GameState.defenderPositions: string[][]` with
`positionHistory: string[]`, containing full-board/side-to-move keys. The fifth
argument of raw `validateMove` now takes those keys too. Raw callers must seed
history with `positionKey(initialPosition, initialPlayer)` from
`src/repetition.ts` and retain committed keys; omitting history provides no prior
occurrences. Old defender projections cannot be migrated without the attackers'
positions and turns; replay notation from the initial layout instead.
`extractDefenderPosition` remains available as a board utility. The low-level
`getGameStatusAfterMove` requires an already-applied board with captures removed;
use the resolver/facade when repetition matters.

Returned states remain mutable and shared; readonly piece fields are a TypeScript
constraint, not runtime freezing. Move application now calculates new counters
without mutating previous states. Shallow board clones still share pieces, and
callers can still modify engine state (B5). Do not rely on snapshot isolation
until W7 establishes it.

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
Mappings replace the entire default mapping for a character, including terrain.
Tests share two helpers in [src/test/fixtures.ts](src/test/fixtures.ts):
`layoutFixture` preserves the production `K`/`T` shorthand; `positionFixture`
places `K`/`k` on ordinary squares and requires `T` for throne terrain. Both allow
small boards and missing kings for isolated rules tests. Facade tests use
`engine.reset(layout)` to exercise initialization. These helpers are test-only,
not a new public position-construction API.
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

W1–W5 are complete: maintenance guidance and runtime/configuration/check
commands are aligned, UI/domain helpers are extracted, result/piece types and
fixture conventions are explicit, and capture/transition consistency is corrected.
Parsing/layout, state ownership, and UI corrections remain in W6–W8.
Resolve board-size/pass policy before W6 and state ownership before W7. Treat
Load Game semantics and accessibility changes as separate decisions within W8.
Do not infer the intended variant from the Rust reference project.

The package is marked `private` and has no library entry point. An engine
distribution should wait until reuse is explicitly in scope.

GitHub Actions runs installation, type and formatting checks, tests, and the build
for pushes to `main` and pull requests targeting `main`. The deployment job runs only for the `main` ref
and publishes `dist/` to GitHub Pages. A pull request does not deploy the site.

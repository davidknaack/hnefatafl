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
  Parsers reject `P`. Resignation concedes for the side to move.

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
| `getState(): GameState` | Return a detached snapshot, including independent rows, squares, pieces, counters, and histories. Editing it does not change the engine. |
| `validateMove(moveStr: string): MoveValidationResult` | Parse and validate without committing. Return `isValid`, optional `reason`, `expectedCaptures: Coordinate[]`, and `status`. Captures and status agree with application against the same state, with or without capture notation. |
| `applyMove(moveStr: string): ApplyMoveResult` | Revalidate and apply automatically discovered captures. Return `{ success: true, newState }` with a detached snapshot or `{ success: false, error }`. Advance the turn only while the resulting game remains in progress. |
| `applyMoveSequence(moveList: string): ApplyMoveResult` | Split on commas and apply in order to the current game. Success returns a detached final snapshot. Stop at the first failure, retaining all earlier successful moves. Does not reset or roll back the sequence. |
| `getPossibleMoves(from: Coordinate): PossibleMove[]` | Return destinations and capture coordinates for one current-player piece using the same resolver/history as validation/application. Includes legal moves that end the game; returns `[]` after game end or for invalid coordinates. |
| `loadGame(input: string): ApplyMoveResult` | Parse the portable game format and replay from the standard opening. Replace the current game only when the entire replay succeeds; failure preserves all state and saved tags. |
| `saveGame(): string` | Write canonical portable notation, including metadata, captures, and result. Throws for empty games or custom starting layouts, which the format cannot represent. |
| `resign(): ApplyMoveResult` | End an in-progress game as a loss for the side to move and append `---` to history. Requires at least one move, as specified by the game grammar. |

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

**W7 ownership contract:** `getState()` and successful move/sequence results
return fully detached, mutable snapshots. Every call owns its rows, squares,
piece objects, counters, and history arrays. Editing a snapshot affects only that
copy; subsequent moves, captures, failed commands, and resets leave saved
snapshots unchanged. No runtime freezing is used; readonly piece fields remain
a TypeScript constraint. Board cloning/application also copies occupants, and
layout transformation creates independent pieces for each square, including
pieces supplied through a custom `charMap`.

Consumers must call `getState()` again or use the next successful command result
to observe changes. Do not depend on reference equality between reads, or edit
a returned state to set up an engine position; use `reset(layout)` and replay
moves instead. Exported state/result shapes are unchanged. Snapshot copying
allocates a board and history arrays on each return.

## Load/save game format

**Load Game** validates and replays the complete game from the standard opening,
then replaces the current board, turn, counters, history, and result. Invalid
games show the first error with its move number and leave the current game and
selection unchanged. Both played and loaded history start with **A**, then **D**.
**Copy Game** writes canonical text; the input supports multiline tags and moves.

```text
[Event:Friendly game]
d11-d8 f8-e8 f10-f8xe8
```

The portable grammar is:

```ebnf
game        = { tag }, move-list ;
tag         = "[", tag-name, ":", tag-value, "]" ;
move-list   = move, { whitespace, move }, [ whitespace, resignation ] ;
move        = square, "-", square, [ captures ], [ terminal ] ;
captures    = "x", square, { "/", square } ;
terminal    = "++" | "--" ;
resignation = "---" ;
square      = letter, number ;
```

The reader accepts upper/lowercase letters, leading zeroes, surrounding
whitespace, and whitespace around move punctuation and between a square's letter
and digits. Moves require whitespace separators; spaces, tabs, and newlines all
work. Every character in the move list must be consumed. Commas, parenthesized captures, passes,
trailing junk, and empty move lists are not part of this game format. Squares must
resolve to a1–k11. Loaded moves must obey ownership, movement, capture, and
repetition rules. The reader also accepts repeated `x` separators (`a1-a3xb3xc3`)
and collapses repeated capture squares (`a1-a3xb3xb3`). After deduplication,
supplied captures must match the complete actual capture set; omitted captures
are discovered automatically. Incorrect capture squares still fail validation.

A single Copenhagen CSV row may be pasted directly. A trailing
`,capture-count,capture-count,state` summary, with two nonnegative integer
counts and `Ongoing`, `Black`, `White`, or `Draw`, is discarded. The counts and
state are never used to populate the game. A final `timeout` token before that
CSV summary is also discarded: external timeout results cannot be reconstructed
from moves, so the loaded status comes only from replay. This does not import
multiple rows or accept commas between moves. Metadata tags may still contain
commas. Saving emits the canonical game format without CSV fields or timeout
metadata. Genuine rule disagreements with games from other engines remain load
errors; malformed moves are not silently dropped.

`++` means the mover wins; `--` means the mover loses. Supplied markers must match
the replayed result. Omitted result markers are inferred. A standalone `---`
concedes for the side to move after the preceding move. Further moves or
resignation after game end are rejected.

Tags are optional, ordered, opaque metadata; they do not change the initial board,
rules, turn, or result. Names must be nonempty and cannot contain a colon, brackets,
or line breaks. Values may be empty and may contain colons, but cannot contain
brackets or line breaks. Names and values are trimmed. Unknown and repeated tags
are preserved in their original order and case. There is no escaping, reserved
tag schema, or custom-position format.

The writer emits one `[name:value]` tag per line, then one line of moves separated
by single spaces. Squares are lowercase with positive ranks and no leading zeroes.
All actual captures are included, sorted by file then numeric rank and separated
with `/`; the final move includes its terminal marker when appropriate. Resignation
is a separate final ` ---`, without marking the preceding move as a win or loss.
There is no trailing whitespace or newline. Loading and saving canonical text is
stable, and replay restores the same engine state. Empty games cannot be exported;
Copy Game is disabled until the first move.

`parseGame` in [src/gameFormat.ts](src/gameFormat.ts) consumes syntax and checks
square bounds; use `engine.loadGame` for full semantic validation. `serializeGame`
formats a validated record; use `engine.saveGame` for a resolved game. Custom
engine layouts remain supported by `reset(layout)`, but cannot be saved without a
setup representation, so saving one fails explicitly.

## Move command compatibility and layouts

Moves use files A–K and ranks 1–11: `D11-D10`. Optional capture annotations contain
concatenated coordinates, such as `D11-C11(B11)` or `D6-D8(D7E7)` (syntax examples;
legality depends on the position). A nonempty parsed capture list is checked
against discovered captures. Case is normalized and whitespace is ignored throughout
a move. The entire token must match: empty capture parentheses, out-of-range
captures, punctuation, and trailing junk are rejected. `parseMove` returns `null`
for invalid syntax; syntactically valid but incorrect captures fail validation.

`serializeMove` from [src/parser.ts](src/parser.ts) produces uppercase notation
without whitespace, retaining capture order. Engine history serializes the resolved
move, including all discovered captures in discovery order, so equivalent input
case/spacing and automatic/explicit captures yield the same history.

**W6 API change:** `parseMoveSequence` returns a discriminated result instead of an
array: `{ success: true, moves: Move[] }`, or
`{ success: false, moves: Move[], index: number, token: string, error: string }`.
On failure, `moves` is the parsed prefix, `index` is the zero-based comma-token
index, and `token` is its trimmed text. Error messages use one-based move numbers.
Empty input, empty tokens (including trailing commas), and `P` passes are rejected.
Passing is unsupported throughout the command API; W6 adds no no-legal-move rule.
`applyMoveSequence` shares this parser, commits the legal prefix, and reports the
first syntax or legality failure with its move number. It is still non-atomic.

These existing `parseMove`/`serializeMove`, `applyMove`, and `applyMoveSequence`
contracts remain available for command/API compatibility. Engine `moveHistory`
retains this notation, with a final `---` entry for resignation. It is not the
portable file format: use `loadGame`/`saveGame` for game interchange. UI history
uses the new lowercase display format, including captures and terminal markers.

Production game layouts are exactly 11×11, with rows ordered top to bottom:

| Character | Current default transformation |
| --- | --- |
| `A` / `a` | Attacker |
| `D` / `d` | Defender |
| `K` / `k` | Defender-owned king; also a restricted throne if no uppercase `T` occurs anywhere in the layout |
| `T` | Empty restricted throne; when present, the king's square is not implicitly a throne |
| `R` | Empty restricted non-throne square |
| Space / `.` | Empty ordinary square |
| Any other character | Rejected by game initialization |

`initializeGame` and `engine.reset(layout)` enforce the size and alphabet above,
then require exactly one king on the transformed board. Either `K` or `k` is
accepted; multiple kings are rejected regardless of case. Failed resets leave
the existing game unchanged. `transformLayoutToPosition` remains a flexible
square-layout utility: it supports other sizes, custom mappings, missing/multiple
kings, and unknown characters as empty squares with the default mapping.
Mappings replace the entire default mapping for a character, including terrain.
Tests share two helpers in [src/test/fixtures.ts](src/test/fixtures.ts):
`layoutFixture` preserves the production `K`/`T` shorthand; `positionFixture`
places `K`/`k` on ordinary squares and requires `T` for throne terrain. Both allow
small boards and missing kings for isolated rules tests. Facade tests use
`engine.reset(layout)` to exercise initialization. These helpers are test-only,
not a new public position-construction API.
Coordinates must be finite integers within the board. Invalid sources return
`[]` from facade and raw move generation; raw validation/resolution rejects
invalid source, destination, or capture coordinates before indexing. Raw functions
use the supplied board size, keeping small fixtures usable. Notation conversion
is fixed to 11×11: `coordFromString` returns `null` for invalid notation, while
`coordToString` (and consequently `serializeMove`) throws `RangeError` for invalid
coordinates instead of emitting invalid notation.

## Maintenance and next work

- [Maintenance instructions](.github/copilot-instructions.md): commands, validation,
  module boundaries, and deployment behavior.
- [September 5 project review](docs/project-review-2026-09-05.md): B1–B8 defects,
  T1 tooling gaps, reproduction fixtures, and W1–W8 work packages.
- [Exit-fort notes](docs/exit-fort.md): structural semantics and regression examples.

W1–W8's selected scope is complete: maintenance guidance and runtime/configuration/check
commands are aligned, UI/domain helpers are extracted, result/piece types and
fixture conventions are explicit, capture/transition consistency is corrected,
strict parsing, coordinate boundaries, and production layouts are enforced,
and engine state is protected by detached snapshots. W8 fixes history labels and
adds validated, atomic loading and canonical saving. Board keyboard navigation
and dialog focus changes remain outside the selected W8 scope.
Do not infer the intended variant from the Rust reference project.

The package is marked `private` and has no library entry point. An engine
distribution should wait until reuse is explicitly in scope.

GitHub Actions runs installation, type and formatting checks, tests, and the build
for pushes to `main` and pull requests targeting `main`. The deployment job runs only for the `main` ref
and publishes `dist/` to GitHub Pages. A pull request does not deploy the site.

npm init -y
npm install -D typescript vite

Hnefatafl Engine – Simplified SRS (Initial Version)
Target: Browser-compatible TypeScript module for use with web components

✅ Core Features
1. Board Initialization
Standard 11×11 Hnefatafl layout

Defenders, King, and Attackers placed per classic rules

Throne and corners marked for special rules

2. Game State Representation
ts
interface GameState {
  board: CellState[][];
  currentPlayer: "attacker" | "defender";
  captured: {
    attacker: number;
    defender: number;
  };
  moveHistory: string[];
  status: "in_progress" | "attacker_win" | "defender_win";
}
ts
interface CellState {
  occupant: "attacker" | "defender" | "king" | null;
  isThrone: boolean;
  isCorner: boolean;
}
3. Move Format
Moves are strings like:

ts
"E5-E6"                // No capture
"E7-E6(F9)"            // Single capture
"D6-D8(D7E7)"          // Multiple captures
"E5-E6, E7-E6(F9)"     // Sequence of moves
4. Validation API
ts
function validateMove(move: string): MoveValidationResult;
ts
interface MoveValidationResult {
  isValid: boolean;
  reason?: string;
  expectedCaptures: string[]; // e.g. ["F9", "D7"]
}
Parses one move at a time

Does not apply the move

Provides list of available captures for the move, but allows player to choose whether to apply them

Handles 0–4 capture directions (orthogonal only; max 3 is realistic but 4 is technically possible)

5. Commit API
ts
function applyMove(move: string): ApplyMoveResult;
ts
interface ApplyMoveResult {
  success: boolean;
  error?: string;
  newState?: GameState;
}
Revalidates move string

Checks if listed captures match what’s possible

Applies piece movement and capture(s)

Advances turn if valid

Returns updated game state or error

6. Game History Parsing
ts
function applyMoveSequence(moves: string): ApplyMoveResult;
Input: comma-separated string of moves

Applies moves in order, halts on first error

Returns final state or error

7. Design Constraints
No exceptions for validation errors — use clean return types

No mandatory captures

Moves must explicitly list desired captures, even if they’re available

Support for use inside a web component context

Engine must be fully functional in static files

No external state or async behavior

Minimal external dependencies (or none)

📌 Notes
Capturing multiple enemy pieces in one move is possible (up to 4).

If a move could capture but the player opts not to list any captures, it is legal.

Captures indicated that are not possible are rejected by the validator.


🧱 Code Architecture Overview
🧭 Design Philosophy
Modular: Small, focused files/classes for parsing, validation, state, and rules

Functional core + encapsulated engine class: Core logic is mostly pure functions (easy to test), wrapped by a stateful engine object

Stateless validation: Move validation can be run without mutating state (needed for preview in UI)

Web-component-friendly: No reliance on external frameworks or servers

📦 Module Breakdown
1. HnefataflEngine.ts (main public API)
Purpose: The single class you interact with to create a game, validate moves, apply them, and get the game state.

ts
class HnefataflEngine {
  constructor();
  getState(): GameState;
  validateMove(move: string): MoveValidationResult;
  applyMove(move: string): ApplyMoveResult;
  applyMoveSequence(moves: string): ApplyMoveResult;
  reset(): void;
}
Internally uses helpers below

Stores current GameState

All mutation goes through here

2. types.ts
Purpose: Strong, reusable TypeScript type definitions.

Includes:

ts
type Player = "attacker" | "defender";
type Piece = "attacker" | "defender" | "king";
interface Coordinate { file: string; rank: number; } // or x/y?
interface Move { from: Coordinate; to: Coordinate; captures: Coordinate[]; }

interface GameState { ... }
interface MoveValidationResult { ... }
interface ApplyMoveResult { ... }
interface CellState { ... }
3. board.ts
Purpose: Board structure + utilities (create board, get/set cells, clone board).

Functions:

createInitialBoard(): CellState[][]

cloneBoard(board: CellState[][]): CellState[][]

getPieceAt(board, coord): Piece | null

setPieceAt(board, coord, piece: Piece | null)

4. parser.ts
Purpose: Parse move strings like "E5-E6(D8F8)" into structured Move objects.

Functions:

parseMove(input: string): Move | Error

parseMoveSequence(input: string): Move[] | Error

5. validator.ts
Purpose: Stateless logic to validate moves.

Function:

ts
function validateMove(board: CellState[][], player: Player, move: Move): MoveValidationResult
Checks turn

Checks movement path (straight line, unobstructed)

Computes available captures based on new position

Does not mutate anything

6. rules.ts
Purpose: Capture-specific logic and win conditions.

Functions:

getAvailableCaptures(board, move): Coordinate[]

isKingCaptured(board): boolean

isKingEscaped(coord): boolean

isMoveLegal(...): reusable helper logic

7. utils.ts
Purpose: Coordinates, notation helpers, deep clone, etc.

Functions:

coordFromString("E5") → {x: 4, y: 6}

coordToString({x: 4, y: 6}) → "E5"

isCorner(coord), isThrone(coord)

deepClone()

🔄 State Machine?
We don’t need a formal state machine library, but we can model turns and statuses explicitly via GameState.status and GameState.currentPlayer. This gives us the benefit of state-machine-like clarity without the overhead.

ts
Copy
Edit
// status can be:
"in_progress" | "attacker_win" | "defender_win"
🧪 Testability
With this design:

All core logic (parsing, validation, rules) is easily unit tested in isolation

HnefataflEngine can be integration tested for full sequences

Can easily fake board state for testing specific edge cases (e.g., king surrounded by 3 on throne)

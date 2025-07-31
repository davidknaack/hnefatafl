export type Player = "attacker" | "defender";

export type Piece = "attacker" | "defender" | "king";

export interface Coordinate {
  x: number; // 0-based column
  y: number; // 0-based row
}

export interface Move {
  from: Coordinate;
  to: Coordinate;
  captures: Coordinate[];
}

export interface CellState {
  occupant: Piece | null;
  isThrone: boolean;
  isCorner: boolean;
}

export interface GameState {
  board: CellState[][];
  currentPlayer: Player;
  captured: {
    attacker: number;
    defender: number;
  };
  moveHistory: string[];
  status: "in_progress" | "attacker_win" | "defender_win";
}

export interface MoveValidationResult {
  isValid: boolean;
  reason?: string;
  expectedCaptures: Coordinate[];
}

export interface ApplyMoveResult {
  success: boolean;
  error?: string;
  newState?: GameState;
}

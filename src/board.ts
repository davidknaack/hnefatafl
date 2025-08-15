import { CellState, Move, Piece } from "./types";

export function cloneBoard(board: CellState[][]): CellState[][] {
  return board.map(row =>
    row.map(cell => ({ ...cell }))
  );
}

export function movePiece(board: CellState[][], move: Move): CellState[][] {
  const newBoard = cloneBoard(board);
  const piece = newBoard[move.from.y][move.from.x].occupant;
  newBoard[move.from.y][move.from.x].occupant = null;
  newBoard[move.to.y][move.to.x].occupant = piece;
  return newBoard;
}

export function extractDefenderPosition(board: CellState[][], move?: Move): string[] {
  return board.map((row, y) =>
    row
      .map((cell, x) => {
        let occ = cell.occupant;

        if (move) {
          if (x === move.from.x && y === move.from.y) occ = null;
          if (x === move.to.x && y === move.to.y) occ = board[move.from.y][move.from.x].occupant;
        }

        if (occ === Piece.Defender) return "D";
        if (occ === Piece.King) return "K";
        return " ";
      })
      .join("")
  );
}

export const STANDARD_BOARD = [
  "R  AAAAA  R",
  "     A     ",
  "           ",
  "A    D    A",
  "A   DDD   A",
  "AA DDKDD AA",
  "A   DDD   A",
  "A    D    A",
  "           ",
  "     A     ",
  "R  AAAAA  R",
]

export function createInitialBoard(boardLayout: string[]): CellState[][] {
  // Validation
  const size = boardLayout.length;
  if (size === 0) throw new Error("boardLayout array must not be empty");
  if (!boardLayout.every(row => row.length === size)) {
    throw new Error("All boardLayout rows must be the same length and equal to the number of rows (square board)");
  }

  let kingCount = 0;
  let restrictedCount = 0;
  let thronePos: { x: number, y: number } | null = null;

  // First pass: find king and restricted squares
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const c = boardLayout[y][x];
      if (c === 'K') {
        kingCount++;
        thronePos = { x, y };
      }
      if (c === 'R') restrictedCount++;
    }
  }
  if (kingCount !== 1) throw new Error("There must be exactly one king on the board");
  if (restrictedCount < 1) throw new Error("There must be at least one restricted square (not counting throne)");

  // Build board
  const board: CellState[][] = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const c = boardLayout[y][x];
      let occupant: CellState["occupant"] = null;
      let isThrone = false;
      let isRestricted = false;
      if (c === 'A') occupant = "attacker";
      else if (c === 'D') occupant = "defender";
      else if (c === 'K') {
        occupant = "king";
        isThrone = true;
        isRestricted = true;
      }
      else if (c === 'R') {
        isRestricted = true;
      }
      return {
        occupant,
        isThrone,
        isRestricted
      };
    })
  );
  return board;
}

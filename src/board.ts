import { CellState } from "./types";

export const BOARD_SIZE = 11;

export function cloneBoard(board: CellState[][]): CellState[][] {
  return board.map(row =>
    row.map(cell => ({ ...cell }))
  );
}

export function createInitialBoard(): CellState[][] {
  const emptyCell = (): CellState => ({
    occupant: null,
    isThrone: false,
    isCorner: false
  });

  const board: CellState[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, emptyCell)
  );

  const throne = { x: 5, y: 5 };
  board[throne.y][throne.x].isThrone = true;

  const corners = [
    { x: 0, y: 0 }, { x: 0, y: 10 },
    { x: 10, y: 0 }, { x: 10, y: 10 }
  ];
  corners.forEach(({ x, y }) => {
    board[y][x].isCorner = true;
  });

  const king = { x: 5, y: 5 };
  board[king.y][king.x].occupant = "king";

  const defenders = [
    { x: 5, y: 4 }, { x: 5, y: 6 },
    { x: 4, y: 5 }, { x: 6, y: 5 },
    { x: 5, y: 3 }, { x: 5, y: 7 },
    { x: 3, y: 5 }, { x: 7, y: 5 },
    { x: 4, y: 4 }, { x: 6, y: 4 },
    { x: 4, y: 6 }, { x: 6, y: 6 }
  ];
  defenders.forEach(({ x, y }) => {
    board[y][x].occupant = "defender";
  });

  const attackers = [
    { x: 5, y: 0 }, { x: 5, y: 1 }, { x: 5, y: 2 },
    { x: 0, y: 5 }, { x: 1, y: 5 }, { x: 2, y: 5 },
    { x: 10, y: 5 }, { x: 9, y: 5 }, { x: 8, y: 5 },
    { x: 5, y: 10 }, { x: 5, y: 9 }, { x: 5, y: 8 },
    { x: 4, y: 1 }, { x: 6, y: 1 }, { x: 1, y: 4 },
    { x: 1, y: 6 }, { x: 4, y: 9 }, { x: 6, y: 9 },
    { x: 9, y: 4 }, { x: 9, y: 6 }, { x: 3, y: 0 },
    { x: 7, y: 0 }, { x: 0, y: 3 }, { x: 0, y: 7 }
  ];
  attackers.forEach(({ x, y }) => {
    board[y][x].occupant = "attacker";
  });

  return board;
}

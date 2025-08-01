import { CellState, Coordinate, Move, MoveValidationResult, Player } from "./types";
import { coordToString } from "./utils";
import { getAvailableCaptures } from "./rules";

function isSameCoord(a: Coordinate, b: Coordinate): boolean {
  return a.x === b.x && a.y === b.y;
}

function isPathClear(board: CellState[][], from: Coordinate, to: Coordinate): boolean {
  if (from.x !== to.x && from.y !== to.y) return false; // not orthogonal

  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);

  let x = from.x + dx;
  let y = from.y + dy;

  while (x !== to.x || y !== to.y) {
    if (board[y][x].occupant) return false;
    x += dx;
    y += dy;
  }

  return true;
}


export function validateMove(board: CellState[][], player: Player, move: Move): MoveValidationResult {
  const fromCell = board[move.from.y][move.from.x];
  const toCell = board[move.to.y][move.to.x];

  if (!fromCell.occupant) {
    return { isValid: false, reason: "No piece at source", expectedCaptures: [] };
  }

  if (fromCell.occupant !== player && !(player === "defender" && fromCell.occupant === "king")) {
    return { isValid: false, reason: "Not your piece", expectedCaptures: [] };
  }

  if (toCell.occupant) {
    return { isValid: false, reason: "Destination is occupied", expectedCaptures: [] };
  }

  if (!isPathClear(board, move.from, move.to)) {
    return { isValid: false, reason: "Path is blocked", expectedCaptures: [] };
  }

  const expectedCaptures = getAvailableCaptures(board, move, player);

  for (const capture of move.captures) {
    const found = expectedCaptures.some(exp => isSameCoord(exp, capture));
    if (!found) {
      return {
        isValid: false,
        reason: `Invalid capture at ${coordToString(capture)}`,
        expectedCaptures
      };
    }
  }

  return { isValid: true, expectedCaptures };
}

import { CellState, Coordinate, Move, MoveValidationResult, Player } from "./types";
import { coordToString } from "./utils";

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

function getAvailableCaptures(board: CellState[][], move: Move, player: Player): Coordinate[] {
  const captures: Coordinate[] = [];
  const opponent = player === "attacker" ? ["defender", "king"] : ["attacker"];

  const directions = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 }
  ];

  for (const { dx, dy } of directions) {
    const midX = move.to.x + dx;
    const midY = move.to.y + dy;
    const beyondX = move.to.x + dx * 2;
    const beyondY = move.to.y + dy * 2;

    if (
      midX < 0 || midX >= board.length || midY < 0 || midY >= board.length ||
      beyondX < 0 || beyondX >= board.length || beyondY < 0 || beyondY >= board.length
    ) continue;

    const middle = board[midY][midX];
    const beyond = board[beyondY][beyondX];

    if (
      middle.occupant &&
      opponent.includes(middle.occupant) &&
      (beyond.occupant === player ||
        beyond.isThrone ||
        beyond.isCorner)
    ) {
      captures.push({ x: midX, y: midY });
    }
  }

  return captures;
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

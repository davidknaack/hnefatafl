import { CellState, Coordinate, Move, Player } from "./types";

// Same logic as in validator
export function getAvailableCaptures(
  board: CellState[][],
  move: Move,
  player: Player
): Coordinate[] {
  const captures: Coordinate[] = [];
  const opponent = player === "attacker" ? ["defender", "king"] : ["attacker"];

  const directions = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 }
  ];

  const size = board.length;

  function kingWouldBeCaptured(x: number, y: number): boolean {
    if (player !== "attacker") return false;

    const checks = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    let surrounded = 0;
    for (const { dx, dy } of checks) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) return false;

      const cell = board[ny][nx];
      let occ = cell.occupant;

      if (nx === move.from.x && ny === move.from.y) occ = null;
      if (nx === move.to.x && ny === move.to.y) occ = player;

      if (cell.isThrone || cell.isCorner || occ === "attacker") {
        surrounded++;
      }
    }

    return surrounded >= 4;
  }

  for (const { dx, dy } of directions) {
    const midX = move.to.x + dx;
    const midY = move.to.y + dy;
    const beyondX = move.to.x + dx * 2;
    const beyondY = move.to.y + dy * 2;

    if (
      midX < 0 || midX >= size || midY < 0 || midY >= size ||
      beyondX < 0 || beyondX >= size || beyondY < 0 || beyondY >= size
    ) continue;

    const middle = board[midY][midX];
    const beyond = board[beyondY][beyondX];

    if (middle.occupant === "king") {
      if (kingWouldBeCaptured(midX, midY)) {
        captures.push({ x: midX, y: midY });
      }
    } else if (
      middle.occupant &&
      opponent.includes(middle.occupant) &&
      (beyond.occupant === player || beyond.isThrone || beyond.isCorner)
    ) {
      captures.push({ x: midX, y: midY });
    }
  }

  return captures;
}

export function isKingCaptured(board: CellState[][]): boolean {
  const size = board.length;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x].occupant === "king") {
        // Look around for attackers or capture squares
        const adj = [
          { x: x - 1, y },
          { x: x + 1, y },
          { x, y: y - 1 },
          { x, y: y + 1 }
        ];

        let surrounded = 0;
        for (const { x: nx, y: ny } of adj) {
          if (
            nx >= 0 && ny >= 0 && nx < size && ny < size &&
            (board[ny][nx].occupant === "attacker" ||
              board[ny][nx].isThrone ||
              board[ny][nx].isCorner)
          ) {
            surrounded++;
          }
        }

        return surrounded >= 4;
      }
    }
  }

  return false;
}

export function isKingEscaped(coord: Coordinate, boardSize = 11): boolean {
  return (
    (coord.x === 0 || coord.x === boardSize - 1) &&
    (coord.y === 0 || coord.y === boardSize - 1)
  );
}

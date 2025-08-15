import { CellState, Coordinate, Move, Player, PieceType } from "./types";

export function getAvailableCaptures(
  board: CellState[][],
  move: Move,
  player: Player
): Coordinate[] {
  const captures: Coordinate[] = [];
  const opponentTypes = player === Player.Attacker ? [PieceType.Defender, PieceType.King] : [PieceType.Attacker];

  const directions = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 }
  ];

  const size = board.length;

  function kingCanBeCaptured(x: number, y: number): boolean {
    if (player !== Player.Attacker) 
      return false;

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

      if (nx === move.from.x && ny === move.from.y)
        occ = null;
      if (nx === move.to.x && ny === move.to.y) 
        occ = { owner: player, type: player === Player.Attacker ? PieceType.Attacker : PieceType.Defender };

      if (cell.isThrone || cell.isRestricted || (occ && occ.type === PieceType.Attacker))
        surrounded++;
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

    if (middle.occupant && middle.occupant.type === PieceType.King) {
      if (kingCanBeCaptured(midX, midY)) {
        captures.push({ x: midX, y: midY });
      }
    } else if (
      middle.occupant &&
      opponentTypes.includes(middle.occupant.type) &&
      ((beyond.occupant && beyond.occupant.owner === player) || beyond.isThrone || beyond.isRestricted)
    ) {
      captures.push({ x: midX, y: midY });
    }
  }

  return captures;
}

export function isKingCaptured(board: CellState[][]): boolean {
  for (const row of board) {
    for (const cell of row) {
      if (cell.occupant && cell.occupant.type === PieceType.King)
        return false;
    }
  }
  return true;
}

export function isKingEscaped(coord: Coordinate, boardSize = 11): boolean {
  return (
    (coord.x === 0 || coord.x === boardSize - 1) &&
    (coord.y === 0 || coord.y === boardSize - 1)
  );
}

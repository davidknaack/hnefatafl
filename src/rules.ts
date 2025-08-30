import { CellState, Coordinate, Move, Player, PieceType } from "./types";

// Shared hostility rule (pure): determines if a square is hostile to an owner,
// given the cell and its occupant. This encodes throne/restricted behavior and
// opponent occupancy, and should be the single source of truth for hostility.
export function isSquareHostileTo(
  cell: CellState,
  owner: Player,
  occupant: CellState["occupant"]
): boolean {
  if (cell.isRestricted) {
    if (cell.isThrone && occupant && occupant.type === PieceType.King) {
      // Occupied throne is not hostile to defenders
      return owner === Player.Attacker;
    }
    return true;
  }
  if (occupant) return occupant.owner !== owner;
  return false;
}

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

  // Helper: occupant as if the move has been applied
  function getOccupantAfter(x: number, y: number): CellState["occupant"] {
    if (x === move.from.x && y === move.from.y) return null;
    if (x === move.to.x && y === move.to.y) {
      const moved = board[move.from.y][move.from.x].occupant!;
      return moved;
    }
    return board[y][x].occupant;
  }

  // Helper: determine if a cell is hostile to a given owner after applying move
  function isHostileTo(owner: Player, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= size || y >= size) return false;
    const cell = board[y][x];
    const occ = getOccupantAfter(x, y);
    return isSquareHostileTo(cell, owner, occ);
  }

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
      let occ = getOccupantAfter(nx, ny);

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

    if (middle.occupant && middle.occupant.type === PieceType.King) {
      if (kingCanBeCaptured(midX, midY)) {
        captures.push({ x: midX, y: midY });
      }
    } else if (
      middle.occupant &&
      opponentTypes.includes(middle.occupant.type)
    ) {
      // Use unified hostility check: the square beyond must be hostile
      // to the owner of the middle piece for a capture to occur.
      const opponentOwner = middle.occupant.owner;
      const hostileBoundary = isHostileTo(opponentOwner, beyondX, beyondY);
      if (hostileBoundary) {
        captures.push({ x: midX, y: midY });
      }
    }
  }

  // Edge-enclosure captures: capture contiguous opponent lines on edges
  // Only if enclosure is created by this move.
  function collectEdgeEnclosures() {
    const opponentOwner: Player = player === Player.Attacker ? Player.Defender : Player.Attacker;

    type Edge = { kind: 'left'|'right'|'top'|'bottom', coords: (idx: number) => Coordinate, len: number, inward: (c: Coordinate) => Coordinate };

    const edges: Edge[] = [
      {
        kind: 'left',
        len: size,
        coords: (i) => ({ x: 0, y: i }),
        inward: (c) => ({ x: c.x + 1, y: c.y })
      },
      {
        kind: 'right',
        len: size,
        coords: (i) => ({ x: size - 1, y: i }),
        inward: (c) => ({ x: c.x - 1, y: c.y })
      },
      {
        kind: 'top',
        len: size,
        coords: (i) => ({ x: i, y: 0 }),
        inward: (c) => ({ x: c.x, y: c.y + 1 })
      },
      {
        kind: 'bottom',
        len: size,
        coords: (i) => ({ x: i, y: size - 1 }),
        inward: (c) => ({ x: c.x, y: c.y - 1 })
      }
    ];

    function isOpponentPieceAfter(c: Coordinate): boolean {
      const occ = getOccupantAfter(c.x, c.y);
      return !!(occ && occ.owner === opponentOwner && occ.type !== PieceType.King);
    }

    for (const edge of edges) {
      let i = 0;
      while (i < edge.len) {
        // Find start of opponent segment after move
        while (i < edge.len && !isOpponentPieceAfter(edge.coords(i))) i++;
        if (i >= edge.len) break;
        const start = i;
        while (i < edge.len && isOpponentPieceAfter(edge.coords(i))) i++;
        const end = i - 1;

        // Build the set of adjacency squares to check for hostility (after and before)
        const segment: Coordinate[] = [];
        for (let j = start; j <= end; j++) segment.push(edge.coords(j));

        const adjAfter: Coordinate[] = [];
        const adjBefore: Coordinate[] = [];

        // Inward neighbors for all in segment
        for (const c of segment) {
          const inward = edge.inward(c);
          adjAfter.push(inward);
          adjBefore.push(inward);
        }

        // Endpoint neighbors along the same edge
        const startNeighbor = start - 1;
        const endNeighbor = end + 1;
        if (startNeighbor >= 0) {
          adjAfter.push(edge.coords(startNeighbor));
          adjBefore.push(edge.coords(startNeighbor));
        }
        if (endNeighbor < edge.len) {
          adjAfter.push(edge.coords(endNeighbor));
          adjBefore.push(edge.coords(endNeighbor));
        }

        // Check enclosure after the move
        const enclosedAfter = adjAfter.every((a) => isHostileTo(opponentOwner, a.x, a.y));

        if (!enclosedAfter) continue;

        // Check enclosure before the move: simulate pre-move hostility
        function isHostileToBefore(owner: Player, x: number, y: number): boolean {
          if (x < 0 || y < 0 || x >= size || y >= size) return false;
          const cell = board[y][x];
          const occ = board[y][x].occupant;
          if (cell.isRestricted) {
            if (cell.isThrone && occ && occ.type === PieceType.King) {
              return owner === Player.Attacker;
            }
            return true;
          }
          if (occ) return occ.owner !== owner;
          return false;
        }

        const enclosedBefore = adjBefore.every((a) => isHostileToBefore(opponentOwner, a.x, a.y));

        if (!enclosedBefore) {
          // Newly enclosed by this move -> capture all in segment
          for (const c of segment) {
            captures.push({ x: c.x, y: c.y });
          }
        }
      }
    }
  }

  collectEdgeEnclosures();

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

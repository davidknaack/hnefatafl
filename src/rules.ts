import { GameStatus, PieceType, Player, CellState, Move, Coordinate } from "./types";
import { defendersCanEscape } from "./utils";
import { extractEdges } from "./board";

// Returns the game status after a move is applied
export function getGameStatusAfterMove(board: CellState[][], move: Move, currentPlayer: Player): GameStatus {
  // Be robust whether the board has been mutated yet or not
  const piece =
    board[move.to.y][move.to.x].occupant ||
    board[move.from.y][move.from.x].occupant;
  
  if (isKingCaptured(board)) {
    return GameStatus.AttackerWin;
  } else if (piece && piece.type === PieceType.King && isKingEscaped(move.to, board.length)) {
    return GameStatus.DefenderWin;
  }

  // Check for encirclement after attacker moves
  if (currentPlayer === Player.Attacker) {
    const edges = extractEdges(board);
    if (!defendersCanEscape(board, edges)) {
      return GameStatus.AttackerWin;
    }
  }
  
  return GameStatus.InProgress;
}

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
  player: Player,
  edges: Set<string>
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
  function collectEdgeEnclosuresFromSet() {
    const opponentOwner: Player = player === Player.Attacker ? Player.Defender : Player.Attacker;

    // For each edge coordinate, scan for contiguous opponent segments
    // edges is a Set<string> of "x,y"
    const edgeCoords: Coordinate[] = Array.from(edges).map(e => {
      const [x, y] = e.split(",").map(Number);
      return { x, y };
    });

    // Group edgeCoords by row and column for scanning
    const byRow: Map<number, Coordinate[]> = new Map();
    const byCol: Map<number, Coordinate[]> = new Map();
    for (const c of edgeCoords) {
      if (!byRow.has(c.y)) byRow.set(c.y, []);
      byRow.get(c.y)!.push(c);
      if (!byCol.has(c.x)) byCol.set(c.x, []);
      byCol.get(c.x)!.push(c);
    }

    // Helper to scan a line (row or col)
    function scanLine(coords: Coordinate[], getInward: (c: Coordinate) => Coordinate) {
      coords.sort((a, b) => getInward(a).x - getInward(b).x || getInward(a).y - getInward(b).y);
      // Helper: isOpponentPieceAfter for this scan
      function isOpponentPieceAfter(c: Coordinate): boolean {
        const occ = getOccupantAfter(c.x, c.y);
        return !!(occ && occ.owner === opponentOwner && occ.type !== PieceType.King);
      }
      let i = 0;
      while (i < coords.length) {
        // Find start of opponent segment after move
        while (i < coords.length && !isOpponentPieceAfter(coords[i])) i++;
        if (i >= coords.length) break;
        const start = i;
        while (i < coords.length && isOpponentPieceAfter(coords[i])) i++;
        const end = i - 1;

        // Build the set of adjacency squares to check for hostility (after and before)
        const segment: Coordinate[] = [];
        for (let j = start; j <= end; j++) segment.push(coords[j]);

        const adjAfter: Coordinate[] = [];
        const adjBefore: Coordinate[] = [];

        // Inward neighbors for all in segment
        for (const c of segment) {
          const inward = getInward(c);
          adjAfter.push(inward);
          adjBefore.push(inward);
        }

        // Endpoint neighbors along the same edge
        const startNeighbor = start - 1;
        const endNeighbor = end + 1;
        if (startNeighbor >= 0) {
          adjAfter.push(coords[startNeighbor]);
          adjBefore.push(coords[startNeighbor]);
        }
        if (endNeighbor < coords.length) {
          adjAfter.push(coords[endNeighbor]);
          adjBefore.push(coords[endNeighbor]);
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

    // Scan all rows (horizontal edges)
    for (const [y, coords] of byRow.entries()) {
      scanLine(coords, c => ({ x: c.x, y: c.y === 0 ? c.y + 1 : c.y - 1 }));
    }
    // Scan all columns (vertical edges)
    for (const [x, coords] of byCol.entries()) {
      scanLine(coords, c => ({ x: c.x === 0 ? c.x + 1 : c.x - 1, y: c.y }));
    }
  }

  collectEdgeEnclosuresFromSet();

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

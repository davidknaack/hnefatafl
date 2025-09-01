import { Coordinate, Square, Player, PieceType } from "./types";
import { COORD_CAPTURE_RE } from "./patterns";

/**
 * Checks if any defender can reach a board edge or non-throne restricted square.
 * Uses multi-start DFS from all defender positions.
 *
 * @param position Square[][] representing the game position
 * @param edgeSquares Set of edge positions as Coordinate objects
 * @returns true if any defender can reach an edge square, false otherwise
 */
export function defendersCanEscape(
  position: Square[][],
  edgeSquares: Set<Coordinate>
): boolean {
  const visited = new Set<string>();
  const stack: {x: number, y: number}[] = [];

  // Efficiently filter out edge squares occupied by attackers
  const validEdges = new Set<string>();
  for (const coord of edgeSquares) {
    const x = coord.x, y = coord.y;
    const square = position[y][x];
    // Edge is valid if not occupied by an attacker
    if (!square.occupant || square.occupant.owner !== Player.Attacker) {
      validEdges.add(`${x},${y}`);
    }
  }

  // Find all defender positions (including king) from the position
  for (let y = 0; y < position.length; y++) {
    for (let x = 0; x < position[0].length; x++) {
      const square = position[y][x];
      if (square.occupant && (
        square.occupant.type === PieceType.Defender ||
        square.occupant.type === PieceType.King
      )) {
        const key = `${x},${y}`;
        stack.push({x, y});
        visited.add(key);
      }
    }
  }

  const directions = [
    {dx: 0, dy: -1}, // up
    {dx: 0, dy: 1},  // down
    {dx: -1, dy: 0}, // left
    {dx: 1, dy: 0},  // right
  ];

  const inBounds = (x: number, y: number) =>
    y >= 0 && y < position.length && x >= 0 && x < position[0].length;

  while (stack.length > 0) {
    const current = stack.pop()!;
    const key = `${current.x},${current.y}`;
    if (validEdges.has(key)) {
      return true; // Found escape path!
    }
    for (const {dx, dy} of directions) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const nkey = `${nx},${ny}`;
      if (inBounds(nx, ny) && !visited.has(nkey)) {
        const square = position[ny][nx];
        // Can move through empty squares or squares with friendly pieces
        if (!square.occupant || 
            square.occupant.owner === Player.Defender) {
          stack.push({x: nx, y: ny});
          visited.add(nkey);
        }
      }
    }
  }
  // If we exhaust all reachable squares and never touch an edge
  return false;
}

export function coordFromString(input: string): Coordinate | null {
  const match = COORD_CAPTURE_RE.exec(input.trim().toUpperCase());
  if (!match) return null;
  const file = match[1].charCodeAt(0) - 65;
  const rank = 11 - parseInt(match[2], 10);
  return { x: file, y: rank };
}

export function coordToString(coord: Coordinate): string {
  const file = String.fromCharCode(65 + coord.x);
  const rank = 11 - coord.y;
  return `${file}${rank}`;
}
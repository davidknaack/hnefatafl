/**
 * Checks if any defender can reach a board edge or non-throne restricted square.
 * Uses multi-start DFS from all defender positions.
 *
 * @param board 2D array representing the board state
 * @param edges Set of edge positions (or escape squares) as strings 'x,y'
 * @returns true if any defender can escape, false otherwise
 */
export function defendersCanEscape(
  board: any[][],
  edges: Set<string>
): boolean {
  const visited = new Set<string>();
  const stack: {x: number, y: number}[] = [];

  // Efficiently filter out edge squares occupied by attackers
  const validEdges = new Set<string>();
  for (const key of edges) {
    const [xStr, yStr] = key.split(",");
    const x = Number(xStr), y = Number(yStr);
    if (board[y][x] !== 'attacker') {
      validEdges.add(key);
    }
  }

  // Find all defender positions from the board
  for (let y = 0; y < board.length; y++) {
    for (let x = 0; x < board[0].length; x++) {
      if (board[y][x] === 'defender') {
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
    y >= 0 && y < board.length && x >= 0 && x < board[0].length;

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
      if (
        inBounds(nx, ny) &&
        !visited.has(nkey) &&
        (board[ny][nx] === null || board[ny][nx] === 'defender')
      ) {
        stack.push({x: nx, y: ny});
        visited.add(nkey);
      }
    }
  }
  // If we exhaust all reachable squares and never touch an edge
  return false;
}
import { Coordinate, CellState } from "./types";
import { COORD_CAPTURE_RE } from "./patterns";

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
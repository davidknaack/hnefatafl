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
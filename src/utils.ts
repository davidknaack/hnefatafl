import { Coordinate, CellState } from "./types";

export function coordFromString(input: string): Coordinate | null {
  const match = /^([A-K])([1-9]|10|11)$/.exec(input.trim().toUpperCase());
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

export function isThrone(cell: CellState): boolean {
  return cell.isThrone;
}

export function isCorner(cell: CellState): boolean {
  return cell.isCorner;
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
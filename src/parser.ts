import { Coordinate, Move } from "./types";

function parseCoord(input: string): Coordinate | null {
  const match = /^([A-K])(10|11|[1-9])$/.exec(input.trim().toUpperCase());
  if (!match) return null;
  const file = match[1].charCodeAt(0) - 65;
  const rank = 11 - parseInt(match[2], 10);
  return { x: file, y: rank };
}

export function parseMove(input: string): Move | null {
  const pattern = /^([A-K](?:10|11|[1-9]))-([A-K](?:10|11|[1-9]))(?:\(([^)]+)\))?$/i;
  const cleaned = input.trim().replace(/\s+/g, "");
  const match = pattern.exec(cleaned);
  if (!match) return null;

  const from = parseCoord(match[1]);
  const to = parseCoord(match[2]);
  if (!from || !to) return null;

  const captures = [];
  const captureChunk = match[3];
  if (captureChunk) {
    // Parse captures by matching coordinate patterns
    const capturePattern = /[A-K](?:10|11|[1-9])/g;
    let captureMatch;
    while ((captureMatch = capturePattern.exec(captureChunk)) !== null) {
      const cap = parseCoord(captureMatch[0]);
      if (cap) captures.push(cap);
    }
  }

  return { from, to, captures };
}

export function parseMoveSequence(input: string): (Move | "pass")[] {
  return input
    .split(",")
    .map(part => part.trim().toUpperCase())
    .map(token => token === "P" ? "pass" : parseMove(token))
    .filter(m => m !== null) as (Move | "pass")[];
}

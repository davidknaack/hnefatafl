import { Coordinate, Move } from "./types";
import { coordFromString } from "./utils";


export function parseMove(input: string): Move | null {
  const pattern = /^([A-K](?:10|11|[1-9]))-([A-K](?:10|11|[1-9]))(?:\(([^)]+)\))?$/i;
  const cleaned = input.trim().replace(/\s+/g, "");
  const match = pattern.exec(cleaned);
  if (!match) return null;

  const from = coordFromString(match[1]);
  const to = coordFromString(match[2]);
  if (!from || !to) return null;

  const captures = [];
  const captureChunk = match[3];
  if (captureChunk) {
    // Parse captures by matching coordinate patterns
    const capturePattern = /[A-K](?:10|11|[1-9])/g;
    let captureMatch;
    while ((captureMatch = capturePattern.exec(captureChunk)) !== null) {
      const cap = coordFromString(captureMatch[0]);
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

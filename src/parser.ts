import { Coordinate, Move } from "./types";
import { coordFromString } from "./utils";
import { MOVE_RE, CAPTURE_RE } from "./patterns";


export function parseMove(input: string): Move | null {
  const cleaned = input.trim().replace(/\s+/g, "");
  const match = MOVE_RE.exec(cleaned);
  if (!match) return null;

  const from = coordFromString(match[1]);
  const to = coordFromString(match[2]);
  if (!from || !to) return null;

  const captures = [];
  const captureChunk = match[3];
  if (captureChunk) {
    // Parse captures by matching coordinate patterns
    let captureMatch;
    while ((captureMatch = CAPTURE_RE.exec(captureChunk)) !== null) {
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

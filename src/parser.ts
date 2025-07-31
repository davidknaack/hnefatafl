import { Coordinate, Move } from "./types";

function parseCoord(input: string): Coordinate | null {
  const match = /^([A-K])([1-9]|10|11)$/.exec(input.trim().toUpperCase());
  if (!match) return null;
  const file = match[1].charCodeAt(0) - 65;
  const rank = 11 - parseInt(match[2], 10);
  return { x: file, y: rank };
}

export function parseMove(input: string): Move | null {
  const pattern = /^([A-K][1-9]|10|11)-([A-K][1-9]|10|11)(?:\(([A-K][1-9]|10|11)*\))?$/i;
  const cleaned = input.trim().replace(/\s+/g, "");
  const match = /^([A-K][1-9]|10|11)-([A-K][1-9]|10|11)(?:\(([A-K0-9]+)\))?$/i.exec(cleaned);
  if (!match) return null;

  const from = parseCoord(match[1]);
  const to = parseCoord(match[2]);
  if (!from || !to) return null;

  const captures = [];
  const captureChunk = match[3];
  if (captureChunk) {
    for (let i = 0; i < captureChunk.length; i += 2) {
      const cap = parseCoord(captureChunk.slice(i, i + 2));
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

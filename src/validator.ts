import { Square, Coordinate, Move, MoveValidationResult, Player, PieceType, GameStatus } from "./types";
import { coordToString } from "./utils";
import { getAvailableCaptures } from "./rules";
import { getGameStatusAfterMove } from "./rules";
import { extractDefenderPosition, applyMoveToPosition } from "./board";

function isSameCoord(a: Coordinate, b: Coordinate): boolean {
  return a.x === b.x && a.y === b.y;
}

function isPathClear(position: Square[][], from: Coordinate, to: Coordinate): boolean {
  if (from.x !== to.x && from.y !== to.y) return false; // not orthogonal

  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);

  let x = from.x + dx;
  let y = from.y + dy;

  while (x !== to.x || y !== to.y) {
    if (position[y][x].occupant) return false;
    x += dx;
    y += dy;
  }

  return true;
}


export function validateMove(
  position: Square[][],
  player: Player,
  move: Move,
  escapePoints: Set<Coordinate>,
  defenderPositions: string[][] = []
): MoveValidationResult {
  const fromSquare = position[move.from.y][move.from.x];
  const toSquare = position[move.to.y][move.to.x];

  if (!fromSquare.occupant)
    return { isValid: false, reason: "No piece at source", expectedCaptures: [], status: GameStatus.InProgress };

  if (fromSquare.occupant.owner !== player && !(player === Player.Defender && fromSquare.occupant.type === PieceType.King))
    return { isValid: false, reason: "Not your piece", expectedCaptures: [], status: GameStatus.InProgress };

  if (toSquare.occupant)
    return { isValid: false, reason: "Destination is occupied", expectedCaptures: [], status: GameStatus.InProgress };

  if (!isPathClear(position, move.from, move.to))
    return { isValid: false, reason: "Path is blocked", expectedCaptures: [], status: GameStatus.InProgress };

  if (fromSquare.occupant.type !== PieceType.King && toSquare.isRestricted)
    return { isValid: false, reason: "Cannot move to restricted square", expectedCaptures: [], status: GameStatus.InProgress };

  const expectedCaptures = getAvailableCaptures(position, move, player, escapePoints);

  // If captures were explicitly provided, validate them
  if (move.captures.length > 0) {
    // Check if provided captures match the expected ones
    if (move.captures.length !== expectedCaptures.length || 
        !expectedCaptures.every(expected => 
          move.captures.some(capture => isSameCoord(capture, expected))
        )) {
      return {
        isValid: false,
        reason: `Invalid captures. Expected ${expectedCaptures.length} specific captures.`,
        expectedCaptures,
        status: GameStatus.InProgress
      };
    }

    // Validate that all provided captures are valid
    for (const capture of move.captures) {
      const found = expectedCaptures.some(exp => isSameCoord(exp, capture));
      if (!found) {
        return {
          isValid: false,
          reason: `Invalid capture at ${coordToString(capture)}`,
          expectedCaptures,
          status: GameStatus.InProgress
        };
      }
    }
  }
  
  // At this point, either no captures were provided, or they exactly match the expected captures

  if (player === "defender") {
    const pos = extractDefenderPosition(position, move);
    const repeat = defenderPositions.some(
      p => p.length === pos.length && p.every((r, i) => r === pos[i])
    );
    if (repeat) {
      return {
        isValid: false,
        reason: "Move would repeat defender board position",
        expectedCaptures,
        status: GameStatus.InProgress
      };
    }
  }

  // Determine status on a simulated post-move board (including captures)
  const previewPosition = applyMoveToPosition(position, move, { applyCaptures: true });
  const status = getGameStatusAfterMove(previewPosition, move, player);
  return { isValid: true, expectedCaptures, status };
}

import { Square, Move, Piece, Player, PieceType, Coordinate } from "./types";

export function clonePosition(position: Square[][]): Square[][] {
  return position.map(row =>
    row.map(square => ({ ...square }))
  );
}

export function extractDefenderPosition(position: Square[][], move?: Move): string[] {
  return position.map((row, y) =>
    row
      .map((square, x) => {
        let occ = square.occupant;

        if (move) {
          if (x === move.from.x && y === move.from.y) occ = null;
          if (x === move.to.x && y === move.to.y) occ = position[move.from.y][move.from.x].occupant;
        }

        if (occ && occ.type === PieceType.Defender) return "D";
        if (occ && occ.type === PieceType.King) return "K";
        return " ";
      })
      .join("")
  );
}

// Create a new position with the move applied. Optionally remove captured pieces.
export function applyMoveToPosition(
  position: Square[][],
  move: Move,
  options: { applyCaptures?: boolean } = {}
): Square[][] {
  const { applyCaptures = true } = options;
  const next = clonePosition(position);

  const moving = next[move.from.y][move.from.x].occupant;
  next[move.from.y][move.from.x].occupant = null;
  next[move.to.y][move.to.x].occupant = moving;

  if (applyCaptures) {
    for (const cap of move.captures) {
      next[cap.y][cap.x].occupant = null;
    }
  }

  return next;
}

export const STANDARD_BOARD = [
  "R  AAAAA  R",
  "     A     ",
  "           ",
  "A    D    A",
  "A   DDD   A",
  "AA DDKDD AA",
  "A   DDD   A",
  "A    D    A",
  "           ",
  "     A     ",
  "R  AAAAA  R",
]

export interface GameSetup {
  position: Square[][];
  escapePoints: Set<Coordinate>;
}

export interface LayoutTransformOptions {
  /** Custom character mappings for pieces (default: A=Attacker, D=Defender, K=King, R=Restricted) */
  charMap?: Record<string, { 
    occupant?: { owner: Player; type: PieceType }; 
    isThrone?: boolean; 
    isRestricted?: boolean; 
  }>;
}

/**
 * Core function to transform a layout string array into a game position.
 * This is the single source of truth for layout-to-position transformation.
 */
export function transformLayoutToPosition(
  boardLayout: string[], 
  options: LayoutTransformOptions = {}
): GameSetup {
  const size = boardLayout.length;
  if (size === 0) throw new Error("boardLayout array must not be empty");
  if (!boardLayout.every(row => row.length === size)) {
    throw new Error("All boardLayout rows must be the same length and equal to the number of rows (square board)");
  }

  // Default character mappings (production game format)
  const defaultCharMap: Record<string, { 
    occupant?: { owner: Player; type: PieceType }; 
    isThrone?: boolean; 
    isRestricted?: boolean; 
  }> = {
    'A': { occupant: { owner: Player.Attacker, type: PieceType.Attacker } },
    'a': { occupant: { owner: Player.Attacker, type: PieceType.Attacker } },
    'D': { occupant: { owner: Player.Defender, type: PieceType.Defender } },
    'd': { occupant: { owner: Player.Defender, type: PieceType.Defender } },
    'K': { 
      occupant: { owner: Player.Defender, type: PieceType.King },
      isThrone: true,
      isRestricted: true
    },
    'R': { isRestricted: true },
    ' ': {},
    '.': {}
  };

  const charMap = { ...defaultCharMap, ...options.charMap };

  // Build position
  const position: Square[][] = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const c = boardLayout[y][x];
      const mapping = charMap[c] || {};
      
      // Apply character mapping
      let occupant: Square["occupant"] = mapping.occupant || null;
      let isThrone = mapping.isThrone || false;
      let isRestricted = mapping.isRestricted || false;
      
      return {
        occupant,
        isThrone,
        isRestricted
      };
    })
  );

  // Calculate escape points: board perimeter + non-throne restricted squares
  const escapePoints = extractEscapePoints(position);
  return { position, escapePoints };
}

export function initializeGame(boardLayout: string[]): GameSetup {
  // Validation for game boards
  let kingCount = 0;

  // Count kings and restricted squares
  for (let y = 0; y < boardLayout.length; y++) {
    for (let x = 0; x < boardLayout[y].length; x++) {
      const c = boardLayout[y][x];
      if (c === 'K') {
        kingCount++;
      }
    }
  }
  if (kingCount !== 1) throw new Error("There must be exactly one king on the board");

  const gameSetup = transformLayoutToPosition(boardLayout);
  return gameSetup;
}

/**
 * Extracts escape points from a position: board perimeter + non-throne restricted squares
 */
export function extractEscapePoints(position: Square[][]): Set<Coordinate> {
  const escapePoints = new Set<Coordinate>();
  const size = position.length;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const square = position[y][x];
      
      // Board perimeter
      const isPerimeter = x === 0 || x === size - 1 || y === 0 || y === size - 1;
      
      // Non-throne restricted squares
      const isNonThroneRestricted = square.isRestricted && !square.isThrone;
      
      if (isPerimeter || isNonThroneRestricted) {
        escapePoints.add({ x, y });
      }
    }
  }
  
  return escapePoints;
}
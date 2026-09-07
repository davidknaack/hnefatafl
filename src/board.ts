import { Square, Move, Piece, Player, PieceType, Coordinate } from './types'

export function clonePosition(position: Square[][]): Square[][] {
    return position.map((row) => row.map((square) => ({ ...square })))
}

export function extractDefenderPosition(
    position: Square[][],
    move?: Move
): string[] {
    return position.map((row, y) =>
        row
            .map((square, x) => {
                let occ = square.occupant

                if (move) {
                    if (x === move.from.x && y === move.from.y) occ = null
                    if (x === move.to.x && y === move.to.y)
                        occ = position[move.from.y][move.from.x].occupant
                }

                if (occ && occ.type === PieceType.Defender) return 'D'
                if (occ && occ.type === PieceType.King) return 'K'
                return ' '
            })
            .join('')
    )
}

// Create a new position with the move applied. Optionally remove captured pieces.
export function applyMoveToPosition(
    position: Square[][],
    move: Move,
    options: { applyCaptures?: boolean } = {}
): Square[][] {
    const { applyCaptures = true } = options
    const next = clonePosition(position)

    const moving = next[move.from.y][move.from.x].occupant
    next[move.from.y][move.from.x].occupant = null
    next[move.to.y][move.to.x].occupant = moving

    if (applyCaptures) {
        for (const cap of move.captures) {
            next[cap.y][cap.x].occupant = null
        }
    }

    return next
}

// prettier-ignore
export const STANDARD_BOARD = [
    'R  AAAAA  R',
    '     A     ',
    '           ',
    'A    D    A',
    'A   DDD   A',
    'AA DDKDD AA',
    'A   DDD   A',
    'A    D    A',
    '           ',
    '     A     ',
    'R  AAAAA  R',
]

export interface GameSetup {
    position: Square[][]
    edgeSquares: Set<Coordinate>
}

export interface LayoutSquareMapping {
    occupant?: Piece
    isThrone?: boolean
    isRestricted?: boolean
}

export interface LayoutTransformOptions {
    /** Each entry replaces the entire default mapping for that character. */
    charMap?: Record<string, LayoutSquareMapping>
}

/**
 * Flexible square-layout transformation, also used for low-level fixtures.
 * Does not require a king or enforce the engine's notation size. K/k imply a
 * restricted throne unless an uppercase T appears anywhere in the layout.
 * Custom mappings replace defaults; unknown characters become empty squares.
 * Occupants may be shared values; this function provides no runtime isolation.
 */
export function transformLayoutToPosition(
    boardLayout: string[],
    options: LayoutTransformOptions = {}
): GameSetup {
    const size = boardLayout.length
    if (size === 0) throw new Error('boardLayout array must not be empty')
    if (!boardLayout.every((row) => row.length === size)) {
        throw new Error(
            'All boardLayout rows must be the same length and equal to the number of rows (square board)'
        )
    }

    // If a throne is specified separately from the king, the king's position does not imply the throne square
    const layoutHasThrone = boardLayout.some(row => row.includes('T'))

    // Default character mappings (production game format)
    const defaultCharMap: Record<string, LayoutSquareMapping> = {
        A: { occupant: { owner: Player.Attacker, type: PieceType.Attacker } },
        a: { occupant: { owner: Player.Attacker, type: PieceType.Attacker } },
        D: { occupant: { owner: Player.Defender, type: PieceType.Defender } },
        d: { occupant: { owner: Player.Defender, type: PieceType.Defender } },
        K: {
            occupant: { owner: Player.Defender, type: PieceType.King },
            isThrone: layoutHasThrone ? false : true,
            isRestricted: layoutHasThrone ? false : true,
        },
        k: {
            occupant: { owner: Player.Defender, type: PieceType.King },
            isThrone: layoutHasThrone ? false : true,
            isRestricted: layoutHasThrone ? false : true,
        },
        R: { isRestricted: true },
        T: { isThrone: true, isRestricted: true },
        ' ': {},
        '.': {},
    }

    const charMap = { ...defaultCharMap, ...options.charMap }

    // Build position
    const position: Square[][] = Array.from({ length: size }, (_, y) =>
        Array.from({ length: size }, (_, x) => {
            const c = boardLayout[y][x]
            const mapping = charMap[c] || {}

            // Apply character mapping
            let occupant: Square['occupant'] = mapping.occupant || null
            let isThrone = mapping.isThrone || false
            let isRestricted = mapping.isRestricted || false

            return {
                occupant,
                isThrone,
                isRestricted,
            }
        })
    )

    // Calculate edge squares: board perimeter + non-throne restricted squares
    const edgeSquares = extractEscapeTargets(position)
    return { position, edgeSquares }
}

/** Game setup adds the current uppercase-K count check to layout transformation.
 * Size/alphabet validation and transformed king invariants are deferred to W6.
 */
export function initializeGame(boardLayout: string[]): GameSetup {
    // Validation for game boards
    let kingCount = 0

    // Count kings and restricted squares
    for (let y = 0; y < boardLayout.length; y++) {
        for (let x = 0; x < boardLayout[y].length; x++) {
            const c = boardLayout[y][x]
            if (c === 'K') {
                kingCount++
            }
        }
    }
    if (kingCount !== 1)
        throw new Error('There must be exactly one king on the board')

    const gameSetup = transformLayoutToPosition(boardLayout)
    return gameSetup
}

/**
 * Encirclement escape targets: perimeter plus non-throne restricted squares.
 * These may include interior squares; they are not all physical shieldwall edges.
 */
export function extractEscapeTargets(position: Square[][]): Set<Coordinate> {
    const edgeSquares = new Set<Coordinate>()
    const size = position.length

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const square = position[y][x]

            // Board perimeter
            const isPerimeter =
                x === 0 || x === size - 1 || y === 0 || y === size - 1

            // Non-throne restricted squares
            const isNonThroneRestricted =
                square.isRestricted && !square.isThrone

            if (isPerimeter || isNonThroneRestricted) {
                edgeSquares.add({ x, y })
            }
        }
    }

    return edgeSquares
}

// Compatibility names include perimeter AND interior non-throne restricted squares.
export const extractEdgeSquares = extractEscapeTargets
export const extractEscapePoints = extractEscapeTargets

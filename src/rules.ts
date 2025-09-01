import {
    GameStatus,
    PieceType,
    Player,
    Square,
    Move,
    Coordinate,
} from './types'
import { defendersCanEscape } from './utils'
import { extractEdgeSquares } from './board'

// Returns the game status after a move is applied
export function getGameStatusAfterMove(
    position: Square[][],
    move: Move,
    currentPlayer: Player
): GameStatus {
    // Be robust whether the position has been mutated yet or not
    const piece =
        position[move.to.y][move.to.x].occupant ||
        position[move.from.y][move.from.x].occupant

    if (isKingCaptured(position)) {
        return GameStatus.AttackerWin
    } else if (piece && piece.type === PieceType.King) {
        const dest = position[move.to.y][move.to.x]
        // King escapes by reaching a restricted square.
        // A throne (isThrone) is restricted and does not count as escape.
        if (dest.isRestricted && !dest.isThrone) return GameStatus.DefenderWin
    }

    // Check for encirclement after attacker moves
    if (currentPlayer === Player.Attacker) {
        const edgeSquares = extractEdgeSquares(position)
        if (!defendersCanEscape(position, edgeSquares)) {
            return GameStatus.AttackerWin
        }
    }

    return GameStatus.InProgress
}

// Shared hostility rule (pure): determines if a square is hostile to an owner,
// given the cell and its occupant. This encodes throne/restricted behavior and
// opponent occupancy, and should be the single source of truth for hostility.
export function isSquareHostileTo(
    square: Square,
    owner: Player,
    occupant: Square['occupant']
): boolean {
    if (square.isRestricted) {
        if (square.isThrone && occupant && occupant.type === PieceType.King) {
            // Occupied throne is not hostile to defenders
            return owner === Player.Attacker
        }
        return true
    }
    if (occupant) return occupant.owner !== owner
    return false
}

export function getAvailableCaptures(
    position: Square[][],
    move: Move,
    player: Player,
    edgeSquares: Set<Coordinate>
): Coordinate[] {
    const captures: Coordinate[] = []
    const size = position.length

    // Helper: occupant as if the move has been applied
    function getOccupantAfter(x: number, y: number): Square['occupant'] {
        if (x === move.from.x && y === move.from.y) return null
        if (x === move.to.x && y === move.to.y) {
            return position[move.from.y][move.from.x].occupant!
        }
        return position[y][x].occupant
    }

    // Helper: determine if a cell is hostile to a given owner after applying move
    function isHostileTo(owner: Player, x: number, y: number): boolean {
        if (x < 0 || y < 0 || x >= size || y >= size) return false
        const cell = position[y][x]
        const occ = getOccupantAfter(x, y)
        return isSquareHostileTo(cell, owner, occ)
    }

    // Get standard captures (orthogonal sandwiching)
    const standardCaptures = getStandardCaptures(
        position,
        move,
        player,
        isHostileTo,
        getOccupantAfter
    )
    captures.push(...standardCaptures)

    // Get edge-enclosure captures
    const edgeCaptures = getEdgeEnclosureCaptures(
        position,
        move,
        player,
        edgeSquares,
        isHostileTo,
        getOccupantAfter
    )
    captures.push(...edgeCaptures)

    return captures
}

function getStandardCaptures(
    position: Square[][],
    move: Move,
    player: Player,
    isHostileTo: (owner: Player, x: number, y: number) => boolean,
    getOccupantAfter: (x: number, y: number) => Square['occupant']
): Coordinate[] {
    const captures: Coordinate[] = []
    const opponentTypes =
        player === Player.Attacker
            ? [PieceType.Defender, PieceType.King]
            : [PieceType.Attacker]
    const directions = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
    ]
    const size = position.length

    for (const { dx, dy } of directions) {
        const midX = move.to.x + dx
        const midY = move.to.y + dy
        const beyondX = move.to.x + dx * 2
        const beyondY = move.to.y + dy * 2

        if (
            midX < 0 ||
            midX >= size ||
            midY < 0 ||
            midY >= size ||
            beyondX < 0 ||
            beyondX >= size ||
            beyondY < 0 ||
            beyondY >= size
        )
            continue

        const midOccupant = getOccupantAfter(midX, midY)

        if (
            midOccupant &&
            midOccupant.type === PieceType.King &&
            player === Player.Attacker
        ) {
            if (isKingCapturable(midX, midY, position, getOccupantAfter)) {
                captures.push({ x: midX, y: midY })
            }
        } else if (midOccupant && opponentTypes.includes(midOccupant.type)) {
            const opponentOwner = midOccupant.owner
            if (isHostileTo(opponentOwner, beyondX, beyondY)) {
                captures.push({ x: midX, y: midY })
            }
        }
    }

    return captures
}

function isKingCapturable(
    x: number,
    y: number,
    position: Square[][],
    getOccupantAfter: (x: number, y: number) => Square['occupant']
): boolean {
    const size = position.length
    const directions = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
    ]

    let hostileCount = 0
    for (const { dx, dy } of directions) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) return false

        const cell = position[ny][nx]
        const occ = getOccupantAfter(nx, ny)

        if (
            cell.isThrone ||
            cell.isRestricted ||
            (occ && occ.owner === Player.Attacker)
        ) {
            hostileCount++
        }
    }

    return hostileCount >= 4
}

function getEdgeEnclosureCaptures(
    position: Square[][],
    move: Move,
    player: Player,
    edgeSquares: Set<Coordinate>,
    isHostileTo: (owner: Player, x: number, y: number) => boolean,
    getOccupantAfter: (x: number, y: number) => Square['occupant']
): Coordinate[] {
    const captures: Coordinate[] = []
    const size = position.length
    const opponentOwner: Player =
        player === Player.Attacker ? Player.Defender : Player.Attacker

    // Helper for pre-move hostility
    function isHostileToBefore(owner: Player, x: number, y: number): boolean {
        if (x < 0 || y < 0 || x >= size || y >= size) return false
        const cell = position[y][x]
        const occ = position[y][x].occupant
        return isSquareHostileTo(cell, owner, occ)
    }

    // Convert edgeSquares to coordinates
    const edgeCoords: Coordinate[] = Array.from(edgeSquares).map((e) => ({
        x: e.x,
        y: e.y,
    }))

    // Group by row and column
    const byRow: Map<number, Coordinate[]> = new Map()
    const byCol: Map<number, Coordinate[]> = new Map()
    for (const c of edgeCoords) {
        if (!byRow.has(c.y)) byRow.set(c.y, [])
        byRow.get(c.y)!.push(c)
        if (!byCol.has(c.x)) byCol.set(c.x, [])
        byCol.get(c.x)!.push(c)
    }

    // Scan lines for enclosures
    function scanLine(
        coords: Coordinate[],
        getInward: (c: Coordinate) => Coordinate
    ) {
        coords.sort((a, b) => a.x - b.x || a.y - b.y) // Sort by position
        let i = 0
        while (i < coords.length) {
            // Find opponent segment
            while (i < coords.length && !isOpponentAt(coords[i])) i++
            if (i >= coords.length) break
            const start = i
            while (i < coords.length && isOpponentAt(coords[i])) i++
            const end = i - 1

            const segment = coords.slice(start, end + 1)
            if (isNewlyEnclosed(segment, getInward, start, end)) {
                captures.push(...segment)
            }
        }

        function isOpponentAt(c: Coordinate): boolean {
            const occ = getOccupantAfter(c.x, c.y)
            return !!(
                occ &&
                occ.owner === opponentOwner &&
                occ.type !== PieceType.King
            )
        }

        function isNewlyEnclosed(
            segment: Coordinate[],
            getInward: (c: Coordinate) => Coordinate,
            start: number,
            end: number
        ): boolean {
            const adjSquares = new Set<Coordinate>()
            for (const c of segment) {
                adjSquares.add(getInward(c))
            }
            // Add endpoint neighbors
            if (start > 0) adjSquares.add(coords[start - 1])
            if (end < coords.length - 1) adjSquares.add(coords[end + 1])

            const adjList = Array.from(adjSquares)
            const enclosedAfter = adjList.every((a) =>
                isHostileTo(opponentOwner, a.x, a.y)
            )
            const enclosedBefore = adjList.every((a) =>
                isHostileToBefore(opponentOwner, a.x, a.y)
            )
            return enclosedAfter && !enclosedBefore
        }
    }

    // Scan rows and columns
    for (const coords of byRow.values()) {
        scanLine(coords, (c) => ({ x: c.x, y: c.y === 0 ? 1 : size - 2 }))
    }
    for (const coords of byCol.values()) {
        scanLine(coords, (c) => ({ x: c.x === 0 ? 1 : size - 2, y: c.y }))
    }

    return captures
}

export function isKingCaptured(position: Square[][]): boolean {
    for (const row of position) {
        for (const square of row) {
            if (square.occupant && square.occupant.type === PieceType.King)
                return false
        }
    }
    return true
}

// Note: king escape is determined by landing on a non-restricted edge square.

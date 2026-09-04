import { Coordinate, Square, Player, PieceType } from './types'
import { COORD_CAPTURE_RE } from './patterns'

/**
 * Checks if any defender can reach a board edge or non-throne restricted square.
 * Uses multi-start DFS from all defender positions.
 *
 * @param position Square[][] representing the game position
 * @param edgeSquares Set of edge positions as Coordinate objects
 * @returns true if any defender can reach an edge square, false otherwise
 */
export function defendersCanEscape(
    position: Square[][],
    edgeSquares: Set<Coordinate>
): boolean {
    const visited = new Set<string>()
    const stack: { x: number; y: number }[] = []

    // Efficiently filter out edge squares occupied by attackers
    const validEdges = new Set<string>()
    for (const coord of edgeSquares) {
        const x = coord.x,
            y = coord.y
        const square = position[y][x]
        // Edge is valid if not occupied by an attacker
        if (!square.occupant || square.occupant.owner !== Player.Attacker) {
            validEdges.add(`${x},${y}`)
        }
    }

    // Find all defender positions (including king) from the position
    for (let y = 0; y < position.length; y++) {
        for (let x = 0; x < position[0].length; x++) {
            const square = position[y][x]
            if (
                square.occupant &&
                (square.occupant.type === PieceType.Defender ||
                    square.occupant.type === PieceType.King)
            ) {
                const key = `${x},${y}`
                stack.push({ x, y })
                visited.add(key)
            }
        }
    }

    const directions = [
        { dx: 0, dy: -1 }, // up
        { dx: 0, dy: 1 }, // down
        { dx: -1, dy: 0 }, // left
        { dx: 1, dy: 0 }, // right
    ]

    const inBounds = (x: number, y: number) =>
        y >= 0 && y < position.length && x >= 0 && x < position[0].length

    while (stack.length > 0) {
        const current = stack.pop()!
        const key = `${current.x},${current.y}`
        if (validEdges.has(key)) {
            return true // Found escape path!
        }
        for (const { dx, dy } of directions) {
            const nx = current.x + dx
            const ny = current.y + dy
            const nkey = `${nx},${ny}`
            if (inBounds(nx, ny) && !visited.has(nkey)) {
                const square = position[ny][nx]
                // Can move through empty squares or squares with friendly pieces
                if (
                    !square.occupant ||
                    square.occupant.owner === Player.Defender
                ) {
                    stack.push({ x: nx, y: ny })
                    visited.add(nkey)
                }
            }
        }
    }
    // If we exhaust all reachable squares and never touch an edge
    return false
}

export function coordFromString(input: string): Coordinate | null {
    const match = COORD_CAPTURE_RE.exec(input.trim().toUpperCase())
    if (!match) return null
    const file = match[1].charCodeAt(0) - 65
    const rank = 11 - parseInt(match[2], 10)
    return { x: file, y: rank }
}

export function coordToString(coord: Coordinate): string {
    const file = String.fromCharCode(65 + coord.x)
    const rank = 11 - coord.y
    return `${file}${rank}`
}

// Helper to render the board as text for debugging
// Empty edge squares are rendered as 'e' unless occupied,
// then the occupied piece type is rendered as uppercase,
// indicating a defender (D/d) or attacker (A/a) that is on
// an edge square.
export function renderBoard(position: Square[][], edgeSquares: Set<Coordinate>) {
    const edgeKeys = new Set(
        Array.from(edgeSquares).map((c) => `${c.x},${c.y}`)
    )
    let out = ''
    for (let y = 0; y < position.length; y++) {
        for (let x = 0; x < position[0].length; x++) {
            const key = `${x},${y}`
            const isEdge = edgeKeys.has(key)
            const cell = position[y][x]

            if ( cell.occupant?.type === PieceType.King) {
                out += isEdge ? 'K' : 'k'
            } else if ( cell.occupant?.type === PieceType.Defender) {
                out += isEdge ? 'D' : 'd'
            } else if (cell.occupant?.type === PieceType.Attacker) {
                out += isEdge ? 'A' : 'a'
            } else if ( !cell.occupant && cell.isThrone) {
                out += isEdge ? 'T' : 't'
            } else {
                out += isEdge ? 'e' : '.'
            }
        }
        out += '\n'
    }
    return out
}

type FortSupportAxis = 'horizontal' | 'vertical'

function findKing(position: Square[][]): Coordinate | null {
    for (let y = 0; y < position.length; y++) {
        for (let x = 0; x < position[y].length; x++) {
            if (position[y][x].occupant?.type === PieceType.King) {
                return { x, y }
            }
        }
    }

    return null
}

function isOnBoardEdge(coord: Coordinate, size: number): boolean {
    return (
        coord.x === 0 ||
        coord.y === 0 ||
        coord.x === size - 1 ||
        coord.y === size - 1
    )
}

function kingHasLegalMove(position: Square[][], king: Coordinate): boolean {
    const directions = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
    ]

    for (const { dx, dy } of directions) {
        let x = king.x + dx
        let y = king.y + dy

        while (y >= 0 && y < position.length && x >= 0 && x < position[y].length) {
            if (position[y][x].occupant) {
                break
            }

            return true
        }
    }

    return false
}

function defenderProvidesSupport(
    position: Square[][],
    coord: Coordinate,
    axis: FortSupportAxis
): boolean {
    const deltas =
        axis === 'horizontal'
            ? [
                  { dx: -1, dy: 0 },
                  { dx: 1, dy: 0 },
              ]
            : [
                  { dx: 0, dy: -1 },
                  { dx: 0, dy: 1 },
              ]

    for (const { dx, dy } of deltas) {
        const x = coord.x + dx
        const y = coord.y + dy

        if (y < 0 || y >= position.length || x < 0 || x >= position[y].length) {
            return true
        }

        const occupant = position[y][x].occupant
        if (occupant && occupant.owner === Player.Defender) {
            return true
        }
    }

    return false
}

function kingHasAdjacentDefender(position: Square[][], king: Coordinate): boolean {
    const directions = [
        { dx: 0, dy: -1 },
        { dx: 0, dy: 1 },
        { dx: -1, dy: 0 },
        { dx: 1, dy: 0 },
    ]

    for (const { dx, dy } of directions) {
        const x = king.x + dx
        const y = king.y + dy

        if (y < 0 || y >= position.length || x < 0 || x >= position[y].length) {
            continue
        }

        if (position[y][x].occupant?.owner === Player.Defender) {
            return true
        }
    }

    return false
}

function isAttackerOrEmpty(square: Square): boolean {
    return !square.occupant || square.occupant.owner === Player.Attacker
}

function getOrthogonalNeighbors(position: Square[][], coord: Coordinate): Coordinate[] {
    const candidates = [
        { x: coord.x, y: coord.y - 1 },
        { x: coord.x, y: coord.y + 1 },
        { x: coord.x - 1, y: coord.y },
        { x: coord.x + 1, y: coord.y },
    ]

    return candidates.filter(
        ({ x, y }) =>
            y >= 0 && y < position.length && x >= 0 && x < position[y].length
    )
}

function fortContainsEnclosedAttackers(
    position: Square[][],
    fortBoundary: Set<string>
): boolean {
    const size = position.length
    const outsideReachable = new Set<string>()
    const stack: Coordinate[] = []

    const pushOutside = (coord: Coordinate) => {
        const key = `${coord.x},${coord.y}`
        if (outsideReachable.has(key) || fortBoundary.has(key)) return
        if (!isAttackerOrEmpty(position[coord.y][coord.x])) return

        outsideReachable.add(key)
        stack.push(coord)
    }

    for (let x = 0; x < size; x++) {
        pushOutside({ x, y: 0 })
        pushOutside({ x, y: size - 1 })
    }
    for (let y = 1; y < size - 1; y++) {
        pushOutside({ x: 0, y })
        pushOutside({ x: size - 1, y })
    }

    while (stack.length > 0) {
        const coord = stack.pop()!
        for (const neighbor of getOrthogonalNeighbors(position, coord)) {
            pushOutside(neighbor)
        }
    }

    const seenInterior = new Set<string>()

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const square = position[y][x]
            if (square.occupant?.owner !== Player.Attacker) continue

            const startKey = `${x},${y}`
            if (outsideReachable.has(startKey) || seenInterior.has(startKey)) {
                continue
            }

            const component: Coordinate[] = [{ x, y }]
            const componentStack: Coordinate[] = [{ x, y }]
            seenInterior.add(startKey)

            while (componentStack.length > 0) {
                const coord = componentStack.pop()!
                for (const neighbor of getOrthogonalNeighbors(position, coord)) {
                    const key = `${neighbor.x},${neighbor.y}`
                    if (outsideReachable.has(key) || seenInterior.has(key)) continue
                    if (!isAttackerOrEmpty(position[neighbor.y][neighbor.x])) continue

                    seenInterior.add(key)
                    component.push(neighbor)
                    componentStack.push(neighbor)
                }
            }

            const touchesFortBoundary = component.some((coord) =>
                getOrthogonalNeighbors(position, coord).some((neighbor) =>
                    fortBoundary.has(`${neighbor.x},${neighbor.y}`)
                )
            )

            if (touchesFortBoundary) {
                return true
            }
        }
    }

    return false
}

export function defendersHaveFort(position: Square[][]): boolean {
    const king = findKing(position)
    if (!king) return false

    const size = position.length
    if (!isOnBoardEdge(king, size)) return false
    if (!kingHasLegalMove(position, king)) return false
    if (!kingHasAdjacentDefender(position, king)) return false

    let attackerCount = 0
    for (const row of position) {
        for (const square of row) {
            if (square.occupant?.owner === Player.Attacker) {
                attackerCount++
            }
        }
    }

    const requiresSupportChecks = attackerCount > 1
    const visited = new Set<string>()
    const fortBoundary = new Set<string>()
    const stack: Array<{ coord: Coordinate; axis: FortSupportAxis }> = []
    const directions = [
        { dx: 0, dy: -1, axis: 'horizontal' as const },
        { dx: 0, dy: 1, axis: 'horizontal' as const },
        { dx: -1, dy: 0, axis: 'vertical' as const },
        { dx: 1, dy: 0, axis: 'vertical' as const },
    ]

    const push = (coord: Coordinate, axis: FortSupportAxis) => {
        if (
            coord.y < 0 ||
            coord.y >= position.length ||
            coord.x < 0 ||
            coord.x >= position[coord.y].length
        ) {
            return
        }

        const key = `${coord.x},${coord.y}`
        if (visited.has(key)) return
        visited.add(key)
        stack.push({ coord, axis })
    }

    for (const { dx, dy, axis } of directions) {
        push({ x: king.x + dx, y: king.y + dy }, axis)
    }

    while (stack.length > 0) {
        const { coord, axis } = stack.pop()!
        const square = position[coord.y][coord.x]

        if (!square.occupant) {
            for (const { dx, dy, axis: nextAxis } of directions) {
                push({ x: coord.x + dx, y: coord.y + dy }, nextAxis)
            }
            continue
        }

        if (square.occupant.owner === Player.Attacker) {
            return false
        }

        fortBoundary.add(`${coord.x},${coord.y}`)

        if (
            requiresSupportChecks &&
            !defenderProvidesSupport(position, coord, axis)
        ) {
            return false
        }
    }

    if (fortContainsEnclosedAttackers(position, fortBoundary)) {
        return false
    }

    return true
}

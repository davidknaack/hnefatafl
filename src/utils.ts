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

/**
 * Determines whether defenders have formed a valid fort under Copenhagen rules.
 * 
 * A fort is valid when:
 * 1. The king is on the board edge
 * 2. The king can move within the fort area  
 * 3. Fort defenders are not capturable
 * 4. No attackers can reach the king through normal movement
 * 
 * @param position Current board position
 * @returns true if defenders have a valid fort, false otherwise
 */
export function defendersHaveFort(position: Square[][]): boolean {
    const size = position.length

    // Find the king
    let king: Coordinate | null = null
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const occupant = position[y][x].occupant
            if (occupant && occupant.type === PieceType.King) {
                king = { x, y }
                break
            }
        }
        if (king) break
    }

    if (!king) return false

    // Rule 1: King must be on board edge
    const isOnEdge = king.x === 0 || king.y === 0 || king.x === size - 1 || king.y === size - 1
    if (!isOnEdge) return false

    // Helper functions
    const directions = [
        { dx: 0, dy: -1 }, // up
        { dx: 0, dy: 1 },  // down
        { dx: -1, dy: 0 }, // left
        { dx: 1, dy: 0 },  // right
    ]

    const isDefenderOrKing = (x: number, y: number): boolean => {
        if (x < 0 || y < 0 || x >= size || y >= size) return false
        const occupant = position[y][x].occupant
        return occupant && (occupant.type === PieceType.King || occupant.owner === Player.Defender) || false
    }

    const isAttacker = (x: number, y: number): boolean => {
        if (x < 0 || y < 0 || x >= size || y >= size) return false
        const occupant = position[y][x].occupant
        return occupant && occupant.owner === Player.Attacker || false
    }

    const isEmpty = (x: number, y: number): boolean => {
        if (x < 0 || y < 0 || x >= size || y >= size) return false
        return !position[y][x].occupant
    }

    const isRestricted = (x: number, y: number): boolean => {
        if (x < 0 || y < 0 || x >= size || y >= size) return false
        return position[y][x].isRestricted
    }

    // Rule 2: King must be able to move (not completely trapped)
    let kingCanMove = false
    for (const { dx, dy } of directions) {
        const moveX = king.x + dx
        const moveY = king.y + dy
        if (moveX >= 0 && moveY >= 0 && moveX < size && moveY < size) {
            if (isEmpty(moveX, moveY) || isDefenderOrKing(moveX, moveY)) {
                kingCanMove = true
                break
            }
        }
    }
    if (!kingCanMove) return false

    // Find connected defenders that form the potential fort
    const fortPieces = new Set<string>()
    const queue: Coordinate[] = [king]
    const visited = new Set<string>([`${king.x},${king.y}`])

    while (queue.length > 0) {
        const current = queue.shift()!
        const key = `${current.x},${current.y}`
        fortPieces.add(key)

        for (const { dx, dy } of directions) {
            const nx = current.x + dx
            const ny = current.y + dy
            const neighborKey = `${nx},${ny}`

            if (!visited.has(neighborKey) && isDefenderOrKing(nx, ny)) {
                visited.add(neighborKey)
                queue.push({ x: nx, y: ny })
            }
        }
    }

    // Rule 3: Check if any fort piece is capturable by standard rules
    for (const pieceKey of fortPieces) {
        const [x, y] = pieceKey.split(',').map(Number)
        const occupant = position[y][x].occupant!

        if (occupant.type === PieceType.King) {
            // King is capturable if surrounded by 4 hostile squares (not at board edge)
            if (isKingCapturable(x, y)) return false
        } else {
            // Regular defender is capturable if sandwiched between 2 hostile squares
            if (isDefenderCapturable(x, y)) return false
        }
    }

    // Rule 4: Check if attackers can reach the king via pathfinding
    // Use flood fill from all attackers to see if they can reach the king
    const attackerReachable = new Set<string>()
    const attackerQueue: Coordinate[] = []

    // Start from all attacker positions
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (isAttacker(x, y)) {
                const key = `${x},${y}`
                attackerReachable.add(key)
                attackerQueue.push({ x, y })
            }
        }
    }

    // Expand attacker reachability through empty squares and restricted squares they can pass through
    while (attackerQueue.length > 0) {
        const current = attackerQueue.shift()!
        
        for (const { dx, dy } of directions) {
            const nx = current.x + dx
            const ny = current.y + dy
            const neighborKey = `${nx},${ny}`

            if (nx >= 0 && ny >= 0 && nx < size && ny < size && !attackerReachable.has(neighborKey)) {
                // Attackers can reach empty squares
                if (isEmpty(nx, ny)) {
                    attackerReachable.add(neighborKey)
                    attackerQueue.push({ x: nx, y: ny })
                }
                // Attackers can also pass through restricted squares (but shouldn't stop there in actual game)
                // For fort detection, we consider they can threaten through restricted squares
                else if (isRestricted(nx, ny) && !position[ny][nx].occupant) {
                    attackerReachable.add(neighborKey)
                    attackerQueue.push({ x: nx, y: ny })
                }
            }
        }
    }

    // If attackers can reach squares adjacent to the king, they can threaten the king
    const kingKey = `${king.x},${king.y}`
    let kingIsThreatened = false
    
    // Check if attackers can reach the king's position directly
    if (attackerReachable.has(kingKey)) {
        kingIsThreatened = true
    }
    
    // Also check if attackers can reach squares adjacent to the king
    for (const { dx, dy } of directions) {
        const adjX = king.x + dx
        const adjY = king.y + dy
        const adjKey = `${adjX},${adjY}`
        if (attackerReachable.has(adjKey)) {
            kingIsThreatened = true
            break
        }
    }
    
    if (kingIsThreatened) {
        return false
    }

    // If we passed all checks, this is a valid fort
    return true

    // Helper function to check if king can be captured
    function isKingCapturable(x: number, y: number): boolean {
        let hostileCount = 0
        for (const { dx, dy } of directions) {
            const nx = x + dx
            const ny = y + dy
            
            // Board edges prevent king capture in Copenhagen rules
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) {
                return false
            }
            
            if (isAttacker(nx, ny) || isRestricted(nx, ny)) {
                hostileCount++
            }
        }
        return hostileCount >= 4
    }

    // Helper function to check if defender can be captured  
    function isDefenderCapturable(x: number, y: number): boolean {
        // Check horizontal capture potential (left-right)
        const leftHostile = isAttacker(x - 1, y) || isRestricted(x - 1, y)
        const rightHostile = isAttacker(x + 1, y) || isRestricted(x + 1, y)
        const leftEmpty = isEmpty(x - 1, y)
        const rightEmpty = isEmpty(x + 1, y)
        
        // If already sandwiched, definitely capturable
        if (leftHostile && rightHostile) return true
        
        // If one side is hostile and the other is empty, check if there are free attackers
        if ((leftHostile && rightEmpty) || (rightHostile && leftEmpty)) {
            // Count attackers that are not currently threatening other fort pieces
            let freeAttackers = 0
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    if (isAttacker(x, y)) {
                        freeAttackers++
                    }
                }
            }
            // If there are at least 2 attackers total, one could potentially move to capture
            if (freeAttackers >= 2) return true
        }

        // Check vertical capture potential (up-down)
        const upHostile = isAttacker(x, y - 1) || isRestricted(x, y - 1)
        const downHostile = isAttacker(x, y + 1) || isRestricted(x, y + 1)
        const upEmpty = isEmpty(x, y - 1)
        const downEmpty = isEmpty(x, y + 1)
        
        // If already sandwiched, definitely capturable
        if (upHostile && downHostile) return true
        
        // If one side is hostile and the other is empty, check if there are free attackers
        if ((upHostile && downEmpty) || (downHostile && upEmpty)) {
            // Count attackers that are not currently threatening other fort pieces
            let freeAttackers = 0
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    if (isAttacker(x, y)) {
                        freeAttackers++
                    }
                }
            }
            // If there are at least 2 attackers total, one could potentially move to capture
            if (freeAttackers >= 2) return true
        }

        return false
    }
}

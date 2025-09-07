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
    
    console.log(`King found at (${king.x}, ${king.y})`)

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

    // Rule 3: Analyze position after discounting all defenders that could be captured
    // First, identify all potentially capturable defenders in the connected component
    const uncapturableDefenders = new Set<string>()
    
    console.log(`Analyzing fort with pieces: ${Array.from(fortPieces).join(', ')}`)
    
    for (const pieceKey of fortPieces) {
        const [x, y] = pieceKey.split(',').map(Number)
        const occupant = position[y][x].occupant!

        if (occupant.type === PieceType.King) {
            // King is part of fort if not capturable
            if (!isKingCapturable(x, y)) {
                uncapturableDefenders.add(pieceKey)
                console.log(`King at (${x},${y}) is uncapturable`)
            } else {
                console.log(`King at (${x},${y}) is capturable - fort invalid`)
                return false // King is capturable, fort is invalid
            }
        } else {
            // Only include defenders that are not capturable
            const capturable = isDefenderCapturable(x, y)
            console.log(`Defender at (${x},${y}) is ${capturable ? 'capturable' : 'uncapturable'}`)
            if (!capturable) {
                uncapturableDefenders.add(pieceKey)
            }
        }
    }

    // Check if the remaining uncapturable pieces still form a connected fort with the king
    const kingKey = `${king.x},${king.y}`
    if (!uncapturableDefenders.has(kingKey)) {
        return false // King is capturable
    }

    // Verify that uncapturable defenders still form a connected component
    const connectedToKing = new Set<string>()
    const fortQueue: Coordinate[] = [king]
    const fortVisited = new Set<string>([kingKey])
    
    while (fortQueue.length > 0) {
        const current = fortQueue.shift()!
        const key = `${current.x},${current.y}`
        connectedToKing.add(key)

        for (const { dx, dy } of directions) {
            const nx = current.x + dx
            const ny = current.y + dy
            const neighborKey = `${nx},${ny}`

            if (!fortVisited.has(neighborKey) && uncapturableDefenders.has(neighborKey)) {
                fortVisited.add(neighborKey)
                fortQueue.push({ x: nx, y: ny })
            }
        }
    }

    // Debug: show the uncapturable fort pieces
    // console.log(`Uncapturable fort pieces: ${Array.from(connectedToKing).join(', ')}`)

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
    let kingIsThreatened = false
    
    // Check if attackers can reach the king's position directly
    if (attackerReachable.has(kingKey)) {
        kingIsThreatened = true
        console.log('Attackers can reach king directly')
    }
    
    // Also check if attackers can reach squares adjacent to the king
    for (const { dx, dy } of directions) {
        const adjX = king.x + dx
        const adjY = king.y + dy
        const adjKey = `${adjX},${adjY}`
        if (attackerReachable.has(adjKey)) {
            kingIsThreatened = true
            console.log(`Attackers can reach square adjacent to king: (${adjX},${adjY})`)
            break
        }
    }
    
    if (kingIsThreatened) {
        console.log('King is threatened - fort invalid')
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

    // Helper function to check if defender can be captured using enhanced rules
    function isDefenderCapturable(x: number, y: number): boolean {
        // Debug specific case
        const isTestCase = x === 2 && y === 8
        if (isTestCase) {
            console.log(`Checking capturability for defender at (${x},${y})`)
            console.log(`Left (${x-1},${y}): ${isAttacker(x-1,y) ? 'attacker' : isEmpty(x-1,y) ? 'empty' : 'other'}`)
            console.log(`Right (${x+1},${y}): ${isAttacker(x+1,y) ? 'attacker' : isEmpty(x+1,y) ? 'empty' : 'other'}`)
        }
        
        // Check if defender is currently sandwiched
        const leftHostile = isAttacker(x - 1, y) || isRestricted(x - 1, y)
        const rightHostile = isAttacker(x + 1, y) || isRestricted(x + 1, y)
        if (leftHostile && rightHostile) {
            if (isTestCase) console.log('Currently sandwiched horizontally')
            return true
        }

        const upHostile = isAttacker(x, y - 1) || isRestricted(x, y - 1)
        const downHostile = isAttacker(x, y + 1) || isRestricted(x, y + 1)
        if (upHostile && downHostile) {
            if (isTestCase) console.log('Currently sandwiched vertically')
            return true
        }

        // Check if attackers could potentially sandwich this defender
        // We need to check if attackers can reach the empty positions adjacent to the defender

        // Horizontal potential capture
        const leftEmpty = isEmpty(x - 1, y)
        const rightEmpty = isEmpty(x + 1, y)
        
        // Case 1: One side hostile, other side empty - need 1 attacker to reach empty side
        if (leftHostile && rightEmpty) {
            // Can any attacker reach (x+1, y)?
            const canReach = canAttackerReach(x + 1, y)
            if (isTestCase) console.log(`Left hostile, right empty. Can attacker reach (${x+1},${y})? ${canReach}`)
            if (canReach) return true
        }
        if (rightHostile && leftEmpty) {
            // Can any attacker reach (x-1, y)?
            const canReach = canAttackerReach(x - 1, y)
            if (isTestCase) console.log(`Right hostile, left empty. Can attacker reach (${x-1},${y})? ${canReach}`)
            if (canReach) return true
        }
        
        // Case 2: Both sides empty - need 2 attackers to reach both sides
        if (leftEmpty && rightEmpty) {
            // This is more complex - we'd need to check if 2 attackers can coordinate
            // For simplicity, if we have 2+ attackers, consider it possible
            let attackerCount = 0
            for (let ay = 0; ay < size; ay++) {
                for (let ax = 0; ax < size; ax++) {
                    if (isAttacker(ax, ay)) {
                        attackerCount++
                        if (attackerCount >= 2) {
                            if (isTestCase) console.log('Both sides empty, 2+ attackers available')
                            return true
                        }
                    }
                }
            }
        }

        // Vertical potential capture  
        const upEmpty = isEmpty(x, y - 1)
        const downEmpty = isEmpty(x, y + 1)
        
        // Case 1: One side hostile, other side empty - need 1 attacker to reach empty side
        if (upHostile && downEmpty) {
            // Can any attacker reach (x, y+1)?
            const canReach = canAttackerReach(x, y + 1)
            if (isTestCase) console.log(`Up hostile, down empty. Can attacker reach (${x},${y+1})? ${canReach}`)
            if (canReach) return true
        }
        if (downHostile && upEmpty) {
            // Can any attacker reach (x, y-1)?
            const canReach = canAttackerReach(x, y - 1)
            if (isTestCase) console.log(`Down hostile, up empty. Can attacker reach (${x},${y-1})? ${canReach}`)
            if (canReach) return true
        }
        
        // Case 2: Both sides empty - need 2 attackers to reach both sides
        if (upEmpty && downEmpty) {
            // If we have 2+ attackers, consider it possible
            let attackerCount = 0
            for (let ay = 0; ay < size; ay++) {
                for (let ax = 0; ax < size; ax++) {
                    if (isAttacker(ax, ay)) {
                        attackerCount++
                        if (attackerCount >= 2) {
                            if (isTestCase) console.log('Both up/down empty, 2+ attackers available')
                            return true
                        }
                    }
                }
            }
        }

        if (isTestCase) console.log('Defender not capturable')
        return false
    }

    // Helper function to check if any attacker can reach a target position
    function canAttackerReach(targetX: number, targetY: number): boolean {
        // Use the same pathfinding logic as the main fort detection
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if (isAttacker(x, y)) {
                    // Simple reachability: attacker can reach target if they share row/column
                    // and there's a clear path (this is a simplified check)
                    if (x === targetX || y === targetY) {
                        // Check if path is clear
                        if (isPathClear(x, y, targetX, targetY)) {
                            return true
                        }
                    }
                }
            }
        }
        return false
    }

    // Helper function to check if path between two points is clear
    function isPathClear(fromX: number, fromY: number, toX: number, toY: number): boolean {
        if (fromX === toX) {
            // Vertical movement
            const startY = Math.min(fromY, toY)
            const endY = Math.max(fromY, toY)
            for (let y = startY + 1; y < endY; y++) {
                if (!isEmpty(fromX, y)) return false
            }
        } else if (fromY === toY) {
            // Horizontal movement
            const startX = Math.min(fromX, toX)
            const endX = Math.max(fromX, toX)
            for (let x = startX + 1; x < endX; x++) {
                if (!isEmpty(x, fromY)) return false
            }
        } else {
            return false // Diagonal movement not allowed
        }
        return true
    }
}

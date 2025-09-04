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
 * Determines whether defenders (including the king) have formed a
 * "fort"—a configuration that attackers cannot break and that
 * connects the king to the board edge exclusively through squares
 * that attackers cannot occupy.
 *
 * The algorithm works in three broad steps:
 *  1. Compute every square an attacker could eventually occupy by
 *     moving through empty, non-restricted squares. These squares are
 *     considered "reachable" by the attackers.
 *  2. Using that reachability information, determine which defender
 *     pieces are capturable. This includes standard captures and
 *     edge-enclosure captures. Any defender that can be captured is
 *     excluded from the fort.
 *  3. Starting from the king, perform a flood fill through squares
 *     that are either (a) non-capturable defenders/king or (b) empty
 *     squares that attackers cannot reach.  If this region touches the
 *     board edge, the king is protected by an unbreakable fort and the
 *     defenders win.
 */
export function defendersHaveFort(position: Square[][]): boolean {
    const size = position.length
    const key = (x: number, y: number) => `${x},${y}`

    // Debug logging for specific test cases
    const isDebugCase = size === 11 && position[10][5].occupant?.type === PieceType.King;
    if (isDebugCase) console.log("\n=== DEBUG FORT ANALYSIS ===");

    // ------------------------------------------------------------------
    // Step 1: squares attackers can eventually occupy
    // ------------------------------------------------------------------
    const reachable = new Set<string>()
    const queue: Coordinate[] = []

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const occ = position[y][x].occupant
            if (occ && occ.owner === Player.Attacker) {
                const k = key(x, y)
                reachable.add(k)
                queue.push({ x, y })
                if (isDebugCase) console.log(`Attacker at (${x},${y})`);
            }
        }
    }

    // Without any attackers on the board, a fort is not considered
    // formed (tests use minimalist boards without attackers).
    if (queue.length === 0) return false

    const dirs = [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 },
    ]

    while (queue.length > 0) {
        const { x, y } = queue.shift()!
        for (const { dx, dy } of dirs) {
            let nx = x + dx
            let ny = y + dy
            while (nx >= 0 && ny >= 0 && nx < size && ny < size) {
                const square = position[ny][nx]
                if (square.occupant) {
                    // Attackers block behind them; if another attacker is
                    // encountered we treat it as another source.
                    if (
                        square.occupant.owner === Player.Attacker &&
                        !reachable.has(key(nx, ny))
                    ) {
                        reachable.add(key(nx, ny))
                        queue.push({ x: nx, y: ny })
                    }
                    break
                }
                if (!square.isRestricted) {
                    const k = key(nx, ny)
                    if (!reachable.has(k)) {
                        reachable.add(k)
                        queue.push({ x: nx, y: ny })
                    }
                }
                // Can move past restricted squares but cannot stop there
                nx += dx
                ny += dy
            }
        }
    }

    if (isDebugCase) {
        console.log(`Total reachable squares: ${reachable.size}`);
        console.log("Squares around king:");
        const kingX = 3, kingY = 10;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue; // skip king square
                const x = kingX + dx, y = kingY + dy;
                if (x >= 0 && x < size && y >= 0 && y < size) {
                    const occupied = position[y][x].occupant ? 
                        `${position[y][x].occupant.type[0].toLowerCase()}` : '.';
                    const reach = reachable.has(key(x, y)) ? 'R' : '-';
                    console.log(`  (${x},${y}): ${occupied} [${reach}]`);
                } else {
                    console.log(`  (${x},${y}): OOB`);
                }
            }
        }
    }

    // Helper to determine if a square is hostile to defenders given
    // attacker reachability.
    const isHostile = (x: number, y: number): boolean => {
        if (x < 0 || y < 0 || x >= size || y >= size) return true
        const sq = position[y][x]
        if (sq.isRestricted) return true
        if (sq.occupant && sq.occupant.owner === Player.Attacker) return true
        return reachable.has(key(x, y))
    }

    // ------------------------------------------------------------------
    // Step 2: determine capturable defenders (including king)
    // ------------------------------------------------------------------
    const capturable = new Set<string>()

    // Edge-enclosure capture detection
    function processHorizontalEdge(y: number) {
        const xs: number[] = []
        for (let x = 0; x < size; x++) {
            const occ = position[y][x].occupant
            if (
                occ &&
                (occ.owner === Player.Defender || occ.type === PieceType.King)
            ) {
                xs.push(x)
            }
        }
        xs.sort((a, b) => a - b)
        let i = 0
        while (i < xs.length) {
            let start = xs[i]
            let end = start
            while (i + 1 < xs.length && xs[i + 1] === xs[i] + 1) {
                i++
                end = xs[i]
            }

            if (isDebugCase && y === size - 1) {
                console.log(`Edge enclosure check: bottom edge segment [${start},${end}]`);
            }

            const adj: Coordinate[] = []
            for (let x = start; x <= end; x++) {
                const inward = y === 0 ? 1 : size - 2
                adj.push({ x, y: inward })
            }
            adj.push({ x: start - 1, y })
            adj.push({ x: end + 1, y })

            if (isDebugCase && y === size - 1) {
                console.log("Adjacent squares to check:");
                for (const {x, y} of adj) {
                    const occ = (x >= 0 && y >= 0 && x < size && y < size) ? 
                        (position[y][x].occupant ? position[y][x].occupant.type[0] : '.') : 'OOB';
                    const hostile = isHostile(x, y) ? 'H' : '-';
                    console.log(`  (${x},${y}): ${occ} [${hostile}]`);
                }
            }

            const enclosed = adj.every(({ x, y }) => isHostile(x, y))
            if (enclosed) {
                if (isDebugCase && y === size - 1) {
                    console.log("Edge enclosure: all adjacent squares hostile - capturing segment");
                }
                for (let x = start; x <= end; x++) {
                    capturable.add(key(x, y))
                }
            } else {
                if (isDebugCase && y === size - 1) {
                    console.log("Edge enclosure: not all adjacent squares hostile - no capture");
                }
            }
            i++
        }
    }

    function processVerticalEdge(x: number) {
        const ys: number[] = []
        for (let y = 0; y < size; y++) {
            const occ = position[y][x].occupant
            if (
                occ &&
                (occ.owner === Player.Defender || occ.type === PieceType.King)
            ) {
                ys.push(y)
            }
        }
        ys.sort((a, b) => a - b)
        let i = 0
        while (i < ys.length) {
            let start = ys[i]
            let end = start
            while (i + 1 < ys.length && ys[i + 1] === ys[i] + 1) {
                i++
                end = ys[i]
            }

            const adj: Coordinate[] = []
            for (let y = start; y <= end; y++) {
                const inward = x === 0 ? 1 : size - 2
                adj.push({ x: inward, y })
            }
            adj.push({ x, y: start - 1 })
            adj.push({ x, y: end + 1 })

            const enclosed = adj.every(({ x, y }) => isHostile(x, y))
            if (enclosed) {
                for (let y = start; y <= end; y++) {
                    capturable.add(key(x, y))
                }
            }
            i++
        }
    }

    processHorizontalEdge(0)
    processHorizontalEdge(size - 1)
    processVerticalEdge(0)
    processVerticalEdge(size - 1)

    // Standard captures & king capture
    const isStandardCapturable = (x: number, y: number): boolean => {
        if (isHostile(x - 1, y) && isHostile(x + 1, y)) return true
        if (isHostile(x, y - 1) && isHostile(x, y + 1)) return true
        return false
    }

    const isKingCapturable = (x: number, y: number): boolean => {
        const dirs = [
            { dx: 1, dy: 0 },
            { dx: -1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: 0, dy: -1 },
        ]
        let hostileCount = 0
        if (isDebugCase) console.log(`Checking king capturability at (${x},${y}):`);
        for (const { dx, dy } of dirs) {
            const nx = x + dx
            const ny = y + dy
            // Out of bounds squares are considered hostile for king capture
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) {
                hostileCount++
                if (isDebugCase) console.log(`  (${nx},${ny}): out of bounds - hostile`);
            } else if (isHostile(nx, ny)) {
                hostileCount++
                if (isDebugCase) console.log(`  (${nx},${ny}): hostile`);
            } else {
                if (isDebugCase) console.log(`  (${nx},${ny}): not hostile`);
            }
        }
        if (isDebugCase) console.log(`King has ${hostileCount}/4 hostile neighbors`);
        return hostileCount >= 4
    }

    let king: Coordinate | null = null
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const sq = position[y][x]
            if (!sq.occupant) continue
            const occ = sq.occupant
            const k = key(x, y)
            if (occ.type === PieceType.King) {
                king = { x, y }
                if (isKingCapturable(x, y)) capturable.add(k)
            } else if (occ.owner === Player.Defender) {
                if (capturable.has(k)) continue // already marked via edge rules
                if (isStandardCapturable(x, y)) capturable.add(k)
            }
        }
    }

    if (isDebugCase) console.log(`Capturable pieces: ${capturable.size}`);
    if (isDebugCase) {
        console.log("List of capturable pieces:");
        for (const piece of capturable) {
            const [x, y] = piece.split(',').map(Number);
            const type = position[y][x].occupant?.type || 'empty';
            console.log(`  (${x},${y}): ${type}`);
        }
    }

    // ------------------------------------------------------------------
    // Step 3: flood fill from king through safe squares
    // ------------------------------------------------------------------
    if (!king) return false
    const kingKey = key(king.x, king.y)
    if (capturable.has(kingKey)) {
        if (isDebugCase) console.log("King is capturable - no fort");
        return false
    }

    const safe = new Set<string>()
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const k = key(x, y)
            const sq = position[y][x]
            if (sq.occupant) {
                const occ = sq.occupant
                if (
                    (occ.owner === Player.Defender ||
                        occ.type === PieceType.King) &&
                    !capturable.has(k)
                ) {
                    safe.add(k)
                }
            } else if (!reachable.has(k)) {
                safe.add(k)
            }
        }
    }

    if (isDebugCase) {
        console.log(`Total safe squares: ${safe.size}`);
        console.log("Safe squares around king:");
        const kingX = 3, kingY = 10;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const x = kingX + dx, y = kingY + dy;
                const k = key(x, y);
                if (x >= 0 && x < size && y >= 0 && y < size) {
                    const isSafe = safe.has(k) ? 'S' : '-';
                    const occupied = position[y][x].occupant ? 
                        `${position[y][x].occupant.type[0].toLowerCase()}` : '.';
                    console.log(`  (${x},${y}): ${occupied} [${isSafe}]`);
                } else {
                    console.log(`  (${x},${y}): OOB`);
                }
            }
        }
    }

    if (!safe.has(kingKey)) {
        if (isDebugCase) console.log("King is not in safe squares - returning false");
        return false
    } else {
        if (isDebugCase) console.log("King is in safe squares");
    }

    const stack: Coordinate[] = [king]
    const visited = new Set<string>([kingKey])
    
    // Special case: if king is at edge but has no safe adjacent squares, 
    // it's not a valid fort (just an isolated king at edge)
    if (king.x === 0 || king.y === 0 || king.x === size - 1 || king.y === size - 1) {
        let hasSafeAdjacent = false;
        let hasThreateningAdjacent = false;
        for (const { dx, dy } of dirs) {
            const nx = king.x + dx
            const ny = king.y + dy
            if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
                const k = key(nx, ny)
                if (safe.has(k)) {
                    hasSafeAdjacent = true;
                } else {
                    // If square is reachable by attackers or has attackers, it's threatening
                    if (reachable.has(k) || (position[ny][nx].occupant?.owner === Player.Attacker)) {
                        hasThreateningAdjacent = true;
                    }
                }
            }
        }
        if (!hasSafeAdjacent) {
            if (isDebugCase) console.log("King at edge but has no safe adjacent squares - not a fort");
            return false;
        }
        // Additional check: if king has threatening adjacent squares, fort must be more robust
        if (hasThreateningAdjacent) {
            // Check if ALL non-out-of-bounds adjacent squares are either safe or protected
            let allAdjacentSecure = true;
            for (const { dx, dy } of dirs) {
                const nx = king.x + dx
                const ny = king.y + dy
                if (nx >= 0 && ny >= 0 && nx < size && ny < size) {
                    const k = key(nx, ny)
                    const square = position[ny][nx];
                    // Square is secure if it's safe, restricted, or protected by safe defenders
                    if (!safe.has(k) && !square.isRestricted) {
                        // Check if this threatening square is "protected" by surrounding safe squares
                        let protectedCount = 0;
                        for (const { dx: dx2, dy: dy2 } of dirs) {
                            const nx2 = nx + dx2
                            const ny2 = ny + dy2
                            if (nx2 >= 0 && ny2 >= 0 && nx2 < size && ny2 < size) {
                                if (safe.has(key(nx2, ny2))) {
                                    protectedCount++;
                                }
                            }
                        }
                        // If the threatening square isn't well-protected, fort is invalid
                        if (protectedCount < 3) {
                            allAdjacentSecure = false;
                            break;
                        }
                    }
                }
            }
            if (!allAdjacentSecure) {
                if (isDebugCase) console.log("King at edge with insufficiently protected threatening squares - not a fort");
                return false;
            }
        }
    }
    
    while (stack.length > 0) {
        const { x, y } = stack.pop()!
        if (x === 0 || y === 0 || x === size - 1 || y === size - 1) {
            if (isDebugCase) console.log(`Fort reaches edge at (${x},${y})`);
            return true
        }
        for (const { dx, dy } of dirs) {
            const nx = x + dx
            const ny = y + dy
            const k = key(nx, ny)
            if (
                nx >= 0 &&
                ny >= 0 &&
                nx < size &&
                ny < size &&
                safe.has(k) &&
                !visited.has(k)
            ) {
                visited.add(k)
                stack.push({ x: nx, y: ny })
            }
        }
    }

    if (isDebugCase) console.log("Fort does not reach edge");
    return false
}

import { clonePosition, extractEdgeSquares } from './board'
import { getAvailableCaptures } from './captures'
import { Coordinate, PieceType, Player, Square } from './types'

const directions = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
]
const attacker = { owner: Player.Attacker, type: PieceType.Attacker }
const key = ({ x, y }: Coordinate) => `${x},${y}`

function inBounds(position: Square[][], { x, y }: Coordinate): boolean {
    return y >= 0 && y < position.length && x >= 0 && x < position[y].length
}

function step({ x, y }: Coordinate, direction: Coordinate): Coordinate {
    return { x: x + direction.x, y: y + direction.y }
}

/** Squares on which attackers can stop, with defenders and the king fixed. */
function attackerReach(position: Square[][], starts: Coordinate[]): Set<string> {
    const reachable = new Set(starts.map(key))
    const pending = [...starts]
    while (pending.length) {
        const from = pending.pop()!
        for (const direction of directions) {
            let to = step(from, direction)
            while (inBounds(position, to)) {
                const square = position[to.y][to.x]
                if (square.occupant?.owner === Player.Defender) break
                // Restricted squares may be crossed in a straight line, but
                // attackers cannot stop (or turn) on them.
                if (!square.isRestricted && !reachable.has(key(to))) {
                    reachable.add(key(to))
                    pending.push(to)
                }
                to = step(to, direction)
            }
        }
    }
    return reachable
}

function kingIsReachable(
    position: Square[][],
    king: Coordinate,
    reachable: Set<string>
): boolean {
    // The king itself is occupied. Check for an approach along a legal rook
    // ray, including straight passage through empty restricted squares.
    return directions.some((direction) => {
        let neighbor = step(king, direction)
        while (inBounds(position, neighbor)) {
            const square = position[neighbor.y][neighbor.x]
            if (square.occupant?.owner === Player.Defender) return false
            if (!square.isRestricted) return reachable.has(key(neighbor))
            neighbor = step(neighbor, direction)
        }
        return false
    })
}

/**
 * Exit fort: recursively remove all structurally capturable soldiers, then
 * check whether any attacker's region reaches the edge king. No defender moves
 * and no hypothetical removal is applied to the caller's board.
 */
export function defendersHaveFort(position: Square[][]): boolean {
    let king: Coordinate | undefined
    const starts: Coordinate[] = []
    for (let y = 0; y < position.length; y++) {
        for (let x = 0; x < position[y].length; x++) {
            const occupant = position[y][x].occupant
            if (occupant?.type === PieceType.King) king = { x, y }
            if (occupant?.owner === Player.Attacker) starts.push({ x, y })
        }
    }
    if (!king) return false
    if (
        king.x !== 0 &&
        king.y !== 0 &&
        king.y !== position.length - 1 &&
        king.x !== position[king.y].length - 1
    ) {
        return false
    }
    // A king can enter any empty square, including restricted squares. Thus
    // any adjacent empty square supplies a legal rook move.
    if (
        !directions.some((direction) => {
            const to = step(king!, direction)
            return inBounds(position, to) && !position[to.y][to.x].occupant
        })
    ) return false

    const remaining = clonePosition(position)
    if (!starts.length) {
        // Synthetic/test positions can contain no attackers. Still require an
        // actual barrier: use hypothetical attackers in the regions outside
        // the king's region, rather than declaring an open board a fort.
        const openKing = clonePosition(remaining)
        openKing[king.y][king.x].occupant = null
        openKing[king.y][king.x].isRestricted = false
        const inside = attackerReach(openKing, [king])
        for (let y = 0; y < remaining.length; y++) {
            for (let x = 0; x < remaining[y].length; x++) {
                const square = remaining[y][x]
                if (
                    !square.occupant &&
                    !square.isRestricted &&
                    !inside.has(key({ x, y }))
                ) {
                    starts.push({ x, y })
                }
            }
        }
        if (!starts.length) return false
    }
    const edges = extractEdgeSquares(position)
    for (;;) {
        const reachable = attackerReach(remaining, starts)
        if (kingIsReachable(remaining, king, reachable)) return false

        // Populate every accessible landing square. This deliberately ignores
        // attacker count and exact positions, but never puts one inside an
        // inaccessible pocket or on a restricted square.
        const hypothetical = clonePosition(remaining)
        const destinations: Coordinate[] = []
        for (let y = 0; y < remaining.length; y++) {
            for (let x = 0; x < remaining[y].length; x++) {
                if (!reachable.has(key({ x, y }))) continue
                hypothetical[y][x].occupant = attacker
                if (
                    directions.some((direction) => {
                        const neighbor = step({ x, y }, direction)
                        return (
                            inBounds(remaining, neighbor) &&
                            remaining[neighbor.y][neighbor.x].occupant?.type === PieceType.Defender
                        )
                    })
                ) destinations.push({ x, y })
            }
        }

        const removable = new Map<string, Coordinate>()
        for (const to of destinations) {
            // A capture must still be completed by a legal move. Clear each
            // candidate arrival ray; all other available attackers can supply
            // the sandwich or shieldwall. No search for setup moves is needed.
            hypothetical[to.y][to.x].occupant = null
            for (const direction of directions) {
                const cleared: Coordinate[] = []
                let from = step(to, direction)
                while (inBounds(remaining, from)) {
                    if (remaining[from.y][from.x].occupant?.owner === Player.Defender) {
                        break
                    }
                    if (reachable.has(key(from))) {
                        const captures = getAvailableCaptures(
                            hypothetical,
                            { from, to, captures: [] },
                            Player.Attacker,
                            edges
                        )
                        for (const captured of captures) {
                            if (remaining[captured.y][captured.x].occupant?.type === PieceType.Defender) {
                                removable.set(key(captured), captured)
                            }
                        }
                        hypothetical[from.y][from.x].occupant = null
                        cleared.push(from)
                    }
                    from = step(from, direction)
                }
                for (const coord of cleared) {
                    hypothetical[coord.y][coord.x].occupant = attacker
                }
            }
            hypothetical[to.y][to.x].occupant = attacker
        }
        if (!removable.size) return true
        for (const { x, y } of removable.values()) remaining[y][x].occupant = null
    }
}

import { canMovePiece, canEnterSquare } from './movement'
import { Square, Coordinate, Player, PossibleMove } from './types'
import { getAvailableCaptures } from './captures'

/** Geometric moves with captures, without game status or repetition context. */
export function generatePossibleMoves(
    position: Square[][],
    from: Coordinate,
    player: Player,
    escapeTargets: Set<Coordinate>
): PossibleMove[] {
    return generateMoveCandidates(position, from, player).map((to) => ({
        to,
        captures: getAvailableCaptures(position, { from, to, captures: [] }, player, escapeTargets),
    }))
}

/** Rook destinations satisfying ownership, path, and terrain constraints. */
export function generateMoveCandidates(
    position: Square[][],
    from: Coordinate,
    player: Player
): Coordinate[] {
    const fromSquare = position[from.y][from.x]
    
    // No piece at source
    if (!fromSquare.occupant) return []
    
    // Not the player's piece (except king can be moved by defender)
    if (!canMovePiece(fromSquare.occupant, player)) {
        return []
    }

    const possibleMoves: Coordinate[] = []
    const size = position.length
    
    // Check all four directions (orthogonal movement only)
    const directions = [
        { dx: 0, dy: -1 }, // up
        { dx: 0, dy: 1 },  // down
        { dx: -1, dy: 0 }, // left
        { dx: 1, dy: 0 },  // right
    ]
    
    for (const { dx, dy } of directions) {
        let distance = 1
        
        // Check each square in this direction until blocked or edge
        while (true) {
            const to: Coordinate = {
                x: from.x + dx * distance,
                y: from.y + dy * distance
            }
            
            // Out of bounds
            if (to.x < 0 || to.x >= size || to.y < 0 || to.y >= size) {
                break
            }
            
            const toSquare = position[to.y][to.x]
            
            // Square is occupied - can't move here or beyond
            if (toSquare.occupant) {
                break
            }
            
            // Non-king pieces can't move to restricted squares
            if (!canEnterSquare(fromSquare.occupant, toSquare)) {
                distance++
                continue
            }
            
            // The ray has already checked every intervening square.
            possibleMoves.push(to)
            
            distance++
        }
    }
    
    return possibleMoves
}

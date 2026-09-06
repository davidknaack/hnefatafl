import { canMovePiece, canEnterSquare } from './movement'
import { Square, Coordinate, Move, Player, PossibleMove } from './types'
import { getAvailableCaptures } from './captures'

export function generatePossibleMoves(
    position: Square[][],
    from: Coordinate,
    player: Player,
    escapeTargets: Set<Coordinate>
): PossibleMove[] {
    const fromSquare = position[from.y][from.x]
    
    // No piece at source
    if (!fromSquare.occupant) return []
    
    // Not the player's piece (except king can be moved by defender)
    if (!canMovePiece(fromSquare.occupant, player)) {
        return []
    }

    const possibleMoves: PossibleMove[] = []
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
            
            // The ray stops at its first occupant, so every intervening square is clear.
            // This is a valid move - calculate captures
            const move: Move = { from, to, captures: [] }
            const captures = getAvailableCaptures(position, move, player, escapeTargets)
            
            possibleMoves.push({
                to,
                captures
            })
            
            distance++
        }
    }
    
    return possibleMoves
}

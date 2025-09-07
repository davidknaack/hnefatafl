import { Square, Coordinate, Move, Player, PieceType, PossibleMove } from './types'
import { getAvailableCaptures } from './rules'

function isPathClear(
    position: Square[][],
    from: Coordinate,
    to: Coordinate
): boolean {
    if (from.x !== to.x && from.y !== to.y) return false // not orthogonal

    const dx = Math.sign(to.x - from.x)
    const dy = Math.sign(to.y - from.y)

    let x = from.x + dx
    let y = from.y + dy

    while (x !== to.x || y !== to.y) {
        if (position[y][x].occupant) return false
        x += dx
        y += dy
    }

    return true
}

export function generatePossibleMoves(
    position: Square[][],
    from: Coordinate,
    player: Player,
    edgeSquares: Set<Coordinate>
): PossibleMove[] {
    const fromSquare = position[from.y][from.x]
    
    // No piece at source
    if (!fromSquare.occupant) return []
    
    // Not the player's piece (except king can be moved by defender)
    if (
        fromSquare.occupant.owner !== player &&
        !(
            player === Player.Defender &&
            fromSquare.occupant.type === PieceType.King
        )
    ) {
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
            if (fromSquare.occupant.type !== PieceType.King && toSquare.isRestricted) {
                distance++
                continue
            }
            
            // Path should be clear (redundant check, but ensures consistency)
            if (!isPathClear(position, from, to)) {
                break
            }
            
            // This is a valid move - calculate captures
            const move: Move = { from, to, captures: [] }
            const captures = getAvailableCaptures(position, move, player, edgeSquares)
            
            possibleMoves.push({
                to,
                captures
            })
            
            distance++
        }
    }
    
    return possibleMoves
}
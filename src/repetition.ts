import { PieceType, Player, Square } from './types'

/** Full piece placement and side to move; terrain is fixed for each game.
 * The initial position counts once. Captures start a new history window.
 */
export function positionKey(position: Square[][], nextPlayer: Player): string {
    return nextPlayer + ':' + position.map((row) => row.map(({ occupant }) => {
        if (!occupant) return '.'
        if (occupant.type === PieceType.King) return 'K'
        return occupant.type === PieceType.Attacker ? 'A' : 'D'
    }).join('')).join('/')
}

import {
    GameStatus,
    PieceType,
    Player,
    Square,
    Move,
} from './types'
import { defendersCanEscape, defendersHaveFort } from './utils'
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

    // An exit fort wins only with a mobile edge king still isolated after
    // recursively removing every structurally capturable defender.
    if (defendersHaveFort(position)) {
        return GameStatus.DefenderWin
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

export { getAvailableCaptures, isSquareHostileTo } from './captures'

export function isKingCaptured(position: Square[][]): boolean {
    for (const row of position) {
        for (const square of row) {
            if (square.occupant && square.occupant.type === PieceType.King)
                return false
        }
    }
    return true
}

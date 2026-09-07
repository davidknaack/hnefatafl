import {
    GameStatus,
    PieceType,
    Player,
    Square,
    Move,
} from './types'
import { defendersCanEscape } from './encirclement'
import { defendersHaveFort } from './exitFort'
import { extractEscapeTargets } from './board'

// Requires the post-move board with all resolved captures already removed.
// Repetition is evaluated by the transition resolver, which owns its history.
export function getGameStatusAfterMove(
    position: Square[][],
    move: Move,
    currentPlayer: Player
): GameStatus {
    const piece = position[move.to.y][move.to.x].occupant

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
        const escapeTargets = extractEscapeTargets(position)
        if (!defendersCanEscape(position, escapeTargets)) {
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

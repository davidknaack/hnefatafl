import { GameOutcome, GameState, Player } from '../types'
import { parseMove } from '../parser'
import { serializeRecordedMove, terminalFor } from '../gameFormat'

export const sideName = (side: Player): string => side === Player.Attacker ? 'Attackers' : 'Defenders'

const reasons: Record<GameOutcome['reason'], string> = {
    king_capture: 'The king was captured.', king_escape: 'The king reached a corner.',
    exit_fort: 'The defenders formed an exit fort.', encirclement: 'The defenders were encircled.',
    repetition: 'The position occurred three times. Repetition is a defender loss.',
    resignation: 'The other side resigned.',
}

export function gameHeading(state: GameState): string {
    return state.outcome ? `${sideName(state.outcome.winner)} win` : `${sideName(state.currentPlayer)} to move`
}

export function gameDetail(state: GameState): string {
    return state.outcome ? reasons[state.outcome.reason]
        : state.currentPlayer === Player.Attacker ? 'Surround the king. Close every escape.' : 'Protect the king. Reach a corner to escape.'
}

/** Use the portable display grammar without changing engine history ordering. */
export function displayHistory(state: GameState): string[] {
    return state.moveHistory.map((command, index) => {
        if (command === '---') return 'Resigned'
        const move = parseMove(command)
        if (!move) throw new Error('Invalid internal move history')
        const terminal = index === state.moveHistory.length - 1
            ? terminalFor(state.status, index % 2 === 0 ? Player.Attacker : Player.Defender) : undefined
        return serializeRecordedMove({ ...move, terminal })
    })
}

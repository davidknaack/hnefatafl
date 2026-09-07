import { coordToString } from '../coordinates'
import { Player } from '../types'
import { RecordedMove, serializeRecordedMove } from '../gameFormat'

export function renderMoveList(
    list: HTMLElement,
    moves: (RecordedMove | '---')[],
    onSelect: (from: string, to: string) => void,
    startingPlayer: Player = Player.Attacker
): void {
    list.innerHTML = ''
    let player = startingPlayer
    for (const move of moves) {
        const li = document.createElement('li')
        const prefix = player === 'defender' ? 'D' : 'A'
        if (move === '---') {
            li.textContent = `${prefix}: ---`
        } else {
            const from = coordToString(move.from)
            const to = coordToString(move.to)
            li.textContent = `${prefix}: ${serializeRecordedMove(move)}`
            li.style.cursor = 'pointer'
            li.onclick = () => onSelect(from, to)
        }
        list.appendChild(li)
        player = player === Player.Defender ? Player.Attacker : Player.Defender
    }
}

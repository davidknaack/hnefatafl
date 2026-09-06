import { coordToString } from '../coordinates'
import { Move } from '../types'

export function renderMoveList(
    list: HTMLElement,
    moves: (Move | 'pass')[],
    onSelect: (from: string, to: string) => void
): void {
    list.innerHTML = ''
    // Preserve the existing display convention; correcting B8 belongs to W8.
    let player = 'defender'
    for (const move of moves) {
        const li = document.createElement('li')
        const prefix = player === 'defender' ? 'D' : 'A'
        if (move === 'pass') {
            li.textContent = `${prefix}: P`
        } else {
            const from = coordToString(move.from)
            const to = coordToString(move.to)
            const caps = move.captures.length
                ? `(${move.captures.map(coordToString).join('')})`
                : ''
            li.textContent = `${prefix}: ${from}-${to}${caps}`
            li.style.cursor = 'pointer'
            li.onclick = () => onSelect(from, to)
        }
        list.appendChild(li)
        player = player === 'defender' ? 'attacker' : 'defender'
    }
}

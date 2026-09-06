import { Coordinate, GameState, Square } from '../types'

export function renderBoard(
    board: HTMLElement,
    state: GameState,
    onSquareClick: (coord: Coordinate, square: Square, state: GameState) => void
): void {
    board.innerHTML = ''
    state.position.forEach((row, y) => {
        row.forEach((square, x) => {
            const div = document.createElement('div')
            div.className = 'cell'
            if (square.isThrone) div.classList.add('throne')
            else if (square.isRestricted) div.classList.add('corner')
            if (square.occupant?.type === 'attacker') div.textContent = '⚔'
            else if (square.occupant?.type === 'defender')
                div.textContent = '🛡️'
            else if (square.occupant?.type === 'king') div.textContent = '👑'
            else div.textContent = ''
            // Retain the state/square snapshot captured when this board was rendered.
            div.addEventListener('click', () =>
                onSquareClick({ x, y }, square, state)
            )
            board.appendChild(div)
        })
    })
}

import { Coordinate, PossibleMove } from '../types'
import { SessionView } from '../session/GameSession'
import { coordToString } from '../coordinates'
import { parseMove } from '../parser'

const indexOf = (coord: Coordinate) => coord.y * 11 + coord.x

/** Persistent squares and roving focus; session updates never replace focused buttons. */
export function createBoard(board: HTMLElement, activate: (coord: Coordinate) => void, clear: () => void) {
    const buttons: HTMLButtonElement[] = []
    let focusIndex = 3
    board.replaceChildren()
    for (let y = 0; y < 11; y++) {
        const row = document.createElement('div')
        row.className = 'board-row'; row.setAttribute('role', 'row')
        for (let x = 0; x < 11; x++) {
            const cell = document.createElement('div'), button = document.createElement('button')
            cell.setAttribute('role', 'gridcell')
            button.type = 'button'; button.className = 'square'; button.dataset.square = coordToString({ x, y })
            button.tabIndex = buttons.length === focusIndex ? 0 : -1
            const piece = document.createElement('span'), hint = document.createElement('span')
            piece.className = 'piece'; piece.setAttribute('aria-hidden', 'true')
            hint.className = 'destination-hint'; hint.setAttribute('aria-hidden', 'true')
            button.append(piece, hint); cell.append(button); row.append(cell); buttons.push(button)
        }
        board.append(row)
    }
    const focus = (index: number, move = true) => {
        buttons[focusIndex].tabIndex = -1
        focusIndex = index; buttons[index].tabIndex = 0
        if (move) buttons[index].focus()
    }
    const clicked = (event: MouseEvent) => {
        const button = (event.target as Element).closest('button')
        const index = buttons.indexOf(button as HTMLButtonElement)
        if (index >= 0) { focus(index, false); activate({ x: index % 11, y: Math.floor(index / 11) }) }
    }
    const focused = (event: FocusEvent) => {
        const index = buttons.indexOf(event.target as HTMLButtonElement)
        if (index >= 0) focus(index, false)
    }
    const keydown = (event: KeyboardEvent) => {
        const index = buttons.indexOf(event.target as HTMLButtonElement)
        if (index < 0) return
        const x = index % 11, y = Math.floor(index / 11)
        let next = index
        switch (event.key) {
            case 'ArrowLeft': next = y * 11 + Math.max(0, x - 1); break
            case 'ArrowRight': next = y * 11 + Math.min(10, x + 1); break
            case 'ArrowUp': next = Math.max(0, y - 1) * 11 + x; break
            case 'ArrowDown': next = Math.min(10, y + 1) * 11 + x; break
            case 'Home': next = event.ctrlKey ? 0 : y * 11; break
            case 'End': next = event.ctrlKey ? 120 : y * 11 + 10; break
            case 'Escape': event.preventDefault(); clear(); return
            default: return
        }
        event.preventDefault(); focus(next)
    }
    const skipToBoard = () => { buttons[focusIndex].focus() }
    // The grid itself is an anchor destination; normal Tab reaches its current square.
    board.tabIndex = -1
    const boardFocus = (event: FocusEvent) => { if (event.target === board) skipToBoard() }
    board.addEventListener('click', clicked)
    board.addEventListener('focusin', focused)
    board.addEventListener('focus', boardFocus)
    board.addEventListener('keydown', keydown)
    return {
        render(view: SessionView, selected: Coordinate | null, moves: PossibleMove[], pending: boolean) {
            const last = view.state.moveHistory[view.state.moveHistory.length - 1]
            const lastMove = last && last !== '---' ? parseMove(last) : null
            const lastSquares = lastMove ? [indexOf(lastMove.from), indexOf(lastMove.to)] : []
            buttons.forEach((button, index) => {
                const x = index % 11, y = Math.floor(index / 11)
                const square = view.state.position[y][x], type = square.occupant?.type
                const move = moves.find(move => indexOf(move.to) === index)
                const isSelected = !!selected && indexOf(selected) === index
                button.className = ['square', (x + y) % 2 ? 'dark-square' : '',
                    square.isThrone ? 'throne-square' : square.isRestricted ? 'escape-square' : '',
                    lastSquares.includes(index) ? 'last-move' : '', isSelected ? 'selected' : '',
                    move ? 'legal-destination' : '', move?.repetition ? `repeat-${move.repetition}` : '',
                ].filter(Boolean).join(' ')
                const piece = button.firstElementChild as HTMLElement
                piece.className = `piece ${type ?? 'empty'}`
                piece.textContent = type === 'king' ? '♔' : ''
                const hint = button.lastElementChild as HTMLElement
                hint.textContent = move?.repetition === 'loss' ? '↻!' : move?.repetition ? '↻' : ''
                button.parentElement!.setAttribute('aria-selected', String(isSelected))
                const label = [coordToString({ x, y }), type ?? 'empty',
                    square.isThrone ? 'throne' : square.isRestricted ? 'escape corner' : '',
                    isSelected ? 'selected' : '', move ? 'legal destination' : '',
                    move?.captures.length ? `captures ${move.captures.map(coordToString).join(', ')}` : '',
                    move?.repetition === 'loss' ? 'third occurrence: defenders lose' : move?.repetition ? 'allowed repeated position' : '',
                ].filter(Boolean).join(', ')
                button.setAttribute('aria-label', label)
                button.title = label
                button.setAttribute('aria-disabled', String(pending || !view.capabilities.move))
            })
            board.setAttribute('aria-busy', String(pending))
        },
        dispose() {
            board.removeEventListener('click', clicked); board.removeEventListener('focusin', focused)
            board.removeEventListener('keydown', keydown); board.removeEventListener('focus', boardFocus)
        },
    }
}

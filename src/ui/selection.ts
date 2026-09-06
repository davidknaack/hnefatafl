import { HnefataflEngine } from '../HnefataflEngine'
import { coordToString } from '../coordinates'
import { isSameCoord } from '../movement'
import { Coordinate, PossibleMove } from '../types'
import { UIElements } from './elements'

export class Selection {
    from: Coordinate | null = null
    possibleMoves: PossibleMove[] = []
    private highlights: Element[] = []

    constructor(
        private ui: UIElements,
        private engine: HnefataflEngine
    ) {}

    clearHighlights(): void {
        this.highlights.forEach((cell) => {
            cell.classList.remove(
                'highlight-possible',
                'highlight-capture',
                'highlight-selected'
            )
        })
        this.highlights = []
    }

    private highlight(coord: Coordinate, className: string): void {
        const cell = this.ui.board.children[coord.y * 11 + coord.x]
        cell.classList.add(className)
        this.highlights.push(cell)
    }

    private show(from: Coordinate, moves: PossibleMove[]): void {
        this.highlight(from, 'highlight-selected')
        moves.forEach((move) => {
            this.highlight(move.to, 'highlight-possible')
            move.captures.forEach((capture) =>
                this.highlight(capture, 'highlight-capture')
            )
        })
    }

    select(from: Coordinate): void {
        this.from = from
        this.ui.from.value = coordToString(from)
        this.ui.to.value = ''
        this.clearHighlights()
        this.possibleMoves = this.engine.getPossibleMoves(from)
        this.ui.log.textContent = JSON.stringify(this.possibleMoves, null, 2)
        if (this.ui.displayMoves.checked) this.show(from, this.possibleMoves)
    }

    showTarget(to: Coordinate): void {
        if (!this.ui.displayMoves.checked || !this.from) return
        this.clearHighlights()
        const move = this.possibleMoves.find((move) => isSameCoord(move.to, to))
        this.show(this.from, [{ to, captures: move?.captures ?? [] }])
    }

    toggleVisibility(): void {
        if (
            this.ui.displayMoves.checked &&
            this.from &&
            this.possibleMoves.length > 0
        ) {
            this.show(this.from, this.possibleMoves)
        } else {
            this.clearHighlights()
        }
    }

    clear(): void {
        this.from = null
        this.possibleMoves = []
        this.ui.from.value = ''
        this.ui.to.value = ''
        this.clearHighlights()
    }
}

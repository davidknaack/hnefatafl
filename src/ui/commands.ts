import { HnefataflEngine } from '../HnefataflEngine'
import { coordToString } from '../coordinates'
import { canMovePiece, isSameCoord } from '../movement'
import { parseMove } from '../parser'
import { RecordedMove, terminalFor } from '../gameFormat'
import { Coordinate, GameState, Player, Square } from '../types'
import { renderBoard } from './board'
import { UIElements } from './elements'
import { renderMoveList } from './history'
import { Selection } from './selection'

export function bindCommands(ui: UIElements, engine: HnefataflEngine): void {
    const selection = new Selection(ui, engine)
    const inputMove = () => `${ui.from.value}-${ui.to.value}`
    const selectHistory = (from: string, to: string) => {
        ui.from.value = from
        ui.to.value = to
    }

    function render(): void {
        const state = engine.getState()
        renderBoard(ui.board, state, onSquareClick)
        ui.player.textContent = state.currentPlayer
        ui.capturedA.textContent = String(state.captured.attacker)
        ui.capturedD.textContent = String(state.captured.defender)
        ui.status.textContent = state.status
        const parsedMoves = state.moveHistory.map((str, index): RecordedMove | '---' => {
            if (str === '---') return str
            const move: RecordedMove | null = parseMove(str)
            if (!move) throw new Error('Invalid internal move history')
            if (index === state.moveHistory.length - 1) {
                move.terminal = terminalFor(state.status, index % 2 === 0 ? Player.Attacker : Player.Defender)
            }
            return move
        })
        renderMoveList(ui.currentMoves, parsedMoves, selectHistory)
        ui.copy.disabled = state.moveHistory.length === 0
    }

    function validate(): void {
        const result = engine.validateMove(inputMove())
        if (result.expectedCaptures && result.expectedCaptures.length > 0) {
            const captures = result.expectedCaptures.map(coordToString).join('')
            ui.log.textContent = `${JSON.stringify(result, null, 2)}\n\nCaptures: ${captures}`
        } else {
            ui.log.textContent = JSON.stringify(result, null, 2)
        }
    }

    function apply(mode: 'manual' | 'automatic'): void {
        const result = engine.applyMove(inputMove())
        ui.log.textContent = JSON.stringify(result, null, 2)
        if (result.success) {
            selection.clear()
            render()
        } else if (mode === 'automatic') {
            selection.clear()
        } else {
            // Manual failure clears fields but retains selection and highlights.
            ui.from.value = ''
            ui.to.value = ''
        }
    }

    function onSquareClick(
        coord: Coordinate,
        square: Square,
        state: GameState
    ): void {
        const friendly =
            square.occupant &&
            canMovePiece(square.occupant, state.currentPlayer)
        if (!selection.from) {
            if (friendly) selection.select(coord)
        } else if (friendly) {
            selection.select(coord)
        } else if (
            selection.possibleMoves.some((move) => isSameCoord(move.to, coord))
        ) {
            ui.to.value = coordToString(coord)
            // Auto Apply has priority even when both toggles are checked.
            if (ui.autoApply.checked) {
                apply('automatic')
            } else {
                if (ui.autoValidate.checked) validate()
                selection.showTarget(coord)
            }
        } else {
            selection.clear()
        }
    }

    ui.validate.onclick = validate
    ui.apply.onclick = () => apply('manual')
    ui.clear.onclick = () => selection.clear()
    ui.load.onclick = () => {
        const result = engine.loadGame(ui.notation.value)
        if (!result.success) {
            ui.log.textContent = result.error
            return
        }
        selection.clear()
        render()
        ui.log.textContent = `Loaded and validated ${result.newState.moveHistory.filter((move) => move !== '---').length} moves`
    }
    ui.copy.onclick = async () => {
        try {
            await navigator.clipboard.writeText(engine.saveGame())
            ui.log.textContent = 'Game copied to clipboard'
        } catch (error) {
            ui.log.textContent = `Could not copy game: ${error instanceof Error ? error.message : String(error)}`
        }
    }
    ui.displayMoves.onchange = () => selection.toggleVisibility()
    engine.reset()
    render()
}

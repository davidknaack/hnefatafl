import { coordToString } from '../coordinates'
import { canMovePiece, isSameCoord } from '../movement'
import { parseMove } from '../parser'
import { RecordedMove, terminalFor } from '../gameFormat'
import { Coordinate, GameState, Player, Square } from '../types'
import { GameSession, SessionView } from '../session/GameSession'
import { renderBoard } from './board'
import { UIElements } from './elements'
import { renderMoveList } from './history'
import { Selection } from './selection'

const bindings = new WeakMap<HTMLElement, () => void>()

/** Bind an existing session without resetting it. Caller owns/disposes the session. */
export function bindCommands(ui: UIElements, session: GameSession): () => void {
    bindings.get(ui.board)?.()
    const selection = new Selection(ui, session)
    let active = true
    let operation = 0
    let pending = false
    let view = session.getView()
    const inputMove = () => `${ui.from.value}-${ui.to.value}`
    const current = (generation: number) => active && generation === session.getView().generation

    function controls(): void {
        ui.apply.disabled = pending || !view.capabilities.move
        ui.validate.disabled = !view.capabilities.validate
        ui.load.disabled = !view.capabilities.import
        ui.notation.disabled = !view.capabilities.import
        ui.copy.disabled = !view.capabilities.export
        ui.autoApply.disabled = !view.capabilities.move
        ui.autoValidate.disabled = !view.capabilities.validate
    }

    function render(next: SessionView): void {
        if (!active) return
        selection.clear()
        view = next
        const { state, generation } = next
        renderBoard(ui.board, state, (coord, square, boardState) => {
            if (current(generation)) onSquareClick(coord, square, boardState)
        })
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
        renderMoveList(ui.currentMoves, parsedMoves, (from, to) => {
            if (!current(generation)) return
            ui.from.value = from
            ui.to.value = to
        })
        controls()
    }

    function validate(): void {
        if (!active) return
        const result = session.validateMove(inputMove(), view.generation)
        if (result.expectedCaptures.length > 0) {
            const captures = result.expectedCaptures.map(coordToString).join('')
            ui.log.textContent = `${JSON.stringify(result, null, 2)}\n\nCaptures: ${captures}`
        } else ui.log.textContent = JSON.stringify(result, null, 2)
    }

    async function apply(mode: 'manual' | 'automatic'): Promise<void> {
        if (!active || pending || !view.capabilities.move) return
        const request = ++operation
        const generation = view.generation
        const command = inputMove()
        pending = true
        controls()
        try {
            const result = await session.submitMove(command, generation)
            if (!active || request !== operation || !current(result.generation)) return
            // A stale rejection must not clear input belonging to an imported/new view.
            if (!result.success && !current(generation)) return
            ui.log.textContent = JSON.stringify(result, null, 2)
            // Successful state/selection rendering is owned by the subscription.
            if (!result.success && mode === 'automatic') selection.clear()
            else if (!result.success) {
                // Retain debug harness behavior: manual failure keeps highlights.
                ui.from.value = ''
                ui.to.value = ''
            }
        } catch (error) {
            if (active && request === operation && current(generation)) {
                ui.log.textContent = error instanceof Error ? error.message : String(error)
            }
        } finally {
            if (active && request === operation) {
                pending = false
                controls()
            }
        }
    }

    function onSquareClick(coord: Coordinate, square: Square, state: GameState): void {
        if (pending || !view.capabilities.move) return
        const friendly = square.occupant && canMovePiece(square.occupant, state.currentPlayer)
        if (!selection.from) {
            if (friendly) selection.select(coord, view.generation)
        } else if (friendly) {
            selection.select(coord, view.generation)
        } else if (selection.possibleMoves.some((move) => isSameCoord(move.to, coord))) {
            ui.to.value = coordToString(coord)
            // Auto Apply continues to take precedence when both toggles are checked.
            if (ui.autoApply.checked) void apply('automatic')
            else {
                if (ui.autoValidate.checked) validate()
                selection.showTarget(coord)
            }
        } else selection.clear()
    }

    const onValidate = () => validate()
    const onApply = () => { void apply('manual') }
    const onClear = () => { if (active) selection.clear() }
    const onLoad = () => {
        if (!active) return
        const result = session.loadGame(ui.notation.value, view.generation)
        if (!result.success) { ui.log.textContent = result.error; return }
        operation++
        pending = false
        controls()
        ui.log.textContent = `Loaded and validated ${result.newState.moveHistory.filter((move) => move !== '---').length} moves`
    }
    const onCopy = async () => {
        if (!active) return
        const generation = view.generation
        try {
            await navigator.clipboard.writeText(session.saveGame())
            if (current(generation)) ui.log.textContent = 'Game copied to clipboard'
        } catch (error) {
            if (current(generation)) ui.log.textContent = `Could not copy game: ${error instanceof Error ? error.message : String(error)}`
        }
    }
    const onDisplay = () => { if (active) selection.toggleVisibility() }
    ui.validate.onclick = onValidate
    ui.apply.onclick = onApply
    ui.clear.onclick = onClear
    ui.load.onclick = onLoad
    ui.copy.onclick = onCopy
    ui.displayMoves.onchange = onDisplay
    const unsubscribe = session.subscribe(render)
    const unbind = () => {
        if (!active) return
        active = false
        operation++
        unsubscribe()
        selection.clear()
        ui.validate.onclick = null
        ui.apply.onclick = null
        ui.clear.onclick = null
        ui.load.onclick = null
        ui.copy.onclick = null
        ui.displayMoves.onchange = null
        bindings.delete(ui.board)
    }
    bindings.set(ui.board, unbind)
    return unbind
}

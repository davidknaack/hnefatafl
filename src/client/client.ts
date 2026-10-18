import { Coordinate, Player, PossibleMove } from '../types'
import { coordToString } from '../coordinates'
import { isSameCoord } from '../movement'
import { GameSession, SessionView } from '../session/GameSession'
import { LocalGameSession } from '../session/LocalGameSession'
import { SessionOwner } from '../session/SessionOwner'
import { parseMove } from '../parser'
import { clientElements, ClientElements } from './elements'
import { createBoard } from './board'
import { displayHistory, gameDetail, gameHeading, sideName } from './presentation'
import { loadGameLibrary } from './gameLibrary'

function bindGame(ui: ClientElements, session: GameSession): () => void {
    let view = session.getView(), selected: Coordinate | null = null, moves: PossibleMove[] = []
    let active = true, pending = false
    const board = createBoard(ui.board, activate, clear)
    const current = (generation: number) => active && session.getView().generation === generation
    function renderBoard() {
        board.render(view, selected, moves, pending)
        ui.clear.disabled = !selected || pending
    }
    function clear() {
        selected = null; moves = []; renderBoard()
        ui.feedback.textContent = view.state.outcome ? gameDetail(view.state) : `Select ${view.state.currentPlayer === Player.Attacker ? 'an attacker' : 'a defender or the king'}.`
    }
    function activate(coord: Coordinate) {
        if (pending || !view.capabilities.move) return
        const piece = view.state.position[coord.y][coord.x].occupant
        if (selected && isSameCoord(selected, coord)) { clear(); return }
        if (piece?.owner === view.state.currentPlayer) {
            selected = coord; moves = session.getPossibleMoves(coord, view.generation)
            ui.feedback.textContent = `${coordToString(coord)} selected. ${moves.length} legal ${moves.length === 1 ? 'move' : 'moves'}. ${moves.length ? 'Choose a destination.' : 'Choose another piece.'}`
            renderBoard()
        } else if (selected && moves.some(move => isSameCoord(move.to, coord))) {
            void submit(coord)
        } else clear()
    }
    async function submit(to: Coordinate) {
        const generation = view.generation, from = selected!
        pending = true; renderBoard()
        try {
            const result = await session.submitMove(`${coordToString(from)}-${coordToString(to)}`, generation)
            if (!current(result.generation)) return
            if (!result.success && current(generation)) ui.feedback.textContent = result.error
        } catch (error) {
            if (current(generation)) ui.feedback.textContent = error instanceof Error ? error.message : 'The move could not be played.'
        } finally {
            if (active) { pending = false; renderBoard() }
        }
    }
    let historySignature = ''
    function render(next: SessionView) {
        if (!active) return
        const oldLength = view.state.moveHistory.length
        if (next.generation !== view.generation) { selected = null; moves = [] }
        view = next
        ui.title.textContent = gameHeading(next.state); ui.detail.textContent = gameDetail(next.state)
        ui.marker.className = `turn-marker ${next.state.outcome ? 'finished' : next.state.currentPlayer}`
        const playing = !next.state.outcome
        ui.attackerCard.classList.toggle('active-side', playing && next.state.currentPlayer === Player.Attacker)
        ui.defenderCard.classList.toggle('active-side', playing && next.state.currentPlayer === Player.Defender)
        let attackers = 0, defenders = 0
        next.state.position.forEach(row => row.forEach(square => {
            if (square.occupant?.owner === Player.Attacker) attackers++
            else if (square.occupant) defenders++
        }))
        ui.attackers.textContent = String(attackers); ui.defenders.textContent = String(defenders)
        const captured = next.state.captured
        ui.captures.textContent = captured.attacker || captured.defender
            ? `Captured: ${captured.attacker} ${captured.attacker === 1 ? 'attacker' : 'attackers'} · ${captured.defender} ${captured.defender === 1 ? 'defender' : 'defenders'}.` : 'No pieces captured yet.'
        const boardMoves = next.state.moveHistory.filter(move => move !== '---').length
        ui.moveNumber.textContent = playing ? `Move ${Math.floor(boardMoves / 2) + 1}` : 'Game finished'
        ui.recordCount.textContent = `${boardMoves} ${boardMoves === 1 ? 'move' : 'moves'}`
        ui.exportButton.disabled = !next.capabilities.export
        ui.importButton.disabled = !next.capabilities.import
        const signature = next.state.moveHistory.join(' ') + next.state.status
        if (signature !== historySignature) {
            const atBottom = ui.historyScroll.scrollHeight - ui.historyScroll.scrollTop - ui.historyScroll.clientHeight < 32
            historySignature = signature
            ui.history.replaceChildren()
            const history = displayHistory(next.state)
            for (let index = 0; index < history.length; index += 2) {
                const row = document.createElement('li')
                const number = document.createElement('span')
                number.className = 'history-number'; number.textContent = String(index / 2 + 1); number.setAttribute('aria-hidden', 'true')
                row.append(number)
                for (let offset = 0; offset < 2; offset++) {
                    const command = document.createElement('span'), text = history[index + offset]
                    if (text) {
                        const label = document.createElement('span')
                        label.className = 'sr-only'
                        label.textContent = `${sideName(offset === 0 ? Player.Attacker : Player.Defender)}, move ${index / 2 + 1}: `
                        command.append(label, document.createTextNode(text))
                    } else { command.textContent = '—'; command.setAttribute('aria-hidden', 'true') }
                    row.append(command)
                }
                ui.history.append(row)
            }
            ui.empty.hidden = history.length > 0
            if (atBottom) ui.historyScroll.scrollTop = ui.historyScroll.scrollHeight
        }
        if (next.state.outcome) ui.feedback.textContent = `${gameHeading(next.state)}. ${gameDetail(next.state)}`
        else if (next.state.moveHistory.length > oldLength) {
            const move = parseMove(next.state.moveHistory[next.state.moveHistory.length - 1])
            ui.feedback.textContent = move ? `${coordToString(move.from)} to ${coordToString(move.to)}.${move.captures.length ? ` Captured ${move.captures.map(coordToString).join(', ')}.` : ''} ${gameHeading(next.state)}.` : gameHeading(next.state)
        }
        renderBoard()
    }
    ui.clear.onclick = clear
    ui.feedback.textContent = view.state.outcome ? `${gameHeading(view.state)}. ${gameDetail(view.state)}`
        : view.state.moveHistory.length ? 'Game loaded. Select a piece to continue.' : 'Select an attacker to begin.'
    const unsubscribe = session.subscribe(render)
    return () => { active = false; unsubscribe(); board.dispose(); ui.clear.onclick = null }
}

export interface ClientDependencies {
    loadLibrary?: () => Promise<readonly string[]>
}

/** Local production consumer. No sockets or recovery-slot access in this milestone. */
export function mountLocalClient(root: ParentNode, initial: GameSession = new LocalGameSession(), dependencies: ClientDependencies = {}): () => void {
    const ui = clientElements(root)
    let active = true
    const owner = new SessionOwner(initial, session => bindGame(ui, session))
    let replacement: { commit: () => void; cancel: () => void } | undefined
    const dialogs = [ui.help, ui.importDialog, ui.exportDialog, ui.confirm]
    let games: readonly string[] | undefined, loadingLibrary = false
    async function populateLibrary() {
        if (games || loadingLibrary) return
        loadingLibrary = true; ui.library.disabled = true
        ui.libraryStatus.textContent = 'Loading test games…'
        try {
            const loaded = await (dependencies.loadLibrary ?? loadGameLibrary)()
            if (!active) return
            games = loaded
            const options = document.createDocumentFragment()
            games.forEach((_game, index) => {
                const option = document.createElement('option')
                option.value = String(index); option.textContent = `Game ${index + 1}`; options.append(option)
            })
            ui.library.append(options); ui.library.disabled = false
            ui.libraryStatus.textContent = `${games.length.toLocaleString()} test games. Select one to review its notation, then choose Load game.`
        } catch {
            if (active) ui.libraryStatus.textContent = 'Test games could not be opened. Paste your own notation, or reopen this dialog to try again.'
        } finally { loadingLibrary = false }
    }
    function clearImportError() {
        ui.importError.textContent = ''; ui.importText.removeAttribute('aria-invalid')
    }
    ui.library.onchange = () => {
        if (ui.library.value === '' || !games) return
        const game = games[Number(ui.library.value)]
        if (game !== undefined) { ui.importText.value = game; clearImportError() }
    }
    ui.importText.oninput = () => { ui.library.value = ''; clearImportError() }
    function cancelReplacement() { replacement?.cancel(); replacement = undefined }
    function replace(candidate: LocalGameSession, description: string) {
        const source = owner.session, generation = source.getView().generation
        const commit = () => {
            if (!active || owner.session !== source || source.getView().generation !== generation) {
                candidate.dispose(); ui.feedback.textContent = 'The game changed. Please try again.'; return
            }
            ui.importDialog.close()
            owner.replace(candidate)
        }
        if (!source.getView().state.moveHistory.length) { commit(); return }
        cancelReplacement()
        replacement = { commit, cancel: () => candidate.dispose() }
        ui.confirmDescription.textContent = description
        ui.confirm.showModal(); ui.cancelReplace.focus()
    }
    ui.newGame.onclick = () => replace(new LocalGameSession(), 'Start a new game? Save or copy the current record first if you want to keep it.')
    ui.helpButton.onclick = () => {
        ui.help.showModal()
        const heading = ui.help.querySelector<HTMLElement>('h2')!
        heading.tabIndex = -1; heading.focus(); ui.help.scrollTop = 0
    }
    ui.closeHelp.onclick = () => ui.help.close()
    ui.importButton.onclick = () => {
        clearImportError()
        ui.importDialog.showModal(); ui.importText.focus()
        void populateLibrary()
    }
    ui.cancelImport.onclick = () => ui.importDialog.close()
    ui.load.onclick = () => {
        const candidate = new LocalGameSession()
        const result = candidate.loadGame(ui.importText.value, candidate.getView().generation)
        if (!result.success) {
            candidate.dispose(); ui.importError.textContent = result.error
            ui.importText.setAttribute('aria-invalid', 'true'); ui.importText.focus(); return
        }
        ui.importError.textContent = ''; ui.importText.removeAttribute('aria-invalid')
        replace(candidate, 'Load this game in place of the current game? Save or copy the current record first if you want to keep it.')
    }
    ui.replace.onclick = () => {
        const action = replacement; replacement = undefined
        ui.confirm.close(); action?.commit()
    }
    ui.cancelReplace.onclick = () => { cancelReplacement(); ui.confirm.close() }
    ui.confirm.addEventListener('cancel', cancelReplacement)
    ui.confirm.addEventListener('close', cancelReplacement)
    ui.exportButton.onclick = () => {
        try {
            ui.exportText.value = owner.session.saveGame(); ui.exportStatus.textContent = ''
            ui.exportDialog.showModal()
        } catch (error) { ui.feedback.textContent = error instanceof Error ? error.message : 'The game could not be saved.' }
    }
    ui.closeExport.onclick = () => ui.exportDialog.close()
    ui.copy.onclick = async () => {
        const text = ui.exportText.value
        try {
            await navigator.clipboard.writeText(text)
            if (active && ui.exportDialog.open && ui.exportText.value === text) ui.exportStatus.textContent = 'Game record copied.'
        } catch {
            if (active && ui.exportDialog.open && ui.exportText.value === text) {
                ui.exportStatus.textContent = 'Could not access the clipboard. Select and copy the record above, or download it.'
                ui.exportText.focus(); ui.exportText.select()
            }
        }
    }
    ui.download.onclick = () => {
        const url = URL.createObjectURL(new Blob([ui.exportText.value], { type: 'text/plain;charset=utf-8' }))
        const link = document.createElement('a')
        link.href = url; link.download = 'hnefatafl-game.txt'; link.click()
        setTimeout(() => URL.revokeObjectURL(url), 0)
        ui.exportStatus.textContent = 'Game record prepared for download.'
    }
    return () => {
        if (!active) return
        active = false; cancelReplacement()
        ui.confirm.removeEventListener('cancel', cancelReplacement); ui.confirm.removeEventListener('close', cancelReplacement)
        dialogs.forEach(dialog => dialog.close()); owner.dispose()
        ui.library.onchange = null; ui.importText.oninput = null
        for (const button of [ui.newGame, ui.helpButton, ui.closeHelp, ui.importButton, ui.cancelImport,
            ui.load, ui.replace, ui.cancelReplace, ui.exportButton, ui.closeExport, ui.copy, ui.download]) button.onclick = null
    }
}

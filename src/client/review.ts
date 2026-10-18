import { GameSession, SessionResult, SessionView } from '../session/GameSession'
import { ReviewChoice, ReviewLine } from '../session/LocalReview'
import { parseMove } from '../parser'
import { serializeRecordedMove } from '../gameFormat'
import { Player } from '../types'
import { ClientElements } from './elements'
import { displayHistory, sideName } from './presentation'

function moveText(command: string): string {
    if (command === '---') return 'Resigned'
    const move = parseMove(command)
    return move ? serializeRecordedMove(move) : command
}

/** Record navigation is a local session consumer, separate from board input. */
export function bindReview(ui: ClientElements, session: GameSession) {
    let view = session.getView(), active = true, historySignature = ''
    let variantAction: { generation: number; line: string; command?: string; complete?: (result?: SessionResult) => void } | undefined
    let saving = false
    const tabs = [ui.movesTab, ui.variantsTab]
    function tab(index: number, focus = false) {
        tabs.forEach((button, i) => { button.setAttribute('aria-selected', String(i === index)); button.tabIndex = i === index ? 0 : -1 })
        ui.movesPanel.hidden = index !== 0; ui.variantsPanel.hidden = index !== 1
        if (focus) tabs[index].focus()
    }
    function result(result: SessionResult | undefined) {
        if (result && !result.success) ui.feedback.textContent = result.error
    }
    function seek(line: string, ply: number, generation = view.generation) {
        if (active) result(session.reviewMove?.(line, ply, generation))
    }
    function chooseNext() {
        const review = view.review
        if (!review || !active) return
        if (review.next.length === 1) { const next = review.next[0]; seek(next.line, next.ply); return }
        if (!review.next.length) return
        const generation = view.generation
        ui.nextChoices.replaceChildren()
        review.next.forEach((choice: ReviewChoice) => {
            const button = document.createElement('button'), title = document.createElement('strong')
            button.type = 'button'; button.className = 'continuation-option'
            title.textContent = `${choice.label} · ${moveText(choice.move)}`; button.append(title)
            if (choice.description) { const note = document.createElement('span'); note.textContent = choice.description; button.append(note) }
            button.onclick = () => { ui.nextDialog.close(); seek(choice.line, choice.ply, generation) }
            ui.nextChoices.append(button)
        })
        ui.nextDialog.showModal()
    }
    function variant(command?: string, complete?: (result?: SessionResult) => void) {
        if (!view.review || !active) return
        const edit = command === undefined
        variantAction = { generation: view.generation, line: view.review.line, command, complete }
        const line = view.review.lines.find(line => line.id === view.review!.line)!
        ui.variantTitle.textContent = edit ? `Describe ${line.label}` : 'Create a variant'
        ui.variantHelp.textContent = edit ? 'Add a short note so you can recognize this line later.' : `Branch from ${view.review.label} by playing ${moveText(command!)} at ply ${view.review.cursor + 1}. The existing continuation stays intact.`
        ui.variantDescription.value = edit ? line.description : ''
        ui.variantError.textContent = ''; ui.saveVariant.textContent = edit ? 'Save description' : 'Create variant'; ui.saveVariant.disabled = false
        ui.variantDialog.showModal(); ui.variantDescription.focus()
    }
    function cancelVariant() {
        const action = variantAction; variantAction = undefined
        action?.complete?.()
    }
    const variantClosed = () => { if (!ui.variantDialog.open) cancelVariant() }
    ui.variantDialog.addEventListener('cancel', cancelVariant)
    ui.variantDialog.addEventListener('close', variantClosed)
    ui.saveVariant.onclick = async () => {
        if (!active || !variantAction || saving) return
        const action = variantAction
        saving = true; ui.saveVariant.disabled = true
        try {
            const response = action.command === undefined ? session.describeVariant?.(action.line, ui.variantDescription.value, action.generation)
                : await session.submitVariant?.(action.command, ui.variantDescription.value, action.generation)
            if (!active || variantAction !== action) return
            if (!response?.success) { ui.variantError.textContent = response?.error ?? 'Variants are not available'; return }
            variantAction = undefined; ui.variantDialog.close(); action.complete?.(response)
            if (action.command !== undefined) tab(0)
        } catch (error) {
            if (active && variantAction === action) ui.variantError.textContent = error instanceof Error ? error.message : 'The variant could not be played.'
        } finally { saving = false; if (active) ui.saveVariant.disabled = false }
    }
    ui.describe.onclick = () => variant()
    ui.cancelVariant.onclick = () => { cancelVariant(); ui.variantDialog.close() }
    ui.cancelNext.onclick = () => ui.nextDialog.close()
    ui.reviewStart.onclick = () => { if (view.review) seek(view.review.line, 0) }
    ui.reviewBack.onclick = () => { if (view.review) seek(view.review.line, view.review.cursor - 1) }
    ui.reviewNext.onclick = chooseNext
    ui.reviewEnd.onclick = () => { if (view.review) seek(view.review.line, view.review.moves.length) }
    ui.movesTab.onclick = () => tab(0)
    ui.variantsTab.onclick = () => tab(1)
    const tabKeys = (event: KeyboardEvent) => {
        const index = tabs.indexOf(event.target as HTMLButtonElement)
        if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault(); tab(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index, true)
    }
    tabs.forEach(button => button.addEventListener('keydown', tabKeys))
    const historyClick = (event: MouseEvent) => {
        const button = (event.target as Element).closest<HTMLButtonElement>('button[data-ply]')
        if (button && view.review) seek(view.review.line, Number(button.dataset.ply))
    }
    const historyKeys = (event: KeyboardEvent) => {
        const button = (event.target as Element).closest<HTMLButtonElement>('button[data-ply]')
        if (!button || !view.review) return
        const ply = Number(button.dataset.ply), end = view.review.moves.length
        const targets: Record<string, number> = { ArrowLeft: ply - 1, ArrowRight: ply + 1, ArrowUp: ply - 2, ArrowDown: ply + 2, Home: 1, End: end }
        if (!(event.key in targets)) return
        event.preventDefault()
        const next = Math.max(1, Math.min(end, targets[event.key]))
        seek(view.review.line, next)
        ui.history.querySelector<HTMLButtonElement>(`button[data-ply="${next}"]`)?.focus()
    }
    ui.history.addEventListener('click', historyClick); ui.history.addEventListener('keydown', historyKeys)

    function render(next: SessionView) {
        if (!active) return
        view = next
        const review = next.review, cursor = review?.cursor ?? next.state.moveHistory.length
        const commands = review?.moves ?? next.state.moveHistory
        ui.reviewControls.hidden = !review; ui.variantsTab.hidden = !review
        ui.reviewPosition.textContent = review ? `${review.label} · ${cursor} / ${commands.length}` : ''
        const available = next.connection !== 'closed'
        ui.reviewStart.disabled = ui.reviewBack.disabled = !available || cursor === 0
        ui.reviewNext.disabled = !available || !review?.next.length
        ui.reviewNext.classList.toggle('has-choices', !!review && review.next.length > 1)
        ui.reviewNext.setAttribute('aria-label', review && review.next.length > 1 ? 'Choose next move' : 'Next move')
        ui.reviewNext.setAttribute('aria-haspopup', review && review.next.length > 1 ? 'dialog' : 'false')
        ui.reviewEnd.disabled = !available || cursor === commands.length
        ui.describe.disabled = !available || !review || review.line === 'main'
        ui.variantsTab.textContent = `Variants${review && review.lines.length > 1 ? ` (${review.lines.length - 1})` : ''}`
        const count = commands.filter(command => command !== '---').length
        ui.recordCount.textContent = `${count} ${count === 1 ? 'move' : 'moves'}`
        const signature = `${review?.line ?? ''}:${commands.join(' ')}:${review?.status ?? next.state.status}`
        if (signature !== historySignature) {
            historySignature = signature; ui.history.replaceChildren()
            const history = displayHistory({ ...next.state, moveHistory: commands, status: review?.status ?? next.state.status })
            for (let index = 0; index < history.length; index += 2) {
                const row = document.createElement('li'), number = document.createElement('span')
                number.className = 'history-number'; number.textContent = String(index / 2 + 1); number.setAttribute('aria-hidden', 'true'); row.append(number)
                for (let offset = 0; offset < 2; offset++) {
                    const text = history[index + offset], command = document.createElement(text && review ? 'button' : 'span')
                    if (text) {
                        const label = document.createElement('span'); label.className = 'sr-only'
                        label.textContent = `${sideName(offset === 0 ? Player.Attacker : Player.Defender)}, move ${index / 2 + 1}: `
                        command.append(label, document.createTextNode(text))
                        if (command instanceof HTMLButtonElement) { command.type = 'button'; command.dataset.ply = String(index + offset + 1) }
                    } else { command.textContent = '—'; command.setAttribute('aria-hidden', 'true') }
                    row.append(command)
                }
                ui.history.append(row)
            }
            ui.empty.hidden = history.length > 0
        }
        ui.history.querySelectorAll<HTMLButtonElement>('button[data-ply]').forEach(button => {
            const ply = Number(button.dataset.ply)
            button.classList.toggle('current-move', ply === cursor)
            if (ply === cursor) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current')
            button.tabIndex = ply === (cursor || 1) ? 0 : -1
            button.disabled = !available
        })
        const selected = ui.history.querySelector<HTMLElement>('.current-move')?.closest('li')
        if (selected) {
            if (selected.offsetTop < ui.historyScroll.scrollTop) ui.historyScroll.scrollTop = selected.offsetTop
            else if (selected.offsetTop + selected.offsetHeight > ui.historyScroll.scrollTop + ui.historyScroll.clientHeight) ui.historyScroll.scrollTop = selected.offsetTop + selected.offsetHeight - ui.historyScroll.clientHeight
        }
        const focusedLine = ui.variantList.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.line : undefined
        ui.variantList.replaceChildren()
        function addLine(line: ReviewLine) {
            const button = document.createElement('button'), title = document.createElement('strong'), detail = document.createElement('span')
            button.type = 'button'; button.className = 'variant-option'; button.dataset.line = line.id
            button.style.marginLeft = `${Math.min(line.depth, 3) * 10}px`; button.setAttribute('aria-pressed', String(line.id === review?.line))
            title.textContent = line.label
            const parent = review?.lines.find(parent => parent.id === line.parent)
            detail.textContent = line.parent ? `From ${parent?.label} after move ${line.at} · ${line.firstMove ? moveText(line.firstMove) : 'Awaiting first move'}` : `${line.length} recorded moves`
            button.append(title, detail)
            if (line.description) { const note = document.createElement('span'); note.className = 'variant-note'; note.textContent = line.description; button.append(note) }
            button.onclick = () => seek(line.id, line.parent ? Math.min(line.at + 1, line.length) : line.length)
            button.disabled = !available; ui.variantList.append(button)
            review?.lines.filter(child => child.parent === line.id).forEach(addLine)
        }
        review?.lines.filter(line => line.parent === null).forEach(addLine)
        if (focusedLine) ui.variantList.querySelector<HTMLButtonElement>(`button[data-line="${focusedLine}"]`)?.focus()
    }
    const unsubscribe = session.subscribe(render)
    function dispose() {
        active = false; unsubscribe(); ui.nextDialog.close(); ui.variantDialog.close()
        cancelVariant()
        ui.variantDialog.removeEventListener('cancel', cancelVariant); ui.variantDialog.removeEventListener('close', variantClosed)
        ui.history.removeEventListener('click', historyClick); ui.history.removeEventListener('keydown', historyKeys)
        tabs.forEach(button => button.removeEventListener('keydown', tabKeys))
        for (const button of [...tabs, ui.reviewStart, ui.reviewBack, ui.reviewNext, ui.reviewEnd, ui.describe,
            ui.saveVariant, ui.cancelVariant, ui.cancelNext]) button.onclick = null
    }
    return {
        dispose,
        requestVariant(command: string): Promise<SessionResult | undefined> {
            if (!active || !view.review || !session.submitVariant) return Promise.resolve(undefined)
            return new Promise(resolve => variant(command, resolve))
        },
    }
}

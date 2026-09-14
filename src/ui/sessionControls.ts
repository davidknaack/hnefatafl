import { GameSession, SessionView } from '../session/GameSession'
import { LocalGameSession } from '../session/LocalGameSession'
import { OnlineGameSession, OnlineStart } from '../session/OnlineGameSession'
import { bindCommands } from './commands'
import { UIElements } from './elements'

/** Owns session replacement; board/selection commands only see GameSession. */
export function bindSessionControls(ui: UIElements, configuredEndpoint?: string): () => void {
    let endpoint = configuredEndpoint?.trim() ?? ''
    let configurationError = ''
    if (endpoint) {
        try {
            const url = new URL(endpoint)
            if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.hash ||
                (location.protocol === 'https:' && url.protocol !== 'wss:')) throw new Error()
        } catch { endpoint = ''; configurationError = 'Online play is unavailable: invalid or insecure relay address.' }
    }
    let session: GameSession = new LocalGameSession()
    let active = true
    let notice = ''
    let confirmation: (() => void) | undefined
    let unbind = () => {}
    let unsubscribe = () => {}

    function render(view: SessionView): void {
        if (!active) return
        const online = view.mode === 'online'
        ui.sessionMode.textContent = online ? 'Online game' : 'Local game'
        ui.sessionSide.textContent = online ? (view.localSide ? `You play ${view.localSide === 'attacker' ? 'attackers' : 'defenders'}` : 'Assigning your side…') : 'You control both sides'
        const labels: Record<SessionView['connection'], string> = {
            connecting: 'Connecting to the room…', waiting: 'Waiting for the other player. Moves are paused.',
            syncing: view.online?.pendingAcceptance ? 'Waiting for the other player to verify the game…' : 'Synchronizing the game…',
            ready: view.state.outcome ? 'Game finished.' : view.capabilities.move ? 'Your turn.' : 'Other player’s turn.',
            disconnected: 'Disconnected. Your game is retained in this tab.',
            error: 'Online play stopped. Your game is retained in this tab.', closed: 'Room closed. Your game is retained in this tab.',
        }
        ui.connection.textContent = online ? labels[view.connection] : 'Local play is ready.'
        ui.sessionError.textContent = notice || view.online?.error || configurationError
        ui.sessionWarning.textContent = view.online?.warning ?? ''
        ui.sessionHelp.textContent = online ? 'Refresh recovery is not available yet. Keep this tab open; Copy Game saves the moves without room credentials.'
            : endpoint ? 'Create starts a new standard game. Share the room code with the other player.' : 'Online play is not configured. Local play is available.'
        ui.onlineSetup.hidden = online
        ui.onlineActions.hidden = !online
        ui.createRoom.disabled = !endpoint || online
        ui.joinRoom.disabled = !endpoint || online
        ui.onlineSide.disabled = !endpoint || online
        ui.roomInput.disabled = !endpoint || online
        ui.roomCode.textContent = view.online?.roomCode ?? 'Not assigned'
        ui.copyRoom.disabled = !view.online?.roomCode
        const conflict = session instanceof OnlineGameSession && !!session.getConflictRecord()
        ui.reconnect.disabled = !online || conflict || !['error', 'disconnected'].includes(view.connection)
        ui.leaveRoom.disabled = !online || view.connection === 'closed'
        ui.continueLocal.disabled = !online
    }
    function bind(): void {
        unbind = bindCommands(ui, session)
        unsubscribe = session.subscribe(render)
    }
    function cancel(): void {
        confirmation = undefined; ui.confirmation.hidden = true
    }
    function replace(next: GameSession): void {
        unbind(); unsubscribe(); session.dispose()
        session = next; notice = ''; cancel(); ui.log.textContent = ''; bind()
    }
    function guarded(action: () => void): void {
        if (!active) return
        try { action() }
        catch (error) { notice = error instanceof Error ? error.message : 'Could not change session'; render(session.getView()) }
    }
    function ask(message: string, action: () => void, required = true): void {
        if (!active) return
        if (!required) { guarded(action); return }
        const source = session
        confirmation = () => { if (active && session === source) guarded(action) }
        ui.confirmationText.textContent = message
        ui.confirmation.hidden = false
        ui.cancelSession.focus()
    }
    function startOnline(start: OnlineStart): void {
        if (!endpoint || session.getView().mode !== 'local') return
        ask('Replace the current local game with a new online game? Copy Game first if you want to keep these moves.',
            () => replace(new OnlineGameSession({ endpoint, start })), session.getView().state.moveHistory.length > 0)
    }
    ui.createRoom.onclick = () => startOnline({ type: 'create', side: ui.onlineSide.value === 'defender' ? 'defender' : 'attacker' })
    ui.joinRoom.onclick = () => {
        const roomCode = ui.roomInput.value.trim().toUpperCase()
        if (!/^[A-Z2-9]{6}$/.test(roomCode)) {
            notice = 'Enter a six-character room code.'; render(session.getView()); ui.roomInput.focus(); return
        }
        startOnline({ type: 'join', roomCode })
    }
    ui.newLocal.onclick = () => ask('Start a new local game? This replaces the current board and stops this tab’s online connection.',
        () => replace(new LocalGameSession()), session.getView().mode === 'online' || session.getView().state.moveHistory.length > 0)
    ui.continueLocal.onclick = () => {
        if (!(session instanceof OnlineGameSession)) return
        ask('Continue this game locally? This tab will disconnect from online play and control both sides. Local moves will never be sent to the room.', () => {
            // Prepare/replay the candidate before closing the online owner.
            const next = new LocalGameSession()
            if (session.getView().state.moveHistory.length) {
                const result = next.loadGame(session.saveGame(), next.getView().generation)
                if (!result.success) { next.dispose(); throw new Error(result.error) }
            }
            replace(next)
        })
    }
    ui.reconnect.onclick = () => guarded(() => { notice = ''; if (session instanceof OnlineGameSession) session.reconnect() })
    ui.leaveRoom.onclick = () => {
        if (!(session instanceof OnlineGameSession)) return
        ask('Leave this room? Online play ends for both players. The game will remain visible and available to copy.', () => {
            notice = ''; if (session instanceof OnlineGameSession) session.leave()
        })
    }
    ui.copyRoom.onclick = async () => {
        const source = session, roomCode = source.getView().online?.roomCode
        if (!roomCode || !active) return
        try {
            await navigator.clipboard.writeText(roomCode)
            if (active && session === source) ui.log.textContent = 'Room code copied'
        } catch {
            if (active && session === source) { notice = 'Could not copy the room code. Select the displayed code to copy it manually.'; render(session.getView()) }
        }
    }
    ui.confirmSession.onclick = () => { const action = confirmation; cancel(); action?.() }
    ui.cancelSession.onclick = cancel
    bind()
    return () => {
        if (!active) return
        active = false; cancel(); unbind(); unsubscribe(); session.dispose()
        for (const button of [ui.createRoom, ui.joinRoom, ui.newLocal, ui.continueLocal, ui.reconnect,
            ui.leaveRoom, ui.copyRoom, ui.confirmSession, ui.cancelSession]) button.onclick = null
    }
}

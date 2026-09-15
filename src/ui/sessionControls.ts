import { GameSession, SessionView } from '../session/GameSession'
import { LocalGameSession } from '../session/LocalGameSession'
import { OnlineGameSession, OnlineStart, OnlineSessionOptions } from '../session/OnlineGameSession'
import { bindCommands } from './commands'
import { UIElements } from './elements'
import { RecoveryEnvelope, RecoveryStore } from '../online/recovery'
import { CLIENT_VERSION } from '../online/clientVersion'
import { versionWarning } from '../../shared/relayProtocol'
import { compareRecords } from '../online/record'
import { validRelayEndpoint } from '../online/endpoint'

export interface SessionControlDependencies {
    recoveryStore?: RecoveryStore
    createOnline?: (options: OnlineSessionOptions) => OnlineGameSession
}

/** Owns session replacement; board/selection commands only see GameSession. */
export function bindSessionControls(ui: UIElements, configuredEndpoint?: string, dependencies: SessionControlDependencies = {}): () => void {
    let endpoint = configuredEndpoint?.trim() ?? ''
    let configurationError = ''
    if (endpoint) {
        if (!validRelayEndpoint(endpoint, location.protocol)) {
            endpoint = ''; configurationError = 'Online play is unavailable: invalid or insecure relay address.'
        }
    }
    let session: GameSession = new LocalGameSession()
    let active = true
    let notice = ''
    let confirmation: (() => void) | undefined
    let unbind = () => {}
    let unsubscribe = () => {}
    const recoveryStore = dependencies.recoveryStore ?? new RecoveryStore()
    const createOnline = dependencies.createOnline ?? (options => new OnlineGameSession(options))
    const loaded = recoveryStore.load()
    let saved: RecoveryEnvelope | null = loaded.kind === 'saved' ? loaded.value : null
    let storageStatus = loaded.kind === 'invalid' ? `Saved recovery could not be opened: ${loaded.error}. It has been preserved; download a private backup before replacing it.`
        : loaded.kind === 'unavailable' ? loaded.error : ''
    let savedWarning = saved ? versionWarning(CLIENT_VERSION, saved.clientVersion) : null
    let savingEnabled = false
    // Restoring/duplicating a tab must not rewrite an unchanged save or steal
    // ownership from the still-live tab merely by changing its timestamp.
    let lastSavedSignature = saved ? JSON.stringify({ storageVersion: 1, endpoint: saved.endpoint,
        credentials: saved.credentials, record: saved.record, clientVersion: CLIENT_VERSION,
        resume: saved.resume, conflict: saved.conflict }) : ''

    function persist(resume: boolean): void {
        if (!(session instanceof OnlineGameSession)) return
        const snapshot = session.getRecovery()
        if (!snapshot) return
        const conflict = session.getConflictRecord() ?? (saved && compareRecords(saved.record, snapshot.record) === 'equal' ? saved.conflict : null)
        const content = { storageVersion: 1 as const, ...snapshot, clientVersion: CLIENT_VERSION, resume: resume && !conflict, conflict }
        const signature = JSON.stringify(content)
        if (signature === lastSavedSignature) return
        const envelope = { ...content, savedAt: Date.now() }
        const result = recoveryStore.save(envelope)
        if (result.success) {
            saved = envelope; lastSavedSignature = signature
            storageStatus = envelope.resume ? 'Online game saved in this browser. Refresh will replay it and reconnect.'
                : 'Online record retained for review. It will not reconnect automatically.'
        } else storageStatus = result.error
    }

    function archive(): void {
        if (session instanceof OnlineGameSession) persist(false)
        savingEnabled = false
    }

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
        ui.sessionWarning.textContent = view.online?.warning || savedWarning || ''
        ui.sessionHelp.textContent = online ? 'Copy Game exports moves without room credentials. Check the recovery save status before closing this tab.'
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
        ui.recoveryStatus.textContent = storageStatus
        ui.backupRecovery.hidden = !recoveryStore.hasSaved()
        ui.recoveryBackupHelp.hidden = !recoveryStore.hasSaved()
        ui.reviewRecovery.hidden = online || !saved
    }
    function bind(): void {
        unbind = bindCommands(ui, session)
        unsubscribe = session.subscribe(view => {
            if (savingEnabled) persist(view.connection !== 'closed')
            render(view)
        })
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
        ask('Start a new online game? This replaces the current board and the browser’s saved recovery slot when the room is assigned. Copy Game or download a private recovery backup first if needed.',
            () => {
                const next = createOnline({ endpoint, start })
                recoveryStore.permitReplacement(); savingEnabled = true; lastSavedSignature = ''; savedWarning = null
                replace(next)
            }, session.getView().state.moveHistory.length > 0 || recoveryStore.hasSaved())
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
        () => { archive(); replace(new LocalGameSession()) }, session.getView().mode === 'online' || session.getView().state.moveHistory.length > 0)
    ui.continueLocal.onclick = () => {
        if (!(session instanceof OnlineGameSession)) return
        ask('Continue this game locally? This tab will disconnect from online play and control both sides. Local moves will never be sent to the room.', () => {
            // Prepare/replay the candidate before closing the online owner.
            const next = new LocalGameSession()
            if (session.getView().state.moveHistory.length) {
                const result = next.loadGame(session.saveGame(), next.getView().generation)
                if (!result.success) { next.dispose(); throw new Error(result.error) }
            }
            archive(); replace(next)
            storageStatus += ' Local continuation moves are not autosaved; use Copy Game to retain them.'
            render(session.getView())
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
    ui.reviewRecovery.onclick = () => {
        if (!saved) return
        ask('Review the saved online record? This replaces the current local board without reconnecting.', () => {
            if (!saved) return
            const next = createOnline({ endpoint: saved.endpoint, start: { type: 'resume', credentials: saved.credentials, record: saved.record }, autoConnect: false })
            savingEnabled = false; replace(next)
        }, session.getView().state.moveHistory.length > 0)
    }
    ui.backupRecovery.onclick = () => guarded(() => {
        const raw = recoveryStore.backup()
        if (raw === null) return
        const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }))
        const link = document.createElement('a')
        link.href = url; link.download = 'hnefatafl-private-recovery.json'
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 0)
    })
    ui.confirmSession.onclick = () => { const action = confirmation; cancel(); action?.() }
    ui.cancelSession.onclick = cancel
    if (saved?.resume) {
        // Only send saved credentials to the currently configured relay. A changed
        // endpoint still permits local review, never an automatic credential send.
        const permitted = !!endpoint && new URL(endpoint).href === new URL(saved.endpoint).href
        try {
            session.dispose()
            session = createOnline({ endpoint: saved.endpoint,
                start: { type: 'resume', credentials: saved.credentials, record: saved.record }, autoConnect: permitted })
            savingEnabled = permitted
            storageStatus = permitted ? 'Saved game recovered in this browser. See the connection status above before playing.'
                : 'Saved game opened for review. Configure its original relay to reconnect; no credentials were sent.'
        } catch {
            session = new LocalGameSession()
            storageStatus = 'Saved recovery could not be restored. The original data is preserved for private backup.'
        }
    } else if (saved) storageStatus = saved.conflict
        ? 'Saved histories diverged. Both records are retained in the private backup; automatic reconnect is disabled.'
        : 'A saved online record is available for review. It will not reconnect automatically.'
    bind()
    return () => {
        if (!active) return
        active = false; cancel(); unbind(); unsubscribe(); session.dispose()
        for (const button of [ui.createRoom, ui.joinRoom, ui.newLocal, ui.continueLocal, ui.reconnect,
            ui.leaveRoom, ui.copyRoom, ui.confirmSession, ui.cancelSession, ui.reviewRecovery, ui.backupRecovery]) button.onclick = null
    }
}

import { GameSession, SessionView } from '../session/GameSession'
import { LocalGameSession } from '../session/LocalGameSession'
import { OnlineGameSession, OnlineSessionOptions } from '../session/OnlineGameSession'
import { OnlineStudySession } from '../session/OnlineStudySession'
import { SessionRecovery } from '../session/SessionRecovery'
import { RecoveryStore } from '../online/recovery'
import { validRelayEndpoint } from '../online/endpoint'
import { screenName } from '../online/annotations'
import { OnlineStorage } from './onlineStorage'
import { LocalGameStorage } from './localGameStorage'
import { ClientElements } from './elements'

export interface OnlineClientDependencies {
    endpoint?: string
    recoveryStore?: RecoveryStore
    createOnline?: (options: OnlineSessionOptions) => OnlineGameSession
    invite?: string
}
export function bindOnlineControls(root: ParentNode, ui: ClientElements, options: OnlineClientDependencies,
    storage: (() => LocalGameStorage) | null, hooks: {
        current(): GameSession
        replace(session: GameSession): void
        ask(message: string, action: () => void, required?: boolean): void
        cancelPending(): void
    }) {
    const get = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!
    const setup = get<HTMLDialogElement>('online-setup'), kind = get<HTMLSelectElement>('game-kind')
    const name = get<HTMLInputElement>('online-name'), code = get<HTMLInputElement>('online-code'), side = get<HTMLSelectElement>('online-side')
    const start = get<HTMLButtonElement>('online-start'), cancel = get<HTMLButtonElement>('online-cancel')
    const error = get<HTMLElement>('online-setup-error'), config = get<HTMLElement>('online-configuration')
    const room = get<HTMLElement>('online-room'), status = get<HTMLElement>('online-status'), save = get<HTMLElement>('online-save')
    const mode = get<HTMLElement>('game-mode'), modeHelp = get<HTMLElement>('game-mode-help')
    const copyCode = get<HTMLButtonElement>('copy-room-code'), copyLink = get<HTMLButtonElement>('copy-room-link')
    const reconnect = get<HTMLButtonElement>('online-reconnect'), leave = get<HTMLButtonElement>('online-leave')
    const local = get<HTMLButtonElement>('online-local'), rename = get<HTMLButtonElement>('online-rename')
    const backup = get<HTMLButtonElement>('online-backup'), resume = get<HTMLButtonElement>('online-resume')
    const setupBackup = get<HTMLButtonElement>('setup-private-backup')
    const live = get<HTMLButtonElement>('return-live'), nameDialog = get<HTMLDialogElement>('name-dialog')
    const newName = get<HTMLInputElement>('new-screen-name'), saveName = get<HTMLButtonElement>('save-screen-name')
    const cancelName = get<HTMLButtonElement>('cancel-screen-name'), nameError = get<HTMLElement>('screen-name-error')
    const endpoint = options.endpoint?.trim() ?? ''
    const configured = !!endpoint && validRelayEndpoint(endpoint, location.protocol)
    const persistence = new SessionRecovery(options.recoveryStore ?? new RecoveryStore(storage ?? (() => { throw new Error('Storage disabled') })))
    const presentation = new OnlineStorage(storage)
    const create = options.createOnline ?? (value => new OnlineGameSession(value))
    let active = true, unbind = () => {}, stopCandidate = () => {}, candidate: OnlineStudySession | undefined
    let bound: GameSession | undefined
    const inert = new WeakSet<OnlineStudySession>()
    name.value = presentation.preferences().name
    config.textContent = configured ? 'Share a room code or invitation with the other player.' : 'Online play is unavailable: no usable relay is configured. Local play is available.'
    function fields() {
        get('online-name-field').hidden = kind.value === 'local'
        get('online-side-field').hidden = kind.value !== 'create'
        get('online-code-field').hidden = kind.value !== 'join'
        start.textContent = kind.value === 'local' ? 'Start local game' : kind.value === 'create' ? 'Create game' : 'Join game'
        start.disabled = !!candidate || (kind.value !== 'local' && !configured)
        resume.hidden = !persistence.saved
        setupBackup.hidden = !persistence.store.hasSaved()
        get('setup-recovery-status').textContent = persistence.status
        resume.textContent = persistence.saved?.resume ? 'Resume saved online game' : 'Review saved online game'
    }
    function cancelCandidate() {
        stopCandidate(); stopCandidate = () => {}
        if (candidate) { if (candidate.getRecovery()) candidate.leave(); candidate.dispose(); candidate = undefined }
        fields()
    }
    function archive() {
        const current = hooks.current()
        if (current instanceof OnlineStudySession) persistence.persist(current, false)
    }
    function render(view: SessionView) {
        const online = view.mode === 'online', liveState = view.liveState ?? view.state
        mode.textContent = online ? '● Online game' : '● Local game'
        modeHelp.textContent = online ? `Room ${view.online?.roomCode ?? '…'}` : 'Two players · One board'
        room.hidden = !online
        for (const seat of ['attacker', 'defender'] as const) {
            const label = get<HTMLElement>(`${seat}-player`)
            label.hidden = !online
            const own = view.localSide === seat
            label.textContent = `${view.online?.names?.[seat] || (seat === 'attacker' ? 'Attacker' : 'Defender')} · ${own ? 'You' : 'Opponent'}${!own && online ? view.online?.peerConnected ? ' · Connected' : ' · Away' : ''}`
        }
        if (!online) { live.hidden = true; return }
        ui.saveNote.textContent = 'Online recovery and comment save status appears in Room options. Save / copy keeps a separate game record.'
        get('visible-room-code').textContent = view.online?.roomCode ?? 'Assigning…'
        const names = view.online?.names, turn = liveState.currentPlayer
        const labels: Record<SessionView['connection'], string> = {
            connecting: 'Connecting to the room…',
            waiting: 'Waiting for the other player. Moves are paused.',
            syncing: view.online?.pendingAcceptance ? 'Waiting for opponent to confirm the move…' : 'Synchronizing the game…',
            ready: liveState.outcome ? 'Game finished.' : turn === view.localSide ? 'Your turn.' : `${names?.[turn] || 'Opponent'} (${turn === 'attacker' ? 'Attackers' : 'Defenders'}) to move.`,
            disconnected: 'Disconnected. Reconnect to resume; your game is retained.',
            error: 'Online play stopped. Your game is retained.', closed: 'Room closed. Your game is retained for review.',
        }
        status.textContent = `${labels[view.connection]}${view.online?.error ? ` ${view.online.error}` : ''}`
        get('online-warning').textContent = [view.online?.warning, view.online?.annotationWarning].filter(Boolean).join(' ')
        get('online-comment-status').textContent = view.online?.annotationStatus ?? ''
        save.textContent = [persistence.status, presentation.status].filter(Boolean).join(' ')
        reconnect.disabled = !['error', 'disconnected'].includes(view.connection) || !!(hooks.current() as OnlineStudySession).getConflictRecord?.()
        leave.disabled = view.connection === 'closed'; rename.disabled = !view.localSide
        copyCode.disabled = copyLink.disabled = !view.online?.roomCode
        const behind = (view.review?.moves.length ?? 0) - (view.review?.cursor ?? 0)
        live.hidden = !behind; live.textContent = `Return to live · ${behind} ${behind === 1 ? 'move' : 'moves'} ahead`
        local.textContent = liveState.outcome ? 'Open local study' : 'Continue locally'
    }
    function bind(session: GameSession) {
        unbind(); bound = session
        unbind = session.subscribe(view => {
            if (!active || bound !== session) return
            if (session instanceof OnlineStudySession) {
                if (!inert.has(session)) persistence.persist(session, view.connection !== 'closed')
                presentation.save(session)
            }
            render(view)
        })
        return () => { if (bound === session) { unbind(); bound = undefined } }
    }
    function ask(message: string, action: () => void) {
        const current = hooks.current()
        hooks.ask(message, () => { if (active && hooks.current() === current) action() },
            current.getView().capabilities.export || current.getView().mode === 'online' || persistence.store.hasSaved())
    }
    function startRoom() {
        error.textContent = ''
        if (kind.value === 'local') {
            ask('Start a new local game? Save / copy keeps a separate copy of the current record.', () => {
                archive(); presentation.prefer('local'); setup.close(); hooks.replace(new LocalGameSession({ review: true }))
            }); return
        }
        if (!configured || candidate) return
        let nickname: string
        try { nickname = screenName(name.value) }
        catch (value) { error.textContent = String(value instanceof Error ? value.message : value); name.focus(); return }
        const roomCode = code.value.trim().toUpperCase()
        if (kind.value === 'join' && !/^[A-Z2-9]{6}$/.test(roomCode)) { error.textContent = 'Enter a six-character room code.'; code.focus(); return }
        ask('Start another online game? The current local record stays saved separately. The browser’s saved online recovery will be replaced only after room assignment.', () => {
            try {
                const source = create({ endpoint, start: kind.value === 'join' ? { type: 'join', roomCode } : { type: 'create', side: side.value === 'defender' ? 'defender' : 'attacker' } })
                const next = new OnlineStudySession(source, { name: nickname })
                candidate = next; fields()
                const stop = next.subscribe(view => {
                    if (!active || candidate !== next) return
                    if (next.getRecovery()) {
                        stopCandidate(); stopCandidate = () => {}; candidate = undefined
                        archive(); persistence.permitReplacement(); presentation.permitReplacement(); presentation.prefer('online', nickname); name.value = nickname
                        if (options.invite === undefined && kind.value === 'join' && new URLSearchParams(location.hash.slice(1)).has('room')) {
                            const url = new URL(location.href); url.hash = ''; history.replaceState(history.state, '', url)
                        }
                        setup.close(); hooks.replace(next); fields()
                    } else if (['error', 'disconnected', 'closed'].includes(view.connection)) {
                        error.textContent = view.online?.error ?? 'Could not join the room.'; cancelCandidate()
                    } else error.textContent = 'Connecting to the room…'
                })
                if (candidate === next) stopCandidate = stop; else stop()
            } catch (value) { error.textContent = value instanceof Error ? value.message : 'Could not open online play.'; cancelCandidate() }
        })
    }
    ui.newGame.onclick = () => { error.textContent = ''; fields(); setup.showModal(); kind.focus() }
    kind.onchange = () => { error.textContent = ''; fields() }
    start.onclick = startRoom
    cancel.onclick = () => setup.close()
    setup.addEventListener('close', cancelCandidate)
    setup.addEventListener('cancel', cancelCandidate)
    const onlineSession = () => hooks.current() instanceof OnlineStudySession ? hooks.current() as OnlineStudySession : undefined
    reconnect.onclick = () => onlineSession()?.reconnect()
    leave.onclick = () => hooks.ask('Leave this room? This closes online play for both players. The record remains available to save or review. Leaving does not resign the game.', () => {
        onlineSession()?.leave(); archive()
    })
    local.onclick = () => hooks.ask('Continue as a local study? This tab disconnects and controls both sides; the other player will be waiting. New local moves and variants will not be sent online.', () => {
        const session = onlineSession()
        if (!session) return
        const next = new LocalGameSession({ review: true })
        if (session.getRecovery()?.record.revision) {
            const result = next.loadGame(session.saveGame(), next.getView().generation)
            if (!result.success) { next.dispose(); ui.feedback.textContent = result.error; return }
        }
        archive(); presentation.prefer('local'); hooks.replace(next)
    })
    live.onclick = () => { const session = hooks.current(), view = session.getView(); session.reviewMove?.('main', view.review!.moves.length, view.generation) }
    async function share(link: boolean) {
        const current = hooks.current(), roomCode = current.getView().online?.roomCode
        if (!roomCode) return
        const url = new URL(location.href); url.search = ''; url.hash = `room=${roomCode}`
        try {
            await navigator.clipboard.writeText(link ? url.href : roomCode)
            if (active && current === hooks.current()) get('online-copy-status').textContent = link ? 'Invitation copied.' : 'Room code copied.'
        } catch { if (active && current === hooks.current()) get('online-copy-status').textContent = 'Clipboard unavailable. Select and copy the displayed room code.' }
    }
    copyCode.onclick = () => { void share(false) }; copyLink.onclick = () => { void share(true) }
    rename.onclick = () => { newName.value = onlineSession()?.getView().online?.names?.[hooks.current().getView().localSide!] ?? ''; nameError.textContent = ''; nameDialog.showModal(); newName.focus() }
    saveName.onclick = () => {
        try { const nickname = screenName(newName.value); onlineSession()?.changeName(nickname); presentation.prefer('online', nickname); name.value = nickname; nameDialog.close() }
        catch (value) { nameError.textContent = value instanceof Error ? value.message : 'Invalid name.' }
    }
    cancelName.onclick = () => nameDialog.close()
    const downloadBackup = () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'hnefatafl-private-recovery', version: 1,
            recovery: persistence.store.backup(), presentation: presentation.backup() })], { type: 'application/json' }))
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'hnefatafl-private-recovery.json'; anchor.click()
        setTimeout(() => URL.revokeObjectURL(url), 0)
    }
    backup.onclick = downloadBackup; setupBackup.onclick = downloadBackup
    function restore(auto: boolean) {
        const saved = persistence.saved
        if (!saved) return
        const permitted = configured && new URL(endpoint).href === new URL(saved.endpoint).href
        let restored: OnlineStudySession | undefined, source: OnlineGameSession | undefined
        try {
            source = create({ endpoint: saved.endpoint, start: { type: 'resume', credentials: saved.credentials, record: saved.record },
                autoConnect: permitted && saved.resume })
            const extras = presentation.restore(saved.endpoint, saved.credentials)
            try { restored = new OnlineStudySession(source, extras) }
            catch { presentation.status = 'Saved review position could not be restored.'; restored = new OnlineStudySession(source, { annotations: extras.annotations }) }
            if (!permitted || !saved.resume) inert.add(restored)
            if (!permitted) persistence.status = 'Saved record opened for review; its original relay is unavailable. No credentials were sent.'
            presentation.prefer('online'); setup.close(); hooks.replace(restored)
        } catch (value) { restored?.dispose(); source?.dispose(); error.textContent = 'Saved online game could not be restored. Its private backup is retained.'; if (auto) ui.feedback.textContent = error.textContent }
    }
    resume.onclick = () => ask('Open the saved online game in place of the current board?', () => restore(false))
    fields()
    const saved = persistence.saved
    if (saved?.resume && presentation.preferences().mode !== 'local') restore(true)
    function openInvitation() {
        const invite = options.invite ?? new URLSearchParams(location.hash.slice(1)).get('room')
        if (!active || !invite || !/^[A-Z2-9]{6}$/i.test(invite)) return
        cancelCandidate(); hooks.cancelPending()
        code.value = invite.toUpperCase(); kind.value = 'join'; error.textContent = ''; fields()
        if (!setup.open) setup.showModal()
        name.focus()
    }
    if (options.invite === undefined) window.addEventListener('hashchange', openInvitation)
    openInvitation()
    return { bind, dispose() {
        active = false; unbind(); cancelCandidate(); setup.close(); nameDialog.close()
        setup.removeEventListener('close', cancelCandidate); setup.removeEventListener('cancel', cancelCandidate)
        window.removeEventListener('hashchange', openInvitation)
        kind.onchange = null
        for (const button of [start, cancel, reconnect, leave, local, live, copyCode, copyLink, rename, saveName, cancelName, backup, setupBackup, resume]) button.onclick = null
    } }
}

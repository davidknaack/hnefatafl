import { MAX_MESSAGE_BYTES, readJson } from '../../shared/json'
import { ClientMessage, decodeClientMessage, decodeRelayMessage, RelayMessage, Seat, versionWarning } from '../../shared/relayProtocol'
import { HnefataflEngine } from '../HnefataflEngine'
import { CLIENT_VERSION } from '../online/clientVersion'
import { validRelayEndpoint } from '../online/endpoint'
import { acknowledgesRecord, decodePeerMessage, GameRecordMessage } from '../online/messages'
import { compareRecords, createGameRecord, decodeGameRecord, OnlineGameRecordV1 } from '../online/record'
import { browserSocket, SessionSocket } from '../online/socket'
import { Coordinate, GameStatus, MoveValidationResult, Player, PossibleMove } from '../types'
import { GameSession, SessionListener, SessionResult, SessionView } from './GameSession'

export interface RoomCredentials { roomCode: string; gameId: string; seat: Seat; token: string }
export type OnlineStart = { type: 'create'; side: Seat } | { type: 'join'; roomCode: string } |
    { type: 'resume'; credentials: RoomCredentials; record: unknown }
export interface OnlineSessionOptions {
    endpoint: string
    start: OnlineStart
    socketFactory?: (url: string) => SessionSocket
    messageId?: () => string
    timeoutMs?: number
    setTimer?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>
    clearTimer?: (timer: ReturnType<typeof setTimeout>) => void
    /** May lower the shared ceiling for a constrained transport; never raise it. */
    maxWireBytes?: number
    /** Open a retained game for review without sending credentials or reconnecting. */
    autoConnect?: boolean
}
export interface PeerFeature {
    type: string
    payload: unknown
    senderSeat: Seat
    messageId: string
}
type Pending = { message: GameRecordMessage; id: string; connection: number }

/** Owns replay, permissions and synchronization; never gives the UI an engine/socket. */
export class OnlineGameSession implements GameSession {
    private engine = new HnefataflEngine()
    private record: OnlineGameRecordV1 | null = null
    private credentials: RoomCredentials | null = null
    private conflict: OnlineGameRecordV1 | null = null
    private connection: SessionView['connection'] = 'connecting'
    private error: string | null = null
    private warning: string | null = null
    private peer = false
    private generation = 0
    private epoch = 0
    private disposed = false
    private socket?: SessionSocket
    private unlisten?: () => void
    private timer?: ReturnType<typeof setTimeout>
    private listeners = new Set<SessionListener>()
    private featureListeners = new Set<(feature: PeerFeature) => void>()
    private pending?: Pending
    private controlId = ''
    private syncId: string | null = null
    private recovering = false
    private verified = false
    private accepted = false
    private retries = 0
    private readonly options: Required<Omit<OnlineSessionOptions, 'start'>> & { start: OnlineStart }

    constructor(options: OnlineSessionOptions) {
        if (!validRelayEndpoint(options.endpoint)) throw new Error('Invalid relay endpoint')
        this.options = { socketFactory: browserSocket, messageId: () => crypto.randomUUID(), timeoutMs: 5000,
            setTimer: (callback, ms) => setTimeout(callback, ms), clearTimer: (timer) => clearTimeout(timer),
            maxWireBytes: MAX_MESSAGE_BYTES, autoConnect: true, ...options,
            start: structuredClone(options.start) }
        if (!Number.isSafeInteger(this.options.timeoutMs) || this.options.timeoutMs < 1 ||
            !Number.isSafeInteger(this.options.maxWireBytes) || this.options.maxWireBytes < 1 ||
            this.options.maxWireBytes > MAX_MESSAGE_BYTES) throw new Error('Invalid session limits')
        if (options.start.type === 'resume') {
            const replay = decodeGameRecord(options.start.record)
            const credentials = options.start.credentials
            const control = decodeClientMessage({ ...this.base(), type: 'resume', ...credentials })
            if (!replay.success || !control.success || !['attacker', 'defender'].includes(credentials.seat) ||
                replay.value.record.gameId !== credentials.gameId) throw new Error('Invalid recovered game/credentials')
            this.engine = replay.value.engine; this.record = replay.value.record
            this.credentials = { ...credentials, roomCode: credentials.roomCode.toUpperCase() }
        }
        if (this.options.autoConnect) this.connect()
        else this.connection = 'closed'
    }

    private base() { return { protocolVersion: 1 as const, messageId: this.options.messageId(), clientVersion: CLIENT_VERSION } }
    private notify(): void {
        this.generation++
        const generation = this.generation
        for (const listener of [...this.listeners]) {
            if (generation !== this.generation) break
            if (this.listeners.has(listener)) this.deliver(listener)
        }
    }
    private deliver(listener: SessionListener): void {
        try { listener(this.getView()) } catch { console.error('Online session subscriber failed') }
    }
    subscribe(listener: SessionListener): () => void {
        if (!this.disposed) this.listeners.add(listener)
        this.deliver(listener)
        return () => { this.listeners.delete(listener) }
    }
    /** Optional client features share membership/transport, never gameplay acknowledgements. */
    subscribeFeatures(listener: (feature: PeerFeature) => void): () => void {
        this.featureListeners.add(listener)
        return () => { this.featureListeners.delete(listener) }
    }
    sendFeature(type: string, payload: unknown): string | null {
        if (this.disposed || !this.peer || !this.record || !this.credentials || !this.socket) return null
        const messageId = this.options.messageId(), body = { type, payload }
        const forwarded = readJson({ ...this.base(), type: 'relayed', gameId: this.record.gameId,
            senderSeat: this.credentials.seat, body }, this.options.maxWireBytes)
        if (!forwarded.success) return null
        return this.peerSend(body, messageId) ? messageId : null
    }
    getView(): SessionView {
        const state = this.engine.getState()
        const move = !this.disposed && this.connection === 'ready' && this.peer &&
            state.status === GameStatus.InProgress && state.currentPlayer === this.credentials?.seat
        return { state, generation: this.generation, mode: 'online', connection: this.connection,
            localSide: this.credentials ? (this.credentials.seat === 'attacker' ? Player.Attacker : Player.Defender) : null,
            capabilities: { move, validate: move, import: false, reset: false, export: !!this.record && this.record.revision > 0 },
            online: { roomCode: this.credentials?.roomCode ?? null, gameId: this.record?.gameId ?? null,
                peerConnected: this.peer, pendingAcceptance: !!this.pending, error: this.error, warning: this.warning } }
    }
    /** Explicit private-data access for P7; never put this result in shared UI/logs. */
    getRecovery(): { endpoint: string; credentials: RoomCredentials; record: OnlineGameRecordV1 } | null {
        return this.credentials && this.record ? structuredClone({ endpoint: this.options.endpoint,
            credentials: this.credentials, record: this.record }) : null
    }
    getConflictRecord(): OnlineGameRecordV1 | null { return structuredClone(this.conflict) }
    private clearDeadline(): void {
        if (this.timer !== undefined) this.options.clearTimer(this.timer)
        this.timer = undefined
    }
    private detach(): void {
        this.epoch++; this.clearDeadline(); this.unlisten?.(); this.unlisten = undefined
        const socket = this.socket; this.socket = undefined
        try { socket?.close() } catch { /* Already disconnected. */ }
        this.pending = undefined; this.peer = false; this.accepted = false; this.verified = false; this.syncId = null
    }
    private fail(message: string, state: 'error' | 'disconnected' | 'closed' = 'error'): void {
        this.detach(); this.error = message; this.connection = state; this.notify()
    }
    private connect(): void {
        this.detach(); this.error = null; this.connection = 'connecting'; this.retries = 0
        const epoch = this.epoch
        try {
            const socket = this.options.socketFactory(this.options.endpoint)
            this.socket = socket
            const live = () => !this.disposed && this.epoch === epoch && this.socket === socket
            this.unlisten = socket.listen({
                open: () => {
                    if (!live()) return
                    const start = this.options.start
                    const request = this.credentials ? { type: 'resume' as const, ...this.credentials } : start
                    if (request.type === 'resume' && !this.credentials) return
                    const decoded = decodeClientMessage({ ...this.base(), ...request })
                    if (!decoded.success) return this.fail(decoded.error)
                    this.controlId = decoded.value.messageId
                    this.send(decoded.value)
                },
                message: (data) => { if (live()) this.receive(data) },
                close: () => { if (live()) this.fail('Relay disconnected; reconnect to synchronize', 'disconnected') },
                error: () => { if (live()) this.fail('Relay connection failed', 'disconnected') },
            })
            this.deadline()
        } catch { this.fail('Could not connect to relay', 'disconnected') }
        this.notify()
    }
    /** Deliberate retry only; no automatic duplicate-tab or room-recreation loop. */
    reconnect(): void {
        if (this.disposed || this.connection === 'closed' || this.conflict) return
        this.connect()
    }
    private send(message: ClientMessage): boolean {
        const bounded = readJson(message, this.options.maxWireBytes)
        if (!bounded.success) { this.fail(bounded.error); return false }
        const text = JSON.stringify(message)
        if (!this.socket || this.socket.readyState !== 1 ||
            this.socket.bufferedAmount + new TextEncoder().encode(text).length > MAX_MESSAGE_BYTES * 4) {
            this.fail('Relay is unavailable or output buffer is full', 'disconnected'); return false
        }
        try { this.socket.send(text); return true }
        catch { this.fail('Relay send failed; game retained', 'disconnected'); return false }
    }
    private peerSend(body: unknown, messageId = this.options.messageId()): boolean {
        const decoded = decodeClientMessage({ protocolVersion: 1, clientVersion: CLIENT_VERSION, messageId, type: 'peer', body })
        if (!decoded.success) { this.fail(decoded.error); return false }
        return this.send(decoded.value)
    }
    private recordMessage(record: OnlineGameRecordV1, syncId: string | null): GameRecordMessage {
        return { type: 'game-record', payload: { record, syncId } }
    }
    private sendRecord(syncId: string | null): boolean {
        if (!this.record) return false
        const message = this.recordMessage(this.record, syncId), id = this.options.messageId()
        this.pending = { message, id, connection: this.epoch }
        return this.peerSend(message, id)
    }
    private deadline(): void {
        if (this.timer !== undefined) return
        const epoch = this.epoch
        this.timer = this.options.setTimer(() => {
            if (this.disposed || epoch !== this.epoch) return
            this.timer = undefined
            if (this.connection === 'connecting') return this.fail('Room assignment timed out', 'disconnected')
            if (!this.peer || this.connection === 'ready') return
            if (this.retries++ >= 1) return this.fail('Synchronization timed out; game retained')
            this.beginSync()
        }, this.options.timeoutMs)
    }
    private beginSync(): void {
        if (!this.record || !this.peer) return
        this.connection = 'syncing'; this.recovering = true; this.verified = false; this.accepted = false
        this.syncId = this.options.messageId()
        if (!this.peerSend({ type: 'sync-request', payload: { gameId: this.record.gameId, syncId: this.syncId } })) return
        if (!this.sendRecord(this.syncId)) return
        this.deadline(); this.notify()
    }
    private ready(): void {
        if (!this.peer || !this.verified || !this.accepted) return
        this.connection = 'ready'; this.recovering = false; this.syncId = null; this.pending = undefined
        this.retries = 0; this.clearDeadline()
    }
    private receive(input: unknown): void {
        if (typeof input !== 'string') return this.fail('Expected text relay message')
        const decoded = decodeRelayMessage(input)
        if (!decoded.success) return this.fail(decoded.error)
        const message = decoded.value
        if (message.type === 'error') {
            if (message.code === 'room_closed') return this.fail(message.message, 'closed')
            if (message.code === 'peer_absent') {
                this.peer = false; this.pending = undefined; this.clearDeadline()
                this.connection = 'waiting'; this.notify(); return
            }
            return this.fail(`${message.code}: ${message.message}`)
        }
        if (message.type === 'assigned') {
            if (this.connection !== 'connecting' || message.requestId !== this.controlId) return
            const expected = this.credentials
            const start = this.options.start
            if ((expected && (expected.gameId !== message.gameId || expected.roomCode !== message.roomCode ||
                expected.seat !== message.seat || expected.token !== message.token)) ||
                (start.type === 'create' && start.side !== message.seat) ||
                (start.type === 'join' && start.roomCode.toUpperCase() !== message.roomCode)) return this.fail('Unexpected room assignment')
            this.credentials = { roomCode: message.roomCode, gameId: message.gameId, seat: message.seat, token: message.token }
            if (!this.record) {
                const initial = createGameRecord(message.gameId, [])
                if (!initial.success) return this.fail(initial.error)
                this.record = initial.value.record; this.engine = initial.value.engine
            }
            this.clearDeadline(); this.connection = 'waiting'; this.notify(); return
        }
        if (!this.credentials || !this.record || message.gameId !== this.credentials.gameId) return this.fail('Wrong game identity')
        if (message.type === 'presence') {
            if (this.peer === message.peerConnected) return
            this.peer = message.peerConnected; this.pending = undefined; this.clearDeadline(); this.retries = 0
            if (this.peer) this.beginSync()
            else { this.connection = 'waiting'; this.accepted = false; this.verified = false; this.notify() }
            return
        }
        this.receivePeer(message)
    }
    private receivePeer(message: Extract<RelayMessage, { type: 'relayed' }>): void {
        if (!this.peer || message.senderSeat === this.credentials!.seat) return this.fail('Unexpected peer identity/presence')
        const decoded = decodePeerMessage(message)
        if (!decoded.success) return this.fail(decoded.error)
        const body = decoded.value
        const previousConnection = this.connection
        const warning = versionWarning(CLIENT_VERSION, message.clientVersion)
        const warningChanged = warning !== this.warning
        this.warning = warning
        if (body.type === 'unsupported') {
            for (const listener of [...this.featureListeners]) {
                try { listener({ type: message.body.type, payload: message.body.payload,
                    senderSeat: message.senderSeat, messageId: message.messageId }) }
                catch { console.error('Online feature subscriber failed') }
            }
            if (warningChanged) this.notify()
            return
        }
        if (body.type === 'sync-request') {
            if (!this.recovering) this.beginSync()
            if (this.socket && this.sendRecord(body.payload.syncId)) { this.deadline(); this.notify() }
            return
        }
        if (body.type === 'record-ack') {
            if (!this.pending || this.pending.connection !== this.epoch ||
                !acknowledgesRecord(body, this.pending.message, this.pending.id) ||
                compareRecords(this.record!, this.pending.message.payload.record) !== 'equal') return
            this.accepted = true; this.pending = undefined
            // For a submitted move the previously verified prefix plus this ack is sufficient.
            this.ready(); this.notify(); return
        }
        const incoming = body.payload.record, local = this.record!
        const relation = compareRecords(local, incoming)
        if (relation === 'divergent' || relation === 'different-game') {
            this.conflict = incoming
            return this.fail('Game histories diverged; both records retained')
        }
        if (relation === 'prefix') { if (this.sendRecord(body.payload.syncId)) this.deadline(); return }
        if (relation === 'extends') {
            if (!this.recovering && incoming.revision !== local.revision + 1) { this.beginSync(); return }
            if (this.recovering && body.payload.syncId !== this.syncId) return
            if (!this.recovering && this.engine.getState().currentPlayer !== message.senderSeat) return this.fail('Peer moved out of turn')
            this.record = incoming; this.engine = body.engine
            this.accepted = !this.recovering; this.pending = undefined
        }
        this.verified = true
        if (!this.peerSend({ type: 'record-ack', payload: { gameId: incoming.gameId, revision: incoming.revision,
            recordMessageId: message.messageId, syncId: body.payload.syncId } })) return
        if (relation === 'extends' && this.recovering && !this.sendRecord(this.syncId)) return
        this.ready()
        // Equal duplicate records do not publish a new board generation unless readiness changed.
        if (relation === 'extends' || previousConnection !== this.connection || warningChanged) this.notify()
    }
    private unavailable(generation: number): string | null {
        if (generation !== this.generation) return 'Game changed; select the move again'
        return this.getView().capabilities.move ? null : 'Online move is not available'
    }
    private reject(error: string): SessionResult { return { success: false, error, generation: this.generation } }
    getPossibleMoves(from: Coordinate, generation: number): PossibleMove[] {
        return this.unavailable(generation) ? [] : this.engine.getPossibleMoves(from)
    }
    validateMove(command: string, generation: number): MoveValidationResult {
        const error = this.unavailable(generation)
        return error ? { isValid: false, reason: error, expectedCaptures: [], status: this.engine.getState().status }
            : this.engine.validateMove(command)
    }
    async submitMove(command: string, generation: number): Promise<SessionResult> {
        await Promise.resolve()
        const error = this.unavailable(generation)
        if (error) return this.reject(error)
        const candidate = createGameRecord(this.record!.gameId, [...this.record!.moves, command])
        if (!candidate.success) return this.reject(candidate.error)
        const body = this.recordMessage(candidate.value.record, null), base = this.base()
        // Preflight the receiver's larger envelope as well as the outgoing one.
        for (const envelope of [{ ...base, type: 'peer', body }, { ...base, type: 'relayed', body,
            gameId: this.record!.gameId, senderSeat: this.credentials!.seat }]) {
            const bounded = readJson(envelope, this.options.maxWireBytes)
            if (!bounded.success) return this.reject(bounded.error)
        }
        this.record = candidate.value.record; this.engine = candidate.value.engine
        this.connection = 'syncing'; this.recovering = false; this.accepted = false; this.verified = true; this.retries = 0
        this.pending = { message: body, id: base.messageId, connection: this.epoch }
        const newState = this.engine.getState()
        // A failed send preserves this committed local extension for reconciliation.
        if (this.peerSend(body, base.messageId)) { this.deadline(); this.notify() }
        return { success: true, newState, generation: this.generation }
    }
    loadGame(_input: string, _generation: number): SessionResult { return this.reject('Online import is not available') }
    reset(_generation: number, _layout?: string[]): SessionResult { return this.reject('Online reset is not available') }
    saveGame(): string {
        if (!this.getView().capabilities.export) throw new Error('Game export is not available')
        return this.engine.saveGame()
    }
    leave(): void {
        if (this.disposed || this.connection === 'closed') return
        if (this.socket?.readyState === 1 && this.credentials) this.send({ ...this.base(), type: 'leave' })
        this.fail('Left online room', 'closed')
    }
    dispose(): void {
        if (this.disposed) return
        this.disposed = true; this.detach(); this.connection = 'closed'; this.notify(); this.listeners.clear(); this.featureListeners.clear()
    }
}

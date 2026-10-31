import { object } from '../../shared/json'
import { GameSession, SessionListener, SessionResult, SessionView } from './GameSession'
import { OnlineGameSession, PeerFeature } from './OnlineGameSession'
import { AnnotationState, decodeAnnotations, emptyAnnotations, MAX_ONLINE_COMMENTS, mergeAnnotations, screenName } from '../online/annotations'
import { createGameRecord } from '../online/record'
import { Coordinate } from '../types'
import { normalizeComment } from '../moveComments'
import { parseGame, serializeGame } from '../gameFormat'
import { HnefataflEngine } from '../HnefataflEngine'

/** Presentation and optional annotations; the underlying session alone owns live rules. */
export class OnlineStudySession implements GameSession {
    private live: SessionView
    private annotations: AnnotationState | null = null
    private cursor: number | null = null
    private historical?: HnefataflEngine
    private generation = 0
    private loadGeneration = 0
    private listeners = new Set<SessionListener>()
    private unbind: () => void
    private unfeature: () => void
    private peer = false
    private supported = false
    private pending: string | null = null
    private timer?: ReturnType<typeof setTimeout>
    private attempts = 0
    private warning: string | null = null
    private status = 'Shared comments connect when your opponent joins.'
    private disposed = false
    private draft = false
    private initialName: string

    constructor(readonly source: OnlineGameSession, options: { name?: string; annotations?: unknown; cursor?: number | null } = {}) {
        this.initialName = screenName(options.name ?? '')
        this.live = source.getView()
        if (options.annotations !== undefined) this.annotations = decodeAnnotations(options.annotations)
        const record = source.getRecovery()?.record
        if (this.annotations && record && this.annotations.gameId !== record.gameId) throw new Error('Saved annotations belong to another game')
        if (options.cursor !== undefined && options.cursor !== null && record) this.seek(options.cursor)
        this.unfeature = source.subscribeFeatures(feature => this.receive(feature))
        this.unbind = source.subscribe(view => {
            if (this.draft && this.cursor === null && view.state.moveHistory.length > this.live.state.moveHistory.length) this.seek(this.live.state.moveHistory.length)
            if (view.state.moveHistory.length !== this.live.state.moveHistory.length && this.live.connection !== 'ready') this.loadGeneration++
            this.live = view
            const gameId = view.online?.gameId, seat = view.localSide
            if (gameId && !this.annotations) this.annotations = emptyAnnotations(gameId)
            if (seat && this.annotations && !this.annotations.profiles[seat]) {
                this.annotations.profiles[seat] = { revision: 1, name: this.initialName }
            }
            const peer = !!view.online?.peerConnected && !['error', 'disconnected', 'closed'].includes(view.connection)
            if (!peer) {
                this.peer = false; this.supported = false; this.pending = null; this.clearTimer()
                this.status = 'Shared comments paused. Your comments are retained.'
            } else if (!this.peer) {
                this.peer = true; this.attempts = 0; this.sendState()
            }
            this.publish()
        })
    }
    private clearTimer() { if (this.timer !== undefined) clearTimeout(this.timer); this.timer = undefined }
    private publish() {
        if (this.disposed) return
        this.generation++
        const generation = this.generation
        for (const listener of [...this.listeners]) {
            if (generation !== this.generation) break
            if (this.listeners.has(listener)) { try { listener(this.getView()) } catch { console.error('Online study subscriber failed') } }
        }
    }
    private sendState() {
        this.clearTimer()
        if (!this.peer || !this.annotations) return
        this.pending = this.source.sendFeature('annotations-v1', this.annotations)
        this.status = this.supported ? 'Comments awaiting opponent confirmation…' : 'Checking shared comment support…'
        if (!this.pending) return
        this.timer = setTimeout(() => {
            this.timer = undefined
            if (!this.peer || !this.pending || this.disposed) return
            if (this.attempts++ < 1) { this.sendState(); this.publish(); return }
            this.status = this.supported ? 'Comments are retained locally; confirmation timed out. Reconnect to retry.'
                : 'This opponent does not support shared comments. Moves are still available.'
            if (!this.supported) this.warning = 'Shared comments are unavailable with this client.'
            this.publish()
        }, 5000)
    }
    private receive(feature: PeerFeature) {
        if (this.disposed || !this.annotations || !this.peer) return
        if (feature.type === 'annotations-ack-v1') {
            if (object(feature.payload) && feature.payload.gameId === this.annotations.gameId && feature.payload.messageId === this.pending) {
                this.supported = true; this.pending = null; this.clearTimer(); this.attempts = 0
                this.status = 'Shared comments up to date.'; this.publish()
            }
            return
        }
        if (feature.type !== 'annotations-v1') return
        try {
            const incoming = decodeAnnotations(feature.payload)
            // A peer may return our retained events on recovery. It cannot rename our seat.
            const own = this.live.localSide
            if (own && this.annotations.profiles[own]) incoming.profiles[own] = this.annotations.profiles[own]
            this.annotations = mergeAnnotations(this.annotations, incoming)
            this.supported = true; this.warning = null
            this.source.sendFeature('annotations-ack-v1', { gameId: this.annotations.gameId, messageId: feature.messageId })
            this.publish()
        } catch (error) {
            this.warning = error instanceof Error ? error.message : 'Could not read shared comments'
            this.publish()
        }
    }
    getView(): SessionView {
        const view = structuredClone(this.live), commands = this.source.getRecovery()?.record.moves ?? view.state.moveHistory
        const cursor = this.cursor ?? commands.length, state = this.historical?.getState() ?? view.state
        const comments = (this.annotations?.comments ?? []).filter(comment => comment.prefix.length === cursor &&
            comment.prefix.every((move, index) => commands[index] === move))
        const atTip = this.cursor === null || cursor === commands.length
        const online = view.online!
        return { ...view, generation: this.generation, loadGeneration: this.loadGeneration, state, liveState: view.state,
            capabilities: { ...view.capabilities, move: atTip && view.capabilities.move, validate: atTip && view.capabilities.validate },
            review: { line: 'main', label: 'Live game', cursor, moves: commands, status: view.state.status,
                lines: [{ id: 'main', label: 'Live game', parent: null, at: 0, description: '', firstMove: commands[0] ?? null, length: commands.length, depth: 0 }],
                next: cursor < commands.length ? [{ line: 'main', ply: cursor + 1, label: 'Live game', move: commands[cursor], description: '' }] : [],
                comments: comments.map(comment => ({ id: comment.id, text: comment.text, author: comment.author, seat: comment.seat })) },
            online: { ...online, names: { attacker: this.annotations?.profiles.attacker?.name ?? '', defender: this.annotations?.profiles.defender?.name ?? '' },
                commentsAvailable: this.peer && this.supported && !!view.localSide,
                annotationStatus: this.status, annotationWarning: this.warning } }
    }
    subscribe(listener: SessionListener) { this.listeners.add(listener); listener(this.getView()); return () => { this.listeners.delete(listener) } }
    private reject(error: string): SessionResult { return { success: false, error, generation: this.generation } }
    private valid(generation: number) { return !this.disposed && generation === this.generation }
    private seek(ply: number) {
        const record = this.source.getRecovery()?.record
        if (!record || !Number.isInteger(ply) || ply < 0 || ply > record.moves.length) throw new Error('Invalid review position')
        if (ply === record.moves.length) { this.cursor = null; this.historical = undefined; return }
        const replay = createGameRecord(record.gameId, record.moves.slice(0, ply))
        if (!replay.success) throw new Error(replay.error)
        this.cursor = ply; this.historical = replay.value.engine
    }
    reviewMove(line: string, ply: number, generation: number): SessionResult {
        if (!this.valid(generation) || line !== 'main') return this.reject('Game changed; select the position again')
        try { this.seek(ply); this.publish(); return { success: true, newState: this.getView().state, generation: this.generation } }
        catch (error) { return this.reject(String(error)) }
    }
    getPossibleMoves(from: Coordinate, generation: number) {
        return this.valid(generation) && this.getView().capabilities.move ? this.source.getPossibleMoves(from, this.live.generation) : []
    }
    validateMove(command: string, generation: number) {
        if (this.valid(generation) && this.getView().capabilities.move) return this.source.validateMove(command, this.live.generation)
        return { isValid: false as const, reason: 'Return to the live position on your turn to play.', expectedCaptures: [], status: this.live.state.status }
    }
    async submitMove(command: string, generation: number): Promise<SessionResult> {
        await Promise.resolve()
        if (!this.valid(generation) || !this.getView().capabilities.move) return this.reject('Return to the live position on your turn to play.')
        const result = await this.source.submitMove(command, this.live.generation)
        return { ...result, generation: this.generation }
    }
    changeName(value: string) {
        if (this.disposed || !this.annotations || !this.live.localSide) throw new Error('Join a room before changing your name.')
        const name = screenName(value), seat = this.live.localSide
        const next = structuredClone(this.annotations)
        next.profiles[seat] = { revision: (next.profiles[seat]?.revision ?? 0) + 1, name }
        this.annotations = decodeAnnotations(next); this.attempts = 0; this.sendState(); this.publish()
    }
    addComment(text: string, _author: string | undefined, generation: number): SessionResult {
        const view = this.getView(), cursor = view.review!.cursor
        if (!this.valid(generation) || !view.online?.commentsAvailable || !cursor || !this.annotations || !view.localSide) return this.reject('Shared comments are unavailable until the opponent connects.')
        try {
            if (!text.trim() || Array.from(text).length > 500 || this.annotations.comments.length >= MAX_ONLINE_COMMENTS) throw new Error('Comment limit reached (500 characters; 128 comments per game).')
            const next = structuredClone(this.annotations), author = next.profiles[view.localSide]?.name || undefined
            next.comments.push({ id: crypto.randomUUID(), seat: view.localSide, author, text: normalizeComment(text).text,
                order: Math.max(0, ...next.comments.map(comment => comment.order)) + 1,
                prefix: this.source.getRecovery()!.record.moves.slice(0, cursor) })
            this.annotations = decodeAnnotations(next); this.attempts = 0; this.sendState(); this.publish()
            return { success: true, newState: this.getView().state, generation: this.generation }
        } catch (error) { return this.reject(`Comment could not be added: ${error instanceof Error ? error.message : error}`) }
    }
    saveGame(): string {
        const parsed = parseGame(this.source.saveGame())
        if (!parsed.success) throw new Error(parsed.error)
        const commands = this.source.getRecovery()!.record.moves
        parsed.game.moves.forEach((move, index) => {
            move.comments = (this.annotations?.comments ?? []).filter(comment => comment.prefix.length === index + 1 &&
                comment.prefix.every((command, i) => commands[i] === command)).map(comment => ({ text: comment.text, author: comment.author }))
        })
        for (const seat of ['attacker', 'defender'] as const) {
            const name = this.annotations?.profiles[seat]?.name
            if (name) parsed.game.tags.push({ name: seat === 'attacker' ? 'Attackers' : 'Defenders', value: name })
        }
        return serializeGame(parsed.game)
    }
    getAnnotations() { return this.annotations ? structuredClone(this.annotations) : null }
    getCursor() { return this.cursor }
    holdReviewForDraft(hold: boolean) { this.draft = hold }
    getRecovery() { return this.source.getRecovery() }
    getConflictRecord() { return this.source.getConflictRecord() }
    reconnect() { this.peer = false; this.supported = false; this.source.reconnect() }
    leave() { this.source.leave() }
    loadGame(_input: string, _generation: number): SessionResult { return this.reject('Online import is unavailable.') }
    reset(_generation: number): SessionResult { return this.reject('Online reset is unavailable.') }
    dispose() {
        if (this.disposed) return
        this.disposed = true; this.clearTimer(); this.unbind(); this.unfeature(); this.source.dispose(); this.listeners.clear()
    }
}

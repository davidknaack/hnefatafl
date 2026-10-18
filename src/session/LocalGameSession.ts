import { HnefataflEngine } from '../HnefataflEngine'
import { STANDARD_BOARD } from '../board'
import { ApplyMoveResult, Coordinate, GameStatus, MoveValidationResult, PossibleMove } from '../types'
import { GameSession, SessionCapabilities, SessionListener, SessionResult, SessionView } from './GameSession'
import { LocalReview } from './LocalReview'

export class LocalGameSession implements GameSession {
    private engine = new HnefataflEngine()
    private generation = 0
    private disposed = false
    private standardStart = true
    private listeners = new Set<SessionListener>()
    private review?: LocalReview

    constructor(private options: { review?: boolean } = {}) {
        if (options.review) this.review = new LocalReview()
    }

    getView(): SessionView {
        const state = this.engine.getState()
        const active = !this.disposed
        return {
            state, generation: this.generation, mode: 'local',
            connection: active ? 'ready' : 'closed', localSide: null,
            capabilities: {
                move: active && state.status === GameStatus.InProgress,
                validate: active, import: active, reset: active,
                export: active && this.standardStart && (this.review ? this.review.hasContent : state.moveHistory.length > 0),
            },
            ...(this.review ? { review: this.review.view() } : {}),
        }
    }

    subscribe(listener: SessionListener): () => void {
        if (!this.disposed) this.listeners.add(listener)
        this.deliver(listener)
        return () => { this.listeners.delete(listener) }
    }

    private deliver(listener: SessionListener): void {
        // A view observer must not turn a committed command into a rejected Promise.
        try { listener(this.getView()) }
        catch (error) { console.error('Session subscriber failed', error) }
    }

    private publish(): void {
        const generation = this.generation
        for (const listener of [...this.listeners]) {
            // A reentrant change already published a newer view; never deliver stale views.
            if (this.generation !== generation) break
            if (this.listeners.has(listener)) this.deliver(listener)
        }
    }

    private unavailable(generation: number, action: keyof SessionCapabilities): string | null {
        if (this.disposed) return 'Session is closed'
        if (generation !== this.generation) return 'Game changed; select the move again'
        return this.getView().capabilities[action] ? null : 'Action is not available'
    }

    private reject(error: string): SessionResult {
        return { success: false, error, generation: this.generation }
    }

    private committed(result: ApplyMoveResult): SessionResult {
        if (!result.success) return this.reject(result.error)
        this.generation++
        const response = { ...result, generation: this.generation }
        this.publish()
        return response
    }

    getPossibleMoves(from: Coordinate, generation: number): PossibleMove[] {
        return this.unavailable(generation, 'move') ? [] : this.engine.getPossibleMoves(from)
    }

    validateMove(command: string, generation: number): MoveValidationResult {
        const error = this.unavailable(generation, 'validate')
        return error ? { isValid: false, reason: error, expectedCaptures: [], status: this.engine.getState().status }
            : this.engine.validateMove(command)
    }

    async submitMove(command: string, generation: number): Promise<SessionResult> {
        // Recheck at commit time: import/reset/disposal can invalidate a queued action.
        await Promise.resolve()
        const error = this.unavailable(generation, 'move')
        if (error) return this.reject(error)
        if (this.review && !this.review.atTip) return this.reject('Create a variant to play from this position')
        if (this.review && !this.review.canAppend()) return this.reject('The study move limit has been reached')
        const result = this.engine.applyMove(command)
        if (result.success) this.review?.append(result.newState.moveHistory[result.newState.moveHistory.length - 1], result.newState.status)
        return this.committed(result)
    }

    loadGame(input: string, generation: number): SessionResult {
        const error = this.unavailable(generation, 'import')
        if (error) return this.reject(error)
        try {
            if (this.options.review && input.trimStart().startsWith('{')) {
                const loaded = LocalReview.load(input)
                this.engine = loaded.engine; this.review = loaded.study
            } else {
                const candidate = new HnefataflEngine()
                const result = candidate.loadGame(input)
                if (!result.success) return this.reject(result.error)
                const review = this.options.review ? new LocalReview(candidate) : undefined
                this.engine = candidate; this.review = review
            }
            this.standardStart = true
            return this.committed({ success: true, newState: this.engine.getState() })
        } catch (error) { return this.reject(error instanceof Error ? error.message : 'Could not load game') }
    }

    saveGame(): string {
        if (!this.getView().capabilities.export) throw new Error('Game export is not available')
        return this.review ? this.review.save() : this.engine.saveGame()
    }

    reset(generation: number, layout?: string[]): SessionResult {
        const error = this.unavailable(generation, 'reset')
        if (error) return this.reject(error)
        try { this.engine.reset(layout) }
        catch (error) { return this.reject(error instanceof Error ? error.message : String(error)) }
        this.standardStart = (layout ?? STANDARD_BOARD).every((row, index) => row === STANDARD_BOARD[index])
        this.review = this.options.review && this.standardStart ? new LocalReview() : undefined
        return this.committed({ success: true, newState: this.engine.getState() })
    }

    reviewMove(line: string, ply: number, generation: number): SessionResult {
        const error = this.unavailable(generation, 'validate')
        if (error || !this.review) return this.reject(error ?? 'Local review is not available')
        try {
            const engine = this.review.seek(line, ply)
            this.engine = engine
            return this.committed({ success: true, newState: engine.getState() })
        } catch (error) { return this.reject(error instanceof Error ? error.message : 'Could not review move') }
    }

    createVariant(description: string, generation: number): SessionResult {
        const error = this.unavailable(generation, 'validate')
        if (error || !this.review) return this.reject(error ?? 'Local review is not available')
        if (this.engine.getState().status !== GameStatus.InProgress) return this.reject('Step back from the completed position before branching')
        try {
            this.review.branch(description)
            return this.committed({ success: true, newState: this.engine.getState() })
        } catch (error) { return this.reject(error instanceof Error ? error.message : 'Could not create variant') }
    }

    async submitVariant(command: string, description: string, generation: number): Promise<SessionResult> {
        await Promise.resolve()
        const error = this.unavailable(generation, 'move')
        if (error || !this.review) return this.reject(error ?? 'Local review is not available')
        try {
            const engine = this.review.branchWithMove(command, description)
            this.engine = engine
            return this.committed({ success: true, newState: engine.getState() })
        } catch (error) { return this.reject(error instanceof Error ? error.message : 'Could not play variant') }
    }

    describeVariant(line: string, description: string, generation: number): SessionResult {
        const error = this.unavailable(generation, 'validate')
        if (error || !this.review) return this.reject(error ?? 'Local review is not available')
        try {
            this.review.describe(line, description)
            return this.committed({ success: true, newState: this.engine.getState() })
        } catch (error) { return this.reject(error instanceof Error ? error.message : 'Could not describe variant') }
    }

    dispose(): void {
        if (this.disposed) return
        this.disposed = true
        this.generation++
        this.publish()
        this.listeners.clear()
    }
}

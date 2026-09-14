import { HnefataflEngine } from '../HnefataflEngine'
import { STANDARD_BOARD } from '../board'
import { ApplyMoveResult, Coordinate, GameStatus, MoveValidationResult, PossibleMove } from '../types'
import { GameSession, SessionCapabilities, SessionListener, SessionResult, SessionView } from './GameSession'

export class LocalGameSession implements GameSession {
    private readonly engine = new HnefataflEngine()
    private generation = 0
    private disposed = false
    private standardStart = true
    private listeners = new Set<SessionListener>()

    getView(): SessionView {
        const state = this.engine.getState()
        const active = !this.disposed
        return {
            state, generation: this.generation, mode: 'local',
            connection: active ? 'ready' : 'closed', localSide: null,
            capabilities: {
                move: active && state.status === GameStatus.InProgress,
                validate: active, import: active, reset: active,
                export: active && this.standardStart && state.moveHistory.length > 0,
            },
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
        return error ? this.reject(error) : this.committed(this.engine.applyMove(command))
    }

    loadGame(input: string, generation: number): SessionResult {
        const error = this.unavailable(generation, 'import')
        if (error) return this.reject(error)
        const result = this.engine.loadGame(input)
        if (result.success) this.standardStart = true
        return this.committed(result)
    }

    saveGame(): string {
        if (!this.getView().capabilities.export) throw new Error('Game export is not available')
        return this.engine.saveGame()
    }

    reset(generation: number, layout?: string[]): SessionResult {
        const error = this.unavailable(generation, 'reset')
        if (error) return this.reject(error)
        try { this.engine.reset(layout) }
        catch (error) { return this.reject(error instanceof Error ? error.message : String(error)) }
        this.standardStart = (layout ?? STANDARD_BOARD).every((row, index) => row === STANDARD_BOARD[index])
        return this.committed({ success: true, newState: this.engine.getState() })
    }

    dispose(): void {
        if (this.disposed) return
        this.disposed = true
        this.generation++
        this.publish()
        this.listeners.clear()
    }
}

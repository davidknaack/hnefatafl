import { ApplyMoveResult, Coordinate, GameState, MoveValidationResult, Player, PossibleMove } from '../types'

export interface SessionCapabilities {
    move: boolean
    validate: boolean
    import: boolean
    export: boolean
    reset: boolean
}

export interface SessionView {
    state: GameState
    /** Monotonic within this session, including imports/reset/lifecycle changes. */
    generation: number
    mode: 'local' | 'online'
    connection: 'waiting' | 'connecting' | 'syncing' | 'ready' | 'disconnected' | 'error' | 'closed'
    /** null means local control of both sides. */
    localSide: Player | null
    capabilities: SessionCapabilities
    /** Online status contains no reconnect credentials. */
    online?: {
        roomCode: string | null
        gameId: string | null
        peerConnected: boolean
        pendingAcceptance: boolean
        error: string | null
        warning: string | null
    }
}

export type SessionResult = ApplyMoveResult & { generation: number }
export type SessionListener = (view: SessionView) => void

/** Views/results are detached. Mutations require the generation the caller observed. */
export interface GameSession {
    getView(): SessionView
    /** Immediately delivers a view, then changes. Returns an unsubscribe function. */
    subscribe(listener: SessionListener): () => void
    getPossibleMoves(from: Coordinate, generation: number): PossibleMove[]
    validateMove(command: string, generation: number): MoveValidationResult
    submitMove(command: string, generation: number): Promise<SessionResult>
    loadGame(input: string, generation: number): SessionResult
    saveGame(): string
    reset(generation: number, layout?: string[]): SessionResult
    dispose(): void
}

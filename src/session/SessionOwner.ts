import { GameSession } from './GameSession'

/** Owns one session and its consumer binding. Unbind before disposing/replacing. */
export class SessionOwner {
    private cleanup: () => void
    private closed = false

    constructor(private current: GameSession, private bind: (session: GameSession) => () => void) {
        this.cleanup = bind(current)
    }

    get session(): GameSession { return this.current }

    replace(next: GameSession): void {
        if (next === this.current) return
        if (this.closed) { next.dispose(); return }
        this.cleanup()
        this.current.dispose()
        this.current = next
        this.cleanup = this.bind(next)
    }

    dispose(): void {
        if (this.closed) return
        this.closed = true
        this.cleanup()
        this.current.dispose()
    }
}

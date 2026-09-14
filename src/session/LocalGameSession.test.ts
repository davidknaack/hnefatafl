import { describe, expect, test, vi } from 'vitest'
import { LocalGameSession } from './LocalGameSession'
import { SessionView } from './GameSession'
import { Player } from '../types'

describe('Local game session', () => {
    test('publishes initial and committed detached views once, with local control of both sides', async () => {
        const session = new LocalGameSession()
        const observed: SessionView[] = []
        const unsubscribe = session.subscribe((view) => observed.push(view))
        expect(observed).toHaveLength(1)
        expect(observed[0]).toMatchObject({ generation: 0, mode: 'local', connection: 'ready', localSide: null,
            capabilities: { move: true, validate: true, import: true, export: false, reset: true } })
        expect(session.validateMove('D11-D10', 0).isValid).toBe(true)
        const first = await session.submitMove('D11-D10', 0)
        expect(first).toMatchObject({ success: true, generation: 1 })
        expect(observed).toHaveLength(2)
        expect(observed[1].state.currentPlayer).toBe(Player.Defender)
        expect(observed[1].capabilities.move).toBe(true)
        expect(session.getPossibleMoves({ x: 5, y: 3 }, 1).length).toBeGreaterThan(0)
        expect(await session.submitMove('F8-E8', 1)).toMatchObject({ success: true, generation: 2 })
        expect(observed).toHaveLength(3)
        expect(observed[0].state.moveHistory).toEqual([])
        expect(observed[1].state.moveHistory).toEqual(['D11-D10'])
        unsubscribe()
        session.reset(2)
        expect(observed).toHaveLength(3)
    })

    test('rejections leave state, generation and notifications unchanged', async () => {
        const session = new LocalGameSession()
        const listener = vi.fn()
        session.subscribe(listener)
        const before = session.getView()
        expect(await session.submitMove('garbage', 0)).toMatchObject({ success: false, generation: 0 })
        expect(session.loadGame('d11-d10 garbage', 0).success).toBe(false)
        expect(session.reset(0, ['K']).success).toBe(false)
        expect(session.getView()).toEqual(before)
        expect(listener).toHaveBeenCalledTimes(1)
    })

    test.each(['import', 'reset', 'dispose'] as const)('%s invalidates a queued move', async (change) => {
        const session = new LocalGameSession()
        const pending = session.submitMove('D11-D10', 0)
        if (change === 'import') expect(session.loadGame('a8-c8', 0).success).toBe(true)
        else if (change === 'reset') expect(session.reset(0).success).toBe(true)
        else session.dispose()
        const before = session.getView()
        expect(await pending).toMatchObject({ success: false, generation: 1 })
        expect(session.getView()).toEqual(before)
        expect(session.validateMove('D11-D10', 0).isValid).toBe(false)
        expect(session.getPossibleMoves({ x: 3, y: 0 }, 0)).toEqual([])
    })

    test('only one submission for an observed generation can commit', async () => {
        const session = new LocalGameSession()
        const results = await Promise.all([session.submitMove('D11-D10', 0), session.submitMove('F8-E8', 0)])
        expect(results.map((result) => result.success)).toEqual([true, false])
        expect(session.getView().state.moveHistory).toEqual(['D11-D10'])
    })

    test('importing a shorter game still advances generation and restores export/history', () => {
        const session = new LocalGameSession()
        session.loadGame('d11-d8 f8-e8 f10-f8', 0)
        expect(session.saveGame()).toBe('d11-d8 f8-e8 f10-f8xe8')
        const before = session.getView()
        expect(session.loadGame('a8-c8', 1).success).toBe(true)
        expect(session.getView()).toMatchObject({ generation: 2, state: { moveHistory: ['A8-C8'] } })
        expect(before.state.moveHistory).toHaveLength(3)
        expect(session.loadGame('d11-d10', 1).success).toBe(false)
    })

    test('views, result states and subscriber data cannot change engine permissions or outcomes', async () => {
        const session = new LocalGameSession()
        const listener = vi.fn()
        session.subscribe((view) => { view.state.moveHistory.push('corrupt'); view.capabilities.move = false })
        session.subscribe(listener)
        const result = await session.submitMove('D11-D10', 0)
        expect(result.success).toBe(true)
        if (!result.success) throw new Error(result.error)
        result.newState.moveHistory.push('corrupt')
        expect(listener.mock.calls[1][0].state.moveHistory).toEqual(['D11-D10'])
        expect(session.getView().state.moveHistory).toEqual(['D11-D10'])
        session.loadGame('d11-d10 ---', 1)
        const view = session.getView()
        view.state.outcome!.winner = Player.Defender
        view.capabilities.move = true
        expect(session.getView().state.outcome).toEqual({ winner: Player.Attacker, reason: 'resignation' })
        expect(await session.submitMove('F8-E8', 2)).toMatchObject({ success: false })
        expect(session.getView().capabilities).toMatchObject({ move: false, export: true, import: true })
    })

    test('disposal notifies closed state, releases subscribers and rejects mutations', async () => {
        const session = new LocalGameSession()
        const listener = vi.fn()
        session.subscribe(listener)
        session.dispose()
        session.dispose()
        expect(listener).toHaveBeenCalledTimes(2)
        expect(session.getView()).toMatchObject({ connection: 'closed', generation: 1,
            capabilities: { move: false, validate: false, import: false, export: false, reset: false } })
        expect(await session.submitMove('D11-D10', 1)).toMatchObject({ success: false })
        expect(session.loadGame('a8-c8', 1).success).toBe(false)
        expect(session.reset(1).success).toBe(false)
        expect(() => session.saveGame()).toThrow()
        expect(listener).toHaveBeenCalledTimes(2)
    })

    test('an observer error cannot reject an already committed move', async () => {
        const report = vi.spyOn(console, 'error').mockImplementation(() => {})
        try {
            const session = new LocalGameSession()
            session.subscribe(() => { throw new Error('broken observer') })
            const other = vi.fn()
            session.subscribe(other)
            expect((await session.submitMove('D11-D10', 0)).success).toBe(true)
            expect(other).toHaveBeenCalledTimes(2)
            expect(report).toHaveBeenCalledTimes(2)
        } finally { report.mockRestore() }
    })

    test('export capability excludes custom starting positions', async () => {
        const session = new LocalGameSession()
        session.reset(0, [
            'R.........R', 'A..........', '...........', '...........', '...........',
            '.....K.....', '...........', '...........', '...........', '...........', 'R.........R',
        ])
        expect((await session.submitMove('A10-B10', 1)).success).toBe(true)
        expect(session.getView().capabilities.export).toBe(false)
        expect(() => session.saveGame()).toThrow()
        session.loadGame('d11-d10', 2)
        expect(session.getView().capabilities.export).toBe(true)
    })
})

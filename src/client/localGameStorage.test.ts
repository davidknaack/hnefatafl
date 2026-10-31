import { describe, expect, test } from 'vitest'
import { LocalGameSession } from '../session/LocalGameSession'
import { createLocalGameStorage, LOCAL_GAME_KEY, SAVED_GAME_NOTE } from './localGameStorage'

function fixture(text?: string) {
    const values = new Map<string, string>(text === undefined ? [] : [[LOCAL_GAME_KEY, text]])
    values.set('hnefatafl.online.recent.v1', 'leave alone')
    let failRead = false, failWrite = false
    const messages: string[] = []
    const storage = {
        getItem(key: string) { if (failRead) throw new Error('Denied'); return values.get(key) ?? null },
        setItem(key: string, value: string) { if (failWrite) throw new Error('Quota'); values.set(key, value) },
    }
    const autosave = createLocalGameStorage(() => storage, message => messages.push(message))
    return { values, storage, autosave, messages, failRead: () => { failRead = true }, failWrite: (value: boolean) => { failWrite = value } }
}
const fresh = () => new LocalGameSession({ review: true })
const load = (s: LocalGameSession, text: string) => s.loadGame(text, s.getView().generation)
const seek = (s: LocalGameSession, line: string, ply: number) => s.reviewMove(line, ply, s.getView().generation)

describe('Production local autosave', () => {
    test('restores single-line review at every ply with future moves, captures and tags intact', () => {
        const f = fixture(), s = fresh(), stop = f.autosave.bind(s)
        expect(load(s, '[Event:Keep me] d11-d8 f8-e8 f10-f8').success).toBe(true)
        const exported = s.saveGame()
        for (const ply of [3, 2, 1, 0]) {
            seek(s, 'main', ply)
            const restored = f.autosave.restore()!
            expect(restored.getView().state).toEqual(s.getView().state)
            expect(restored.getView().review).toEqual(s.getView().review)
            expect(restored.saveGame()).toBe(exported)
            restored.dispose()
        }
        expect(f.messages[f.messages.length - 1]).toBe(SAVED_GAME_NOTE)
        expect(f.values.get('hnefatafl.online.recent.v1')).toBe('leave alone')
        stop(); s.dispose()
    })

    test('restores sibling and nested variants, edited descriptions and the selected branch/cursor', async () => {
        const f = fixture(), s = fresh(); f.autosave.bind(s)
        load(s, 'd11-d10 f8-e8 d10-c10')
        seek(s, 'main', 1)
        expect((await s.submitVariant('F8-I8', 'Defense', s.getView().generation)).success).toBe(true)
        expect((await s.submitMove('D10-D9', s.getView().generation)).success).toBe(true)
        seek(s, 'v1', 2)
        expect((await s.submitVariant('D10-C10', 'Nested', s.getView().generation)).success).toBe(true)
        seek(s, 'main', 1)
        expect((await s.submitVariant('F8-G8', 'Sibling', s.getView().generation)).success).toBe(true)
        s.describeVariant('v2', 'Revised nested line', s.getView().generation)
        for (const [line, ply] of [['v2', 3], ['v1', 2], ['main', 0]] as const) {
            seek(s, line, ply)
            const restored = f.autosave.restore()!
            expect(restored.getView().state).toEqual(s.getView().state)
            expect(restored.getView().review).toEqual(s.getView().review)
            expect(restored.saveGame()).toBe(s.saveGame())
            restored.dispose()
        }
    })

    test('new empty game overwrites the old record; completed games and resignations survive', () => {
        const f = fixture(), s = fresh(); f.autosave.bind(s)
        for (const record of ['d11-d10 ---', 'd11-d10 f8-e8 d10-d11 e8-f8 d11-d10 f8-e8 d10-d11 e8-f8']) {
            load(s, record)
            const restored = f.autosave.restore()!
            expect(restored.getView().state.outcome).toEqual(s.getView().state.outcome)
            expect(restored.getView().state.outcome).not.toBeNull()
        }
        s.reset(s.getView().generation)
        const restored = f.autosave.restore()!
        expect(restored.getView().review).toMatchObject({ line: 'main', cursor: 0, moves: [], lines: [{ id: 'main' }] })
        expect(restored.getView().capabilities.export).toBe(false)
    })

    test.each(['{broken', '{"format":"hnefatafl-study","version":99}', 'd11-d10'])('invalid snapshot is retained until an intentional change: %s', async text => {
        const f = fixture(text)
        expect(f.autosave.restore()).toBeUndefined()
        const s = fresh(); f.autosave.bind(s)
        expect(f.values.get(LOCAL_GAME_KEY)).toBe(text)
        expect(f.messages[f.messages.length - 1]).toContain('could not be restored')
        await s.submitMove('D11-D10', s.getView().generation)
        expect(f.autosave.restore()!.getView().state.moveHistory).toEqual(['D11-D10'])
        expect(f.messages[f.messages.length - 1]).toBe(SAVED_GAME_NOTE)
    })

    test('explicit replacement of an unrestorable game saves even before its first move', () => {
        const f = fixture('{broken'); f.autosave.restore()
        const old = fresh(), stop = f.autosave.bind(old)
        stop(); old.dispose()
        const replacement = fresh(); load(replacement, 'd11-d8')
        f.autosave.bind(replacement)
        expect(f.autosave.restore()!.getView().state.moveHistory).toEqual(['D11-D8'])
    })

    test('storage denial/quota do not interrupt play; successful later writes clear the failure', async () => {
        const f = fixture(); f.failRead()
        expect(f.autosave.restore()).toBeUndefined()
        const s = fresh(); f.autosave.bind(s); f.failWrite(true)
        expect((await s.submitMove('D11-D10', s.getView().generation)).success).toBe(true)
        expect(f.messages[f.messages.length - 1]).toContain('could not be saved')
        expect(f.values.has(LOCAL_GAME_KEY)).toBe(false)
        f.failWrite(false)
        expect((await s.submitMove('F8-E8', s.getView().generation)).success).toBe(true)
        expect(JSON.parse(f.values.get(LOCAL_GAME_KEY)!).main).toEqual(['D11-D10', 'F8-E8'])
        expect(f.messages[f.messages.length - 1]).toBe(SAVED_GAME_NOTE)
    })

    test('invalid commands, custom layouts, unbinding and disposal do not overwrite the last copy', async () => {
        const f = fixture(), s = fresh(), stop = f.autosave.bind(s)
        await s.submitMove('D11-D10', s.getView().generation)
        const saved = f.values.get(LOCAL_GAME_KEY)
        expect(load(s, 'invalid').success).toBe(false)
        expect((await s.submitMove('A1-A2', s.getView().generation)).success).toBe(false)
        expect(f.values.get(LOCAL_GAME_KEY)).toBe(saved)
        s.reset(s.getView().generation, ['R.........R', '...........', '...........', '...........', '...........', '.....K.....', '...........', '...........', '...........', '...........', 'RA........R'])
        expect(f.values.get(LOCAL_GAME_KEY)).toBe(saved)
        stop(); s.reset(s.getView().generation); s.dispose()
        expect(f.values.get(LOCAL_GAME_KEY)).toBe(saved)
    })
})

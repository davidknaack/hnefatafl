import { expect, test } from 'vitest'
import { OnlineStorage, ONLINE_PRESENTATION_KEY } from './onlineStorage'
import { emptyAnnotations } from '../online/annotations'
import { OnlineGameSession } from '../session/OnlineGameSession'
import { OnlineStudySession } from '../session/OnlineStudySession'
import { createGameRecord } from '../online/record'

const endpoint = 'ws://localhost/relay'
const credentials = { roomCode: 'ABCDEF', gameId: 'game-1', seat: 'attacker' as const, token: 'private' }
function memory() {
    const values = new Map<string, string>()
    return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}
function session() {
    const game = createGameRecord('game-1', ['D11-D8'])
    if (!game.success) throw new Error(game.error)
    return new OnlineStudySession(new OnlineGameSession({ endpoint, start: { type: 'resume', credentials, record: game.value.record }, autoConnect: false }), { name: 'Alex' })
}
test('sidecar round-trips names and cursor separately from private credentials; a stale tab cannot overwrite it', () => {
    const storage = memory(), a = new OnlineStorage(() => storage), b = new OnlineStorage(() => storage), game = session()
    try {
        a.permitReplacement(); a.save(game)
        expect(storage.values.get(ONLINE_PRESENTATION_KEY)).not.toContain('private')
        const restored = b.restore(endpoint, credentials)
        expect((restored.annotations as ReturnType<OnlineStudySession['getAnnotations']>)!.profiles.attacker?.name).toBe('Alex')
        game.reviewMove('main', 0, game.getView().generation); a.save(game)
        game.changeName('Sam'); b.save(game)
        expect(b.status).toContain('another tab')
        expect(JSON.parse(storage.values.get(ONLINE_PRESENTATION_KEY)!).annotations.profiles.attacker.name).toBe('Alex')
        expect(a.restore(endpoint, credentials).cursor).toBe(0)
    } finally { game.dispose() }
})
test('corrupt, unknown and mismatched sidecars preserve original bytes while the game remains usable', () => {
    for (const raw of ['broken', JSON.stringify({ version: 3 }), JSON.stringify({ version: 1, endpoint, gameId: 'game-1', seat: 'attacker', cursor: 0, annotations: emptyAnnotations('other-game') })]) {
        const storage = memory(); storage.setItem(ONLINE_PRESENTATION_KEY, raw)
        const sidecar = new OnlineStorage(() => storage), game = session()
        try {
            expect(sidecar.restore(endpoint, credentials)).toEqual({})
            sidecar.save(game)
            expect(storage.getItem(ONLINE_PRESENTATION_KEY)).toBe(raw)
            expect(game.saveGame()).toContain('d11-d8')
            expect(sidecar.backup()).toBe(raw)
        } finally { game.dispose() }
    }
})
test('storage denial and quota errors are reported independently; mode and remembered name remain preferences', () => {
    const storage = memory(), sidecar = new OnlineStorage(() => storage), game = session()
    try {
        sidecar.prefer('online', 'Alex'); expect(sidecar.preferences()).toEqual({ mode: 'online', name: 'Alex' })
        sidecar.prefer('local'); expect(sidecar.preferences()).toEqual({ mode: 'local', name: 'Alex' })
        sidecar.permitReplacement(); storage.setItem = () => { throw new Error('quota') }
        sidecar.save(game); expect(sidecar.status).toContain('Save / copy')
        const denied = new OnlineStorage(() => { throw new Error('denied') })
        expect(denied.restore(endpoint, credentials)).toEqual({})
        expect(denied.preferences()).toEqual({ name: '', mode: null })
    } finally { game.dispose() }
})

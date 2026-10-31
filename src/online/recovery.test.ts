import { expect, test } from 'vitest'
import { createGameRecord } from './record'
import { decodeRecovery, MAX_RECOVERY_BYTES, RECOVERY_KEY, RecoveryEnvelope, RecoveryStore } from './recovery'
import { OnlineGameSession } from '../session/OnlineGameSession'

function envelope(moves: string[] = []): RecoveryEnvelope {
    const game = createGameRecord('game-1', moves)
    if (!game.success) throw new Error(game.error)
    return { storageVersion: 1, endpoint: 'ws://localhost:8787/relay', clientVersion: '1.0.0', savedAt: 123,
        resume: true, credentials: { roomCode: 'ABCDEF', gameId: 'game-1', seat: 'attacker', token: 'private-test-token' },
        record: game.value.record, conflict: null }
}
function memory(raw: string | null = null) {
    let stored = raw
    return { getItem: (_key: string) => stored, setItem: (key: string, value: string) => { expect(key).toBe(RECOVERY_KEY); stored = value }, raw: () => stored }
}
test.each([[], ['D11-D10'], ['D11-D8', 'F8-E8', 'F10-F8'],
    ['D11-D10', 'F8-E8', 'D10-D11', 'E8-F8', 'D11-D10', 'F8-E8', 'D10-D11', 'E8-F8']].map(commands => ({ commands })))('recovery replays $commands', ({ commands }) => {
    const input = envelope(commands)
    const result = decodeRecovery(JSON.stringify(input))
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.value).toEqual(input)
    result.value.record.moves.push('edited')
    expect(input.record.moves).toEqual(commands.length === 3 ? ['D11-D8', 'F8-E8', 'F10-F8(E8)'] : commands)
})

test('metadata, credentials, endpoint, schema and replay checks fail closed', () => {
    const good = envelope()
    for (const bad of [
        { ...good, storageVersion: 2 }, { ...good, savedAt: -1 }, { ...good, clientVersion: 'bad' },
        { ...good, endpoint: 'https://example.com' }, { ...good, endpoint: 'ws://user:secret@localhost/relay' },
        { ...good, endpoint: 'ws://localhost/relay?token=secret' }, { ...good, resume: 'yes' },
        { ...good, credentials: { ...good.credentials, gameId: 'other' } },
        { ...good, credentials: { ...good.credentials, seat: 'spectator' } },
        { ...good, record: { ...good.record, stateCheck: { positionKey: 'bad', outcome: null } } },
        { ...good, record: { ...good.record, moves: ['invalid'], revision: 1 } },
        '{', 'x'.repeat(MAX_RECOVERY_BYTES + 1),
    ]) expect(decodeRecovery(bad).success).toBe(false)
})

test('incompatible data is retained byte-for-byte until replacement is explicitly allowed', () => {
    const raw = '{"storageVersion":99,"future":"preserve this"}'
    const storage = memory(raw), store = new RecoveryStore(() => storage)
    expect(store.load().kind).toBe('invalid')
    expect(store.save(envelope()).success).toBe(false)
    expect(storage.raw()).toBe(raw)
    expect(store.backup()).toBe(raw)
    store.permitReplacement()
    expect(store.save(envelope()).success).toBe(true)
    expect(decodeRecovery(storage.raw()).success).toBe(true)
})

test('writes persist zero moves, longer records and changed lifecycle; snapshots are detached', () => {
    const storage = memory(), store = new RecoveryStore(() => storage)
    expect(store.load()).toEqual({ kind: 'empty' })
    expect(store.save(envelope()).success).toBe(true)
    expect(store.save(envelope(['D11-D10'])).success).toBe(true)
    expect(store.save({ ...envelope(['D11-D10']), resume: false }).success).toBe(true)
    const fresh = new RecoveryStore(() => storage), loaded = fresh.load()
    expect(loaded.kind).toBe('saved')
    if (loaded.kind !== 'saved') return
    expect(loaded.value.resume).toBe(false)
    loaded.value.credentials.token = 'changed'
    expect(fresh.backup()).not.toContain('changed')
})

test('another tab cannot overwrite a newer save, including after replacement permission', () => {
    const storage = memory(JSON.stringify(envelope()))
    const a = new RecoveryStore(() => storage), b = new RecoveryStore(() => storage)
    a.load(); b.load()
    a.save(envelope(['D11-D10']))
    b.permitReplacement()
    expect(b.save(envelope()).success).toBe(false)
    expect(JSON.parse(storage.raw()!).record.revision).toBe(1)
})

test('restoring an unchanged snapshot does not rewrite timestamps or disrupt the original tab', () => {
    const storage = memory(JSON.stringify(envelope()))
    const a = new RecoveryStore(() => storage), duplicate = new RecoveryStore(() => storage)
    a.load(); duplicate.load()
    expect(duplicate.save({ ...envelope(), savedAt: 999 }).success).toBe(true)
    expect(JSON.parse(storage.raw()!).savedAt).toBe(123)
    expect(a.save(envelope(['D11-D10'])).success).toBe(true)
    storage.setItem(RECOVERY_KEY, '{"storageVersion":99}')
    expect(a.load().kind).toBe('invalid')
    expect(a.save(envelope()).success).toBe(false)
})

test('saved longer histories, branches and different seats are not silently overwritten', () => {
    const storage = memory(JSON.stringify(envelope(['D11-D10']))), store = new RecoveryStore(() => storage)
    store.load()
    for (const next of [envelope(), envelope(['A8-C8']), { ...envelope(['D11-D10']), credentials: { ...envelope().credentials, token: 'other-seat' } }]) {
        expect(store.save(next).success).toBe(false)
    }
    expect(JSON.parse(storage.raw()!).record.moves).toEqual(['D11-D10'])
})

test('quota, denied access and silent writes report failures without destroying the old save', () => {
    const raw = JSON.stringify(envelope())
    const blocked = new RecoveryStore(() => { throw new Error('access denied') })
    expect(blocked.load().kind).toBe('unavailable')
    expect(blocked.save(envelope()).success).toBe(false)
    for (const setItem of [() => { throw new Error('quota') }, () => {}]) {
        const store = new RecoveryStore(() => ({ getItem: () => raw, setItem }))
        store.load()
        expect(store.save(envelope(['D11-D10'])).success).toBe(false)
        expect(store.backup()).toBe(raw)
    }
})

test('branches survive storage but cannot be marked for automatic reconnect', () => {
    const input = { ...envelope(['D11-D10']), resume: false, conflict: envelope(['A8-C8']).record }
    expect(decodeRecovery(input)).toEqual({ success: true, value: input })
    expect(decodeRecovery({ ...input, resume: true }).success).toBe(false)
})

test('review-only restore never opens a socket, including explicit reconnect', () => {
    const saved = envelope(['D11-D10'])
    let connections = 0
    const session = new OnlineGameSession({ endpoint: saved.endpoint,
        start: { type: 'resume', credentials: saved.credentials, record: saved.record }, autoConnect: false,
        socketFactory: () => { connections++; throw new Error('Must not connect') } })
    session.reconnect()
    expect(connections).toBe(0)
    expect(session.getView()).toMatchObject({ connection: 'closed', capabilities: { move: false, export: true } })
    expect(session.saveGame()).toBe('d11-d10')
    session.dispose()
})

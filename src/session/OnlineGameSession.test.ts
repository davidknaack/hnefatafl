import { afterEach, expect, test, vi } from 'vitest'
import { startRelay } from '../../server/relay'
import { createGameRecord, OnlineGameRecordV1 } from '../online/record'
import { browserSocket, SessionSocket } from '../online/socket'
import { OnlineGameSession, OnlineSessionOptions } from './OnlineGameSession'

type Callbacks = Parameters<SessionSocket['listen']>[0]
class Socket implements SessionSocket {
    readyState = 0
    bufferedAmount = 0
    sent: any[] = []
    callbacks?: Callbacks
    lastCallbacks?: Callbacks
    throws = false
    send(text: string) { if (this.throws) throw new Error('lost'); this.sent.push(JSON.parse(text)) }
    close() { this.readyState = 3 }
    listen(callbacks: Callbacks) {
        this.callbacks = callbacks; this.lastCallbacks = callbacks
        return () => { this.callbacks = undefined }
    }
    open() { this.readyState = 1; this.callbacks!.open() }
    receive(fields: object) {
        this.callbacks?.message(JSON.stringify({ protocolVersion: 1, clientVersion: '1.0.0', messageId: 'remote', ...fields }))
    }
    peer(body: unknown, extra: object = {}) { this.receive({ type: 'relayed', senderSeat: 'defender', gameId: 'game-1', body, ...extra }) }
    lastRecord() { return [...this.sent].reverse().find((m) => m.body?.type === 'game-record') }
    ack(message = this.lastRecord(), extra: object = {}) {
        this.peer({ type: 'record-ack', payload: { gameId: 'game-1', revision: message.body.payload.record.revision,
            recordMessageId: message.messageId, syncId: message.body.payload.syncId, ...extra } })
    }
}
const sessions: OnlineGameSession[] = []
afterEach(() => { sessions.splice(0).forEach((s) => s.dispose()); vi.useRealTimers() })
function record(moves: string[] = []): OnlineGameRecordV1 {
    const result = createGameRecord('game-1', moves)
    if (!result.success) throw new Error(result.error)
    return result.value.record
}
function fixture(options: Partial<OnlineSessionOptions> = {}) {
    let serial = 0
    const sockets: Socket[] = []
    const session = new OnlineGameSession({ endpoint: 'ws://localhost/relay', start: { type: 'create', side: 'attacker' },
        messageId: () => `id-${++serial}`, socketFactory: () => { const s = new Socket(); sockets.push(s); return s }, ...options })
    sessions.push(session)
    return { session, sockets, get socket() { return sockets[sockets.length - 1] } }
}
function assign(f: ReturnType<typeof fixture>) {
    const s = f.socket
    s.open()
    s.receive({ type: 'assigned', requestId: s.sent[0].messageId, roomCode: 'ABCDEF', gameId: 'game-1', seat: 'attacker', token: 'secret' })
    s.receive({ type: 'presence', gameId: 'game-1', peerConnected: true })
}
function ready(f: ReturnType<typeof fixture>, game = record()) {
    assign(f)
    const sent = f.socket.lastRecord()
    f.socket.peer({ type: 'game-record', payload: { record: game, syncId: sent.body.payload.syncId } })
    f.socket.ack()
    expect(f.session.getView().connection).toBe('ready')
}

test('create/sync gates actions; commits once, waits for exact ack, and exposes detached data', async () => {
    const f = fixture()
    expect((await f.session.submitMove('D11-D10', 0)).success).toBe(false)
    assign(f)
    expect(f.session.getView().capabilities.move).toBe(false)
    f.socket.ack()
    expect(f.session.getView().connection).toBe('syncing')
    f.socket.peer({ type: 'game-record', payload: { record: record(), syncId: null } })
    expect(f.session.getView().connection).toBe('ready')
    const generation = f.session.getView().generation
    const result = await f.session.submitMove('D11-D10', generation)
    expect(result.success).toBe(true)
    expect(f.session.getView()).toMatchObject({ connection: 'syncing', capabilities: { move: false, import: false, reset: false } })
    expect((await f.session.submitMove('D11-D10', generation)).success).toBe(false)
    f.socket.ack(undefined, { recordMessageId: 'old' })
    f.socket.ack(undefined, { revision: 0 })
    f.socket.ack(undefined, { syncId: 'wrong' })
    expect(f.session.getView().connection).toBe('syncing')
    f.socket.ack()
    expect(f.session.getView()).toMatchObject({ connection: 'ready', capabilities: { move: false, validate: false } })
    const recovery = f.session.getRecovery()!
    recovery.record.moves.length = 0; recovery.credentials.token = 'edited'
    const view = f.session.getView(); view.state.moveHistory.length = 0
    expect(f.session.getRecovery()!.record.revision).toBe(1)
    expect(f.session.getRecovery()!.credentials.token).toBe('secret')
    expect(f.session.saveGame()).toBe('d11-d10')
    expect(JSON.stringify(view)).not.toContain('secret')
    expect(f.session.loadGame('d11-d10', 0).success).toBe(false)
    expect(f.session.reset(0).success).toBe(false)
})

test('duplicate records acknowledge without publishing or reapplying; immediate reply proves prefix acceptance', async () => {
    const f = fixture(); ready(f)
    const listener = vi.fn(); f.session.subscribe(listener)
    const generation = f.session.getView().generation
    f.socket.peer({ type: 'game-record', payload: { record: record(), syncId: null } })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(f.session.getView().generation).toBe(generation)
    await f.session.submitMove('D11-D10', generation)
    const pending = f.socket.lastRecord()
    f.socket.peer({ type: 'game-record', payload: { record: record(['D11-D10', 'F8-E8']), syncId: null } })
    expect(f.session.getView()).toMatchObject({ connection: 'ready', capabilities: { move: true } })
    f.socket.ack(pending)
    expect(f.session.getRecovery()!.record.revision).toBe(2)
})

test('larger extensions require requested recovery; shorter peers cannot roll back local history', () => {
    const f = fixture(); ready(f)
    const longer = record(['D11-D10', 'F8-E8'])
    f.socket.peer({ type: 'game-record', payload: { record: longer, syncId: null } })
    expect(f.session.getRecovery()!.record.revision).toBe(0)
    expect(f.session.getView().connection).toBe('syncing')
    const syncId = f.socket.lastRecord().body.payload.syncId
    f.socket.peer({ type: 'game-record', payload: { record: longer, syncId: 'stale' } })
    expect(f.session.getRecovery()!.record.revision).toBe(0)
    f.socket.peer({ type: 'game-record', payload: { record: longer, syncId } })
    f.socket.ack()
    expect(f.session.getRecovery()!.record.revision).toBe(2)
    f.socket.peer({ type: 'game-record', payload: { record: record(), syncId } })
    expect(f.session.getRecovery()!.record.revision).toBe(2)
    expect(f.socket.lastRecord().body.payload.record.revision).toBe(2)
})

test('branches retain both records and block reconnect; malformed/foreign/out-of-turn records preserve state', async () => {
    const f = fixture(); ready(f)
    await f.session.submitMove('D11-D10', f.session.getView().generation)
    const other = record(['A8-C8'])
    f.socket.peer({ type: 'game-record', payload: { record: other, syncId: null } })
    expect(f.session.getView().connection).toBe('error')
    expect(f.session.getConflictRecord()).toEqual(other)
    f.session.getConflictRecord()!.moves.length = 0
    expect(f.session.getConflictRecord()!.revision).toBe(1)
    f.session.reconnect(); expect(f.sockets).toHaveLength(1)
    expect(f.session.getRecovery()!.record.moves).toEqual(['D11-D10'])
    for (const [game, extra] of [
        [{ ...record(), stateCheck: { positionKey: 'wrong', outcome: null } }, {}],
        [record(), { gameId: 'foreign' }],
        [record(['D11-D10']), {}],
    ] as const) {
        const g = fixture(); ready(g)
        g.socket.peer({ type: 'game-record', payload: { record: game, syncId: null } }, extra)
        expect(g.session.getView().connection).toBe('error')
        expect(g.session.getRecovery()!.record.revision).toBe(0)
    }
})

test('disconnect retains unacknowledged move; stale callbacks/acks cannot release a new connection', async () => {
    const f = fixture(); ready(f)
    await f.session.submitMove('D11-D10', f.session.getView().generation)
    const oldSocket = f.socket, oldAck = oldSocket.lastRecord(), callbacks = oldSocket.lastCallbacks!
    callbacks.close()
    expect(f.session.getView().connection).toBe('disconnected')
    f.session.reconnect(); assign(f)
    expect(f.socket.sent[0]).toMatchObject({ type: 'resume', token: 'secret' })
    callbacks.close(); callbacks.error(); callbacks.message('bad json')
    expect(f.session.getView().connection).toBe('syncing')
    f.socket.ack(oldAck)
    expect(f.session.getView().connection).toBe('syncing')
    f.socket.peer({ type: 'game-record', payload: { record: record(), syncId: null } })
    expect(f.session.getRecovery()!.record.revision).toBe(1)
    const current = f.socket.lastRecord()
    f.socket.peer({ type: 'game-record', payload: current.body.payload })
    f.socket.ack()
    expect(f.session.getView().connection).toBe('ready')
})

test('bounded timeout resends records, never commands, then stops and cleans timers', async () => {
    vi.useFakeTimers()
    const f = fixture({ timeoutMs: 100 }); ready(f)
    await f.session.submitMove('D11-D10', f.session.getView().generation)
    vi.advanceTimersByTime(100)
    expect(f.session.getView().connection).toBe('syncing')
    expect(f.socket.lastRecord().body.payload.record.moves).toEqual(['D11-D10'])
    vi.advanceTimersByTime(100)
    expect(f.session.getView().connection).toBe('error')
    expect(f.session.getRecovery()!.record.revision).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
    const g = fixture({ timeoutMs: 100 })
    vi.advanceTimersByTime(100)
    expect(g.session.getView().connection).toBe('disconnected')
})

test('send loss retains local commit; wire preflight rejection preserves engine; dispose invalidates queued move', async () => {
    const f = fixture(); ready(f)
    f.socket.throws = true
    expect((await f.session.submitMove('D11-D10', f.session.getView().generation)).success).toBe(true)
    expect(f.session.getView().connection).toBe('disconnected')
    expect(f.session.getRecovery()!.record.revision).toBe(1)
    // Allow the opening record, but leave no room for an additional command.
    const sample = fixture(); ready(sample)
    const sent = sample.socket.lastRecord()
    const ceiling = new TextEncoder().encode(JSON.stringify({ ...sent, type: 'relayed', gameId: 'game-1', senderSeat: 'attacker' })).length
    const g = fixture({ maxWireBytes: ceiling }); ready(g)
    expect((await g.session.submitMove('D11-D10', g.session.getView().generation)).success).toBe(false)
    expect(g.session.getRecovery()!.record.revision).toBe(0)
    const h = fixture(); ready(h)
    const pending = h.session.submitMove('D11-D10', h.session.getView().generation)
    h.session.dispose()
    expect((await pending).success).toBe(false)
    expect(h.socket.callbacks).toBeUndefined()
    expect(h.session.getRecovery()!.record.revision).toBe(0)
})

test('unknown features and major version warnings are nonblocking; leave keeps game without creating outcome', () => {
    const f = fixture(); ready(f)
    f.socket.peer({ type: 'future-feature', payload: { anything: true } }, { clientVersion: '2.0.0' })
    expect(f.session.getView()).toMatchObject({ connection: 'ready', online: { warning: expect.stringContaining('major') } })
    f.session.leave()
    expect(f.socket.sent[f.socket.sent.length - 1].type).toBe('leave')
    expect(f.session.getView()).toMatchObject({ connection: 'closed', state: { outcome: null } })
    f.session.reconnect(); expect(f.sockets).toHaveLength(1)
})

test('restored terminal records remain unplayable and recovery inputs are validated', () => {
    const terminal = record(['D11-D10', 'F8-E8', 'D10-D11', 'E8-F8', 'D11-D10', 'F8-E8', 'D10-D11', 'E8-F8'])
    const credentials = { roomCode: 'ABCDEF', gameId: 'game-1', seat: 'attacker' as const, token: 'secret' }
    const f = fixture({ start: { type: 'resume', credentials, record: terminal } })
    expect(f.session.getView().state.outcome?.reason).toBe('repetition')
    ready(f, terminal)
    expect(f.session.getView().capabilities.move).toBe(false)
    expect(() => fixture({ start: { type: 'resume', credentials, record: { ...terminal, revision: 0 } } })).toThrow()
})

test('absence, room loss and invalid input disable play without changing the game; subscribers detach', () => {
    const f = fixture(); ready(f)
    const observer = vi.fn(), unsubscribe = f.session.subscribe(observer)
    f.socket.receive({ type: 'presence', gameId: 'game-1', peerConnected: false })
    expect(f.session.getView()).toMatchObject({ connection: 'waiting', capabilities: { move: false } })
    expect(f.session.getPossibleMoves({ x: 3, y: 0 }, f.session.getView().generation)).toEqual([])
    expect(f.session.validateMove('D11-D10', f.session.getView().generation).isValid).toBe(false)
    unsubscribe()
    const count = observer.mock.calls.length
    f.socket.receive({ type: 'error', code: 'room_closed', message: 'Room expired', requestId: 'unknown' })
    expect(observer).toHaveBeenCalledTimes(count)
    expect(f.session.getView()).toMatchObject({ connection: 'closed', state: { outcome: null } })
    const g = fixture(); ready(g)
    g.socket.callbacks!.message('malformed')
    expect(g.session.getView().connection).toBe('error')
    expect(g.session.getRecovery()!.record.revision).toBe(0)
})

async function settled(session: OnlineGameSession, condition: () => boolean) {
    await vi.waitFor(() => expect(condition(), JSON.stringify({ connection: session.getView().connection,
        online: session.getView().online, revision: session.getRecovery()?.record.revision })).toBe(true), { timeout: 3000, interval: 10 })
    expect(session.getView().online?.error).toBeNull()
}
test('two native WebSocket sessions against real relay synchronize moves, refresh recovery and peer absence', async () => {
    const relay = await startRelay({ port: 0 })
    try {
        const endpoint = `ws://127.0.0.1:${relay.port}/relay`
        const a = new OnlineGameSession({ endpoint, start: { type: 'create', side: 'defender' } }); sessions.push(a)
        await settled(a, () => !!a.getRecovery())
        const b = new OnlineGameSession({ endpoint, start: { type: 'join', roomCode: a.getRecovery()!.credentials.roomCode } }); sessions.push(b)
        await settled(a, () => a.getView().connection === 'ready' && b.getView().connection === 'ready')
        expect((await a.submitMove('D11-D10', a.getView().generation)).success).toBe(false)
        expect((await b.submitMove('D11-D10', b.getView().generation)).success).toBe(true)
        await settled(a, () => a.getView().capabilities.move && b.getView().connection === 'ready')
        await a.submitMove('F8-E8', a.getView().generation)
        await settled(b, () => b.getView().capabilities.move && a.getView().connection === 'ready')
        expect(a.getRecovery()!.record).toEqual(b.getRecovery()!.record)
        const recovery = a.getRecovery()!
        a.dispose()
        await settled(b, () => b.getView().connection === 'waiting')
        // Refresh from a shorter saved prefix while the other browser retains both moves.
        const short = createGameRecord(recovery.credentials.gameId, [])
        if (!short.success) throw new Error(short.error)
        const resumed = new OnlineGameSession({ endpoint, start: { type: 'resume', credentials: recovery.credentials, record: short.value.record } })
        sessions.push(resumed)
        await settled(resumed, () => resumed.getView().connection === 'ready' && b.getView().connection === 'ready')
        expect(resumed.getRecovery()!.record).toEqual(recovery.record)
        b.leave()
        await vi.waitFor(() => expect(resumed.getView().connection).toBe('closed'))
        expect(resumed.getRecovery()!.record.revision).toBe(2)
    } finally { sessions.forEach((s) => s.dispose()); await relay.close() }
})

test('a longer saved record survives reconnect to a continuously connected shorter peer and both peers refreshing', async () => {
    const relay = await startRelay({ port: 0 })
    try {
        const endpoint = `ws://127.0.0.1:${relay.port}/relay`
        let dropRecords = false
        const a = new OnlineGameSession({ endpoint, start: { type: 'create', side: 'attacker' }, socketFactory: (url) => {
            const socket = browserSocket(url)
            return { get readyState() { return socket.readyState }, get bufferedAmount() { return socket.bufferedAmount },
                close: () => socket.close(), listen: (callbacks) => socket.listen(callbacks), send: (text) => {
                    if (dropRecords && JSON.parse(text).body?.type === 'game-record') return
                    socket.send(text)
                } }
        } }); sessions.push(a)
        await settled(a, () => !!a.getRecovery())
        const b = new OnlineGameSession({ endpoint, start: { type: 'join', roomCode: a.getRecovery()!.credentials.roomCode } }); sessions.push(b)
        await settled(a, () => a.getView().connection === 'ready' && b.getView().connection === 'ready')
        dropRecords = true
        await a.submitMove('D11-D10', a.getView().generation)
        expect(a.getRecovery()!.record.revision).toBe(1)
        expect(b.getRecovery()!.record.revision).toBe(0)
        const saved = a.getRecovery()!
        a.dispose()
        await settled(b, () => b.getView().connection === 'waiting')
        const resumed = new OnlineGameSession({ endpoint, start: { type: 'resume', ...saved } }); sessions.push(resumed)
        await settled(resumed, () => resumed.getView().connection === 'ready' && b.getView().connection === 'ready')
        expect(b.getRecovery()!.record).toEqual(saved.record)
        const savedB = b.getRecovery()!
        resumed.dispose(); b.dispose()
        // Wait for relay close events to release both socket associations.
        await vi.waitFor(() => expect(relay.connectionCount).toBe(0))
        const a2 = new OnlineGameSession({ endpoint, start: { type: 'resume', ...saved } })
        const b2 = new OnlineGameSession({ endpoint, start: { type: 'resume', ...savedB } })
        sessions.push(a2, b2)
        await settled(a2, () => a2.getView().connection === 'ready' && b2.getView().connection === 'ready')
        expect(a2.getRecovery()!.record).toEqual(b2.getRecovery()!.record)
        expect(b2.getView().capabilities.move).toBe(true)
    } finally { sessions.forEach((s) => s.dispose()); await relay.close() }
})

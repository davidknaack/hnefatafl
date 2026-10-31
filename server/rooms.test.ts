import { expect, test } from 'vitest'
import { decodeClientMessage, RelayMessage } from '../shared/relayProtocol.js'
import { defaultRoomOptions, Peer, RoomOptions, Rooms } from './rooms.js'
import { RateBudget } from './relay.js'
import { configFromEnv } from './config.js'

class TestPeer implements Peer {
    messages: RelayMessage[] = []
    closed = false
    send(message: RelayMessage): boolean { this.messages.push(structuredClone(message)); return true }
    close(): void { this.closed = true }
    assignment() {
        const result = this.messages.find((m) => m.type === 'assigned')
        if (!result || result.type !== 'assigned') throw new Error('No assignment')
        return result
    }
    error(code: string): boolean { return this.messages.some((m) => m.type === 'error' && m.code === code) }
}
function fixture(options: Partial<RoomOptions> = {}) {
    let time = 0, serial = 0, code = 0
    const rooms = new Rooms({ version: '1.0.0', now: () => time,
        code: () => String.fromCharCode(65 + code++).repeat(6),
        gameId: () => `game-${++serial}`, token: () => `secret-${++serial}`,
        messageId: () => `relay-${++serial}`, ...options })
    return { rooms, advance: (ms: number) => { time += ms }, send: (peer: Peer, fields: object) => {
        const result = decodeClientMessage({ protocolVersion: 1, messageId: `request-${++serial}`, clientVersion: '1.0.0', ...fields })
        if (!result.success) throw new Error(result.error)
        rooms.handle(peer, result.value)
    } }
}

test.each(['attacker', 'defender'])('creator can choose %s and joiner gets the other side', (side) => {
    const { rooms, send } = fixture()
    const a = new TestPeer(), b = new TestPeer()
    send(a, { type: 'create', side })
    send(b, { type: 'join', roomCode: a.assignment().roomCode })
    expect(a.assignment().seat).toBe(side)
    expect(b.assignment().seat).not.toBe(side)
    expect(a.assignment().gameId).toBe(b.assignment().gameId)
    expect(a.assignment().token).not.toBe(b.assignment().token)
    expect(a.messages[a.messages.length - 1]).toMatchObject({ type: 'presence', peerConnected: true })
    expect(rooms.size).toBe(1)
})

test('disconnected claimed seats require tokens; duplicate resume and stale close cannot steal a seat', () => {
    const { rooms, send } = fixture()
    const a = new TestPeer(), b = new TestPeer(), stranger = new TestPeer(), resumed = new TestPeer()
    send(a, { type: 'create', side: 'attacker' })
    const { roomCode, gameId, token } = a.assignment()
    send(b, { type: 'join', roomCode })
    send(stranger, { type: 'resume', roomCode, gameId, token })
    expect(stranger.error('seat_in_use')).toBe(true)
    rooms.disconnect(a)
    expect(b.messages[b.messages.length - 1]).toMatchObject({ type: 'presence', peerConnected: false })
    send(stranger, { type: 'join', roomCode })
    expect(stranger.error('room_full')).toBe(true)
    send(stranger, { type: 'resume', roomCode, gameId, token: 'wrong' })
    expect(stranger.error('invalid_token')).toBe(true)
    send(stranger, { type: 'resume', roomCode, gameId: 'old-game', token })
    expect(stranger.error('room_not_found')).toBe(true)
    send(resumed, { type: 'resume', roomCode, gameId, token })
    expect(resumed.assignment().seat).toBe('attacker')
    rooms.disconnect(a)
    expect(rooms.has(resumed)).toBe(true)
    expect(b.messages[b.messages.length - 1]).toMatchObject({ type: 'presence', peerConnected: true })
    expect(resumed.messages.every((message) => message.type !== 'relayed')).toBe(true)
})

test('opaque messages only reach the room opponent, using assigned identity/version', () => {
    const { rooms, send } = fixture()
    const a = new TestPeer(), b = new TestPeer(), other = new TestPeer()
    send(a, { type: 'create', side: 'defender' })
    send(b, { type: 'join', roomCode: a.assignment().roomCode })
    send(other, { type: 'create', side: 'attacker' })
    const before = other.messages.length
    const body = { type: 'future-message', payload: { text: 'No game interpretation', values: [1, null, false] } }
    send(a, { type: 'peer', body, senderSeat: 'attacker', gameId: other.assignment().gameId })
    expect(b.messages[b.messages.length - 1]).toMatchObject({ type: 'relayed', senderSeat: 'defender', gameId: a.assignment().gameId, clientVersion: '1.0.0', body })
    expect(other.messages).toHaveLength(before)
    send(a, { type: 'peer', body, clientVersion: '2.0.0' })
    expect(a.error('version_changed')).toBe(true)
    send(a, { type: 'create', side: 'defender' })
    expect(a.error('already_joined')).toBe(true)
    rooms.disconnect(b)
    send(a, { type: 'peer', body })
    expect(a.error('peer_absent')).toBe(true)
})

test('leave closes the room and notifies both peers; late close does not recreate metadata', () => {
    const { rooms, send } = fixture()
    const a = new TestPeer(), b = new TestPeer()
    send(a, { type: 'create', side: 'attacker' })
    send(b, { type: 'join', roomCode: a.assignment().roomCode })
    send(a, { type: 'leave' })
    expect(a.error('room_closed') && b.error('room_closed')).toBe(true)
    expect(a.closed && b.closed).toBe(true)
    rooms.disconnect(a); rooms.disconnect(b)
    expect(rooms.size).toBe(0)
    send(new TestPeer(), { type: 'create', side: 'defender' })
    rooms.shutdown()
    expect(rooms.size).toBe(0)
})

test('idle expiry starts when both sockets disconnect, and resume clears the idle deadline', () => {
    const { rooms, send, advance } = fixture({ idleMs: 100, lifetimeMs: 1000 })
    const a = new TestPeer(), b = new TestPeer()
    send(a, { type: 'create', side: 'attacker' }); send(b, { type: 'join', roomCode: a.assignment().roomCode })
    rooms.disconnect(a); advance(200); rooms.sweep()
    expect(rooms.size).toBe(1)
    rooms.disconnect(b); advance(99); rooms.sweep()
    expect(rooms.size).toBe(1)
    const again = new TestPeer()
    send(again, { type: 'resume', ...pickResume(a.assignment()) })
    advance(101); rooms.sweep()
    expect(rooms.size).toBe(1)
    rooms.disconnect(again); advance(100); rooms.sweep()
    expect(rooms.size).toBe(0)
})
function pickResume(m: Extract<RelayMessage, { type: 'assigned' }>) {
    return { roomCode: m.roomCode, gameId: m.gameId, token: m.token }
}

test('absolute lifetime closes active rooms, including when handling a new request', () => {
    const { rooms, send, advance } = fixture({ lifetimeMs: 100 })
    const a = new TestPeer(), b = new TestPeer()
    send(a, { type: 'create', side: 'attacker' }); advance(100)
    send(b, { type: 'join', roomCode: a.assignment().roomCode })
    expect(a.closed).toBe(true)
    expect(b.error('room_not_found')).toBe(true)
    expect(rooms.size).toBe(0)
})

test('an expiring member cannot allocate a new room on its closing connection', () => {
    const { rooms, send, advance } = fixture({ lifetimeMs: 100 })
    const a = new TestPeer()
    send(a, { type: 'create', side: 'attacker' })
    advance(100)
    send(a, { type: 'create', side: 'defender' })
    expect(a.closed).toBe(true)
    expect(a.messages.filter((message) => message.type === 'assigned')).toHaveLength(1)
    expect(rooms.size).toBe(0)
})

test('capacity and code collisions are bounded; a used code cannot replace its room', () => {
    const f = fixture({ maxRooms: 1 })
    const a = new TestPeer(), b = new TestPeer()
    f.send(a, { type: 'create', side: 'attacker' }); f.send(b, { type: 'create', side: 'attacker' })
    expect(b.error('server_full')).toBe(true)
    const codes = ['AAAAAA', 'AAAAAA', 'BBBBBB']
    const g = fixture({ code: () => codes.shift() ?? 'BBBBBB' })
    const c = new TestPeer(), d = new TestPeer(), e = new TestPeer()
    g.send(c, { type: 'create', side: 'attacker' }); g.send(d, { type: 'create', side: 'attacker' })
    expect(d.assignment().roomCode).toBe('BBBBBB')
    g.send(e, { type: 'create', side: 'attacker' })
    expect(e.error('server_full')).toBe(true)
    expect(g.rooms.size).toBe(2)
    expect(defaultRoomOptions.code()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(defaultRoomOptions.token()).toMatch(/^[A-Za-z0-9_-]{43}$/)
})

test('rate budget refills without accumulating more than a burst', () => {
    const budget = new RateBudget(2, 1, 0)
    expect([budget.take(0), budget.take(0), budget.take(0)]).toEqual([true, true, false])
    expect(budget.take(500)).toBe(false)
    expect(budget.take(1000)).toBe(true)
    expect([budget.take(99999), budget.take(99999), budget.take(99999)]).toEqual([true, true, false])
})

test('configuration uses explicit numeric limits and exact browser origins', () => {
    expect(configFromEnv({}, '1.2.3')).toMatchObject({ host: '127.0.0.1', port: 8787, version: '1.2.3' })
    expect(configFromEnv({ RELAY_PORT: '0', RELAY_ORIGINS: 'https://example.com' }, '1.0.0')).toMatchObject({ port: 0, allowedOrigins: ['https://example.com'] })
    for (const env of [{ RELAY_RATE: '0' }, { RELAY_BURST: 'NaN' }, { RELAY_PORT: '' }, { RELAY_ORIGINS: 'https://example.com/path' }]) {
        expect(() => configFromEnv(env, '1.0.0')).toThrow()
    }
    expect(() => new Rooms({ maxRooms: 0 })).toThrow()
})

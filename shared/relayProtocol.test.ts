import { expect, test } from 'vitest'
import { decodeClientMessage, decodeRelayMessage, versionWarning } from './relayProtocol'
import { MAX_MESSAGE_BYTES, readJson } from './json'

const base = { protocolVersion: 1, messageId: 'msg-1', clientVersion: '1.0.0' }

test.each([
    { type: 'create', side: 'attacker' }, { type: 'create', side: 'defender' },
    { type: 'join', roomCode: 'ABC234' },
    { type: 'resume', roomCode: 'ABC234', gameId: 'game-1', token: 'secret' },
    { type: 'leave' }, { type: 'peer', body: { type: 'future-chat', payload: { text: 'hello', extras: [1, null] } } },
])('validates room client envelope %j', (message) => {
    expect(decodeClientMessage(JSON.stringify({ ...base, ...message }))).toEqual({ success: true, value: { ...base, ...message } })
})

test.each([
    { type: 'assigned', requestId: 'request', roomCode: 'ABC234', gameId: 'game-1', seat: 'defender', token: 'secret' },
    { type: 'presence', gameId: 'game-1', peerConnected: false },
    { type: 'relayed', gameId: 'game-1', senderSeat: 'attacker', body: { type: 'future', payload: 'opaque' } },
    { type: 'error', requestId: 'request', code: 'seat_in_use', message: 'Another tab is connected' },
])('validates relay envelope %j', (message) => {
    expect(decodeRelayMessage({ ...base, ...message })).toEqual({ success: true, value: { ...base, ...message } })
})

test('normalizes room codes and does not preserve forged sender/room/token fields on a peer request', () => {
    expect(decodeClientMessage({ ...base, type: 'join', roomCode: 'abc234' })).toMatchObject({ success: true, value: { roomCode: 'ABC234' } })
    const body = { type: 'game-record', payload: { completely: 'uninterpreted by the relay' } }
    expect(decodeClientMessage({ ...base, type: 'peer', body, senderSeat: 'defender', gameId: 'other', token: 'secret' }))
        .toEqual({ success: true, value: { ...base, type: 'peer', body } })
})

test.each([
    { type: 'create', side: 'spectator' }, { type: 'join', roomCode: 'long-code' },
    { type: 'resume', roomCode: 'ABC234', gameId: 'game-1' },
    { type: 'peer', body: { type: 'chat' } }, { type: 'peer', body: { type: '', payload: null } },
    { type: 'unknown' }, { type: 'leave', protocolVersion: 2 }, { type: 'leave', messageId: '' },
    { type: 'leave', clientVersion: 'invalid' },
])('rejects malformed client envelope %j', (change) => {
    expect(decodeClientMessage({ ...base, ...change }).success).toBe(false)
})

test('rejects malformed relay envelopes and oversized UTF-8 messages', () => {
    expect(decodeRelayMessage({ ...base, type: 'presence', gameId: 'game-1', peerConnected: 'yes' }).success).toBe(false)
    expect(decodeRelayMessage({ ...base, type: 'assigned', requestId: 'x', roomCode: 'ABC234', gameId: 'x', seat: 'attacker' }).success).toBe(false)
    expect(decodeRelayMessage({ ...base, type: 'relayed', gameId: 'x', senderSeat: 'spectator', body: { type: 'chat', payload: null } }).success).toBe(false)
    expect(decodeClientMessage(JSON.stringify({ ...base, type: 'peer', body: { type: 'chat', payload: '界'.repeat(MAX_MESSAGE_BYTES / 3) } })).success).toBe(false)
    expect(readJson('{').success).toBe(false)
    const cycle: { self?: unknown } = {}; cycle.self = cycle
    expect(readJson(cycle).success).toBe(false)
})

test('version differences are diagnostic, independent of protocol compatibility', () => {
    expect(versionWarning('1.0.0', '1.8.0-beta.1+build')).toBeNull()
    expect(versionWarning('1.0.0', '2.0.0')).toContain('major versions differ')
    expect(decodeClientMessage({ ...base, type: 'leave', clientVersion: '2.0.0' }).success).toBe(true)
    expect(decodeClientMessage({ ...base, type: 'leave', protocolVersion: 2 }).success).toBe(false)
})

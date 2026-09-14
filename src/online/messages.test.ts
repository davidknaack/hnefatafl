import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { createGameRecord } from './record'
import { acknowledgesRecord, decodePeerMessage, GameRecordMessage, RecordAck } from './messages'
import { CLIENT_VERSION } from './clientVersion'

const envelope = { protocolVersion: 1, messageId: 'peer-msg', clientVersion: '2.0.0',
    type: 'relayed', gameId: 'game-1', senderSeat: 'attacker' }
function emptyRecord() {
    const result = createGameRecord('game-1', [])
    if (!result.success) throw new Error(result.error)
    return result.value.record
}

test('build client version comes from package metadata', () => {
    expect(CLIENT_VERSION).toBe(JSON.parse(readFileSync('package.json', 'utf8')).version)
})

test('a software major difference does not reject a compatible empty record', () => {
    const result = decodePeerMessage({ ...envelope, body: {
        type: 'game-record', payload: { record: emptyRecord(), syncId: 'sync-1' },
    } })
    expect(result.success).toBe(true)
    if (!result.success || result.value.type !== 'game-record') throw new Error('Expected record')
    expect(result.value.engine.getState().moveHistory).toEqual([])
    expect(result.value.payload.record).toEqual(emptyRecord())
})

test('unknown typed peer feature is unsupported, not a malformed core message', () => {
    expect(decodePeerMessage({ ...envelope, body: { type: 'future-chat', payload: ['anything'] } }))
        .toEqual({ success: true, value: { type: 'unsupported', messageType: 'future-chat' } })
    expect(decodePeerMessage({ ...envelope, body: { type: 'game-record', payload: ['anything'] } }).success).toBe(false)
})

test('checks game association before replay and validates sync requests', () => {
    expect(decodePeerMessage({ ...envelope, body: { type: 'game-record', payload: {
        record: { ...emptyRecord(), gameId: 'other-game' }, syncId: null,
    } } }).success).toBe(false)
    const body = { type: 'sync-request', payload: { gameId: 'game-1', syncId: 'sync-1' } }
    expect(decodePeerMessage({ ...envelope, body })).toEqual({ success: true, value: body })
    expect(decodePeerMessage({ ...envelope, body: { ...body, payload: { ...body.payload, gameId: 'other' } } }).success).toBe(false)
})

test('acknowledges only the exact sent record message and synchronization exchange', () => {
    const sent: GameRecordMessage = { type: 'game-record', payload: { record: emptyRecord(), syncId: 'sync-1' } }
    const ack: RecordAck = { type: 'record-ack', payload: { gameId: 'game-1', revision: 0, recordMessageId: 'sent-1', syncId: 'sync-1' } }
    expect(decodePeerMessage({ ...envelope, body: ack })).toEqual({ success: true, value: ack })
    expect(acknowledgesRecord(ack, sent, 'sent-1')).toBe(true)
    for (const change of [{ gameId: 'game-2' }, { revision: 1 }, { recordMessageId: 'old' }, { syncId: null }, { syncId: 'old-sync' }]) {
        expect(acknowledgesRecord({ ...ack, payload: { ...ack.payload, ...change } }, sent, 'sent-1')).toBe(false)
    }
    expect(acknowledgesRecord(ack, sent, 'new-message')).toBe(false)
})

test.each([-1, 1.5, '1', 2049])('rejects invalid acknowledgement revision %j', (revision) => {
    expect(decodePeerMessage({ ...envelope, body: { type: 'record-ack', payload: {
        gameId: 'game-1', revision, recordMessageId: 'm', syncId: null,
    } } }).success).toBe(false)
})

test('ack and game-record require explicit synchronization correlation', () => {
    expect(decodePeerMessage({ ...envelope, body: { type: 'record-ack', payload: {
        gameId: 'game-1', revision: 0, recordMessageId: 'm',
    } } }).success).toBe(false)
    expect(decodePeerMessage({ ...envelope, body: { type: 'game-record', payload: { record: emptyRecord() } } }).success).toBe(false)
})

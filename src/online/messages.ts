import { failure, id, object, Result } from '../../shared/json'
import { decodeRelayMessage } from '../../shared/relayProtocol'
import { HnefataflEngine } from '../HnefataflEngine'
import { decodeGameRecord, MAX_MOVES, OnlineGameRecordV1 } from './record'

export interface SyncRequest { type: 'sync-request'; payload: { gameId: string; syncId: string } }
export interface RecordAck {
    type: 'record-ack'
    payload: { gameId: string; revision: number; recordMessageId: string; syncId: string | null }
}
export interface GameRecordMessage {
    type: 'game-record'
    payload: { record: OnlineGameRecordV1; syncId: string | null }
}
export type DecodedPeerMessage = SyncRequest | RecordAck |
    (GameRecordMessage & { engine: HnefataflEngine }) |
    { type: 'unsupported'; messageType: string }

function syncId(value: unknown): value is string | null { return value === null || id(value) }

/** Client-only validation of forwarded bodies. Unknown features do not break the room. */
export function decodePeerMessage(input: unknown): Result<DecodedPeerMessage> {
    const parsed = decodeRelayMessage(input)
    if (!parsed.success) return parsed
    const envelope = parsed.value
    if (envelope.type !== 'relayed') return failure('Expected relayed peer message')
    const { type, payload: v } = envelope.body
    if (!['sync-request', 'game-record', 'record-ack'].includes(type)) {
        return { success: true, value: { type: 'unsupported', messageType: type } }
    }
    if (!object(v)) return failure('Invalid synchronization payload')
    if (type === 'game-record') {
        if (!syncId(v.syncId)) return failure('Invalid sync ID')
        if (!object(v.record) || v.record.gameId !== envelope.gameId) return failure('Wrong game ID')
        const replay = decodeGameRecord(v.record)
        if (!replay.success) return replay
        return { success: true, value: {
            type, payload: { record: replay.value.record, syncId: v.syncId }, engine: replay.value.engine,
        } }
    }
    if (v.gameId !== envelope.gameId) return failure('Wrong game ID')
    if (type === 'sync-request' && id(v.syncId)) {
        return { success: true, value: { type, payload: { gameId: envelope.gameId, syncId: v.syncId } } }
    }
    if (type === 'record-ack' && Number.isInteger(v.revision) && typeof v.revision === 'number' &&
        v.revision >= 0 && v.revision <= MAX_MOVES && id(v.recordMessageId) && syncId(v.syncId)) {
        return { success: true, value: { type, payload: {
            gameId: envelope.gameId, revision: v.revision, recordMessageId: v.recordMessageId, syncId: v.syncId,
        } } }
    }
    return failure('Invalid synchronization payload')
}

/** Caller must also require the same live connection generation (P5). */
export function acknowledgesRecord(ack: RecordAck, sent: GameRecordMessage, sentMessageId: string): boolean {
    return ack.payload.recordMessageId === sentMessageId && ack.payload.gameId === sent.payload.record.gameId &&
        ack.payload.revision === sent.payload.record.revision && ack.payload.syncId === sent.payload.syncId
}

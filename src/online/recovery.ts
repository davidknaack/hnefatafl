import { failure, object, readJson, Result, text } from '../../shared/json'
import { decodeClientMessage, isClientVersion } from '../../shared/relayProtocol'
import type { RoomCredentials } from '../session/OnlineGameSession'
import { compareRecords, decodeGameRecord, OnlineGameRecordV1 } from './record'
import { validRelayEndpoint } from './endpoint'

export const RECOVERY_KEY = 'hnefatafl.online.recent.v1'
export const MAX_RECOVERY_BYTES = 128 * 1024
export interface RecoveryEnvelope {
    storageVersion: 1
    endpoint: string
    credentials: RoomCredentials
    clientVersion: string
    savedAt: number
    resume: boolean
    record: OnlineGameRecordV1
    conflict: OnlineGameRecordV1 | null
}
export type RecoveryLoad = { kind: 'empty' } | { kind: 'saved'; value: RecoveryEnvelope } |
    { kind: 'invalid' | 'unavailable'; error: string }
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>

export function decodeRecovery(input: unknown): Result<RecoveryEnvelope> {
    const bounded = readJson(input, MAX_RECOVERY_BYTES)
    if (!bounded.success) return bounded
    const v = bounded.value
    if (!object(v) || v.storageVersion !== 1) return failure('Unsupported recovery storage version')
    if (!text(v.endpoint, 2048) || !isClientVersion(v.clientVersion) || !Number.isSafeInteger(v.savedAt) ||
        typeof v.savedAt !== 'number' || v.savedAt < 0 || typeof v.resume !== 'boolean' || !object(v.credentials)) return failure('Invalid recovery metadata')
    if (!validRelayEndpoint(v.endpoint)) return failure('Invalid saved relay endpoint')
    const c = v.credentials
    const control = decodeClientMessage({ protocolVersion: 1, messageId: 'restore', clientVersion: v.clientVersion,
        type: 'resume', roomCode: c.roomCode, gameId: c.gameId, token: c.token })
    if (!control.success || control.value.type !== 'resume' || !['attacker', 'defender'].includes(String(c.seat))) return failure('Invalid saved room credentials')
    const game = decodeGameRecord(v.record)
    if (!game.success) return failure(`Saved game: ${game.error}`)
    if (game.value.record.gameId !== c.gameId) return failure('Saved room/game mismatch')
    let conflict: OnlineGameRecordV1 | null = null
    if (v.conflict !== null) {
        const other = decodeGameRecord(v.conflict)
        if (!other.success || compareRecords(game.value.record, other.value.record) !== 'divergent' || v.resume) return failure('Invalid saved conflict')
        conflict = other.value.record
    }
    return { success: true, value: { storageVersion: 1, endpoint: v.endpoint, clientVersion: v.clientVersion,
        savedAt: v.savedAt, resume: v.resume, record: game.value.record, conflict,
        credentials: { roomCode: control.value.roomCode, gameId: control.value.gameId, token: control.value.token,
            seat: c.seat as RoomCredentials['seat'] } } }
}

/** One origin-wide slot. Failed reads/writes never erase it or imply a successful save. */
export class RecoveryStore {
    private raw: string | null = null
    private readable = false
    private replace = false
    private previous: RecoveryEnvelope | null = null
    constructor(private storage: () => StoragePort = () => localStorage) {}
    load(): RecoveryLoad {
        this.previous = null; this.replace = false
        try { this.raw = this.storage().getItem(RECOVERY_KEY); this.readable = true }
        catch { this.readable = false; return { kind: 'unavailable', error: 'Browser storage is unavailable; refresh recovery cannot be saved.' } }
        if (this.raw === null) return { kind: 'empty' }
        const parsed = decodeRecovery(this.raw)
        if (!parsed.success) return { kind: 'invalid', error: parsed.error }
        this.previous = parsed.value
        return { kind: 'saved', value: structuredClone(parsed.value) }
    }
    hasSaved(): boolean { return this.raw !== null }
    /** Private backup only; never render or copy this string into general game output. */
    backup(): string | null { return this.raw }
    permitReplacement(): void { this.replace = true }
    save(value: RecoveryEnvelope): Result<true> {
        if (!this.readable) return failure('Browser storage is unavailable; refresh recovery cannot be saved.')
        const decoded = decodeRecovery(value)
        if (!decoded.success) return decoded
        const next = decoded.value
        if (this.raw !== null && !this.replace) {
            if (!this.previous) return failure('Existing recovery data is incompatible and has been preserved.')
            const sameSeat = JSON.stringify(this.previous.credentials) === JSON.stringify(next.credentials) && this.previous.endpoint === next.endpoint
            const relation = compareRecords(this.previous.record, next.record)
            if (!sameSeat || !['equal', 'extends'].includes(relation)) return failure('A different or longer saved game has been preserved.')
        }
        try {
            const storage = this.storage()
            if (storage.getItem(RECOVERY_KEY) !== this.raw) return failure('Recovery was changed in another tab. This tab cannot overwrite it; Copy Game to retain these moves.')
            if (this.previous && JSON.stringify({ ...next, savedAt: this.previous.savedAt }) === JSON.stringify(this.previous)) {
                this.replace = false
                return { success: true, value: true }
            }
            const encoded = JSON.stringify(next)
            storage.setItem(RECOVERY_KEY, encoded)
            // Some restricted storage implementations silently ignore writes.
            if (storage.getItem(RECOVERY_KEY) !== encoded) return failure('Browser did not retain the recovery save. Keep this tab open and Copy Game.')
            this.raw = encoded; this.previous = next; this.replace = false
            return { success: true, value: true }
        } catch { return failure('Could not save recovery (storage blocked or full). Keep this tab open and Copy Game.') }
    }
}

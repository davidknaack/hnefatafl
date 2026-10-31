import { RecoveryEnvelope, RecoveryLoad, RecoveryStore } from '../online/recovery'
import { CLIENT_VERSION } from '../online/clientVersion'
import { compareRecords } from '../online/record'
import { OnlineGameSession } from './OnlineGameSession'

type Recoverable = Pick<OnlineGameSession, 'getRecovery' | 'getConflictRecord'>
/** Shared credential-bearing persistence policy; independent of either DOM consumer. */
export class SessionRecovery {
    saved: RecoveryEnvelope | null
    status: string
    private signature: string
    constructor(readonly store = new RecoveryStore(), readonly loaded: RecoveryLoad = store.load()) {
        this.saved = loaded.kind === 'saved' ? loaded.value : null
        this.status = loaded.kind === 'invalid' ? `Saved recovery could not be opened: ${loaded.error}. The original data is preserved for private backup.`
            : loaded.kind === 'unavailable' ? loaded.error : loaded.kind === 'saved' ? 'Online game recovered from this browser.' : ''
        this.signature = this.saved ? JSON.stringify({ storageVersion: 1, endpoint: this.saved.endpoint,
            credentials: this.saved.credentials, record: this.saved.record, clientVersion: CLIENT_VERSION,
            resume: this.saved.resume, conflict: this.saved.conflict }) : ''
    }
    permitReplacement() { this.store.permitReplacement(); this.signature = '' }
    persist(session: Recoverable, resume: boolean) {
        const snapshot = session.getRecovery()
        if (!snapshot) return
        const conflict = session.getConflictRecord() ?? (this.saved && compareRecords(this.saved.record, snapshot.record) === 'equal' ? this.saved.conflict : null)
        const content = { storageVersion: 1 as const, ...snapshot, clientVersion: CLIENT_VERSION, resume: resume && !conflict, conflict }
        const signature = JSON.stringify(content)
        if (signature === this.signature) return
        const envelope = { ...content, savedAt: Date.now() }
        const result = this.store.save(envelope)
        if (result.success) {
            this.saved = envelope; this.signature = signature
            this.status = envelope.resume ? 'Online game saved in this browser.' : 'Online record retained; automatic reconnect is off.'
        } else this.status = result.error
    }
}

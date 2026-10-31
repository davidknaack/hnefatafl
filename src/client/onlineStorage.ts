import { decodeAnnotations } from '../online/annotations'
import { OnlineStudySession } from '../session/OnlineStudySession'
import { LocalGameStorage } from './localGameStorage'
import { readJson, object } from '../../shared/json'
import { RoomCredentials } from '../session/OnlineGameSession'

export const ONLINE_PRESENTATION_KEY = 'hnefatafl.online.presentation.v1'
export const CLIENT_PREFERENCE_KEY = 'hnefatafl.client.preferences.v1'
/** No tokens. Kept separate from both local studies and online credential recovery. */
export class OnlineStorage {
    private raw: string | null | undefined
    private preserve = false
    status = ''
    constructor(private storage: (() => LocalGameStorage) | null) {}
    preferences(): { name: string; mode: 'local' | 'online' | null } {
        try {
            const value = JSON.parse(this.storage?.().getItem(CLIENT_PREFERENCE_KEY) ?? 'null')
            return { name: typeof value?.name === 'string' ? value.name : '', mode: ['local', 'online'].includes(value?.mode) ? value.mode : null }
        } catch { return { name: '', mode: null } }
    }
    prefer(mode: 'local' | 'online', name = this.preferences().name) {
        try { this.storage?.().setItem(CLIENT_PREFERENCE_KEY, JSON.stringify({ name, mode })) }
        catch { this.status = 'Browser preferences could not be saved.' }
    }
    restore(endpoint: string, credentials: RoomCredentials): { annotations?: unknown; cursor?: number | null } {
        if (!this.storage) return {}
        try {
            this.raw = this.storage().getItem(ONLINE_PRESENTATION_KEY)
            if (!this.raw) return {}
            const decoded = readJson(this.raw, 64 * 1024)
            if (!decoded.success || !object(decoded.value)) throw new Error('Invalid saved comments')
            const value = decoded.value
            if (value.version !== 1 || value.endpoint !== endpoint || value.gameId !== credentials.gameId || value.seat !== credentials.seat) {
                this.preserve = true; this.status = 'Other or unsupported saved comments have been preserved.'; return {}
            }
            if (value.cursor !== null && (!Number.isInteger(value.cursor) || Number(value.cursor) < 0)) throw new Error('Invalid saved review position')
            const annotations = decodeAnnotations(value.annotations)
            if (annotations.gameId !== credentials.gameId) throw new Error('Saved comment game mismatch')
            return { annotations, cursor: value.cursor as number | null }
        } catch { this.preserve = true; this.status = 'Saved comments could not be restored. The original data is preserved.'; return {} }
    }
    permitReplacement() {
        this.preserve = false
        try { this.raw = this.storage?.().getItem(ONLINE_PRESENTATION_KEY) ?? null }
        catch { this.raw = undefined }
    }
    save(session: OnlineStudySession) {
        if (!this.storage || this.preserve) return
        const recovery = session.getRecovery(), annotations = session.getAnnotations()
        if (!recovery || !annotations) return
        try {
            const storage = this.storage()
            if (this.raw === undefined || storage.getItem(ONLINE_PRESENTATION_KEY) !== this.raw) throw new Error('Saved comments changed in another tab or could not be read. Export to retain this copy.')
            const value = JSON.stringify({ version: 1, endpoint: recovery.endpoint, gameId: recovery.credentials.gameId,
                seat: recovery.credentials.seat, annotations, cursor: session.getCursor() })
            if (value === this.raw) return
            storage.setItem(ONLINE_PRESENTATION_KEY, value)
            if (storage.getItem(ONLINE_PRESENTATION_KEY) !== value) throw new Error('Browser did not retain the comments.')
            this.raw = value; this.status = 'Names, comments and review position saved in this browser.'
        } catch (error) { this.status = `${error instanceof Error ? error.message : 'Could not save comments.'} Keep this tab open and use Save / copy.` }
    }
    backup() { try { return this.storage?.().getItem(ONLINE_PRESENTATION_KEY) ?? null } catch { return null } }
}

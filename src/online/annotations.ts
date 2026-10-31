import { id, object, readJson } from '../../shared/json'
import { Seat } from '../../shared/relayProtocol'
import { MAX_COMMENT_LENGTH, normalizeComment } from '../moveComments'
import { createGameRecord } from './record'

export const MAX_ANNOTATION_BYTES = 48 * 1024
export const MAX_ONLINE_COMMENTS = 128
export interface OnlineProfile { revision: number; name: string }
export interface OnlineComment {
    id: string
    seat: Seat
    author?: string
    text: string
    order: number
    /** Exact canonical ancestry; a comment can never migrate to another branch. */
    prefix: string[]
}
export interface AnnotationState {
    version: 1
    gameId: string
    profiles: Partial<Record<Seat, OnlineProfile>>
    comments: OnlineComment[]
}
export function screenName(value: string): string {
    const name = value.trim()
    if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error('Names must be on one line without control characters.')
    if (name) normalizeComment('', name)
    return name
}
export function emptyAnnotations(gameId: string): AnnotationState {
    return { version: 1, gameId, profiles: {}, comments: [] }
}
export function decodeAnnotations(input: unknown): AnnotationState {
    const parsed = readJson(input, MAX_ANNOTATION_BYTES)
    if (!parsed.success) throw new Error(parsed.error)
    const value = parsed.value
    if (!object(value) || value.version !== 1 || !id(value.gameId) || !object(value.profiles) ||
        !Array.isArray(value.comments) || value.comments.length > MAX_ONLINE_COMMENTS) throw new Error('Invalid online annotations')
    const result = emptyAnnotations(value.gameId)
    for (const seat of ['attacker', 'defender'] as const) {
        const profile = value.profiles[seat]
        if (profile === undefined) continue
        if (!object(profile) || !Number.isSafeInteger(profile.revision) || Number(profile.revision) < 1 || typeof profile.name !== 'string') throw new Error('Invalid player name')
        result.profiles[seat] = { revision: profile.revision as number, name: screenName(profile.name) }
    }
    const ids = new Set<string>()
    for (const comment of value.comments) {
        if (!object(comment) || !id(comment.id) || ids.has(comment.id) ||
            !['attacker', 'defender'].includes(String(comment.seat)) || typeof comment.text !== 'string' ||
            !comment.text.trim() || Array.from(comment.text).length > MAX_COMMENT_LENGTH ||
            !Number.isSafeInteger(comment.order) || Number(comment.order) < 1 ||
            (comment.author !== undefined && (typeof comment.author !== 'string' || !screenName(comment.author))) ||
            !Array.isArray(comment.prefix) || !comment.prefix.length) throw new Error('Invalid online comment')
        const replay = createGameRecord(result.gameId, comment.prefix as string[])
        if (!replay.success || JSON.stringify(replay.value.record.moves) !== JSON.stringify(comment.prefix)) throw new Error('Invalid comment move reference')
        ids.add(comment.id)
        result.comments.push({ id: comment.id, seat: comment.seat as Seat, text: comment.text,
            order: comment.order as number, prefix: replay.value.record.moves,
            ...(comment.author === undefined ? {} : { author: screenName(comment.author as string) }) })
    }
    result.comments.sort((a, b) => a.order - b.order || (a.seat === b.seat ? 0 : a.seat === 'attacker' ? -1 : 1) || (a.id === b.id ? 0 : a.id < b.id ? -1 : 1))
    // Reserving each seat's share keeps concurrent valid additions mergeable.
    for (const seat of ['attacker', 'defender'] as const) {
        const comments = result.comments.filter(comment => comment.seat === seat)
        if (comments.length > MAX_ONLINE_COMMENTS / 2 || new TextEncoder().encode(JSON.stringify({ profile: result.profiles[seat], comments })).length > 22 * 1024) {
            throw new Error('Your online comment storage limit is reached (64 comments or 22 KiB). Save / copy retains the game.')
        }
    }
    return result
}
export function mergeAnnotations(local: AnnotationState, incoming: AnnotationState): AnnotationState {
    if (local.gameId !== incoming.gameId) throw new Error('Annotations belong to another game')
    const next = structuredClone(local)
    for (const seat of ['attacker', 'defender'] as const) {
        const profile = incoming.profiles[seat], previous = next.profiles[seat]
        if (profile && (!previous || profile.revision > previous.revision)) next.profiles[seat] = profile
        else if (profile && previous && profile.revision === previous.revision && profile.name !== previous.name) throw new Error('Conflicting player names retained locally')
    }
    for (const comment of incoming.comments) {
        const previous = next.comments.find(value => value.id === comment.id)
        if (previous && JSON.stringify(previous) !== JSON.stringify(comment)) throw new Error('Conflicting comment retained locally')
        if (!previous) next.comments.push(comment)
    }
    return decodeAnnotations(next)
}

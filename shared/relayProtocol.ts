import { failure, id, object, readJson, text, JsonValue, Result } from './json.js'

export const PROTOCOL_VERSION = 1
export type Seat = 'attacker' | 'defender'
export interface PeerBody { type: string; payload: JsonValue }
export interface Envelope {
    protocolVersion: 1
    messageId: string
    clientVersion: string
}
export type ClientMessage = Envelope & (
    | { type: 'create'; side: Seat }
    | { type: 'join'; roomCode: string }
    | { type: 'resume'; roomCode: string; gameId: string; token: string }
    | { type: 'leave' }
    | { type: 'peer'; body: PeerBody }
)
export type RelayMessage = Envelope & (
    | { type: 'assigned'; requestId: string; roomCode: string; gameId: string; seat: Seat; token: string }
    | { type: 'presence'; gameId: string; peerConnected: boolean }
    | { type: 'relayed'; gameId: string; senderSeat: Seat; body: PeerBody }
    | { type: 'error'; requestId: string; code: string; message: string }
)

export function isClientVersion(value: unknown): value is string {
    return text(value) && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value)
}

export function versionWarning(local: string, remote: string): string | null {
    if (!isClientVersion(local) || !isClientVersion(remote)) return 'Unrecognized client version'
    return local.split('.')[0] === remote.split('.')[0] ? null
        : `Client major versions differ (${local} / ${remote}); replay will check compatibility`
}

function seat(value: unknown): value is Seat { return value === 'attacker' || value === 'defender' }
function room(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z2-9]{6}$/.test(value) }
function token(value: unknown): value is string { return text(value, 256) && /^[A-Za-z0-9_-]+$/.test(value) }
function body(value: unknown): value is PeerBody {
    return object(value) && text(value.type) && /^[a-z][a-z0-9-]*$/.test(value.type) && 'payload' in value
}

function envelope(input: unknown): Result<Record<string, unknown> & Envelope> {
    const parsed = readJson(input)
    if (!parsed.success) return parsed
    const value = parsed.value
    if (!object(value)) return failure('Expected message object')
    if (value.protocolVersion !== PROTOCOL_VERSION) return failure('Unsupported protocol version')
    if (!id(value.messageId) || !isClientVersion(value.clientVersion)) return failure('Invalid message identity/version')
    return { success: true, value: value as Record<string, unknown> & Envelope }
}

/** Shape validation only; P4 must bind messages to a socket and authorize room membership. */
export function decodeClientMessage(input: unknown): Result<ClientMessage> {
    const parsed = envelope(input)
    if (!parsed.success) return parsed
    const v = parsed.value
    const base: Envelope = { protocolVersion: 1, messageId: v.messageId, clientVersion: v.clientVersion }
    switch (v.type) {
        case 'create':
            if (seat(v.side)) return { success: true, value: { ...base, type: v.type, side: v.side } }
            break
        case 'join':
            if (room(v.roomCode)) return { success: true, value: { ...base, type: v.type, roomCode: v.roomCode.toUpperCase() } }
            break
        case 'resume':
            if (room(v.roomCode) && id(v.gameId) && token(v.token)) return { success: true, value: {
                ...base, type: v.type, roomCode: v.roomCode.toUpperCase(), gameId: v.gameId, token: v.token,
            } }
            break
        case 'leave': return { success: true, value: { ...base, type: v.type } }
        case 'peer':
            if (body(v.body)) return { success: true, value: {
                ...base, type: v.type, body: { type: v.body.type, payload: v.body.payload },
            } }
    }
    return failure('Invalid client message')
}

export function decodeRelayMessage(input: unknown): Result<RelayMessage> {
    const parsed = envelope(input)
    if (!parsed.success) return parsed
    const v = parsed.value
    const base: Envelope = { protocolVersion: 1, messageId: v.messageId, clientVersion: v.clientVersion }
    switch (v.type) {
        case 'assigned':
            if (id(v.requestId) && room(v.roomCode) && id(v.gameId) && seat(v.seat) && token(v.token)) return {
                success: true, value: { ...base, type: v.type, requestId: v.requestId,
                    roomCode: v.roomCode.toUpperCase(), gameId: v.gameId, seat: v.seat, token: v.token },
            }
            break
        case 'presence':
            if (id(v.gameId) && typeof v.peerConnected === 'boolean') return { success: true,
                value: { ...base, type: v.type, gameId: v.gameId, peerConnected: v.peerConnected } }
            break
        case 'relayed':
            if (id(v.gameId) && seat(v.senderSeat) && body(v.body)) return { success: true, value: {
                ...base, type: v.type, gameId: v.gameId, senderSeat: v.senderSeat,
                body: { type: v.body.type, payload: v.body.payload },
            } }
            break
        case 'error':
            if (id(v.requestId) && id(v.code) && text(v.message, 512)) return { success: true,
                value: { ...base, type: v.type, requestId: v.requestId, code: v.code, message: v.message } }
    }
    return failure('Invalid relay message')
}

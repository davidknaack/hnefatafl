import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { ClientMessage, RelayMessage, Seat } from '../shared/relayProtocol.js'

export interface Peer {
    send(message: RelayMessage): boolean
    close(): void
}
interface Slot { token: string; peer: Peer | null; version: string }
interface Room {
    code: string
    gameId: string
    createdAt: number
    idleSince: number | null
    slots: Partial<Record<Seat, Slot>>
}
export interface RoomOptions {
    version: string
    maxRooms: number
    idleMs: number
    lifetimeMs: number
    now: () => number
    code: () => string
    gameId: () => string
    token: () => string
    messageId: () => string
}
export const defaultRoomOptions: RoomOptions = {
    version: '0.0.0', maxRooms: 100, idleMs: 30 * 60_000, lifetimeMs: 24 * 60 * 60_000,
    now: Date.now,
    code: () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join(''),
    gameId: randomUUID, token: () => randomBytes(32).toString('base64url'), messageId: randomUUID,
}
const opposite = (seat: Seat): Seat => seat === 'attacker' ? 'defender' : 'attacker'

/** Operational metadata only. Peer payloads pass directly through handle(), never into a room. */
export class Rooms {
    private rooms = new Map<string, Room>()
    private memberships = new Map<Peer, { room: Room; seat: Seat }>()
    private options: RoomOptions
    constructor(options: Partial<RoomOptions> = {}) {
        this.options = { ...defaultRoomOptions, ...options }
        for (const key of ['maxRooms', 'idleMs', 'lifetimeMs'] as const) {
            if (!Number.isSafeInteger(this.options[key]) || this.options[key] < 1) throw new Error(`Invalid ${key}`)
        }
    }
    get size(): number { return this.rooms.size }
    has(peer: Peer): boolean { return this.memberships.has(peer) }

    private base() {
        return { protocolVersion: 1 as const, messageId: this.options.messageId(), clientVersion: this.options.version }
    }

    error(peer: Peer, requestId: string, code: string, message: string): void {
        peer.send({ ...this.base(), type: 'error', requestId, code, message })
    }

    private presence(room: Room): void {
        for (const seat of ['attacker', 'defender'] as const) {
            room.slots[seat]?.peer?.send({ ...this.base(), type: 'presence', gameId: room.gameId,
                peerConnected: !!room.slots[opposite(seat)]?.peer })
        }
    }

    private assign(room: Room, seat: Seat, peer: Peer, request: ClientMessage, token: string): void {
        room.slots[seat] = { token, peer, version: request.clientVersion }
        room.idleSince = null
        this.memberships.set(peer, { room, seat })
        peer.send({ ...this.base(), type: 'assigned', requestId: request.messageId,
            roomCode: room.code, gameId: room.gameId, seat, token })
        this.presence(room)
    }

    handle(peer: Peer, request: ClientMessage): void {
        const wasMember = this.memberships.has(peer)
        this.sweep()
        // Expiry has already notified and closed this connection. Do not assign
        // a fresh room to the same socket while that close is still in flight.
        if (wasMember && !this.memberships.has(peer)) return
        const member = this.memberships.get(peer)
        if (request.type === 'peer' || request.type === 'leave') {
            if (!member) return this.error(peer, request.messageId, 'not_in_room', 'Join or resume a room first')
            const slot = member.room.slots[member.seat]!
            if (slot.version !== request.clientVersion) {
                return this.error(peer, request.messageId, 'version_changed', 'Reconnect to change client version')
            }
            if (request.type === 'leave') return this.remove(member.room, request.messageId, 'A player left the room')
            const target = member.room.slots[opposite(member.seat)]?.peer
            if (!target) return this.error(peer, request.messageId, 'peer_absent', 'The other player is disconnected')
            const sent = target.send({ protocolVersion: 1, messageId: request.messageId,
                clientVersion: slot.version, type: 'relayed', gameId: member.room.gameId,
                senderSeat: member.seat, body: request.body })
            if (!sent) this.error(peer, request.messageId, 'delivery_failed', 'Peer update could not be delivered')
            return
        }
        if (member) return this.error(peer, request.messageId, 'already_joined', 'This connection already occupies a seat')
        if (request.type === 'create') {
            if (this.rooms.size >= this.options.maxRooms) return this.error(peer, request.messageId, 'server_full', 'Room capacity reached')
            let code = ''
            for (let attempt = 0; attempt < 32; attempt++) {
                const candidate = this.options.code()
                if (!this.rooms.has(candidate)) { code = candidate; break }
            }
            if (!code) return this.error(peer, request.messageId, 'server_full', 'Could not allocate a room code')
            const room: Room = { code, gameId: this.options.gameId(), createdAt: this.options.now(), idleSince: null, slots: {} }
            this.rooms.set(code, room)
            this.assign(room, request.side, peer, request, this.options.token())
            return
        }
        const room = this.rooms.get(request.roomCode)
        if (!room) return this.error(peer, request.messageId, 'room_not_found', 'Room expired or does not exist')
        if (request.type === 'join') {
            const seat = !room.slots.attacker ? 'attacker' : !room.slots.defender ? 'defender' : null
            if (!seat) return this.error(peer, request.messageId, 'room_full', 'Both seats are reserved')
            this.assign(room, seat, peer, request, this.options.token())
            return
        }
        if (request.gameId !== room.gameId) return this.error(peer, request.messageId, 'room_not_found', 'This game instance no longer exists')
        const seat = (['attacker', 'defender'] as const).find((s) => room.slots[s]?.token === request.token)
        if (!seat) return this.error(peer, request.messageId, 'invalid_token', 'Reconnect token does not match a seat')
        if (room.slots[seat]!.peer) return this.error(peer, request.messageId, 'seat_in_use', 'Another connection is using this seat')
        this.assign(room, seat, peer, request, request.token)
    }

    disconnect(peer: Peer): void {
        const member = this.memberships.get(peer)
        if (!member) return
        this.memberships.delete(peer)
        member.room.slots[member.seat]!.peer = null
        if (!member.room.slots.attacker?.peer && !member.room.slots.defender?.peer) {
            member.room.idleSince = this.options.now()
        }
        this.presence(member.room)
    }

    private remove(room: Room, requestId: string, message: string): void {
        this.rooms.delete(room.code)
        for (const slot of Object.values(room.slots)) {
            if (!slot.peer) continue
            this.memberships.delete(slot.peer)
            this.error(slot.peer, requestId, 'room_closed', message)
            slot.peer.close()
        }
    }

    sweep(): void {
        const now = this.options.now()
        for (const room of this.rooms.values()) {
            if (now - room.createdAt >= this.options.lifetimeMs ||
                (room.idleSince !== null && now - room.idleSince >= this.options.idleMs)) {
                this.remove(room, 'unknown', 'Room expired')
            }
        }
    }

    shutdown(): void {
        for (const room of this.rooms.values()) this.remove(room, 'unknown', 'Relay stopped')
    }
}

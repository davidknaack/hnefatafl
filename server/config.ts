import { defaultRelayOptions, RelayOptions } from './relay.js'
import { defaultRoomOptions } from './rooms.js'

export function configFromEnv(env: NodeJS.ProcessEnv, version: string): RelayOptions {
    const number = (name: string, fallback: number, min = 1): number => {
        if (env[name] === undefined) return fallback
        const value = Number(env[name])
        if (!env[name]!.trim() || !Number.isSafeInteger(value) || value < min) throw new Error(`Invalid ${name}`)
        return value
    }
    const origins = env.RELAY_ORIGINS === undefined ? defaultRelayOptions.allowedOrigins
        : env.RELAY_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
    for (const origin of origins) {
        const url = new URL(origin)
        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error('Invalid RELAY_ORIGINS')
    }
    const host = env.RELAY_HOST ?? defaultRelayOptions.host
    if (!host.trim()) throw new Error('Invalid RELAY_HOST')
    return {
        ...defaultRelayOptions, host, version, allowedOrigins: origins,
        port: number('RELAY_PORT', defaultRelayOptions.port, 0),
        maxConnections: number('RELAY_MAX_CONNECTIONS', defaultRelayOptions.maxConnections),
        maxBufferedBytes: number('RELAY_MAX_BUFFER_BYTES', defaultRelayOptions.maxBufferedBytes),
        heartbeatMs: number('RELAY_HEARTBEAT_MS', defaultRelayOptions.heartbeatMs),
        handshakeMs: number('RELAY_HANDSHAKE_MS', defaultRelayOptions.handshakeMs),
        ratePerSecond: number('RELAY_RATE', defaultRelayOptions.ratePerSecond),
        burst: number('RELAY_BURST', defaultRelayOptions.burst),
        room: {
            maxRooms: number('RELAY_MAX_ROOMS', defaultRoomOptions.maxRooms),
            idleMs: number('RELAY_ROOM_IDLE_MS', defaultRoomOptions.idleMs),
            lifetimeMs: number('RELAY_ROOM_LIFETIME_MS', defaultRoomOptions.lifetimeMs),
        },
    }
}

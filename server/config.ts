import { defaultRelayOptions, RelayOptions } from './relay.js'
import { defaultRoomOptions } from './rooms.js'

export function configFromEnv(env: NodeJS.ProcessEnv, version: string): RelayOptions {
    const number = (name: string, fallback: number, min = 1): number => {
        if (env[name] === undefined) return fallback
        const value = Number(env[name])
        if (!env[name]!.trim() || !Number.isSafeInteger(value) || value < min) throw new Error(`Invalid ${name}`)
        return value
    }
    // Coolify injects SERVICE_URL_WEB for the current deployment, including PRs.
    // Read the generated value directly rather than interpolating a stored
    // production URL into another variable before preview generation.
    const publicUrl = env.RELAY_PUBLIC_URL ?? env.SERVICE_URL_WEB
    let publicOrigin: string | undefined
    if (env.RELAY_ORIGINS === undefined && publicUrl) {
        const url = new URL(publicUrl)
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
            url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid relay public URL')
        publicOrigin = url.origin
    }
    if (env.RELAY_ORIGINS === undefined && !publicOrigin && env.NODE_ENV === 'production') {
        throw new Error('Production relay requires RELAY_ORIGINS, RELAY_PUBLIC_URL or SERVICE_URL_WEB')
    }
    const origins = env.RELAY_ORIGINS === undefined ? publicOrigin ? [publicOrigin] : defaultRelayOptions.allowedOrigins
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

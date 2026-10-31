import { createServer } from 'node:http'
import { AddressInfo } from 'node:net'
import { WebSocket, WebSocketServer } from 'ws'
import { MAX_MESSAGE_BYTES, id, object } from '../shared/json.js'
import { decodeClientMessage, isClientVersion } from '../shared/relayProtocol.js'
import { Peer, Rooms, RoomOptions } from './rooms.js'

export interface RelayOptions {
    host: string
    port: number
    version: string
    allowedOrigins: string[]
    maxConnections: number
    maxBufferedBytes: number
    heartbeatMs: number
    handshakeMs: number
    ratePerSecond: number
    burst: number
    room: Partial<RoomOptions>
}
export const defaultRelayOptions: RelayOptions = {
    host: '127.0.0.1', port: 8787, version: '0.0.0',
    allowedOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    maxConnections: 250, maxBufferedBytes: 256 * 1024, heartbeatMs: 30_000,
    handshakeMs: 60_000, ratePerSecond: 10, burst: 30, room: {},
}

/** Small refillable budget; malformed messages consume the same budget as valid ones. */
export class RateBudget {
    private remaining: number
    private last: number
    constructor(private burst: number, private rate: number, now: number) { this.remaining = burst; this.last = now }
    take(now: number): boolean {
        this.remaining = Math.min(this.burst, this.remaining + Math.max(0, now - this.last) * this.rate / 1000)
        this.last = now
        if (this.remaining < 1) return false
        this.remaining--
        return true
    }
}

export async function startRelay(overrides: Partial<RelayOptions> = {}) {
    const options = { ...defaultRelayOptions, ...overrides }
    for (const key of ['maxConnections', 'maxBufferedBytes', 'heartbeatMs', 'handshakeMs', 'ratePerSecond', 'burst'] as const) {
        if (!Number.isSafeInteger(options[key]) || options[key] < 1) throw new Error(`Invalid ${key}`)
    }
    if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535 || !isClientVersion(options.version)) {
        throw new Error('Invalid port/version')
    }
    const rooms = new Rooms({ ...options.room, version: options.version })
    const now = options.room.now ?? Date.now
    const http = createServer((req, res) => {
        if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
            res.end('{"status":"ok"}')
        } else { res.writeHead(404); res.end() }
    })
    http.maxConnections = options.maxConnections + 16
    const sockets = new Map<WebSocket, { peer: Peer; pongAt: number; connectedAt: number; budget: RateBudget }>()
    // closeTimeout is supported by pinned ws 8.21; @types/ws 8.18 predates it.
    const serverOptions = { noServer: true, maxPayload: MAX_MESSAGE_BYTES,
        perMessageDeflate: false, closeTimeout: 2000 }
    const wss = new WebSocketServer(serverOptions)
    http.on('upgrade', (req, socket, head) => {
        const status = req.url !== '/relay' ? 404
            : req.headers.origin && !options.allowedOrigins.includes(req.headers.origin) ? 403
            : wss.clients.size >= options.maxConnections ? 503 : 0
        if (status) { socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); return }
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws))
    })
    wss.on('connection', (ws) => {
        const peer: Peer = {
            send: (message) => {
                const payload = JSON.stringify(message)
                const bytes = Buffer.byteLength(payload)
                if (bytes > MAX_MESSAGE_BYTES) return false
                if (ws.readyState !== WebSocket.OPEN) return false
                if (ws.bufferedAmount + bytes > options.maxBufferedBytes) { ws.terminate(); return false }
                ws.send(payload, (error) => { if (error) ws.terminate() })
                return true
            },
            close: () => ws.close(1000, 'Room closed'),
        }
        const state = { peer, pongAt: now(), connectedAt: now(), budget: new RateBudget(options.burst, options.ratePerSecond, now()) }
        sockets.set(ws, state)
        ws.on('pong', () => { state.pongAt = now() })
        ws.on('message', (data, binary) => {
            if (ws.readyState !== WebSocket.OPEN) return
            if (!state.budget.take(now())) { ws.close(1008, 'Rate limit'); return }
            if (binary) { ws.close(1003, 'Text JSON required'); return }
            const input = data.toString()
            const decoded = decodeClientMessage(input)
            if (!decoded.success) {
                let requestId = 'unknown'
                try { const raw: unknown = JSON.parse(input); if (object(raw) && id(raw.messageId)) requestId = raw.messageId } catch { /* Invalid JSON */ }
                rooms.error(peer, requestId, 'invalid_message', decoded.error)
                return
            }
            rooms.handle(peer, decoded.value)
        })
        // ws already starts a bounded close handshake for invalid/oversized frames.
        // Do not destroy that socket before its protocol close code is sent.
        ws.on('error', () => { if (ws.readyState === WebSocket.OPEN) ws.terminate() })
        ws.on('close', () => { sockets.delete(ws); rooms.disconnect(peer) })
    })
    const heartbeat = setInterval(() => {
        for (const [ws, state] of sockets) {
            if (now() - state.pongAt >= options.heartbeatMs * 2 ||
                (!rooms.has(state.peer) && now() - state.connectedAt >= options.handshakeMs)) ws.terminate()
            else if (ws.readyState === WebSocket.OPEN) ws.ping()
        }
        rooms.sweep()
    }, options.heartbeatMs)
    heartbeat.unref()
    try {
        await new Promise<void>((resolve, reject) => {
            http.once('error', reject)
            http.listen(options.port, options.host, () => { http.off('error', reject); resolve() })
        })
    } catch (error) { clearInterval(heartbeat); wss.close(); throw error }
    let closing: Promise<void> | undefined
    return {
        port: (http.address() as AddressInfo).port,
        get roomCount() { return rooms.size },
        get connectionCount() { return sockets.size },
        close(): Promise<void> {
            if (closing) return closing
            clearInterval(heartbeat)
            rooms.shutdown()
            for (const ws of sockets.keys()) ws.terminate()
            closing = Promise.all([
                new Promise<void>((resolve) => wss.close(() => resolve())),
                new Promise<void>((resolve) => { http.close(() => resolve()); http.closeAllConnections() }),
            ]).then(() => undefined)
            return closing
        },
    }
}

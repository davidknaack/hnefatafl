import { afterEach, expect, test } from 'vitest'
import { WebSocket } from 'ws'
import { decodeRelayMessage, RelayMessage } from '../shared/relayProtocol.js'
import { MAX_MESSAGE_BYTES } from '../shared/json.js'
import { RelayOptions, startRelay } from './relay.js'

const servers: Awaited<ReturnType<typeof startRelay>>[] = []
const clients: WebSocket[] = []
afterEach(async () => {
    for (const ws of clients.splice(0)) ws.terminate()
    await Promise.all(servers.splice(0).map((server) => server.close()))
})
async function server(options: Partial<RelayOptions> = {}) {
    const result = await startRelay({ port: 0, version: '1.0.0', ...options })
    servers.push(result)
    return result
}
async function connect(port: number, options: { origin?: string; autoPong?: boolean } = {}) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/relay`, options)
    clients.push(ws)
    const messages: RelayMessage[] = []
    let wake: (() => void) | undefined
    ws.on('message', (data) => {
        const result = decodeRelayMessage(data.toString())
        if (!result.success) throw new Error(result.error)
        messages.push(result.value); wake?.()
    })
    const closed = new Promise<number>((resolve) => ws.once('close', resolve))
    await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
    let serial = 0
    return { ws, closed, send(fields: object) {
        const messageId = `request-${++serial}`
        ws.send(JSON.stringify({ protocolVersion: 1, clientVersion: '1.0.0', messageId, ...fields }))
        return messageId
    }, next<T extends RelayMessage['type']>(type: T, predicate: (m: Extract<RelayMessage, { type: T }>) => boolean = () => true) {
        return new Promise<Extract<RelayMessage, { type: T }>>((resolve, reject) => {
            const timer = setTimeout(() => { wake = undefined; reject(new Error(`Timed out waiting for ${type}`)) }, 2000)
            wake = () => {
                const index = messages.findIndex((m) => m.type === type && predicate(m as Extract<RelayMessage, { type: T }>))
                if (index < 0) return
                clearTimeout(timer); wake = undefined
                resolve(messages.splice(index, 1)[0] as Extract<RelayMessage, { type: T }>)
            }
            wake()
        })
    } }
}

test('real clients forward opaque bodies, reserve seats, resume and leave', async () => {
    const relay = await server()
    const a = await connect(relay.port), b = await connect(relay.port), c = await connect(relay.port)
    a.send({ type: 'create', side: 'defender' })
    const assignment = await a.next('assigned')
    const { roomCode, gameId, token } = assignment
    b.send({ type: 'join', roomCode })
    expect(await b.next('assigned')).toMatchObject({ gameId, seat: 'attacker' })
    await b.next('presence', (m) => m.peerConnected)
    c.send({ type: 'resume', roomCode, gameId, token })
    expect(await c.next('error')).toMatchObject({ code: 'seat_in_use' })
    const body = { type: 'future-extension', payload: { arbitrary: [null, 123, 'hello'] } }
    const messageId = a.send({ type: 'peer', body, senderSeat: 'attacker', gameId: 'forged' })
    expect(await b.next('relayed')).toMatchObject({ messageId, gameId, senderSeat: 'defender', clientVersion: '1.0.0', body })
    b.send({ type: 'peer', body })
    expect(await a.next('relayed')).toMatchObject({ senderSeat: 'attacker', body })
    a.ws.close(); await a.closed
    await b.next('presence', (m) => !m.peerConnected)
    c.send({ type: 'join', roomCode })
    expect(await c.next('error')).toMatchObject({ code: 'room_full' })
    c.send({ type: 'resume', roomCode, gameId, token })
    expect(await c.next('assigned')).toMatchObject({ token, seat: 'defender' })
    c.send({ type: 'leave' })
    expect(await b.next('error')).toMatchObject({ code: 'room_closed' })
    expect(await c.next('error')).toMatchObject({ code: 'room_closed' })
    expect(await b.closed).toBe(1000)
    expect(await c.closed).toBe(1000)
    expect(relay.roomCount).toBe(0)
})

test('health, upgrade path, exact browser origins and connection cap', async () => {
    const relay = await server({ maxConnections: 1, allowedOrigins: ['https://example.com'] })
    const health = await fetch(`http://127.0.0.1:${relay.port}/health`)
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ status: 'ok' })
    expect((await fetch(`http://127.0.0.1:${relay.port}/other`)).status).toBe(404)
    await expect(connect(relay.port, { origin: 'https://example.com.evil.test' })).rejects.toThrow('403')
    const wrongPath = new WebSocket(`ws://127.0.0.1:${relay.port}/wrong`)
    clients.push(wrongPath)
    await expect(new Promise((_, reject) => wrongPath.once('error', reject))).rejects.toThrow('404')
    await connect(relay.port, { origin: 'https://example.com' })
    await expect(connect(relay.port)).rejects.toThrow('503')
})

test('malformed input is reported and counted toward rate limits', async () => {
    const relay = await server({ burst: 2, ratePerSecond: 1 })
    const a = await connect(relay.port)
    a.ws.send('{')
    expect(await a.next('error')).toMatchObject({ code: 'invalid_message', requestId: 'unknown' })
    a.send({ type: 'unknown' })
    expect(await a.next('error')).toMatchObject({ code: 'invalid_message', requestId: 'request-1' })
    a.send({ type: 'create', side: 'attacker' })
    expect(await a.closed).toBe(1008)
})

test('binary and oversized frames close; outbound envelope growth reports delivery failure', async () => {
    const relay = await server()
    const binary = await connect(relay.port)
    binary.ws.send(Buffer.from('{}'))
    expect(await binary.closed).toBe(1003)
    const large = await connect(relay.port)
    large.ws.send('x'.repeat(MAX_MESSAGE_BYTES + 1))
    expect(await large.closed).toBe(1009)
    const a = await connect(relay.port), b = await connect(relay.port)
    a.send({ type: 'create', side: 'attacker' })
    b.send({ type: 'join', roomCode: (await a.next('assigned')).roomCode })
    await b.next('assigned')
    const request = { protocolVersion: 1, messageId: 'near-limit', clientVersion: '1.0.0', type: 'peer', body: { type: 'opaque', payload: '' } }
    request.body.payload = 'x'.repeat(MAX_MESSAGE_BYTES - Buffer.byteLength(JSON.stringify(request)))
    a.ws.send(JSON.stringify(request))
    expect(await a.next('error')).toMatchObject({ code: 'delivery_failed', requestId: 'near-limit' })
})

test('outbound buffer bound terminates a connection instead of queueing without limit', async () => {
    const relay = await server({ maxBufferedBytes: 1 })
    const a = await connect(relay.port)
    a.send({ type: 'create', side: 'attacker' })
    expect(await a.closed).toBe(1006)
})

test('heartbeat removes dead sockets and unjoined sockets time out', async () => {
    let now = 0
    const relay = await server({ heartbeatMs: 30, handshakeMs: 1000, room: { now: () => now } })
    const a = await connect(relay.port, { autoPong: false })
    a.send({ type: 'create', side: 'attacker' })
    const { roomCode, gameId, token } = await a.next('assigned')
    now = 60
    expect(await a.closed).toBe(1006)
    const b = await connect(relay.port)
    b.send({ type: 'resume', roomCode, gameId, token })
    expect(await b.next('assigned')).toMatchObject({ token })
    let idleNow = 0
    const unjoined = await server({ heartbeatMs: 30, handshakeMs: 1, room: { now: () => idleNow } })
    const idle = await connect(unjoined.port)
    idleNow = 2
    expect(await idle.closed).toBe(1006)
    expect(b.ws.readyState).toBe(WebSocket.OPEN)
})

test('timer expires live rooms; shutdown is complete, idempotent and restart loses rooms', async () => {
    let now = 0
    const expiring = await server({ heartbeatMs: 100, room: { lifetimeMs: 60, now: () => now } })
    const a = await connect(expiring.port)
    a.send({ type: 'create', side: 'attacker' })
    await a.next('assigned')
    now = 60
    expect(await a.next('error')).toMatchObject({ code: 'room_closed' })
    const relay = await server()
    const b = await connect(relay.port)
    b.send({ type: 'create', side: 'defender' })
    const { roomCode, gameId, token } = await b.next('assigned')
    await Promise.all([relay.close(), relay.close()])
    expect(relay.connectionCount).toBe(0)
    expect(relay.roomCount).toBe(0)
    const restarted = await server({ port: relay.port })
    const c = await connect(restarted.port)
    c.send({ type: 'resume', roomCode, gameId, token })
    expect(await c.next('error')).toMatchObject({ code: 'room_not_found' })
})

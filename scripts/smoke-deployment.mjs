import assert from 'node:assert/strict'
import { WebSocket } from 'ws'

// Works against the CI Compose stack or an HTTPS Coolify deployment. Never log
// assignments: they contain private resume tokens. All created rooms are left.
const base = new URL(process.argv[2] ?? 'http://127.0.0.1:8080')
assert(['http:', 'https:'].includes(base.protocol), 'Expected an HTTP(S) deployment URL')
const endpoint = new URL('/relay', base)
endpoint.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
const sockets = []
const deadline = setTimeout(() => { console.error('Deployment smoke test timed out'); process.exit(1) }, 30_000)

async function connect(origin = base.origin) {
    const ws = new WebSocket(endpoint, { origin, handshakeTimeout: 5000 })
    sockets.push(ws)
    const queued = []
    let wake
    ws.on('message', data => { queued.push(JSON.parse(data.toString())); wake?.() })
    const closed = new Promise(resolve => ws.once('close', resolve))
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.on('error', reject) })
    return {
        ws, closed,
        send(fields) { ws.send(JSON.stringify({ protocolVersion: 1, clientVersion: '1.0.0', messageId: crypto.randomUUID(), ...fields })) },
        next(type) {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => { wake = undefined; reject(new Error(`Timed out waiting for ${type}`)) }, 5000)
                wake = () => {
                    const index = queued.findIndex(message => message.type === type)
                    if (index < 0) return
                    clearTimeout(timeout); wake = undefined
                    resolve(queued.splice(index, 1)[0])
                }
                wake()
            })
        },
    }
}

try {
    const page = await fetch(base)
    assert.equal(page.status, 200, 'Frontend HTTP status')
    assert((await page.text()).includes('online-start'), 'Production online controls missing')
    const health = await fetch(new URL('/health', base))
    assert.equal(health.status, 200, 'Health HTTP status')
    assert.match(health.headers.get('content-type') ?? '', /application\/json/, 'Health must not be SPA HTML')
    assert.deepEqual(await health.json(), { status: 'ok' })
    assert.equal((await fetch(new URL('/relay', base))).status, 404, 'Non-upgrade relay request must not return SPA HTML')
    await assert.rejects(connect('https://disallowed.invalid'), /403/, 'Wrong browser origin must be rejected')

    const a = await connect(), b = await connect()
    a.send({ type: 'create', side: 'attacker' })
    const assignment = await a.next('assigned')
    b.send({ type: 'join', roomCode: assignment.roomCode })
    const joined = await b.next('assigned')
    assert.equal(joined.gameId, assignment.gameId, 'Players must share one room')
    assert.equal(joined.seat, 'defender')
    const body = { type: 'deployment-smoke', payload: { move: 'a1-a2' } }
    a.send({ type: 'peer', body })
    const delivered = await b.next('relayed')
    assert.deepEqual(delivered.body, body)
    assert.equal(delivered.senderSeat, 'attacker')

    a.ws.close(); await a.closed
    const resumed = await connect()
    resumed.send({ type: 'resume', roomCode: assignment.roomCode, gameId: assignment.gameId, token: assignment.token })
    assert.equal((await resumed.next('assigned')).seat, 'attacker', 'Reconnect must preserve the seat')
    resumed.send({ type: 'leave' })
    assert.equal((await b.next('error')).code, 'room_closed')
    console.log('Deployment smoke passed: static client, JSON health, origin rejection, WebSocket create/join/forward/resume/leave')
} finally {
    for (const socket of sockets) socket.terminate()
    clearTimeout(deadline)
}

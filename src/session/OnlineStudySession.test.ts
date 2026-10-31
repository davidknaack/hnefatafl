import { afterEach, expect, test, vi } from 'vitest'
import { startRelay } from '../../server/relay'
import { browserSocket } from '../online/socket'
import { OnlineGameSession } from './OnlineGameSession'
import { OnlineStudySession } from './OnlineStudySession'
import { createGameRecord } from '../online/record'

const sessions: OnlineStudySession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
async function wait(check: () => boolean) { await vi.waitFor(() => expect(check()).toBe(true), { timeout: 4000, interval: 10 }) }
async function pair(drop?: (text: string) => boolean) {
    const relay = await startRelay({ port: 0, burst: 200, ratePerSecond: 100 })
    const endpoint = `ws://127.0.0.1:${relay.port}/relay`
    const a = new OnlineStudySession(new OnlineGameSession({ endpoint, start: { type: 'create', side: 'attacker' },
        socketFactory: url => {
            const socket = browserSocket(url)
            return { ...socket, get readyState() { return socket.readyState }, get bufferedAmount() { return socket.bufferedAmount },
                send: text => { if (!drop?.(text)) socket.send(text) } }
        } }), { name: 'Alex' })
    sessions.push(a)
    await wait(() => !!a.getRecovery())
    const b = new OnlineStudySession(new OnlineGameSession({ endpoint,
        start: { type: 'join', roomCode: a.getRecovery()!.credentials.roomCode } }), { name: 'Alex' })
    sessions.push(b)
    await wait(() => a.getView().connection === 'ready' && b.getView().connection === 'ready' &&
        !!a.getView().online?.commentsAvailable && !!b.getView().online?.commentsAvailable)
    return { relay, endpoint, a, b, close: async () => { sessions.forEach(session => session.dispose()); await relay.close() } }
}
async function move(player: OnlineStudySession, peer: OnlineStudySession, command: string) {
    expect((await player.submitMove(command, player.getView().generation)).success).toBe(true)
    await wait(() => player.getView().connection === 'ready' && peer.getView().connection === 'ready')
}
test('duplicate names never affect turns; historical review is private and commands cannot play there', async () => {
    const f = await pair()
    try {
        expect(f.a.getView().online?.names).toEqual({ attacker: 'Alex', defender: 'Alex' })
        expect((await f.b.submitMove('D11-D8', f.b.getView().generation)).success).toBe(false)
        await move(f.a, f.b, 'D11-D8')
        f.a.reviewMove('main', 0, f.a.getView().generation)
        await move(f.b, f.a, 'F8-E8')
        expect(f.a.getView()).toMatchObject({ capabilities: { move: false }, review: { cursor: 0, moves: ['D11-D8', 'F8-E8'] } })
        expect(f.a.getView().state.moveHistory).toHaveLength(0)
        expect(f.a.getView().liveState!.moveHistory).toHaveLength(2)
        expect((await f.a.submitMove('F10-F8', f.a.getView().generation)).success).toBe(false)
        expect(f.a.getPossibleMoves({ x: 5, y: 1 }, f.a.getView().generation)).toEqual([])
        f.a.reviewMove('main', 2, f.a.getView().generation)
        await move(f.a, f.b, 'F10-F8')
        expect(f.a.getView().state.captured.defender).toBe(1)
    } finally { await f.close() }
})
test('concurrent comments converge once, bind exact moves, keep author snapshots and export the complete line', async () => {
    const f = await pair()
    try {
        await move(f.a, f.b, 'D11-D8')
        expect(f.a.addComment('Opening <D8>', undefined, f.a.getView().generation).success).toBe(true)
        expect(f.b.addComment('Reply [Alex]', undefined, f.b.getView().generation).success).toBe(true)
        await wait(() => f.a.getAnnotations()!.comments.length === 2 && f.b.getAnnotations()!.comments.length === 2)
        expect(f.a.getAnnotations()).toEqual(f.b.getAnnotations())
        expect(f.a.getView().review!.comments.map(comment => comment.seat)).toEqual(['attacker', 'defender'])
        f.a.changeName('Sam')
        await wait(() => f.b.getView().online?.names?.attacker === 'Sam')
        expect(f.a.getView().review!.comments[0].author).toBe('Alex')
        await move(f.b, f.a, 'F8-E8')
        f.a.reviewMove('main', 1, f.a.getView().generation)
        f.a.addComment('Later thought', undefined, f.a.getView().generation)
        await wait(() => f.b.getAnnotations()!.comments.length === 3)
        expect(f.b.getView().review!.comments).toHaveLength(0)
        expect(f.a.saveGame()).toContain('[Attackers:Sam]')
        expect(f.a.saveGame()).toContain('{[Alex]:Opening <D8>}')
        expect(f.a.saveGame()).toContain('{[Sam]:Later thought}')
        expect(f.a.saveGame()).toContain('f8-e8')
        expect(f.a.saveGame()).not.toContain(f.a.getRecovery()!.credentials.token)
    } finally { await f.close() }
})
test('a draft pins its original move when a live move arrives and stale queued moves are rejected', async () => {
    const f = await pair()
    try {
        await move(f.a, f.b, 'D11-D8')
        f.a.holdReviewForDraft(true)
        await move(f.b, f.a, 'F8-E8')
        expect(f.a.getView().review!.cursor).toBe(1)
        expect(f.a.addComment('About the opening', undefined, f.a.getView().generation).success).toBe(true)
        expect(f.a.getAnnotations()!.comments[0].prefix).toEqual(['D11-D8'])
        f.a.holdReviewForDraft(false)
        f.a.reviewMove('main', 2, f.a.getView().generation)
        const queued = f.a.submitMove('F10-F8', f.a.getView().generation)
        f.a.reviewMove('main', 0, f.a.getView().generation)
        expect((await queued).success).toBe(false)
        expect(f.a.getRecovery()!.record.revision).toBe(2)
    } finally { await f.close() }
})
test('refresh recovers names/comments from both peers and room closure leaves full review available', async () => {
    const f = await pair()
    try {
        await move(f.a, f.b, 'D11-D8')
        f.a.addComment('Retained', undefined, f.a.getView().generation)
        await wait(() => f.b.getAnnotations()!.comments.length === 1)
        const saved = f.a.getRecovery()!, annotations = f.a.getAnnotations()
        f.a.dispose(); await wait(() => f.b.getView().connection === 'waiting')
        const a2 = new OnlineStudySession(new OnlineGameSession({ endpoint: f.endpoint,
            start: { type: 'resume', credentials: saved.credentials, record: saved.record } }), { annotations, cursor: 0 })
        sessions.push(a2)
        await wait(() => a2.getView().connection === 'ready' && !!a2.getView().online?.commentsAvailable)
        expect(a2.getAnnotations()!.comments).toHaveLength(1)
        expect(a2.getView().online?.names).toEqual({ attacker: 'Alex', defender: 'Alex' })
        expect(a2.getView().review!.cursor).toBe(0)
        f.b.leave(); await wait(() => a2.getView().connection === 'closed')
        expect(a2.reviewMove('main', 1, a2.getView().generation).success).toBe(true)
        expect(a2.getView().review!.comments[0].text).toBe('Retained')
        expect(a2.saveGame()).toContain('Retained')
        expect(a2.getView().capabilities.move).toBe(false)
    } finally { await f.close() }
})
test('lost feature acknowledgement is independent of moves and reconnect resends without duplication', async () => {
    let dropAcks = true
    const f = await pair(text => dropAcks && JSON.parse(text).body?.type === 'annotations-ack-v1')
    try {
        await move(f.a, f.b, 'D11-D8')
        f.b.addComment('Ack can be lost', undefined, f.b.getView().generation)
        await wait(() => f.a.getAnnotations()!.comments.length === 1)
        expect(f.b.getView().online!.annotationStatus).toContain('awaiting')
        await move(f.b, f.a, 'F8-E8')
        expect(f.a.getRecovery()!.record.revision).toBe(2)
        dropAcks = false
        f.a.dispose(); await wait(() => f.b.getView().connection === 'waiting')
        const saved = f.a.getRecovery()!
        const a2 = new OnlineStudySession(new OnlineGameSession({ endpoint: f.endpoint,
            start: { type: 'resume', credentials: saved.credentials, record: saved.record } }), { annotations: f.a.getAnnotations() })
        sessions.push(a2)
        await wait(() => a2.getView().connection === 'ready' && !!f.b.getView().online!.annotationStatus?.includes('up to date'))
        expect(f.b.getAnnotations()!.comments).toHaveLength(1)
        expect(a2.getAnnotations()!.comments).toHaveLength(1)
    } finally { await f.close() }
})
test('malformed feature data never changes the board; legacy peers can still play', async () => {
    const relay = await startRelay({ port: 0 })
    const endpoint = `ws://127.0.0.1:${relay.port}/relay`
    const rawA = new OnlineGameSession({ endpoint, start: { type: 'create', side: 'attacker' } })
    const a = new OnlineStudySession(rawA); sessions.push(a)
    let b: OnlineGameSession | undefined
    try {
        await wait(() => !!a.getRecovery())
        b = new OnlineGameSession({ endpoint, start: { type: 'join', roomCode: a.getRecovery()!.credentials.roomCode } })
        await wait(() => a.getView().connection === 'ready' && b!.getView().connection === 'ready')
        expect(a.getView().online?.commentsAvailable).toBe(false)
        b.sendFeature('annotations-v1', { version: 9 })
        await wait(() => !!a.getView().online?.annotationWarning)
        expect(a.getView().connection).toBe('ready')
        expect((await a.submitMove('D11-D8', a.getView().generation)).success).toBe(true)
        await wait(() => b!.getRecovery()!.record.revision === 1)
        expect(a.addComment('Unavailable', undefined, a.getView().generation).success).toBe(false)
    } finally { a.dispose(); b?.dispose(); await relay.close() }
})

import { getElements } from '../ui/elements'
import { bindSessionControls } from '../ui/sessionControls'
import { RecoveryStore, RECOVERY_KEY } from '../online/recovery'
import { OnlineGameSession, OnlineSessionOptions } from '../session/OnlineGameSession'
import { browserSocket } from '../online/socket'
import '../ui/styles.css'

// This entry is served only by Vite's development acceptance.html, not the app build.
const run = document.querySelector<HTMLButtonElement>('#run')!
const summary = document.querySelector<HTMLElement>('#summary')!
const results = document.querySelector<HTMLElement>('#results')!
const fixtures = document.querySelector<HTMLElement>('#fixtures')!
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
async function until(check: () => boolean, message: string): Promise<void> {
    const deadline = Date.now() + 6000
    while (!check()) {
        if (Date.now() >= deadline) throw new Error(message)
        await new Promise(resolve => setTimeout(resolve, 20))
    }
}
function memory(raw: string | null = null, failWrites = false) {
    return { getItem: (_key: string) => raw, setItem: (_key: string, value: string) => {
        if (failWrites) throw new Error('Simulated quota failure')
        raw = value
    } }
}

run.onclick = async () => {
    run.disabled = true; results.replaceChildren(); summary.textContent = 'Running…'
    let passed = 0, failed = 0
    const cleanups: (() => void)[] = []
    const online: OnlineGameSession[] = []
    try {
        const endpoint = document.querySelector<HTMLInputElement>('#relay')!.value.trim()
        const url = new URL(endpoint)
        assert(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Use a local test relay; do not run against production')
        const response = await fetch('./debug.html')
        assert(response.ok, 'Could not load the actual app markup')
        const source = new DOMParser().parseFromString(await response.text(), 'text/html')
        source.querySelectorAll('script').forEach(script => script.remove())
        function mount(storage = memory(), relay = endpoint, options: Partial<OnlineSessionOptions> = {}) {
            const panel = document.createElement('details')
            const title = document.createElement('summary'); title.textContent = 'Test UI fixture'
            const root = document.createElement('div'); root.innerHTML = source.body.innerHTML
            panel.append(title, root); fixtures.append(panel)
            const ui = getElements(root)
            let current: OnlineGameSession | undefined
            const dispose = bindSessionControls(ui, relay, { recoveryStore: new RecoveryStore(() => storage),
                createOnline: init => { current = new OnlineGameSession({ ...init, ...options }); online.push(current); return current } })
            const close = () => { dispose(); panel.remove() }
            cleanups.push(close)
            return { ui, storage, close, get session() { return current } }
        }
        type Fixture = ReturnType<typeof mount>
        async function pair(storage = memory(), options: Partial<OnlineSessionOptions> = {}) {
            const a = mount(storage, endpoint, options), b = mount()
            a.ui.createRoom.click()
            await until(() => !!a.session?.getRecovery(), 'Creator assignment failed; check relay origin/port')
            b.ui.roomInput.value = a.ui.roomCode.textContent!; b.ui.joinRoom.click()
            await until(() => a.session?.getView().connection === 'ready' && b.session?.getView().connection === 'ready', 'Peers did not synchronize')
            return { a, b }
        }
        async function move(f: Fixture, from: string, to: string, revision: number) {
            assert(!f.ui.apply.disabled, 'Move unexpectedly disabled')
            f.ui.from.value = from; f.ui.to.value = to; f.ui.apply.click()
            await until(() => f.session?.getRecovery()?.record.revision === revision && f.session.getView().connection === 'ready', 'Move was not acknowledged')
        }
        async function check(name: string, action: () => Promise<void>) {
            const row = document.createElement('li'); row.textContent = `${name}: running`; results.append(row)
            try { await action(); row.textContent = `PASS — ${name}`; passed++ }
            catch (error) { row.textContent = `FAIL — ${name}: ${error instanceof Error ? error.message : 'Unknown failure'}`; failed++ }
            finally {
                online.splice(0).forEach(session => { session.leave(); session.dispose() })
                cleanups.splice(0).forEach(close => close())
            }
        }
        await check('Local mode, valid/invalid import and disabled unconfigured online controls', async () => {
            const f = mount(memory(), '')
            assert(f.ui.createRoom.disabled && !f.ui.apply.disabled, 'Local fallback failed')
            f.ui.autoApply.checked = true; f.ui.autoValidate.checked = true
            ;(f.ui.board.children[3] as HTMLElement).click()
            assert(f.ui.board.querySelector('.highlight-possible'), 'Selection did not show possible moves')
            ;(f.ui.board.children[14] as HTMLElement).click()
            await until(() => !!f.ui.currentMoves.textContent?.includes('d11-d10'), 'Auto Apply did not take precedence')
            assert(!f.ui.board.querySelector('.highlight-possible'), 'Committed move retained stale selection')
            f.ui.notation.value = 'd11-d10 f8-e8'; f.ui.load.click()
            const before = f.ui.currentMoves.textContent
            f.ui.notation.value = 'invalid'; f.ui.load.click()
            assert(f.ui.currentMoves.textContent === before && f.ui.log.textContent?.includes('Invalid'), 'Invalid import changed the board')
        })
        await check('Create/join, turn gating, captures and saved full records', async () => {
            const { a, b } = await pair()
            assert(b.ui.apply.disabled && b.ui.load.disabled && !a.ui.apply.disabled, 'Seat/import controls incorrect')
            await move(a, 'D11', 'D8', 1); await move(b, 'F8', 'E8', 2); await move(a, 'F10', 'F8', 3)
            assert(a.ui.currentMoves.textContent === b.ui.currentMoves.textContent && b.ui.capturedD.textContent === '1', 'Capture histories differ')
            assert(JSON.parse(a.storage.getItem(RECOVERY_KEY)!).record.revision === 3, 'Latest record was not saved')
        })
        await check('Both owners remount from saved records and resume their seats', async () => {
            const { a, b } = await pair()
            await move(a, 'D11', 'D10', 1)
            a.close()
            await until(() => b.session?.getView().connection === 'waiting', 'Peer disconnect not observed')
            b.close()
            // New owners share only each prior storage port, not session/engine state.
            const restoredA = mount(a.storage), restoredB = mount(b.storage)
            await until(() => restoredA.session?.getView().connection === 'ready' && restoredB.session?.getView().connection === 'ready', 'Saved owners did not resume')
            assert(restoredA.ui.currentMoves.textContent === restoredB.ui.currentMoves.textContent && !restoredB.ui.apply.disabled, 'Restored board/turn mismatch')
        })
        await check('Quota failure preserves playable memory and reports unavailable recovery', async () => {
            const { a, b } = await pair(memory(null, true))
            await move(a, 'D11', 'D10', 1)
            assert(a.ui.recoveryStatus.textContent?.includes('Could not save') && b.session?.getRecovery()?.record.revision === 1, 'Storage error blocked play or was hidden')
        })
        await check('Duplicate live seat cannot steal the room or interrupt the original save', async () => {
            const { a, b } = await pair()
            const duplicate = mount(a.storage)
            await until(() => !!duplicate.ui.sessionError.textContent?.includes('seat_in_use'), 'Duplicate seat was not refused')
            await move(a, 'D11', 'D10', 1)
            assert(!a.ui.recoveryStatus.textContent?.includes('another tab') && b.session?.getRecovery()?.record.revision === 1, 'Duplicate disrupted the original owner')
        })
        await check('Changed relay configuration opens saved game without sending credentials', async () => {
            const { a } = await pair()
            await move(a, 'D11', 'D10', 1)
            let connections = 0
            const reviewed = mount(memory(a.storage.getItem(RECOVERY_KEY)), 'ws://127.0.0.1:1/relay', {
                socketFactory: () => { connections++; throw new Error('Unexpected connection') },
            })
            assert(connections === 0 && reviewed.ui.apply.disabled && !reviewed.ui.copy.disabled && reviewed.ui.reconnect.disabled,
                'Changed endpoint sent credentials or lost read-only export')
        })
        await check('Incompatible save is preserved until explicit replacement', async () => {
            const raw = '{"storageVersion":99,"future":"keep"}', storage = memory(raw), f = mount(storage)
            assert(f.ui.recoveryStatus.textContent?.includes('preserved') && !f.ui.backupRecovery.hidden, 'Recovery diagnosis/backup missing')
            f.ui.createRoom.click()
            assert(!f.ui.confirmation.hidden, 'Saved data replacement lacked confirmation')
            f.ui.cancelSession.click()
            assert(storage.getItem(RECOVERY_KEY) === raw, 'Cancelled action changed saved data')
            f.ui.createRoom.click(); f.ui.confirmSession.click()
            await until(() => !!f.session?.getRecovery(), 'Confirmed replacement did not create room')
            assert(JSON.parse(storage.getItem(RECOVERY_KEY)!).storageVersion === 1, 'Confirmed save was not replaced')
        })
        await check('Local continuation preserves board and disables saved automatic resume', async () => {
            const { a, b } = await pair()
            await move(a, 'D11', 'D10', 1)
            a.ui.continueLocal.click(); a.ui.cancelSession.click()
            assert(a.ui.sessionMode.textContent === 'Online game', 'Cancel replaced session')
            a.ui.continueLocal.click(); a.ui.confirmSession.click()
            assert(String(a.ui.sessionMode.textContent) === 'Local game' && !a.ui.load.disabled, 'Local continuation failed')
            assert(JSON.parse(a.storage.getItem(RECOVERY_KEY)!).resume === false, 'Continuation still auto-resumes online')
            await until(() => b.session?.getView().connection === 'waiting', 'Continuation did not disconnect peer')
        })
        await check('Lost peer acceptance triggers bounded recovery without replaying a move', async () => {
            let drop = false
            const { a, b } = await pair(memory(), { timeoutMs: 500, socketFactory: url => {
                const socket = browserSocket(url)
                return { ...socket, get readyState() { return socket.readyState }, get bufferedAmount() { return socket.bufferedAmount },
                    send: text => { if (!drop || JSON.parse(text).type !== 'peer') socket.send(text) } }
            } })
            drop = true
            a.ui.from.value = 'D11'; a.ui.to.value = 'D10'; a.ui.apply.click()
            await until(() => a.session?.getView().connection === 'error', 'Missing acceptance never timed out')
            assert(a.session?.getRecovery()?.record.revision === 1 && b.session?.getRecovery()?.record.revision === 0, 'Lost update changed histories unexpectedly')
            assert(a.ui.apply.disabled && !a.ui.copy.disabled, 'Unsynchronized controls incorrect')
        })
        summary.textContent = `${passed} passed; ${failed} failed`
        summary.dataset.result = failed ? 'failed' : 'passed'
    } catch (error) {
        summary.textContent = `Runner failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        summary.dataset.result = 'failed'
    } finally {
        online.forEach(session => { session.leave(); session.dispose() })
        cleanups.forEach(close => close()); run.disabled = false
    }
}

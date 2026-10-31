import { mountClient } from '../client/application'
import { clientElements } from '../client/elements'
import { OnlineGameSession } from '../session/OnlineGameSession'
import { LOCAL_GAME_KEY } from '../client/localGameStorage'
import { RECOVERY_KEY } from '../online/recovery'
import { ONLINE_PRESENTATION_KEY } from '../client/onlineStorage'
import { LocalGameSession } from '../session/LocalGameSession'
import { createGameRecord } from '../online/record'

const run = document.querySelector<HTMLButtonElement>('#run-production-online')!
const summary = document.querySelector<HTMLElement>('#production-online-summary')!
const results = document.querySelector<HTMLElement>('#production-online-results')!
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
async function until(check: () => boolean, message: string) {
    const deadline = Date.now() + 5000
    while (!check()) { if (Date.now() > deadline) throw new Error(message); await new Promise(resolve => setTimeout(resolve, 20)) }
}
run.onclick = async () => {
    run.disabled = true; results.replaceChildren(); summary.textContent = 'Running…'
    const endpoint = document.querySelector<HTMLInputElement>('#production-relay')!.value.trim()
    let passed = 0, failed = 0
    const cleanups: (() => void)[] = []
    try {
        const url = new URL(endpoint)
        assert(url.protocol === 'ws:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && url.pathname === '/relay' && !url.search && !url.hash && !url.username && !url.password, 'Use a loopback ws:// relay ending in /relay')
        const response = await fetch('./index.html')
        assert(response.ok, 'Could not load production markup')
        const markup = new DOMParser().parseFromString(await response.text(), 'text/html')
        markup.querySelectorAll('script').forEach(script => script.remove())
        function fixture(configured = endpoint) {
            const values = new Map<string, string>()
            const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
            const root = document.createElement('div'); root.innerHTML = markup.body.innerHTML
            document.querySelector('#client-fixtures')!.append(root)
            let source: OnlineGameSession | undefined, dispose = () => {}
            const options = { storage, online: { endpoint: configured, invite: '', createOnline: (input: ConstructorParameters<typeof OnlineGameSession>[0]) => { source = new OnlineGameSession(input); return source } } }
            const mount = () => { dispose = mountClient(root, options) }
            mount()
            cleanups.push(() => { dispose(); root.remove() })
            const ui = clientElements(root)
            const element = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!
            const set = (id: string, value: string) => { const input = element<HTMLInputElement>(id); input.value = value; input.dispatchEvent(new Event(id === 'game-kind' ? 'change' : 'input', { bubbles: true })) }
            const click = (id: string) => element<HTMLButtonElement>(id).click()
            const prepare = (kind: string, code = '', nickname = 'Alex') => { ui.newGame.click(); set('game-kind', kind); set('online-name', nickname); set('online-code', code) }
            const go = () => { click('online-start'); if (ui.confirm.open) ui.replace.click() }
            const play = async (from: string, to: string) => {
                const previous = source!.getView().state.moveHistory.length
                root.querySelector<HTMLButtonElement>(`[data-square="${from}"]`)!.click()
                root.querySelector<HTMLButtonElement>(`[data-square="${to}"]`)!.click()
                await until(() => source!.getView().state.moveHistory.length === previous + 1, `Move ${from}-${to} did not commit: ${ui.feedback.textContent}`)
            }
            return { root, ui, values, storage, element, set, click, prepare, go, play,
                configure: (value: string) => { options.online.endpoint = value },
                get source() { return source! }, unmount: () => dispose(), remount: mount }
        }
        async function pair() {
            const a = fixture(), b = fixture()
            a.prepare('create'); a.go()
            await until(() => !!a.source?.getRecovery(), 'Room creation failed')
            b.prepare('join', a.source.getRecovery()!.credentials.roomCode); b.go()
            await until(() => a.source.getView().connection === 'ready' && b.source.getView().connection === 'ready' &&
                a.element('online-comment-status').textContent!.includes('up to date') && b.element('online-comment-status').textContent!.includes('up to date'), 'Production room did not synchronize')
            return { a, b }
        }
        async function settled(a: ReturnType<typeof fixture>, b: ReturnType<typeof fixture>) {
            await until(() => a.source.getView().connection === 'ready' && b.source.getView().connection === 'ready' &&
                a.source.getView().state.moveHistory.length === b.source.getView().state.moveHistory.length, 'Move synchronization failed')
        }
        async function check(name: string, action: () => Promise<void>) {
            const row = document.createElement('li'); row.textContent = `${name}: running`; results.append(row)
            try { await action(); passed++; row.textContent = `PASS — ${name}` }
            catch (error) { failed++; row.textContent = `FAIL — ${name}: ${error instanceof Error ? error.message : error}` }
            finally { cleanups.splice(0).forEach(cleanup => cleanup()) }
        }
        await check('No-relay setup retains local play and blocks online creation', async () => {
            const f = fixture('')
            f.prepare('create'); assert(f.element<HTMLButtonElement>('online-start').disabled, 'Unconfigured create enabled')
            f.set('game-kind', 'local'); assert(!f.element<HTMLButtonElement>('online-start').disabled, 'Local setup disabled')
            f.go(); assert(f.ui.title.textContent === 'Attackers to move', 'Local game unavailable')
        })
        await check('Create/join, duplicate names, seat gating and capture use production controls', async () => {
            const { a, b } = await pair()
            assert(a.element('attacker-player').textContent!.includes('Alex · You'), 'Own player card missing')
            assert(a.element('defender-player').textContent!.includes('Alex · Opponent'), 'Duplicate-name opponent missing')
            b.root.querySelector<HTMLButtonElement>('[data-square="D11"]')!.click()
            assert(b.ui.clear.disabled, 'Opponent selected the other seat')
            await a.play('D11', 'D8'); await settled(a, b)
            await b.play('F8', 'E8'); await settled(a, b)
            await a.play('F10', 'F8'); await settled(a, b)
            assert(a.ui.defenderCaptured.textContent === '1 captured', 'Capture not rendered')
            assert(a.values.has(RECOVERY_KEY) && b.values.has(ONLINE_PRESENTATION_KEY), 'Recovery or presentation save missing')
        })
        await check('Live review retains comment drafts and Return to live restores play', async () => {
            const { a, b } = await pair()
            await a.play('D11', 'D8'); await settled(a, b)
            a.set('comment-text', 'A draft about the opening')
            await b.play('F8', 'E8'); await settled(a, b)
            assert(a.ui.reviewPosition.textContent === 'Reviewing · 1 / 2', 'Draft move was not retained')
            assert(a.ui.commentText.value === 'A draft about the opening', 'Live move erased the draft')
            a.ui.commentAdd.click()
            b.ui.reviewBack.click()
            await until(() => b.ui.commentList.textContent!.includes('A draft about the opening'), 'Shared review comment missing')
            assert(b.ui.commentList.textContent!.includes('Attackers · Opponent'), 'Same-name byline lost seat identity')
            b.ui.history.querySelector<HTMLButtonElement>('[data-ply="1"]')!.focus()
            a.click('return-live'); await a.play('F10', 'F8'); await settled(a, b)
            assert(b.ui.reviewPosition.textContent === 'Reviewing · 1 / 3', 'Peer move stole historical cursor')
            assert(document.activeElement === b.ui.history.querySelector('[data-ply="1"]'), 'New live move lost history keyboard focus')
        })
        await check('Concurrent comments, rename, historical export and reference previews remain separate from moves', async () => {
            const { a, b } = await pair()
            await a.play('D11', 'D8'); await settled(a, b)
            a.set('comment-text', 'Opening <D8>'); b.set('comment-text', 'For [Alex]')
            a.ui.commentAdd.click(); b.ui.commentAdd.click()
            await until(() => a.ui.commentList.querySelectorAll('article').length === 2 && b.ui.commentList.querySelectorAll('article').length === 2, 'Concurrent comments were lost')
            a.click('online-rename'); a.set('new-screen-name', 'Sam'); a.click('save-screen-name')
            await until(() => b.element('attacker-player').textContent!.includes('Sam'), 'Rename not delivered')
            assert(b.ui.commentList.textContent!.includes('Alex'), 'Rename changed a historical author')
            b.ui.commentList.querySelector<HTMLButtonElement>('.comment-reference')!.click()
            assert(b.source.getView().state.moveHistory.length === 1, 'Reference played a move')
            b.ui.commentList.querySelector<HTMLButtonElement>('.comment-reference')!.focus()
            // Inject the peer snapshot through the real relay: submitting in the
            // other fixture would intentionally focus its editor in this shared document.
            const incoming = JSON.parse(a.values.get(ONLINE_PRESENTATION_KEY)!).annotations
            incoming.comments.push({ id: 'focus-comment', seat: 'attacker', author: 'Sam', text: 'One more thought',
                order: Math.max(...incoming.comments.map((comment: { order: number }) => comment.order)) + 1,
                prefix: a.source.getRecovery()!.record.moves })
            a.source.sendFeature('annotations-v1', incoming)
            await until(() => b.ui.commentList.querySelectorAll('article').length === 3, 'New comment missing')
            assert(document.activeElement === b.ui.commentList.querySelector('.comment-reference'), 'New comment lost reference keyboard focus')
            a.ui.newGame.click()
            assert(a.element<HTMLInputElement>('online-name').value === 'Sam', 'Next room did not remember the changed name')
            a.click('online-cancel')
            a.ui.reviewStart.click(); a.ui.exportButton.click()
            assert(a.ui.exportText.value.includes('[Attackers:Sam]') && a.ui.exportText.value.includes('{[Alex]:Opening <D8>}'), 'Export omitted names/comments')
            assert(!a.ui.exportText.value.includes(a.source.getRecovery()!.credentials.token), 'Export leaked credentials')
            const local = new LocalGameSession({ review: true })
            assert(local.loadGame(a.ui.exportText.value, local.getView().generation).success, 'Export did not replay locally'); local.dispose()
        })
        await check('Refresh restores the room, both names, comments and independent review cursor', async () => {
            const { a, b } = await pair()
            await a.play('D11', 'D8'); await settled(a, b)
            a.set('comment-text', 'Keep this thought'); a.ui.commentAdd.click()
            await until(() => b.ui.commentList.textContent!.includes('Keep this thought'), 'Comment not received')
            a.ui.reviewStart.click(); const code = a.source.getRecovery()!.credentials.roomCode
            a.unmount(); await until(() => b.source.getView().connection === 'waiting', 'Peer disconnect not detected')
            a.remount(); await settled(a, b)
            assert(a.source.getRecovery()!.credentials.roomCode === code, 'Refresh created another room')
            assert(a.ui.reviewPosition.textContent === 'Reviewing · 0 / 1', 'Review cursor not restored')
            a.click('return-live'); await until(() => a.ui.commentList.textContent!.includes('Keep this thought'), 'Comment did not restore')
            a.unmount(); await until(() => b.source.getView().connection === 'waiting', 'Second departure not detected')
            a.configure(''); a.remount()
            assert(a.source.getView().connection === 'closed', 'Missing relay unexpectedly connected')
            assert(JSON.parse(a.values.get(RECOVERY_KEY)!).resume, 'Inert review disabled the saved resume intent')
            a.unmount(); a.configure(endpoint); a.remount(); await settled(a, b)
        })
        await check('Failed join preserves the current board and saved local record', async () => {
            const a = fixture()
            a.root.querySelector<HTMLButtonElement>('[data-square="D11"]')!.click(); a.root.querySelector<HTMLButtonElement>('[data-square="D8"]')!.click()
            await until(() => a.ui.history.textContent!.includes('d11-d8'), 'Local preparation move failed')
            const saved = a.values.get(LOCAL_GAME_KEY)
            a.prepare('join', 'ZZZZZZ'); a.go()
            await until(() => a.element('online-setup-error').textContent!.includes('room_not_found'), 'Join failure was not explained')
            assert(a.ui.history.textContent!.includes('d11-d8') && a.values.get(LOCAL_GAME_KEY) === saved, 'Failed join replaced local game')
        })
        await check('Local continuation autosaves separately and cannot resume/publish the abandoned room', async () => {
            const { a, b } = await pair()
            await a.play('D11', 'D8'); await settled(a, b)
            a.click('online-local'); a.ui.replace.click()
            await until(() => b.source.getView().connection === 'waiting', 'Local departure did not disconnect')
            assert(a.element('game-mode').textContent!.includes('Local'), 'Local continuation missing')
            a.root.querySelector<HTMLButtonElement>('[data-square="F8"]')!.click(); a.root.querySelector<HTMLButtonElement>('[data-square="E8"]')!.click()
            await until(() => a.ui.history.textContent!.includes('f8-e8'), 'Local continuation move failed')
            assert(JSON.parse(a.values.get(RECOVERY_KEY)!).resume === false, 'Online automatic resume still enabled')
            a.unmount(); a.remount()
            assert(a.element('game-mode').textContent!.includes('Local') && a.ui.history.textContent!.includes('f8-e8'), 'Local continuation failed to restore')
            assert(b.source.getView().state.moveHistory.length === 1, 'Local continuation reached peer')
        })
        await check('Leave closes both rooms while record navigation and export stay available', async () => {
            const { a, b } = await pair()
            await a.play('D11', 'D8'); await settled(a, b)
            a.click('online-leave'); a.ui.replace.click()
            await until(() => b.source.getView().connection === 'closed', 'Peer room remained open')
            b.ui.reviewStart.click(); assert(b.ui.reviewPosition.textContent!.includes('0 / 1'), 'Closed room review disabled')
            b.ui.exportButton.click(); assert(b.ui.exportText.value.includes('d11-d8'), 'Closed room export disabled')
            assert(b.source.getView().state.outcome === null, 'Leave incorrectly resigned the game')
        })
        await check('Online room, long duplicate names and review fit phone/desktop widths in both palettes', async () => {
            const game = createGameRecord('layout-game', ['D11-D8', 'F8-E8'])
            assert(game.success, 'Layout record failed')
            const name = 'LongScreenName'.repeat(5), credentials = { roomCode: 'ABCDEF', gameId: 'layout-game', seat: 'attacker', token: 'layout-only' }
            const entries = [[RECOVERY_KEY, JSON.stringify({ storageVersion: 1, endpoint, credentials, clientVersion: '1.0.0', savedAt: 0, resume: true, record: game.value.record, conflict: null })],
                [ONLINE_PRESENTATION_KEY, JSON.stringify({ version: 1, endpoint, gameId: credentials.gameId, seat: 'attacker', cursor: 0,
                    annotations: { version: 1, gameId: credentials.gameId, profiles: { attacker: { revision: 1, name }, defender: { revision: 1, name } }, comments: [] } })]]
            const script = `import ${JSON.stringify(new URL('./@vite/client', location.href).href)};
                import { mountClient } from ${JSON.stringify(new URL('../client/application.ts', import.meta.url).href)};
                import ${JSON.stringify(new URL('../client/styles.css', import.meta.url).href)};
                const values = new Map(${JSON.stringify(entries)});
                mountClient(document, { storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, online: { endpoint: '' } });`
            const source = markup.documentElement.outerHTML.replace('</body>', `<script type="module">${script}</script></body>`)
            for (const scheme of ['light', 'dark']) for (const width of [320, 390, 768, 1200]) {
                const frame = document.createElement('iframe'); frame.title = `Online ${scheme} at ${width}`
                frame.style.cssText = `width:${width}px;height:1100px;border:0;color-scheme:${scheme}`; frame.srcdoc = source
                document.querySelector('#client-fixtures')!.append(frame); cleanups.push(() => frame.remove())
                await until(() => frame.contentDocument?.querySelector('#game-mode')?.textContent?.includes('Online') ?? false, `Online ${width} frame failed to mount`)
                const doc = frame.contentDocument!, board = doc.querySelector<HTMLElement>('#game-board')!.getBoundingClientRect()
                assert(doc.documentElement.scrollWidth <= width + 1, `${scheme} ${width} overflowed horizontally`)
                assert(Math.abs(board.width - board.height) < 1, `${scheme} ${width} board was not square`)
                assert(doc.querySelector('#attacker-player')!.textContent!.includes(name), 'Long name was lost')
                assert(doc.querySelector('#online-status')!.textContent!.includes('closed'), 'Inert recovered game did not explain connection state')
                if (scheme === 'light' && width === 320) {
                    frame.contentWindow!.location.hash = 'room=ZZZZZZ'
                    await until(() => !!doc.querySelector<HTMLDialogElement>('#online-setup')?.open, 'Same-page invitation did not open setup')
                    assert(doc.querySelector<HTMLInputElement>('#online-code')!.value === 'ZZZZZZ', 'Same-page invitation did not prefill the new code')
                    assert(doc.querySelector('#visible-room-code')!.textContent === 'ABCDEF', 'Invitation replaced the retained room without joining')
                    doc.querySelector<HTMLButtonElement>('#online-cancel')!.click()
                }
                frame.remove()
            }
        })
    } catch (error) { failed++; const row = document.createElement('li'); row.textContent = String(error); results.append(row) }
    finally { cleanups.splice(0).forEach(cleanup => cleanup()); summary.textContent = `${passed} passed; ${failed} failed`; run.disabled = false }
}

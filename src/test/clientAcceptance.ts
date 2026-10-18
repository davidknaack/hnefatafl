import { ClientDependencies, mountLocalClient } from '../client/client'
import { clientElements } from '../client/elements'
import { LocalGameSession } from '../session/LocalGameSession'
import '../client/styles.css'

const run = document.querySelector<HTMLButtonElement>('#run-client')!
const summary = document.querySelector<HTMLElement>('#client-summary')!
const results = document.querySelector<HTMLElement>('#client-results')!
const fixtures = document.querySelector<HTMLElement>('#client-fixtures')!
const cornerWinGame = 'd11-d10 d6-d9 h11-h10 e6-d6 h10-i10 d6-d8 g11-g10 f6-c6 g10-h10 c6-c11 i10-i9 c11-a11'
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
function motionPreference(matches: boolean): () => void {
    const original = window.matchMedia
    window.matchMedia = query => {
        const result = original.call(window, query)
        if (query === '(prefers-reduced-motion: reduce)') Object.defineProperty(result, 'matches', { value: matches })
        return result
    }
    return () => { window.matchMedia = original }
}
async function until(check: () => boolean, message: string) {
    const deadline = Date.now() + 2000
    while (!check()) {
        if (Date.now() > deadline) throw new Error(message)
        await new Promise(resolve => setTimeout(resolve, 20))
    }
}

run.onclick = async () => {
    run.disabled = true; results.replaceChildren(); summary.textContent = 'Running…'
    let passed = 0, failed = 0, cleanup = () => {}
    try {
        const response = await fetch('./index.html')
        assert(response.ok, 'Could not load production markup')
        const source = new DOMParser().parseFromString(await response.text(), 'text/html')
        source.querySelectorAll('script').forEach(script => script.remove())
        function mount(dependencies: ClientDependencies = {}) {
            const root = document.createElement('div'); root.innerHTML = source.body.innerHTML
            fixtures.append(root)
            const session = new LocalGameSession({ review: true }), dispose = mountLocalClient(root, session, dependencies)
            cleanup = () => { dispose(); root.remove() }
            const ui = clientElements(root)
            const square = (name: string) => root.querySelector<HTMLButtonElement>(`[data-square="${name}"]`)!
            const load = (text: string) => { ui.importButton.click(); ui.importText.value = text; ui.load.click() }
            return { root, ui, session, square, load }
        }
        async function check(name: string, action: () => void | Promise<void>) {
            const row = document.createElement('li'); row.textContent = `${name}: running`; results.append(row)
            try { await action(); passed++; row.textContent = `PASS — ${name}` }
            catch (error) { failed++; row.textContent = `FAIL — ${name}: ${error instanceof Error ? error.message : String(error)}` }
            finally { cleanup(); cleanup = () => {} }
        }
        await check('Opening board, one keyboard stop, initial side and counts', () => {
            const f = mount()
            assert(f.root.querySelectorAll('.square').length === 121, 'Board has wrong square count')
            assert(f.root.querySelectorAll('.square[tabindex="0"]').length === 1, 'Board is not one Tab stop')
            assert(f.ui.title.textContent === 'Attackers to move' && f.ui.attackers.textContent === '24' && f.ui.defenders.textContent === '13', 'Opening state incorrect')
            assert(f.ui.exportButton.disabled && f.ui.clear.disabled, 'Empty game controls incorrect')
            f.square('F8').click()
            assert(!f.root.querySelector('.selected'), 'Wrong side could select a piece')
        })
        await check('Hover feedback is limited to the moving side, then to legal destinations', async () => {
            const f = mount()
            assert(f.root.querySelectorAll('.square.actionable').length === 24, 'Opening hover actions include empty squares or defenders')
            assert(!f.square('F8').classList.contains('actionable') && !f.square('B11').classList.contains('actionable'), 'Inactive piece/empty square advertises an action')
            f.square('D11').click(); f.square('D10').click()
            await until(() => f.ui.title.textContent === 'Defenders to move', 'Hover fixture did not play')
            assert(f.root.querySelectorAll('.square.actionable').length === 13 && f.square('F6').classList.contains('actionable') && !f.square('D10').classList.contains('actionable'), 'Hover actions did not follow the side to move/king')
            f.square('F8').click()
            const legal = f.root.querySelectorAll('.legal-destination')
            assert(legal.length > 0 && f.root.querySelectorAll('.actionable').length === legal.length && [...legal].every(el => el.classList.contains('actionable')), 'Selection left hover feedback on non-destinations')
            const selectedRing = getComputedStyle(f.square('F8'), '::after')
            assert(selectedRing.borderRadius === '50%' && parseFloat(selectedRing.width) < f.square('F8').getBoundingClientRect().width * .75, 'Feedback ring did not follow the piece diameter')
            await until(() => getComputedStyle(f.square('F8'), '::after').boxShadow.includes('217, 151, 135'), 'Selection ring did not turn muted red')
            assert(getComputedStyle(f.square('F8')).backgroundColor === getComputedStyle(f.square('H8')).backgroundColor, 'Selecting a piece still highlighted the square background')
            f.ui.clear.click()
            assert(f.root.querySelectorAll('.square.actionable').length === 13, 'Clearing did not restore selectable-piece feedback')
        })
        await check('Legal dots stagger outward by distance without delaying removal or move input', async () => {
            const f = mount(), reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
            const hint = (name: string) => f.square(name).querySelector<HTMLElement>('.destination-hint')!
            f.square('D11').click()
            const delays = ['D10', 'D9', 'D8', 'D7'].map(name => parseFloat(getComputedStyle(hint(name)).transitionDelay) * 1000)
            assert(delays.every((value, index) => Math.abs(value - (reduced ? 0 : index * 10)) < .1), 'Dot appearance did not use a short outward sequence (or ignored reduced motion)')
            f.square('F10').click()
            assert(!f.square('D7').classList.contains('legal-destination') && parseFloat(getComputedStyle(hint('D7')).transitionDelay) === 0, 'Reselection delayed hiding a stale destination')
            f.ui.clear.click()
            assert(!f.root.querySelector('.legal-destination') && parseFloat(getComputedStyle(hint('D9')).transitionDelay) === 0, 'Clearing retained a delayed dot')
            f.square('D11').click(); f.square('D7').click()
            await until(() => f.session.getView().state.moveHistory[0] === 'D11-D7', 'Dot animation prevented an immediate legal move')
        })
        await check('Sliding moves, growing arrows, rapid navigation and timed indicator cleanup', async () => {
            const restore = motionPreference(false)
            try {
                const f = mount(); f.load('d11-d8 f8-e8 d8-c8'); f.ui.reviewStart.click()
                f.ui.reviewNext.click()
                const piece = f.square('D8').querySelector<HTMLElement>('.piece')!, animation = piece.getAnimations()[0]
                const svg = f.ui.board.querySelector<SVGSVGElement>('.move-indicator')!, head = svg.querySelector('.move-arrow-head')!
                assert(f.ui.title.textContent === 'Defenders to move' && animation && animation.effect!.getTiming().duration === 420, 'Move did not commit before its visible slide')
                assert(svg.querySelectorAll('.move-ghost.attacker').length === 1 && !svg.querySelector('rect.move-origin') && svg.dataset.from === '3,0' && svg.dataset.to === '3,3', 'Indicator did not replace the origin highlight with the moving piece ghost')
                assert(getComputedStyle(svg.querySelector('.move-ghost')!).opacity === '0.25', 'Origin piece is not translucent')
                await until(() => (animation.effect!.getComputedTiming().progress ?? 0) > .03, 'Slide clock did not advance naturally')
                const progress = animation.effect!.getComputedTiming().progress!, rect = piece.getBoundingClientRect()
                const centerY = rect.top + rect.height / 2, source = f.square('D11').getBoundingClientRect(), target = f.square('D8').getBoundingClientRect()
                assert(progress > 0 && progress < 1 && centerY > source.top + source.height / 2 && centerY < target.top + target.height / 2,
                    `Animation did not advance between squares: progress=${progress}, center=${centerY}, source=${source.top + source.height / 2}, target=${target.top + target.height / 2}`)
                const shape = head.getAttribute('d'), stem = svg.querySelector('.move-arrow rect')!
                animation.pause(); animation.currentTime = 50
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
                const early = Number(stem.getAttribute('width'))
                animation.currentTime = 320
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
                assert(Number(stem.getAttribute('width')) > early && head.getAttribute('d') === shape, 'Arrow stem did not grow independently of its fixed head')
                f.ui.reviewNext.click()
                assert(animation.playState === 'idle' && getComputedStyle(piece).transform === 'none', 'A second step did not snap the prior piece to its committed square')
                assert(f.ui.board.querySelectorAll('.move-indicator').length === 1 && f.ui.board.querySelector<SVGSVGElement>('.move-indicator')!.dataset.from === '5,3' && f.ui.board.querySelector('.move-ghost.defender'), 'A second step retained a stale arrow/ghost')
                f.ui.reviewNext.click()
                const latest = f.square('C8').querySelector<HTMLElement>('.piece')!.getAnimations()[0]
                f.square('E8').click()
                assert(latest.playState === 'idle' && !f.root.querySelector('.piece-in-motion'), 'Selecting the next piece did not cancel the slide')
                const indicator = f.ui.board.querySelector('.move-indicator')!, fade = indicator.getAnimations()[0]
                assert(fade.effect!.getTiming().duration === 180 && fade.effect!.getTiming().easing === 'ease-out', 'Snapping the move did not start the short shared fade')
                f.ui.clear.click()
                await until(() => !f.ui.board.querySelector('.move-indicator'), 'Expired arrow/origin highlight was not removed')
                f.ui.reviewBack.click()
                assert(f.ui.board.querySelector<SVGSVGElement>('.move-indicator')!.dataset.from === '2,3' && f.square('D8').querySelector('.piece')!.getAnimations().length === 1, 'Backward step did not slide the restored piece back')
                f.ui.reviewStart.click()
                assert(!f.root.querySelector('.piece-in-motion') && !f.ui.board.querySelector('.move-indicator'), 'Jump to opening retained an animation')
            } finally { restore() }
        })
        await check('Reduced motion skips piece slides and shows a static, temporary move indicator', () => {
            const restore = motionPreference(true)
            try {
                const f = mount(); f.load('d11-d8 f8-e8'); f.ui.reviewStart.click(); f.ui.reviewNext.click()
                assert(!f.root.querySelector('.piece-in-motion') && f.square('D8').querySelector('.piece')!.getAnimations().length === 0, 'Reduced motion still slid a piece')
                const svg = f.ui.board.querySelector('.move-indicator')!
                assert(svg && svg.getAnimations()[0].effect!.getTiming().duration === 420 && Number(svg.querySelector('.move-arrow rect')!.getAttribute('width')) > 0, 'Reduced motion omitted the brief static arrow or retained growth')
            } finally { restore() }
        })
        await check('Captured pieces, origin ghost and arrow share one ease-out after arrival', async () => {
            const restore = motionPreference(false)
            try {
                const f = mount(); f.load('d11-d8 f8-e8 f10-f8'); f.ui.history.querySelector<HTMLButtonElement>('[data-ply="2"]')!.click()
                f.ui.reviewNext.click()
                const moving = f.square('F8').querySelector('.piece')!.getAnimations()[0], victim = f.square('E8').querySelector<HTMLElement>('.capture-piece')!
                const indicator = f.ui.board.querySelector('.move-indicator')!
                assert(victim?.classList.contains('defender') && victim.getAttribute('aria-hidden') === 'true', 'Capture victim disappeared before the slide or became interactive')
                moving.pause(); moving.currentTime = 210
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
                assert(getComputedStyle(victim).opacity === '1' && victim.getAnimations().length === 0, 'Capture victim began fading before the moving piece arrived')
                assert(f.square('E8').getAttribute('aria-label')?.includes('empty') && f.ui.defenders.textContent === '12', 'Capture presentation delayed the committed game state')
                moving.finish()
                await until(() => victim.getAnimations().length === 1, 'Capture did not start fading on slide completion')
                const removal = victim.getAnimations()[0]
                const indicatorFade = indicator.getAnimations()[0]
                assert(removal.effect!.getTiming().duration === 180 && removal.effect!.getTiming().easing === 'ease-out', 'Capture removal did not ease out')
                assert(indicatorFade.effect!.getTiming().duration === 180 && indicatorFade.effect!.getTiming().easing === 'ease-out' && indicatorFade.startTime === removal.startTime, 'Ghost/arrow and capture fades did not share timing and start time')
                removal.pause(); removal.currentTime = 90
                indicatorFade.pause(); indicatorFade.currentTime = 90
                const opacity = Number(getComputedStyle(victim).opacity)
                assert(opacity > 0 && opacity < 1, 'Capture removal vanished instead of fading')
                assert(Math.abs(opacity - Number(getComputedStyle(indicator).opacity)) < .001, 'Capture and previous-position indicator eased out at different rates')
                removal.finish(); indicatorFade.finish()
                await until(() => !victim.isConnected && !indicator.isConnected, 'Shared fade did not remove capture, ghost and arrow together')
                assert(!f.root.querySelector('.capture-piece'), 'Captured visual survived its fade')
            } finally { restore() }
        })
        await check('Multiple captures and a captured king fade together and clear on reset', async () => {
            const restore = motionPreference(false)
            try {
                const f = mount()
                const multiple = Array.from({ length: 11 }, () => Array<string>(11).fill('.'))
                for (const [x, y] of [[0, 0], [10, 0], [0, 10], [10, 10]]) multiple[y][x] = 'R'
                for (const [x, y, piece] of [[3, 0, 'A'], [4, 1, 'D'], [5, 1, 'A'], [3, 2, 'D'], [3, 3, 'A'], [5, 5, 'K']] as const) multiple[y][x] = piece
                const king = ['R.........R', '...........', '...........', '...........', '.....A.....',
                    '...A.KA....', '.....A.....', '...........', '...........', '...........', 'RD........R']
                for (const fixture of [{ layout: multiple.map(row => row.join('')), command: 'D11-D10', target: 'D10', count: 2, king: false },
                    { layout: king, command: 'D6-E6', target: 'E6', count: 1, king: true }]) {
                    assert(f.session.reset(f.session.getView().generation, fixture.layout).success, 'Capture fixture did not reset')
                    assert((await f.session.submitMove(fixture.command, f.session.getView().generation)).success, 'Capture fixture did not play')
                    const victims = [...f.root.querySelectorAll<HTMLElement>('.capture-piece')]
                    assert(victims.length === fixture.count && victims.every(piece => piece.getAnimations().length === 0), 'Capture did not retain every victim during the move')
                    if (fixture.king) assert(victims[0].classList.contains('king') && victims[0].textContent === '♔', 'Captured king lost its appearance')
                    f.square(fixture.target).querySelector('.piece')!.getAnimations()[0].finish()
                    await until(() => victims.every(piece => piece.getAnimations().length === 1), 'Capture victims did not start fading together')
                    const fades = victims.map(piece => piece.getAnimations()[0])
                    f.session.reset(f.session.getView().generation)
                    assert(victims.every(piece => !piece.isConnected) && fades.every(animation => animation.playState === 'idle'), 'Reset left capture effects running')
                }
            } finally { restore() }
        })
        await check('Rapid review, disposal and reduced motion never retain stale capture pieces', async () => {
            const restore = motionPreference(false)
            try {
                const f = mount(); f.load('d11-d8 f8-e8 f10-f8'); f.ui.history.querySelector<HTMLButtonElement>('[data-ply="2"]')!.click(); f.ui.reviewNext.click()
                const victim = f.square('E8').querySelector('.capture-piece')!, slide = f.square('F8').querySelector('.piece')!.getAnimations()[0]
                f.ui.reviewBack.click()
                assert(!victim.isConnected && slide.playState === 'idle' && f.square('E8').querySelector('.piece.defender'), 'Stepping back retained a capture copy over the restored piece')
                f.ui.reviewNext.click()
                const pending = f.square('F8').querySelector('.piece')!.getAnimations()[0]
                cleanup()
                assert(pending.playState === 'idle', 'Disposal left capture movement running')
            } finally { restore() }
            const restoreReduced = motionPreference(true)
            try {
                const f = mount(); f.load('d11-d8 f8-e8 f10-f8'); f.ui.history.querySelector<HTMLButtonElement>('[data-ply="2"]')!.click(); f.ui.reviewNext.click()
                assert(!f.root.querySelector('.capture-piece') && !f.root.querySelector('.piece-in-motion') && f.ui.defenders.textContent === '12', 'Reduced motion retained animated capture pieces')
            } finally { restoreReduced() }
        })
        await check('Attacker and defender wins grow in place over the winning piece after arrival', async () => {
            const restore = motionPreference(false)
            try {
                const f = mount()
                const king = ['R.........R', '...........', '...........', '...........', '.....A.....',
                    '...A.KA....', '.....A.....', '...........', '...........', '...........', 'RD........R']
                assert(f.session.reset(f.session.getView().generation, king).success, 'Winning capture fixture did not reset')
                assert((await f.session.submitMove('D6-E6', f.session.getView().generation)).success, 'Winning capture did not play')
                const slide = f.square('E6').querySelector('.piece')!.getAnimations()[0]
                slide.pause(); slide.currentTime = 210
                assert(!f.root.querySelector('.board-win'), 'Win message appeared before the winning piece arrived')
                slide.finish()
                await until(() => !!f.root.querySelector('.board-win'), 'Winning arrival did not show its message')
                const message = f.root.querySelector<HTMLElement>('.board-win')!, animation = message.getAnimations()[0]
                assert(message.querySelector('.board-win-side')?.textContent === 'Attacker' && message.querySelector('.board-win-word')?.textContent === 'WIN', 'Attacker win message is not two lines')
                assert(Number.parseFloat(getComputedStyle(message.querySelector('.board-win-word')!).fontSize) > Number.parseFloat(getComputedStyle(message.querySelector('.board-win-side')!).fontSize), 'WIN is not the larger line')
                assert(message.getAttribute('aria-hidden') === 'true' && getComputedStyle(message).pointerEvents === 'none', 'Visual result interferes with input or repeats the live announcement')
                animation.pause(); animation.currentTime = 350
                const early = message.getBoundingClientRect(), target = f.square('E6').getBoundingClientRect()
                animation.currentTime = 1200
                const late = message.getBoundingClientRect()
                assert(late.width > early.width && Math.abs(late.left + late.width / 2 - target.left - target.width / 2) < 2 && Math.abs(late.top + late.height / 2 - target.top - target.height / 2) < 2, 'Win message drifted from the winning square while growing')
                animation.finish(); await until(() => !message.isConnected, 'Win message did not clean up')
                assert(f.ui.title.textContent === 'Attackers win', 'Transient result removal lost the permanent result')
                const escape = Array.from({ length: 11 }, () => Array<string>(11).fill('.'))
                for (const [x, y] of [[0, 0], [10, 0], [0, 10], [10, 10]]) escape[y][x] = 'R'
                escape[0][2] = 'K'; escape[1][5] = 'A'
                f.session.reset(f.session.getView().generation, escape.map(row => row.join('')))
                assert((await f.session.submitMove('F10-F9', f.session.getView().generation)).success && (await f.session.submitMove('C11-A11', f.session.getView().generation)).success, 'Winning corner escape did not play')
                f.square('A11').querySelector('.piece')!.getAnimations()[0].finish()
                await until(() => !!f.root.querySelector('.board-win.defender'), 'Defender escape did not show the defender result')
                const defender = f.root.querySelector<HTMLElement>('.board-win')!
                assert(defender.querySelector('.board-win-side')?.textContent === 'Defender' && parseFloat(defender.style.left) < 5 && parseFloat(defender.style.top) < 5, 'Escape result was not anchored over the corner king')
            } finally { restore() }
        })
        await check('Win messages use the actual winner, replay on terminal review and cancel on navigation', async () => {
            const restore = motionPreference(false)
            try {
                const f = mount(), cycle = 'd11-d10 f8-e8 d10-d11 e8-f8'
                f.session.loadGame(`${cycle} ${cycle}`, f.session.getView().generation)
                const initial = f.root.querySelector<HTMLElement>('.board-win.attacker')!
                assert(initial && f.square('F8').dataset.piece === 'defender', 'Repetition message confused the last mover with the winner')
                initial.getAnimations()[0].finish(); await until(() => !initial.isConnected, 'Initial final-position message did not expire')
                f.session.reviewMove('main', 8, f.session.getView().generation)
                assert(!f.root.querySelector('.board-win'), 'Same-position updates restarted the celebration')
                f.ui.reviewBack.click(); f.ui.reviewNext.click()
                const slide = f.square('F8').querySelector('.piece')!.getAnimations()[0]
                f.ui.reviewBack.click(); slide.finish()
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
                assert(!f.root.querySelector('.board-win'), 'Cancelled winning movement announced a stale result')
                f.ui.reviewNext.click(); f.square('F8').querySelector('.piece')!.getAnimations()[0].finish()
                await until(() => !!f.root.querySelector('.board-win.attacker'), 'Returning to the terminal move did not replay the result')
                const replayed = f.root.querySelector('.board-win')!, effect = replayed.getAnimations()[0]
                f.ui.reviewBack.click()
                assert(!replayed.isConnected && effect.playState === 'idle', 'Review retained a stale result animation')
            } finally { restore() }
        })
        await check('Win messages remain centered and fit both escape corners at responsive widths', async () => {
            const frame = document.createElement('iframe'); frame.title = 'Responsive win message test'
            frame.style.height = '900px'; frame.style.border = '0'
            const loaded = new Promise<void>(resolve => { frame.onload = () => resolve() })
            frame.src = './index.html'; fixtures.append(frame); cleanup = () => frame.remove(); await loaded
            const doc = frame.contentDocument!, win = frame.contentWindow!
            const mirrored = cornerWinGame.replace(/[a-k](?=\d)/g, file => String.fromCharCode('k'.charCodeAt(0) - (file.charCodeAt(0) - 'a'.charCodeAt(0))))
            for (const width of [320, 390, 768, 1200]) {
                frame.style.width = `${width}px`
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
                for (const [game, corner] of [[cornerWinGame, 'A11'], [mirrored, 'K11']]) {
                    doc.querySelector<HTMLButtonElement>('#import-button')!.click()
                    doc.querySelector<HTMLTextAreaElement>('#import-text')!.value = game
                    doc.querySelector<HTMLButtonElement>('#load-game')!.click()
                    if (doc.querySelector<HTMLDialogElement>('#confirm-dialog')!.open) doc.querySelector<HTMLButtonElement>('#confirm-replace')!.click()
                    const message = doc.querySelector<HTMLElement>('.board-win')!
                    assert(message, `Winning record did not announce at ${width}px`)
                    const animation = message.getAnimations()[0]; animation.pause(); animation.currentTime = 1700
                    const rect = message.getBoundingClientRect(), target = doc.querySelector(`[data-square="${corner}"]`)!.getBoundingClientRect()
                    assert(Math.abs(rect.left + rect.width / 2 - target.left - target.width / 2) < 2 && Math.abs(rect.top + rect.height / 2 - target.top - target.height / 2) < 2, `Growing message drifted from ${corner} at ${width}px`)
                    assert(rect.left >= 0 && rect.right <= win.innerWidth && doc.documentElement.scrollWidth <= doc.documentElement.clientWidth,
                        `Win message overflowed at ${corner}, ${width}px: bounds=${rect.left}..${rect.right}, viewport=${win.innerWidth}, scroll=${doc.documentElement.scrollWidth}`)
                }
            }
        })
        await check('Reduced-motion wins stay static, use center for resignation and dispose cleanly', () => {
            const restore = motionPreference(true)
            try {
                const f = mount(); f.session.loadGame('d11-d10 ---', f.session.getView().generation)
                const message = f.root.querySelector<HTMLElement>('.board-win')!, animation = message.getAnimations()[0]
                const frames = (animation.effect as KeyframeEffect).getKeyframes()
                assert(message.style.left === '50%' && message.style.top === '50%', 'Resignation invented a winning destination')
                assert(frames.every(frame => !('transform' in frame) && frame.opacity === '1'), 'Reduced-motion result still scaled or faded')
                assert(animation.effect!.getTiming().duration === 1800 && !f.root.querySelector('.piece-in-motion'), 'Reduced-motion result did not use the static display')
                cleanup()
                assert(animation.playState === 'idle' && !message.isConnected, 'Disposed board retained its result')
            } finally { restore() }
        })
        await check('Selection, reselection, same-square and Escape cancellation', () => {
            const f = mount()
            f.square('D11').click()
            assert(f.root.querySelectorAll('.legal-destination').length > 0, 'No legal moves')
            f.square('F10').click()
            assert(f.square('F10').classList.contains('selected') && !f.square('D11').classList.contains('selected'), 'Reselection failed')
            f.square('F10').click()
            assert(!f.root.querySelector('.selected'), 'Same-square cancellation failed')
            f.square('D11').click()
            f.square('D11').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
            assert(!f.root.querySelector('.selected') && f.ui.clear.disabled, 'Escape did not clear')
        })
        await check('Keyboard traversal and focus survive a committed move', async () => {
            const f = mount(), button = f.square('D11')
            button.focus(); button.click()
            button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
            assert(document.activeElement === f.square('D10'), 'Arrow navigation failed')
            f.square('D10').click()
            await until(() => f.ui.title.textContent === 'Defenders to move', 'Move did not commit')
            assert(button === f.square('D11') && document.activeElement === f.square('D10'), 'Move replaced buttons or lost focus')
            f.square('D10').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', ctrlKey: true, bubbles: true }))
            assert(document.activeElement === f.square('K1'), 'Ctrl+End failed')
            f.square('K1').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true }))
            assert(document.activeElement === f.square('A11'), 'Ctrl+Home failed')
        })
        await check('Three played moves, automatic capture, history and export', async () => {
            const f = mount()
            for (const [from, to, length] of [['D11', 'D8', 1], ['F8', 'E8', 2], ['F10', 'F8', 3]] as const) {
                f.square(from).click(); f.square(to).click()
                await until(() => f.session.getView().state.moveHistory.length === length, 'Move failed')
            }
            assert(f.ui.defenders.textContent === '12' && f.ui.captures.textContent?.includes('1 defender'), 'Capture counts incorrect')
            assert(f.ui.history.textContent?.includes('f10-f8xe8'), 'Capture missing from history')
            assert(!f.root.querySelector('.legal-destination'), 'Stale highlights remained')
            f.ui.exportButton.click()
            assert(f.ui.exportDialog.open && f.ui.exportText.value === 'd11-d8 f8-e8 f10-f8xe8', 'Export was not canonical')
        })
        await check('Invalid import preserves game and selection', () => {
            const f = mount(); f.square('D11').click()
            f.load('d11-d10 garbage')
            assert(f.ui.importError.textContent && f.ui.importDialog.open, 'Invalid import did not report an error')
            assert(f.square('D11').classList.contains('selected') && !f.session.getView().state.moveHistory.length, 'Invalid import changed state/selection')
        })
        await check('Validated replacement can be cancelled, then confirmed', async () => {
            const f = mount()
            f.load('d11-d8 f8-e8 f10-f8')
            assert(f.ui.history.textContent?.includes('f10-f8xe8'), 'Valid import failed')
            f.load('a8-c8')
            assert(f.ui.confirm.open && document.activeElement === f.ui.cancelReplace, 'Replacement lacked safe focus/confirmation')
            f.ui.cancelReplace.click()
            assert(f.ui.history.textContent?.includes('f10-f8xe8'), 'Cancel replaced current game')
            // Let native dialog close events complete before opening a second confirmation.
            await new Promise(resolve => setTimeout(resolve, 40))
            f.ui.load.click(); f.ui.replace.click()
            assert(f.ui.history.textContent?.includes('a8-c8') && !f.ui.history.textContent?.includes('f10-f8'), 'Confirmed import did not replace')
        })
        await check('New-game cancellation and confirmation retain/replace correctly', async () => {
            const f = mount(); f.load('d11-d10')
            f.ui.newGame.click(); f.ui.cancelReplace.click()
            assert(f.ui.history.textContent?.includes('d11-d10'), 'Cancelled new game lost moves')
            await new Promise(resolve => setTimeout(resolve, 40))
            f.ui.newGame.click(); f.ui.replace.click()
            assert(f.ui.title.textContent === 'Attackers to move' && f.ui.empty.hidden === false && f.ui.exportButton.disabled, 'Confirmed new game did not reset')
        })
        await check('Repeated positions remain playable and terminal result disables play', async () => {
            const f = mount()
            f.load('d11-d10 f8-e8 d10-d11 e8-f8 d11-d10 f8-e8 d10-d11')
            f.square('E8').click()
            assert(f.square('F8').classList.contains('repeat-loss') && f.square('F8').getAttribute('aria-label')?.includes('defenders lose'), 'Repetition loss warning missing')
            f.square('F8').click()
            await until(() => f.ui.title.textContent === 'Attackers win', 'Third occurrence did not end game')
            assert(f.ui.detail.textContent?.includes('three times') && !f.ui.exportButton.disabled, 'Result/export incorrect')
            const before = f.ui.history.textContent; f.square('D11').click(); f.square('D10').click()
            assert(f.ui.history.textContent === before && f.square('D11').getAttribute('aria-disabled') === 'true', 'Ended game accepted interaction')
        })
        await check('Queued move cannot mutate a replaced session; disposed UI is inert', async () => {
            const f = mount(); f.square('D11').click(); f.square('D10').click(); f.ui.newGame.click()
            await new Promise(resolve => setTimeout(resolve, 20))
            assert(f.ui.title.textContent === 'Attackers to move' && f.ui.empty.hidden === false, 'Queued move leaked into new game')
            const before = f.ui.title.textContent; cleanup()
            f.square('D11').click(); f.square('D10').click()
            await new Promise(resolve => setTimeout(resolve, 20))
            assert(f.ui.title.textContent === before, 'Disposed controls mutated game')
        })
        await check('Real library retains source indices and validates only when Load game is pressed', async () => {
            const f = mount(); f.ui.importButton.click()
            await until(() => !f.ui.library.disabled, 'Library did not become available')
            assert(f.ui.library.options.length === 1753 && f.ui.library.options[1].textContent === 'Game 1'
                && f.ui.library.options[1752].textContent === 'Game 1752', 'Library rows were missing or reindexed')
            f.ui.library.value = '33'; f.ui.library.dispatchEvent(new Event('change'))
            f.ui.load.click()
            assert(f.ui.importError.textContent && f.ui.empty.hidden === false, 'Known incompatible record bypassed validation')
            f.ui.library.value = '0'; f.ui.library.dispatchEvent(new Event('change'))
            assert(f.ui.importText.value === 'h1-h3 f8-i8 f10-i10 d6-d3,0,0,Ongoing', 'Game 1 did not match source row 1')
            assert(!f.ui.importError.textContent && f.ui.empty.hidden === false && !f.ui.confirm.open, 'Selection loaded the game or retained an obsolete error')
            f.ui.load.click()
            assert(!f.ui.importDialog.open && f.ui.history.textContent?.includes('h1-h3') && f.ui.recordCount.textContent === '4 moves', 'Selected library record did not load')
        })
        await check('Switching library games and editing notation only change the draft', async () => {
            const f = mount({ loadLibrary: async () => ['d11-d10', 'a8-c8'] })
            f.ui.importButton.click(); await until(() => !f.ui.library.disabled, 'Fixture library did not load')
            for (const [value, notation] of [['0', 'd11-d10'], ['1', 'a8-c8']]) {
                f.ui.library.value = value; f.ui.library.dispatchEvent(new Event('change'))
                assert(f.ui.importText.value === notation && f.ui.empty.hidden === false, 'Selecting another game changed the board')
            }
            f.ui.importText.value = 'd11-d8'; f.ui.importText.dispatchEvent(new Event('input'))
            assert(f.ui.library.value === '' && f.ui.importText.value === 'd11-d8', 'Editing did not clear library association')
            f.ui.library.dispatchEvent(new Event('change'))
            assert(f.ui.importText.value === 'd11-d8', 'Blank selection erased the custom draft')
            f.ui.load.click()
            assert(f.ui.history.textContent?.includes('d11-d8'), 'Edited draft was not the record loaded')
        })
        await check('Delayed library fetch preserves typed notation and ignores disposed consumers', async () => {
            let finish!: (games: readonly string[]) => void
            const f = mount({ loadLibrary: () => new Promise(resolve => { finish = resolve }) })
            f.ui.importButton.click(); f.ui.importText.value = 'a8-c8'
            finish(['d11-d10']); await until(() => !f.ui.library.disabled, 'Delayed library did not finish')
            assert(f.ui.importText.value === 'a8-c8' && f.ui.library.value === '', 'Late fetch overwrote the draft')
            cleanup()
            const g = mount({ loadLibrary: () => new Promise(resolve => { finish = resolve }) })
            g.ui.importButton.click(); cleanup(); finish(['d11-d10'])
            await new Promise(resolve => setTimeout(resolve, 20))
            assert(g.ui.library.options.length === 1, 'Disposed dialog adopted a late library response')
        })
        await check('Library failure leaves custom loading usable and retries on reopening', async () => {
            let attempts = 0
            const f = mount({ loadLibrary: async () => {
                if (++attempts === 1) throw new Error('Test fetch failure')
                return ['d11-d10']
            } })
            f.ui.importButton.click()
            await until(() => !!f.ui.libraryStatus.textContent?.includes('could not'), 'Library failure was hidden')
            f.ui.importText.value = 'a8-c8'; f.ui.load.click()
            assert(f.ui.history.textContent?.includes('a8-c8'), 'Library failure disabled custom loading')
            f.ui.importButton.click(); await until(() => !f.ui.library.disabled, 'Reopening did not retry library fetch')
            assert(attempts === 2 && f.ui.importText.value === 'a8-c8', 'Retry lost the previous draft')
        })
        await check('Responsive layouts at 320, 390, 768 and 1200 CSS pixels', async () => {
            const frame = document.createElement('iframe')
            frame.title = 'Responsive local game test'; frame.style.height = '900px'; frame.style.border = '0'
            const loaded = new Promise<void>(resolve => { frame.onload = () => resolve() })
            frame.src = './index.html'; fixtures.append(frame)
            cleanup = () => frame.remove()
            await loaded
            for (const width of [320, 390, 768, 1200]) {
                frame.style.width = `${width}px`
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
                const doc = frame.contentDocument!, win = frame.contentWindow!
                assert(doc.documentElement.scrollWidth <= doc.documentElement.clientWidth, `Horizontal overflow at ${width}px`)
                const board = doc.querySelector<HTMLElement>('#game-board')!, rect = board.getBoundingClientRect()
                assert(rect.width > 200 && Math.abs(rect.width - rect.height) < 2, `Board distorted at ${width}px`)
                const columns = win.getComputedStyle(doc.querySelector('.game-layout')!).gridTemplateColumns.split(' ')
                assert(columns.length === (width <= 760 ? 1 : 2), `Incorrect layout at ${width}px`)
                assert(doc.querySelectorAll('.square').length === 121, `Client did not mount at ${width}px`)
            }
        })
        await check('Always-available navigation and move-list jumps preserve the complete game', () => {
            const f = mount(); f.load('d11-d8 f8-e8 f10-f8')
            f.ui.reviewStart.click()
            assert(f.ui.reviewPosition.textContent?.includes('0 / 3') && f.ui.history.querySelectorAll('button[data-ply]').length === 3, 'Opening review lost future moves')
            assert(f.ui.defenders.textContent === '13' && f.square('D11').getAttribute('aria-disabled') === 'false', 'Review position/permissions incorrect')
            f.ui.exportButton.click()
            assert(f.ui.exportText.value === 'd11-d8 f8-e8 f10-f8xe8', 'Saving a reviewed prefix truncated the game')
            f.ui.closeExport.click()
            f.ui.history.querySelector<HTMLButtonElement>('[data-ply="2"]')!.click()
            assert(f.ui.reviewPosition.textContent?.includes('2 / 3') && f.ui.history.querySelector('[aria-current="step"]')?.getAttribute('data-ply') === '2', 'Move-list jump failed')
            f.ui.reviewBack.click(); assert(f.ui.reviewPosition.textContent?.includes('1 / 3'), 'Previous move failed')
            f.ui.reviewNext.click(); assert(f.ui.reviewPosition.textContent?.includes('2 / 3'), 'Next move failed')
            f.ui.reviewEnd.click(); assert(String(f.ui.defenders.textContent) === '12' && f.square('F7').getAttribute('aria-disabled') === 'false', 'Returning to the tip did not restore play/captures')
            f.ui.reviewStart.click(); f.ui.newGame.click()
            assert(f.ui.confirm.open, 'A nonempty game at the opening was replaced without confirmation')
            f.ui.cancelReplace.click()
        })
        await check('A past-position move prompts for its description; Cancel and Escape discard the move', async () => {
            const f = mount(); f.load('d11-d10 f8-e8 d10-c10')
            f.ui.history.querySelector<HTMLButtonElement>('[data-ply="1"]')!.click()
            const before = f.ui.history.textContent, variants = f.ui.variantList.textContent
            f.square('F8').click(); f.square('I8').click()
            assert(f.ui.variantDialog.open && f.ui.variantHelp.textContent?.includes('Branch from Main game by playing f8-i8 at ply 2'), 'Dialog did not identify the selected move and ply')
            assert(f.ui.history.textContent === before && f.ui.variantList.textContent === variants && f.ui.reviewPosition.textContent === 'Main game · 1 / 3', 'Proposing a variant changed the game')
            f.ui.cancelVariant.click()
            await until(() => f.ui.board.getAttribute('aria-busy') === 'false', 'Cancelling did not release board input')
            assert(!f.root.querySelector('.selected') && f.ui.history.textContent === before && f.ui.variantList.textContent === variants, 'Cancel retained the move or an empty variant')
            f.square('F8').click(); f.square('I8').click()
            f.ui.variantDialog.dispatchEvent(new Event('cancel', { cancelable: true })); f.ui.variantDialog.close()
            await until(() => f.ui.board.getAttribute('aria-busy') === 'false', 'Escape did not release board input')
            assert(f.ui.history.textContent === before && f.ui.variantList.textContent === variants, 'Escape committed a variant')
            f.square('F8').click(); f.square('I8').click(); f.ui.saveVariant.click()
            await until(() => f.ui.reviewPosition.textContent === 'Variant 1 · 2 / 2', 'Confirmed move did not create and play the variant')
            assert(f.ui.history.textContent?.includes('f8-i8') && f.ui.variantList.children.length === 2, 'Confirmed variant omitted its first move')
            f.square('D10').click(); f.square('D9').click()
            await until(() => f.ui.reviewPosition.textContent === 'Variant 1 · 3 / 3', 'Tip move did not continue the variant')
            assert(!f.ui.variantDialog.open && f.ui.variantList.children.length === 2, 'Tip move unnecessarily created another variant')
        })
        await check('A stale variant dialog cannot play into a newer review position', async () => {
            const f = mount(); f.session.loadGame('d11-d10 f8-e8', f.session.getView().generation)
            f.ui.reviewBack.click(); f.square('F8').click(); f.square('I8').click()
            assert(f.ui.variantDialog.open, 'Variant dialog did not open')
            f.session.reviewMove('main', 0, f.session.getView().generation)
            const before = f.session.getView()
            f.ui.saveVariant.click()
            await until(() => !!f.ui.variantError.textContent, 'Stale proposal was not rejected')
            assert(JSON.stringify(f.session.getView()) === JSON.stringify(before) && f.ui.variantList.children.length === 1, 'Stale dialog created an empty variant or applied the move')
            f.ui.cancelVariant.click()
            await until(() => f.ui.board.getAttribute('aria-busy') === 'false', 'Cancelling stale dialog did not restore input')
        })
        await check('Sibling variants, descriptions, continuation chooser and JSON round trip', async () => {
            const f = mount(); f.load('d11-d10 f8-e8 d10-c10')
            const create = (note: string) => { assert(f.ui.variantDialog.open, 'Move did not request a variant'); f.ui.variantDescription.value = note; f.ui.saveVariant.click() }
            f.ui.history.querySelector<HTMLButtonElement>('[data-ply="1"]')!.click()
            f.square('F8').click(); f.square('I8').click()
            create('Long defense')
            await until(() => f.ui.reviewPosition.textContent?.includes('2 / 2') === true, 'First alternative did not play')
            f.ui.reviewBack.click()
            f.square('F8').click(); f.square('G8').click()
            create('Short defense')
            await until(() => f.ui.reviewPosition.textContent?.includes('2 / 2') === true, 'Second alternative did not play')
            f.ui.reviewBack.click(); f.ui.reviewNext.click()
            assert(f.ui.nextDialog.open && f.ui.nextChoices.children.length === 3 && f.ui.nextChoices.textContent?.includes('Long defense') && f.ui.nextChoices.textContent?.includes('Short defense'), 'Fork did not offer described continuations')
            ;(f.ui.nextChoices.children[1] as HTMLButtonElement).click()
            assert(f.ui.reviewPosition.textContent?.includes('Variant 1') && f.ui.history.textContent?.includes('f8-i8'), 'Continuation choice did not change lines')
            f.ui.variantsTab.click()
            assert(!f.ui.variantsPanel.hidden && f.ui.variantList.children.length === 3, 'Variants tab missing lines')
            f.ui.describe.click(); f.ui.variantDescription.value = 'Updated long defense'; f.ui.saveVariant.click()
            assert(f.ui.variantList.textContent?.includes('Updated long defense'), 'Description edit was not retained')
            f.ui.exportButton.click(); const saved = f.ui.exportText.value
            assert(JSON.parse(saved).variants.length === 2 && f.ui.exportHelp.textContent?.includes('JSON'), 'Variant export omitted branches')
            cleanup()
            const g = mount(); g.load(saved)
            assert(g.ui.reviewPosition.textContent?.includes('Variant 1') && g.ui.variantList.textContent?.includes('Updated long defense') && g.ui.variantList.textContent?.includes('Short defense'), 'Study load lost its cursor/descriptions')
            g.ui.variantList.querySelector<HTMLButtonElement>('[data-line="main"]')!.click()
            assert(g.ui.history.textContent?.includes('d10-c10'), 'Variant exploration replaced the main line')
        })
        await check('Backward navigation keeps branch labels and variant selection synchronized across nested forks', () => {
            const f = mount(); f.load(JSON.stringify({ format: 'hnefatafl-study', version: 1, tags: [],
                main: ['D11-D10', 'F8-E8', 'D10-C10'],
                variants: [
                    { id: 'v1', parent: 'main', at: 1, description: 'Defense', moves: ['F8-I8', 'D10-D9'] },
                    { id: 'v2', parent: 'v1', at: 2, description: 'Attacker reply', moves: ['D10-C10'] },
                ], view: { line: 'main', ply: 3 },
            }))
            const selected = (id: string, label: string, ply: number) => {
                assert(f.ui.reviewPosition.textContent?.startsWith(`${label} · ${ply} /`), 'Branch label did not follow the reviewed position')
                assert(f.ui.variantList.querySelectorAll('[aria-pressed="true"]').length === 1 && f.ui.variantList.querySelector('[aria-pressed="true"]')?.getAttribute('data-line') === id, 'Variants tab selection did not follow the reviewed position')
            }
            f.ui.variantsTab.click()
            f.ui.variantList.querySelector<HTMLButtonElement>('[data-line="v2"]')!.click(); selected('v2', 'Variant 2', 3)
            f.ui.reviewBack.click(); selected('v1', 'Variant 1', 2)
            f.ui.reviewBack.click(); selected('main', 'Main game', 1)
            f.ui.reviewNext.click()
            assert(f.ui.nextDialog.open && f.ui.nextChoices.textContent?.includes('Defense'), 'Returning to trunk lost the fork choices')
            ;(f.ui.nextChoices.children[1] as HTMLButtonElement).click(); selected('v1', 'Variant 1', 2)
            f.ui.variantList.querySelector<HTMLButtonElement>('[data-line="v2"]')!.click()
            f.ui.movesTab.click(); f.ui.history.querySelector<HTMLButtonElement>('[data-ply="1"]')!.click(); selected('main', 'Main game', 1)
            f.ui.variantsTab.click(); f.ui.variantList.querySelector<HTMLButtonElement>('[data-line="v2"]')!.click()
            f.ui.reviewStart.click(); selected('main', 'Main game', 0)
            assert(f.ui.variantList.children.length === 3, 'Backward navigation discarded a variant')
        })
        await check('File selection and drop fill a reviewable draft for standard and variant formats', async () => {
            const f = mount(); f.ui.importButton.click()
            const files = new DataTransfer(); files.items.add(new File(['d11-d10'], 'game.txt', { type: 'text/plain' }))
            f.ui.file.files = files.files; f.ui.file.dispatchEvent(new Event('change'))
            await until(() => f.ui.importText.value === 'd11-d10', 'Selected text file was not read')
            assert(f.ui.empty.hidden === false, 'File selection loaded without review')
            f.ui.load.click(); f.ui.reviewStart.click(); f.square('D11').click(); f.square('D8').click()
            f.ui.variantDescription.value = 'File round trip'; f.ui.saveVariant.click()
            await until(() => !f.ui.variantDialog.open, 'File round trip variant did not commit')
            f.ui.exportButton.click(); const saved = f.ui.exportText.value; f.ui.closeExport.click()
            f.ui.importButton.click()
            const drop = new DataTransfer(); drop.items.add(new File([saved], 'study.json', { type: 'application/json' }))
            f.ui.importDialog.dispatchEvent(new DragEvent('drop', { dataTransfer: drop, bubbles: true, cancelable: true }))
            await until(() => f.ui.importText.value === saved, 'Dropped JSON study was not read')
            assert(!f.ui.confirm.open && f.ui.fileStatus.textContent?.includes('study.json'), 'Dropping skipped review')
            f.ui.load.click(); assert(f.ui.confirm.open, 'Study replacement did not confirm')
            f.ui.replace.click()
            assert(f.ui.variantList.textContent?.includes('File round trip'), 'Dropped study did not restore the variant')
        })
        await check('File read races, oversized files and invalid JSON preserve the current study', async () => {
            const f = mount(); f.load('d11-d10')
            const before = f.ui.history.textContent
            f.ui.importButton.click()
            let finish!: (text: string) => void
            const file = new File(['x'], 'slow.txt')
            Object.defineProperty(file, 'text', { value: () => new Promise<string>(resolve => { finish = resolve }) })
            const data = new DataTransfer(); data.items.add(file)
            f.ui.file.files = data.files; f.ui.file.dispatchEvent(new Event('change'))
            f.ui.importText.value = 'a8-c8'; f.ui.importText.dispatchEvent(new Event('input')); finish('d11-d8')
            await new Promise(resolve => setTimeout(resolve, 20))
            assert(f.ui.importText.value === 'a8-c8' && !f.ui.load.disabled, 'Late file read overwrote manual input')
            const oversized = new DataTransfer(); oversized.items.add(new File(['x'.repeat(2 * 1024 * 1024 + 1)], 'large.json'))
            f.ui.file.files = oversized.files; f.ui.file.dispatchEvent(new Event('change'))
            assert(f.ui.importError.textContent?.includes('2 MiB') && f.ui.history.textContent === before, 'Oversized file was accepted or changed the game')
            f.ui.importText.value = '{"format":"hnefatafl-study","version":99}'; f.ui.load.click()
            assert(f.ui.importError.textContent && f.ui.history.textContent === before && !f.ui.confirm.open, 'Invalid JSON replaced the current study')
        })
        await check('Browser color preference updates page, board and dialogs without losing play', async () => {
            const frame = document.createElement('iframe')
            frame.title = 'System color preference test'; frame.style.width = '900px'; frame.style.height = '850px'
            const loaded = new Promise<void>(resolve => { frame.onload = () => resolve() })
            frame.src = './index.html'; fixtures.append(frame); cleanup = () => frame.remove()
            await loaded
            const doc = frame.contentDocument!, win = frame.contentWindow!
            const square = (name: string) => doc.querySelector<HTMLButtonElement>(`[data-square="${name}"]`)!
            square('D11').click(); square('D10').click()
            await until(() => doc.querySelector('#turn-title')?.textContent === 'Defenders to move', 'Theme fixture did not play its opening move')
            square('F8').focus(); square('F8').click()
            const history = doc.querySelector('#game-history')!.textContent, focused = doc.activeElement
            const luminance = (color: string) => {
                const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(value => {
                    const channel = Number(value) / 255
                    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
                })
                return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
            }
            let lightPage = '', lightBoard = ''
            for (const scheme of ['light', 'dark', 'light'] as const) {
                // An iframe's preferred scheme follows its embedding element's color-scheme.
                frame.style.colorScheme = scheme
                await until(() => win.matchMedia(`(prefers-color-scheme: ${scheme})`).matches, `Browser did not apply ${scheme} preference`)
                await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
                const page = win.getComputedStyle(doc.documentElement)
                const swatch = doc.createElement('span'); swatch.style.backgroundColor = 'var(--square-alternate)'; doc.body.append(swatch)
                const expectedBoard = win.getComputedStyle(swatch).backgroundColor; swatch.remove()
                await until(() => win.getComputedStyle(square('B11')).backgroundColor === expectedBoard, `Board color transition did not finish in ${scheme} mode`)
                assert(scheme === 'dark' ? luminance(page.backgroundColor) < 0.1 : luminance(page.backgroundColor) > 0.7, `Page ignored ${scheme} preference`)
                if (scheme === 'light') { lightPage = page.backgroundColor; lightBoard = win.getComputedStyle(square('B11')).backgroundColor }
                else assert(page.backgroundColor !== lightPage && win.getComputedStyle(square('B11')).backgroundColor !== lightBoard, 'Board or page retained the light palette')
                const escape = win.getComputedStyle(square('A11')), border = win.getComputedStyle(square('A11'), '::before')
                assert(escape.backgroundColor === 'rgb(124, 132, 136)', `Escape square ignored the requested #7c8488 in ${scheme} mode`)
                assert(border.content === 'none' && border.borderTopWidth === '0px', `Escape square still has a decorative border in ${scheme} mode`)
                for (const selector of ['html', '.side-card', '.history-panel', 'dialog', 'dialog textarea', '.primary-button']) {
                    const style = win.getComputedStyle(doc.querySelector(selector)!)
                    const a = luminance(style.color), b = luminance(style.backgroundColor)
                    assert((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, `${selector} lacks text contrast in ${scheme} mode`)
                }
                assert(doc.activeElement === focused && square('F8').classList.contains('selected'), 'Preference change lost keyboard focus or selection')
                assert(doc.querySelector('#game-history')!.textContent === history && doc.querySelector('#turn-title')!.textContent === 'Defenders to move', 'Preference change reset the game')
            }
        })
        summary.textContent = `${passed} passed; ${failed} failed`
        summary.dataset.result = failed ? 'failed' : 'passed'
    } catch (error) {
        summary.textContent = `Runner failed: ${error instanceof Error ? error.message : String(error)}`
        summary.dataset.result = 'failed'
    } finally { cleanup(); run.disabled = false }
}

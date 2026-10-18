import { ClientDependencies, mountLocalClient } from '../client/client'
import { clientElements } from '../client/elements'
import { LocalGameSession } from '../session/LocalGameSession'
import '../client/styles.css'

const run = document.querySelector<HTMLButtonElement>('#run-client')!
const summary = document.querySelector<HTMLElement>('#client-summary')!
const results = document.querySelector<HTMLElement>('#client-results')!
const fixtures = document.querySelector<HTMLElement>('#client-fixtures')!
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
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
                assert(scheme === 'dark' ? luminance(page.backgroundColor) < 0.1 : luminance(page.backgroundColor) > 0.7, `Page ignored ${scheme} preference`)
                if (scheme === 'light') { lightPage = page.backgroundColor; lightBoard = win.getComputedStyle(square('B11')).backgroundColor }
                else assert(page.backgroundColor !== lightPage && win.getComputedStyle(square('B11')).backgroundColor !== lightBoard, 'Board or page retained the light palette')
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

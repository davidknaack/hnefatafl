import { describe, expect, test } from 'vitest'
import { LocalGameSession } from './LocalGameSession'
import { HnefataflEngine } from '../HnefataflEngine'
import { MAX_STUDY_BYTES } from './LocalReview'

const session = () => new LocalGameSession({ review: true })
const seek = (s: LocalGameSession, line: string, ply: number) => s.reviewMove(line, ply, s.getView().generation)
const branch = (s: LocalGameSession, text: string) => s.createVariant(text, s.getView().generation)
const move = (s: LocalGameSession, text: string) => s.submitMove(text, s.getView().generation)
const load = (s: LocalGameSession, text: string) => s.loadGame(text, s.getView().generation)

describe('Local review and variants', () => {
    test('review restores every prefix, preserves future history/tags and exports the full line from the opening', async () => {
        const s = session(), input = '[Event:Test] d11-d8 f8-e8 f10-f8'
        expect(load(s, input).success).toBe(true)
        const full = s.saveGame(), tip = s.getView().state
        for (let ply = 0; ply <= 3; ply++) {
            expect(seek(s, 'main', ply).success).toBe(true)
            const engine = new HnefataflEngine()
            if (ply) engine.loadGame(input.split(' ').slice(0, ply + 1).join(' '))
            expect(s.getView().state).toEqual(engine.getState())
            expect(s.getView().review?.moves).toHaveLength(3)
            expect(s.getView().capabilities.move).toBe(true)
            expect(s.saveGame()).toBe(full)
        }
        expect(s.getView().state).toEqual(tip)
        seek(s, 'main', 1)
        expect((await move(s, 'F8-I8')).success).toBe(false)
        expect(s.getView().review?.moves).toHaveLength(3)
    })

    test('confirmed variant moves commit once with canonical captures and preserve the full parent line', async () => {
        const s = session(); load(s, 'd11-d8 f8-e8 f10-f9')
        seek(s, 'main', 2)
        expect(s.getPossibleMoves({ x: 5, y: 1 }, s.getView().generation).length).toBeGreaterThan(0)
        const before = s.getView(), seen: string[] = []
        const unsubscribe = s.subscribe(view => seen.push(`${view.review?.line}:${view.review?.cursor}`))
        const result = await s.submitVariant('F10-F8', 'Capture the defender', before.generation)
        expect(result.success).toBe(true)
        expect(seen).toEqual(['main:2', 'v1:3'])
        expect(s.getView().review).toMatchObject({ line: 'v1', cursor: 3, moves: ['D11-D8', 'F8-E8', 'F10-F8(E8)'] })
        expect(s.getView().review!.lines[1]).toMatchObject({ parent: 'main', at: 2, description: 'Capture the defender' })
        expect(s.getView().state.captured.defender).toBe(1)
        seek(s, 'main', 3)
        expect(s.getView().state.moveHistory).toEqual(['D11-D8', 'F8-E8', 'F10-F9'])
        expect(load(session(), s.saveGame()).success).toBe(true)
        unsubscribe()
    })

    test('invalid, stale and over-limit variant moves leave no empty branch or partial move', async () => {
        const s = session(); load(s, 'd11-d10 f8-e8'); seek(s, 'main', 1)
        const before = s.getView(), saved = s.saveGame()
        expect((await s.submitVariant('F8-F10', 'Illegal', before.generation)).success).toBe(false)
        expect((await s.submitVariant('F8-I8', 'x'.repeat(121), before.generation)).success).toBe(false)
        expect(s.getView()).toEqual(before); expect(s.saveGame()).toBe(saved)
        const queued = s.submitVariant('F8-I8', 'Stale', before.generation)
        seek(s, 'main', 0)
        const navigated = s.getView()
        expect((await queued).success).toBe(false); expect(s.getView()).toEqual(navigated)
        const limited = { format: 'hnefatafl-study', version: 1, tags: [], main: ['D11-D10', 'F8-E8'],
            variants: Array.from({ length: 127 }, (_, i) => ({ id: `v${i + 1}`, parent: 'main', at: 1, description: '', moves: [] })),
            view: { line: 'main', ply: 1 } }
        expect(load(s, JSON.stringify(limited)).success).toBe(true)
        const full = s.getView()
        expect((await s.submitVariant('F8-I8', '', full.generation)).success).toBe(false)
        expect(s.getView()).toEqual(full)
        s.dispose()
        expect((await s.submitVariant('F8-I8', '', s.getView().generation)).success).toBe(false)
        const debug = new LocalGameSession()
        expect((await debug.submitVariant('D11-D10', '', debug.getView().generation)).success).toBe(false)
    })

    test('sibling and nested variants retain the trunk and offer distinct next choices with descriptions', async () => {
        const s = session(); load(s, 'd11-d10 f8-e8 d10-c10')
        seek(s, 'main', 1); branch(s, 'King-side defense')
        expect((await move(s, 'F8-I8')).success).toBe(true)
        expect((await move(s, 'D10-D9')).success).toBe(true)
        seek(s, 'v1', 2); branch(s, 'Different attacker reply')
        expect((await move(s, 'D10-C10')).success).toBe(true)
        seek(s, 'main', 1); branch(s, 'Short defense')
        expect((await move(s, 'F8-G8')).success).toBe(true)
        seek(s, 'main', 1)
        expect(s.getView().review?.next.map(choice => [choice.line, choice.move, choice.description])).toEqual([
            ['main', 'F8-E8', ''], ['v1', 'F8-I8', 'King-side defense'], ['v3', 'F8-G8', 'Short defense'],
        ])
        seek(s, 'v1', 2)
        expect(s.getView().review?.next.map(choice => choice.line)).toEqual(['v1', 'v2'])
        seek(s, 'v2', 1); branch(s, 'Another from the common trunk')
        expect(s.getView().review?.lines.find(line => line.id === 'v4')).toMatchObject({ parent: 'main', at: 1 })
        expect(s.getView().review?.lines.find(line => line.id === 'main')).toMatchObject({ length: 3 })
    })

    test('backward steps and jumps select the ancestor owning the position and retain all continuations', async () => {
        const s = session(); load(s, 'd11-d10 f8-e8 d10-c10')
        seek(s, 'main', 1); branch(s, 'Defense'); await move(s, 'F8-I8'); await move(s, 'D10-D9')
        seek(s, 'v1', 2); branch(s, 'Attacker reply'); await move(s, 'D10-C10')
        const lines = s.getView().review!.lines
        seek(s, 'v2', 2)
        expect(s.getView().review).toMatchObject({ line: 'v1', label: 'Variant 1', cursor: 2 })
        expect(s.getView().review!.next.map(choice => choice.line)).toEqual(['v1', 'v2'])
        seek(s, 'v1', 1)
        expect(s.getView().review).toMatchObject({ line: 'main', label: 'Main game', cursor: 1 })
        expect(s.getView().review!.next.map(choice => choice.line)).toEqual(['main', 'v1'])
        seek(s, 'v2', 3); seek(s, 'v2', 0)
        expect(s.getView().review).toMatchObject({ line: 'main', cursor: 0, lines })
        seek(s, 'v2', 3); seek(s, 'v2', 1)
        expect(s.getView().review).toMatchObject({ line: 'main', cursor: 1, lines })
        expect(s.getView().state.moveHistory).toEqual(['D11-D10'])
    })

    test('an unplayed variant remains selected and playable at its fork after saving and loading', async () => {
        const s = session(); load(s, 'd11-d10 f8-e8')
        seek(s, 'main', 1); branch(s, 'Ready to explore')
        expect(s.getView().review).toMatchObject({ line: 'v1', cursor: 1 })
        const restored = session(); expect(load(restored, s.saveGame()).success).toBe(true)
        expect(restored.getView().review).toMatchObject({ line: 'v1', cursor: 1 })
        expect(restored.getView().capabilities.move).toBe(true)
        expect((await move(restored, 'F8-I8')).success).toBe(true)
        expect(restored.getView().review).toMatchObject({ line: 'v1', cursor: 2 })
        seek(restored, 'v1', 1)
        expect(restored.getView().review).toMatchObject({ line: 'main', cursor: 1 })
    })

    test('JSON round trip retains branches, descriptions, tags and cursor, including an unplayed variant', async () => {
        const s = session(); load(s, '[Event:Study] d11-d8 f8-e8 f10-f8')
        seek(s, 'main', 1); branch(s, 'Alternative'); await move(s, 'F8-I8')
        branch(s, 'Not played yet')
        seek(s, 'v1', 1)
        const before = s.getView(), saved = s.saveGame(), restored = session()
        expect(JSON.parse(saved)).toMatchObject({ format: 'hnefatafl-study', version: 1, tags: [{ name: 'Event', value: 'Study' }], view: { line: 'v1', ply: 1 } })
        expect(load(restored, saved).success).toBe(true)
        expect(restored.getView().state).toEqual(before.state)
        expect(restored.getView().review).toEqual(before.review)
        expect(restored.saveGame()).toBe(saved)
        const detached = restored.getView().review!
        detached.moves.length = 0; detached.lines[1].description = 'corrupt'; detached.next.length = 0
        expect(restored.saveGame()).toBe(saved)
        expect(restored.describeVariant('v1', 'Updated', restored.getView().generation).success).toBe(true)
        expect(restored.getView().review?.lines[1].description).toBe('Updated')
    })

    test('navigation invalidates queued moves, stale commands and stale variant edits', async () => {
        const s = session(), generation = s.getView().generation
        const pending = s.submitMove('D11-D10', generation)
        expect(seek(s, 'main', 0).success).toBe(true)
        expect(await pending).toMatchObject({ success: false })
        expect(s.createVariant('Stale', generation).success).toBe(false)
        expect(s.reviewMove('main', 0, generation).success).toBe(false)
        expect(s.getView().review?.lines).toHaveLength(1)
        branch(s, 'Empty line')
        expect(s.getView().capabilities.export).toBe(true)
        expect(load(session(), s.saveGame()).success).toBe(true)
    })

    test('terminal games can be reviewed and branched before the ending with fresh repetition state', async () => {
        const cycle = 'd11-d10 f8-e8 d10-d11 e8-f8'
        const s = session(); load(s, `${cycle} ${cycle}`)
        expect(s.getView().state.outcome?.reason).toBe('repetition')
        expect(branch(s, 'After end').success).toBe(false)
        seek(s, 'main', 7)
        expect(s.getView().state.outcome).toBeNull()
        expect(s.getView().review?.status).toBe('attacker_win')
        branch(s, 'Avoid repetition'); expect((await move(s, 'E8-E9')).success).toBe(true)
        expect(s.getView().state.outcome).toBeNull()
        const saved = s.saveGame(), restored = session(); expect(load(restored, saved).success).toBe(true)
        seek(restored, 'main', 8)
        expect(restored.getView().state.outcome?.reason).toBe('repetition')
        expect(load(s, 'd11-d10 ---').success).toBe(true)
        seek(s, 'main', 1); expect(s.getView().state.outcome).toBeNull()
        seek(s, 'main', 2); expect(s.getView().state.outcome?.reason).toBe('resignation')
    })

    test.each(['version', 'cycle', 'missing', 'duplicate', 'fork', 'move', 'cursor', 'description', 'tags'] as const)('invalid %s import is atomic for the entire study', async kind => {
        const s = session(); load(s, 'd11-d10 f8-e8')
        seek(s, 'main', 1); branch(s, 'Keep'); await move(s, 'F8-I8')
        const before = s.getView(), saved = s.saveGame(), raw = JSON.parse(saved)
        if (kind === 'version') raw.version = 99
        if (kind === 'cycle') raw.variants[0].parent = 'v1'
        if (kind === 'missing') raw.variants[0].parent = 'v99'
        if (kind === 'duplicate') raw.variants.push(raw.variants[0])
        if (kind === 'fork') raw.variants[0].at = 99
        if (kind === 'move') raw.variants[0].moves = ['F8-I8(A1)']
        if (kind === 'cursor') raw.view.ply = 99
        if (kind === 'description') raw.variants[0].description = 'x'.repeat(121)
        if (kind === 'tags') raw.tags = [{ name: 'Event', value: '[broken]' }]
        expect(load(s, JSON.stringify(raw)).success).toBe(false)
        expect(s.getView()).toEqual(before); expect(s.saveGame()).toBe(saved)
        expect(load(s, 'not a game').success).toBe(false)
        expect(s.getView()).toEqual(before)
    })

    test('bounds, reset, closed sessions and debug sessions retain their contracts', () => {
        const s = session(); load(s, 'd11-d10')
        const before = s.getView()
        expect(load(s, '{' + ' '.repeat(MAX_STUDY_BYTES)).success).toBe(false)
        expect(seek(s, 'main', -1).success).toBe(false)
        expect(seek(s, 'main', 0.5).success).toBe(false)
        expect(s.getView()).toEqual(before)
        branch(s, 'A'); s.reset(s.getView().generation)
        expect(s.getView().review?.lines).toHaveLength(1)
        expect(s.getView().review?.cursor).toBe(0)
        s.dispose()
        expect(seek(s, 'main', 0).success).toBe(false)
        expect(branch(s, 'Closed').success).toBe(false)
        expect(new LocalGameSession().getView().review).toBeUndefined()
    })

    test('same-move alternatives stay identifiable, and unordered nested variants load by ancestry', async () => {
        const s = session(); load(s, 'd11-d10 f8-e8 d10-c10')
        seek(s, 'main', 1); branch(s, 'Same move, another continuation'); await move(s, 'F8-E8')
        branch(s, 'Nested'); await move(s, 'D10-D9')
        seek(s, 'main', 1)
        expect(s.getView().review?.next.map(choice => choice.line)).toEqual(['main', 'v1'])
        const raw = JSON.parse(s.saveGame()); raw.variants.reverse()
        const restored = session(); expect(load(restored, JSON.stringify(raw)).success).toBe(true)
        expect(seek(restored, 'v2', 3).success).toBe(true)
        expect(restored.getView().state.moveHistory).toEqual(['D11-D10', 'F8-E8', 'D10-D9'])
    })

    test('oversized portable metadata cannot leave an unreloadable or partially adopted study', () => {
        const s = session(); load(s, 'd11-d10')
        const before = s.getView()
        expect(load(s, `[Event:${'x'.repeat(2049)}] d11-d8`).success).toBe(false)
        expect(s.getView()).toEqual(before)
    })
})

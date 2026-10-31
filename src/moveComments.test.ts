import { describe, expect, test } from 'vitest'
import { HnefataflEngine } from './HnefataflEngine'
import { parseGame, parseStudyMove, serializeGame } from './gameFormat'
import { commentParts, MAX_COMMENT_LENGTH, normalizeComment, readMoveComments, serializeComments, TRUNCATED_COMMENT_MARKER } from './moveComments'
import { LocalGameSession } from './session/LocalGameSession'

describe('Move comment notation', () => {
    test('chains explicit authors and anonymous prose with colons without confusing tags or CSV trailers', () => {
        const input = '[Event:Commented] D1-D3 {[Alice]:a standard opening} {[Bob]:they are all standard!} H6-H3 {should have played D1:D4} K4-K3 G7-G9,0,0,Ongoing'
        const parsed = parseGame(input)
        expect(parsed.success).toBe(true)
        if (!parsed.success) throw new Error(parsed.error)
        expect(parsed.game.moves[0].comments).toEqual([{ author: 'Alice', text: 'a standard opening' }, { author: 'Bob', text: 'they are all standard!' }])
        expect(parsed.game.moves[1].comments).toEqual([{ text: 'should have played D1:D4' }])
        expect(serializeGame(parsed.game)).toBe('[Event:Commented]\nd1-d3 {[Alice]:a standard opening} {[Bob]:they are all standard!} h6-h3 {should have played D1:D4} k4-k3 g7-g9')
        expect(readMoveComments('{Alice:still anonymous}').comments).toEqual([{ text: 'Alice:still anonymous' }])
    })

    test('literal braces, backslashes and anonymous author-looking text survive repeated saving', () => {
        for (const comment of [normalizeComment('Use {this} and \\ paths'), normalizeComment('[Alice]:this is anonymous'), normalizeComment('[Bob] hello: there', 'Alice')]) {
            const encoded = serializeComments([comment]), decoded = readMoveComments(encoded)
            expect(decoded.comments).toEqual([comment])
            expect(serializeComments(decoded.comments)).toBe(encoded)
        }
        expect(parseGame('d11-d10{one}{two} f8-e8').success).toBe(true)
    })

    test.each(['d11-d10 {unclosed', '{orphan} d11-d10', 'd11-d10 {ok}garbage', 'd11-d10 {[Alice]:oops'])(
        'rejects malformed comment structure atomically: %s', input => {
            const engine = new HnefataflEngine(); engine.loadGame('d11-d8 {keep this}')
            const saved = engine.saveGame(), state = engine.getState()
            expect(engine.loadGame(input).success).toBe(false)
            expect(engine.saveGame()).toBe(saved); expect(engine.getState()).toEqual(state)
        })

    test('long imported comments truncate by Unicode character, retain a bounded marker and reload as truncated', () => {
        const original = '👑'.repeat(700), encoded = serializeComments([normalizeComment(original, 'Alice')])
        const decoded = readMoveComments(encoded).comments[0]
        expect(decoded).toMatchObject({ author: 'Alice', truncated: true })
        expect(Array.from(decoded.text + TRUNCATED_COMMENT_MARKER)).toHaveLength(MAX_COMMENT_LENGTH)
        expect(decoded.text).not.toContain('\uFFFD')
        expect(serializeComments([decoded])).toBe(encoded)
        const exact = normalizeComment('👑'.repeat(500))
        expect(Array.from(exact.text)).toHaveLength(500); expect(exact.truncated).toBeUndefined()
    })

    test('engine replay preserves comments through captures, continued play, terminal results and reset', () => {
        const engine = new HnefataflEngine(), plain = new HnefataflEngine()
        const input = 'd11-d8 {[Alice]:Look at <D8> [Bob]} f8-e8 {Response} f10-f8xe8 {Capture}'
        expect(engine.loadGame(input).success).toBe(true)
        plain.loadGame('d11-d8 f8-e8 f10-f8xe8')
        expect(engine.getState()).toEqual(plain.getState())
        expect(engine.saveGame()).toBe(input)
        expect(engine.applyMove('E7-E8').success).toBe(true)
        expect(engine.saveGame()).toBe(input + ' e7-e8')
        const cycle = 'd11-d10 f8-e8 d10-d11 e8-f8'
        expect(engine.loadGame(`${cycle} ${cycle}-- {[Bob]:Game over} ---`).success).toBe(false)
        expect(engine.loadGame(`${cycle} ${cycle}-- {[Bob]:Game over}`).success).toBe(true)
        expect(engine.saveGame()).toBe(`${cycle} ${cycle}-- {[Bob]:Game over}`)
        engine.reset(); engine.applyMove('D11-D10'); expect(engine.saveGame()).toBe('d11-d10')
    })

    test('reference tokenizer identifies mentions, squares and orthogonal moves; unknown tokens stay text', () => {
        const text = '[Bob] <D3> <d1-d4> <L3> <A0> <D3-D3> <A1-B2> <script>alert(1)</script> [ordinary:name]'
        const parts = commentParts(text)
        expect(parts.map(part => part.text).join('')).toBe(text)
        expect(parts.filter(part => part.mention).map(part => part.mention)).toEqual(['Bob', 'ordinary:name'])
        expect(parts.filter(part => part.reference).map(part => part.reference)).toEqual([
            { from: { x: 3, y: 8 } }, { from: { x: 3, y: 10 }, to: { x: 3, y: 7 } },
        ])
    })

    test('study parser accepts engine/portable capture notation and terminal markers with comments', () => {
        expect(parseStudyMove('F10-F8(E8) {[Alice]:Capture}')?.comments).toEqual([{ author: 'Alice', text: 'Capture' }])
        expect(parseStudyMove('F10-F8xe8 {Capture}')?.captures).toEqual([{ x: 4, y: 3 }])
        expect(parseStudyMove('D11-D10++ {Wrong result}')?.terminal).toBe('++')
        expect(parseStudyMove('D11-D10 {ok} F8-E8')).toBeNull()
    })
})

describe('Review comments, variants and local autosave data', () => {
    const fresh = () => new LocalGameSession({ review: true })
    const load = (s: LocalGameSession, text: string) => s.loadGame(text, s.getView().generation)
    const seek = (s: LocalGameSession, line: string, ply: number) => s.reviewMove(line, ply, s.getView().generation)
    const add = (s: LocalGameSession, text: string, author?: string) => s.addComment(text, author, s.getView().generation)

    test('comments append linearly to the selected move without changing the position or future moves', () => {
        const s = fresh(); load(s, 'd11-d8 {[Alice]:First} f8-e8 f10-f8xe8')
        seek(s, 'main', 1)
        const before = s.getView().state
        expect(add(s, 'Reply with <D8> and [Alice]').success).toBe(true)
        expect(s.getView().state).toEqual(before)
        expect(s.getView().review).toMatchObject({ cursor: 1, moves: ['D11-D8', 'F8-E8', 'F10-F8(E8)'], comments: [{ author: 'Alice', text: 'First' }, { text: 'Reply with <D8> and [Alice]' }] })
        const view = s.getView(); view.review!.comments[0].text = 'mutated'
        expect(s.getView().review!.comments[0].text).toBe('First')
        const saved = s.saveGame()
        expect(saved).toBe('d11-d8 {[Alice]:First} {Reply with <D8> and [Alice]} f8-e8 f10-f8xe8')
        const restored = fresh(); expect(load(restored, s.saveLocalState()).success).toBe(true)
        expect(restored.getView().review).toEqual(s.getView().review)
        seek(s, 'main', 3); expect(s.getView().review!.comments).toEqual([])
    })

    test('shared trunk comments belong to the ancestor; sibling and nested continuation comments stay separate', async () => {
        const s = fresh(); load(s, 'd11-d10 {Trunk} f8-e8 {Main response} d10-c10')
        seek(s, 'main', 1)
        await s.submitVariant('F8-I8', 'Defense', s.getView().generation); add(s, 'First variant', 'Alice')
        await s.submitMove('D10-D9', s.getView().generation)
        seek(s, 'v1', 2)
        await s.submitVariant('D10-C10', 'Nested', s.getView().generation); add(s, 'Nested reply')
        seek(s, 'main', 1)
        await s.submitVariant('F8-G8', 'Sibling', s.getView().generation); add(s, 'Sibling reply', 'Bob')
        seek(s, 'main', 0); seek(s, 'v1', 1); add(s, 'Shared note')
        const saved = s.saveGame(), raw = JSON.parse(saved)
        expect(raw.main[0]).toBe('D11-D10 {Trunk} {Shared note}')
        expect(raw.variants[0].moves[0]).toBe('F8-I8 {[Alice]:First variant}')
        const restored = fresh(); expect(load(restored, saved).success).toBe(true)
        for (const [line, ply, comment] of [['main', 2, 'Main response'], ['v1', 2, 'First variant'], ['v2', 3, 'Nested reply'], ['v3', 2, 'Sibling reply']] as const) {
            seek(restored, line, ply); expect(restored.getView().review!.comments[0].text).toBe(comment)
        }
        seek(restored, 'main', 1)
        expect(restored.getView().review!.next.map(choice => choice.move)).toEqual(['F8-E8', 'F8-I8', 'F8-G8'])
        expect(restored.getView().review!.comments.map(comment => comment.text)).toEqual(['Trunk', 'Shared note'])
    })

    test('JSON comments longer than the old command bound load, truncate and stay marked after saving', () => {
        const s = fresh(), raw = { format: 'hnefatafl-study', version: 1, tags: [], main: [`D11-D10 {[Alice]:${'x'.repeat(5000)}} {Second}`], variants: [], view: { line: 'main', ply: 1 } }
        expect(load(s, JSON.stringify(raw)).success).toBe(true)
        expect(s.getView().review!.comments).toHaveLength(2)
        expect(s.getView().review!.comments[0].truncated).toBe(true)
        const restored = fresh(); expect(load(restored, s.saveLocalState()).success).toBe(true)
        expect(restored.getView().review).toEqual(s.getView().review)
        raw.main = ['D11-D10++ {Invalid terminal marker}']
        const before = s.getView(); expect(load(s, JSON.stringify(raw)).success).toBe(false)
        expect(s.getView()).toEqual(before)
    })

    test('empty, stale, closed and unavailable comment commands do not change the record', () => {
        const s = fresh()
        expect(add(s, 'Opening').success).toBe(false)
        load(s, 'd11-d10')
        const before = s.getView(), saved = s.saveGame()
        expect(add(s, '   ').success).toBe(false)
        expect(add(s, 'Text', 'Bad[name]').success).toBe(false)
        expect(s.addComment('Stale', undefined, before.generation - 1).success).toBe(false)
        expect(s.getView()).toEqual(before); expect(s.saveGame()).toBe(saved)
        load(s, 'd11-d10 ---'); expect(add(s, 'Resignation').success).toBe(false)
        seek(s, 'main', 1); expect(add(s, 'Before resignation').success).toBe(true)
        s.dispose(); expect(add(s, 'Closed').success).toBe(false)
        const debug = new LocalGameSession(); expect(debug.addComment('No review', undefined, 0).success).toBe(false)
    })
})

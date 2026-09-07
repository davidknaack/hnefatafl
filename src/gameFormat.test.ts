import { describe, expect, test } from 'vitest'
import { HnefataflEngine } from './HnefataflEngine'
import { parseGame, serializeGame, serializeRecordedMove } from './gameFormat'
import { GameStatus, Player } from './types'

const captureGame = 'd11-d8 f8-e8 f10-f8'
const cycle = 'd11-d10 f8-e8 d10-d11 e8-f8'

describe('Game format', () => {
    test('reads flexible spacing, case, leading zeros and opaque tags; writes canonical text', () => {
        const parsed = parseGame(' \n[ Event : Friendly: match ][Site:Home]\r\n D011 - d010\tF08-E08 \n')
        expect(parsed.success).toBe(true)
        if (!parsed.success) throw new Error(parsed.error)
        expect(serializeGame(parsed.game)).toBe('[Event:Friendly: match]\n[Site:Home]\nd11-d10 f8-e8')
    })

    test('capture order canonicalizes by file and numeric rank without mutating input', () => {
        const parsed = parseGame('D6-D8 X K11 / A10 / A2 ++')
        if (!parsed.success) throw new Error(parsed.error)
        const before = structuredClone(parsed.game)
        expect(serializeRecordedMove(parsed.game.moves[0])).toBe('d6-d8xa2/a10/k11++')
        expect(parsed.game).toEqual(before)
    })

    test.each([
        '', ' ', '[Event:test]', '---', 'd11-d10, f8-e8', 'd11-d10f8-e8',
        'd11-d10 garbage', 'd11-d10()', 'd11-d10(A1)', 'd11-d10x',
        'd11-d10xa1/', 'd11-d10xa1junk', 'd11-d10+++', 'd11-d10----',
        'd11-d10---', 'd11-d10 --- f8-e8', 'd11-d10 --- ---',
        'l1-a1', 'a0-a1', 'a12-a1', 'a99999999999999999999-a1',
        'd11-d10xl1', 'd11-d10xa0', 'd11-d10xa12',
        '[Event missing colon] d11-d10', '[:value] d11-d10',
        '[Event:missing end d11-d10', '[Event:[nested]] d11-d10',
        '[Event:two\nlines] d11-d10', 'd11-d10 [Event:late]',
    ])('rejects malformed games completely: %j', (text) => {
        expect(parseGame(text).success).toBe(false)
    })

    test('resignation stays separate from a terminal suffix', () => {
        const result = parseGame('d11-d10\n---')
        expect(result).toMatchObject({ success: true, game: { resigned: true, moves: [{ captures: [] }] } })
        if (!result.success) throw new Error(result.error)
        expect(result.game.moves[0].terminal).toBeUndefined()
        expect(serializeGame(result.game)).toBe('d11-d10 ---')
    })
})

describe('Validated load/save', () => {
    test.each(['Ongoing', 'Black', 'White', 'Draw'])('ignores CSV summary values, including a contradictory %s result', (status) => {
        const engine = new HnefataflEngine()
        expect(engine.loadGame(`${captureGame},999,888,${status}`).success).toBe(true)
        expect(engine.getState().captured).toEqual({ attacker: 0, defender: 1 })
        expect(engine.getState().status).toBe(GameStatus.InProgress)
        expect(engine.saveGame()).toBe('d11-d8 f8-e8 f10-f8xe8')
    })

    test.each(['xe8/e8', 'xe8xe8', 'X E08 / e8 X E8'])('tolerates duplicate capture annotations: %s', (captures) => {
        const engine = new HnefataflEngine()
        expect(engine.loadGame(`${captureGame}${captures},1,0,Ongoing`).success).toBe(true)
        expect(engine.getState().captured.defender).toBe(1)
        expect(engine.saveGame()).toBe('d11-d8 f8-e8 f10-f8xe8')
        const replay = new HnefataflEngine()
        expect(replay.loadGame(engine.saveGame()).success).toBe(true)
        expect(replay.getState()).toEqual(engine.getState())
    })

    test('accepts the actual duplicated capture on Copenhagen CSV line 9', () => {
        const engine = new HnefataflEngine()
        const row = 'a8-e8 d6-d8xe8 d11-d9 e6-d6 a7-d7xd8 f8-d8xd7 a6-a7 e7-b7 e11-b11 e5-b5xb6 d1-b1 d6-a6 h11-h7 g5-g3 f2-f3 d8-a8xa7xa7,1,5,Ongoing'
        expect(engine.loadGame(row).success).toBe(true)
        expect(engine.getState().captured).toEqual({ attacker: 4, defender: 1 })
        expect(engine.saveGame()).toBe(row.split(',')[0].replace('xa7xa7', 'xa7'))
    })

    test('accepts distinct captures separated by x from Copenhagen CSV line 8', () => {
        const engine = new HnefataflEngine()
        const row = 'd1-d3 f8-i8 j6-j9 e7-e10 j9-e9xe10 d6-d9 f10-f9 g7-g10 e9-e10 h6-h9 k8-j8 g6-g9 k6-i6 f6-h6 a8-h8xi8 f7-h7xh8 f9-f8 h9-j9 k7-i7 h7-h9 i7-i10 h6-h7 i6-i7 e6-j6 i10-j10xj9 j6-j7xi7 d3-i3 h7-i7 h11-i11 h9-k9 i11-i9 i7-h7 g11-i11 h7-h2 k4-k2 h2-j2 h1-j1 g5-g2 i3-g3xg2 j7-j3 k5-k3 f4-k4xk3xk2,4,4,White'
        expect(engine.loadGame(row).success).toBe(true)
        expect(engine.saveGame()).toContain('f4-k4xk2/k3')
        const replay = new HnefataflEngine()
        expect(replay.loadGame(engine.saveGame()).success).toBe(true)
        expect(replay.getState()).toEqual(engine.getState())
    })

    test('ignores external timeout metadata only on CSV rows', () => {
        const engine = new HnefataflEngine()
        expect(engine.loadGame('D11-D10\tTIMEOUT , 0 , 0 , White\r\n').success).toBe(true)
        expect(engine.getState().status).toBe(GameStatus.InProgress)
        expect(engine.saveGame()).toBe('d11-d10')
        expect(engine.loadGame('d11-d10 timeout').success).toBe(false)
    })

    test('handles summaries after resignation and terminal moves', () => {
        const engine = new HnefataflEngine()
        expect(engine.loadGame('d11-d10 ---,0,0,Ongoing').success).toBe(true)
        expect(engine.saveGame()).toBe('d11-d10 ---')
        expect(engine.loadGame(`${cycle} ${cycle}--,99,99,Draw`).success).toBe(true)
        expect(engine.saveGame()).toBe(`${cycle} ${cycle}--`)
    })

    test('preserves commas inside metadata tags', () => {
        const engine = new HnefataflEngine()
        expect(engine.loadGame('[Event:Example,0,0,Ongoing] d11-d10,0,0,Black').success).toBe(true)
        expect(engine.saveGame()).toBe('[Event:Example,0,0,Ongoing]\nd11-d10')
    })

    test.each([
        'd11-d10,garbage,0,0,Ongoing', 'd11-d10,0,0,Ongoing garbage',
        'd11-d10,0,0,Ongoing\nd11-d10,0,0,Ongoing',
        'd11-d10 timeout f8-e8,0,0,White', 'timeout,0,0,White',
        'd11-d10xe8xe8,0,0,Ongoing', `${captureGame}xe8/xe8,1,0,Ongoing`,
        `${captureGame}xe8xe7xe8,1,0,Ongoing`, `${captureGame}xe8xe12,1,0,Ongoing`,
    ])('still rejects malformed input or incorrect capture sets atomically: %s', (text) => {
        const engine = new HnefataflEngine()
        engine.loadGame('a8-c8')
        const before = engine.getState()
        expect(engine.loadGame(text).success).toBe(false)
        expect(engine.getState()).toEqual(before)
    })

    test('replays captures and replaces an existing game, retaining tags through continued play', () => {
        const engine = new HnefataflEngine()
        engine.applyMove('A8-C8')
        expect(engine.loadGame(`[Event:Test] ${captureGame}`).success).toBe(true)
        expect(engine.getState().captured.defender).toBe(1)
        expect(engine.saveGame()).toBe('[Event:Test]\nd11-d8 f8-e8 f10-f8xe8')
        const replay = new HnefataflEngine()
        expect(replay.loadGame(engine.saveGame()).success).toBe(true)
        expect(replay.getState()).toEqual(engine.getState())
        expect(replay.saveGame()).toBe(engine.saveGame())
        expect(engine.applyMove('E7-E8').success).toBe(true)
        expect(engine.saveGame()).toBe('[Event:Test]\nd11-d8 f8-e8 f10-f8xe8 e7-e8')
        engine.reset()
        engine.applyMove('D11-D10')
        expect(engine.saveGame()).toBe('d11-d10')
    })

    test.each([
        ['d11-d10 f8-e8 f10-f8xe8', 'Move 3: Invalid captures'],
        ['d11-d10 d10-d9', 'Move 2: Not your piece'],
        ['d11-d10 a1-a2', 'Move 2: No piece at source'],
        ['d11-d10 f8-f7', 'Move 2: Destination is occupied'],
        ['d11-d10 f8-g9', 'Move 2: Path is blocked'],
        ['d11-d10xa1', 'Move 1: Invalid captures'],
        [`${captureGame}xe7`, 'Move 3: Invalid captures'],
        ['d11-d10++', 'Move 1: Terminal marker'],
        ['d11-d10--', 'Move 1: Terminal marker'],
        [`${cycle} ${cycle}++`, 'Move 8: Terminal marker'],
        [`${cycle} ${cycle} d11-d10`, 'Move 9: Game is not in progress'],
        [`${cycle} ${cycle} ---`, 'Resignation: Game is not in progress'],
        ['d11-d10 f8-e8 garbage', 'Move 3: Invalid move format'],
    ])('rejects invalid replay atomically: %s', (text, error) => {
        const engine = new HnefataflEngine()
        engine.loadGame('[Event:Keep me] a8-c8 ---')
        const before = engine.getState()
        const saved = engine.saveGame()
        const result = engine.loadGame(text)
        expect(result).toEqual({ success: false, error: expect.stringContaining(error) })
        expect(engine.getState()).toEqual(before)
        expect(engine.saveGame()).toBe(saved)
    })

    test.each([false, true])('emits and validates mover-relative terminal markers, offset: %s', (offset) => {
        const text = offset
            ? 'd11-d10 f8-e8 d10-c10 e8-f8 c10-d10 f8-e8 d10-c10 e8-f8 c10-d10'
            : `${cycle} ${cycle}`
        const marker = offset ? '++' : '--'
        const engine = new HnefataflEngine()
        expect(engine.loadGame(text).success).toBe(true)
        expect(engine.getState().status).toBe(GameStatus.AttackerWin)
        expect(engine.saveGame()).toBe(text + marker)
        const replay = new HnefataflEngine()
        expect(replay.loadGame(engine.saveGame()).success).toBe(true)
        expect(replay.getState()).toEqual(engine.getState())
    })

    test.each(['d11-d10', 'd11-d10 f8-e8'])('resignation loses for the side to move: %s', (text) => {
        const engine = new HnefataflEngine()
        expect(engine.loadGame(`${text} ---`).success).toBe(true)
        const state = engine.getState()
        expect(state.status).toBe(state.currentPlayer === Player.Attacker ? GameStatus.DefenderWin : GameStatus.AttackerWin)
        expect(engine.saveGame()).toBe(`${text} ---`)
        expect(engine.applyMove('D10-D11').success).toBe(false)
        expect(engine.resign().success).toBe(false)
        const replay = new HnefataflEngine()
        expect(replay.loadGame(engine.saveGame()).success).toBe(true)
        expect(replay.getState()).toEqual(state)
    })

    test('does not export an empty game or silently discard a custom setup', () => {
        const engine = new HnefataflEngine()
        expect(() => engine.saveGame()).toThrow('without moves')
        expect(engine.resign().success).toBe(false)
        engine.reset([
            'R.........R', 'A..........', '...........', '...........', '...........',
            '.....K.....', '...........', '...........', '...........', '...........', 'R.........R',
        ])
        engine.applyMove('A10-B10')
        expect(() => engine.saveGame()).toThrow('standard board')
    })
})

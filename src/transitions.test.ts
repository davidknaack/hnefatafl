import { describe, expect, test } from 'vitest'
import { HnefataflEngine } from './HnefataflEngine'
import { Coordinate, GameStatus, PieceType, Player, Square } from './types'
import { coordToString } from './coordinates'
import { parseMove } from './parser'
import { applyMoveToPosition, extractDefenderPosition } from './board'
import { positionKey } from './repetition'
import { getGameStatusAfterMove } from './rules'
import { resolveMove } from './validator'
import { layoutFixture } from './test/fixtures'

const overlap = [
    'RD.A......R', '.A.........', '...........', '...........', '...........',
    '.....K.....', '...........', '...........', '...........', '...........', 'R.........R',
]
const kingCapture = [
    'R.........R', '...........', '...........', '...........', '.....A.....',
    '...A.KA....', '.....A.....', '...........', '...........', '...........', 'RD........R',
]
const cornerKing = [
    'R.K.......R', '.A..A......', 'A..........', '...........', '...A.A.....',
    'A...DT.....', '...........', '...........', '...........', '...........', 'R.........R',
]
const exactReplay = [
    'F10-C10,F8-H8,K8-I8,D6-D9,B6-B9,D9-H9,A4-E4,G7-G10',
    'A8-G8(H8),H6-H8,G8-G9(G10),H9-I9,G9-G8(H8),G5-H5',
    'C10-I10(I9),G6-H6,G1-G4(F4),F5-G5,G8-G6(G5),F7-G7',
    'G4-G5,E5-F5(G5),J6-I6(H6),F5-G5(G6),F11-F7,G7-G6',
    'D11-D7(E7),F6-F4,K4-H4,G6-G7,H4-G4,F4-F3,G4-G3,F3-A3',
    'F2-A2,A3-C3,D1-C1,C3-C11,B9-B11,C11-C9,A7-A9',
].join(',')

function play(engine: HnefataflEngine, notation: string): void {
    const result = engine.applyMoveSequence(notation)
    if (!result.success) throw new Error(`${notation}: ${result.error}`)
}

function count(position: Square[][], player: Player): number {
    return position.flat().filter((square) => square.occupant?.owner === player).length
}

function transform(coord: Coordinate, symmetry: number): Coordinate {
    let { x, y } = coord
    if (symmetry >= 4) x = 10 - x
    for (let turn = 0; turn < symmetry % 4; turn++) [x, y] = [10 - y, x]
    return { x, y }
}

describe('W5 resolved captures', () => {
    test.each(Array.from({ length: 8 }, (_, i) => i))('overlap counts each piece once under symmetry %s', (symmetry) => {
        const layout = Array.from({ length: 11 }, () => Array<string>(11).fill('.'))
        overlap.forEach((row, y) => [...row].forEach((char, x) => {
            const to = transform({ x, y }, symmetry)
            layout[to.y][to.x] = char
        }))
        const from = transform({ x: 3, y: 0 }, symmetry)
        const to = transform({ x: 2, y: 0 }, symmetry)
        const capture = transform({ x: 1, y: 0 }, symmetry)
        const notation = `${coordToString(from)}-${coordToString(to)}`
        const explicit = `${notation}(${coordToString(capture)})`
        const engine = new HnefataflEngine()
        engine.reset(layout.map((row) => row.join('')))
        const before = engine.getState()
        const saved = structuredClone(before)
        expect(engine.getPossibleMoves(from)).toContainEqual({ to, captures: [capture] })
        expect(engine.validateMove(notation)).toEqual(engine.validateMove(explicit))
        expect(engine.validateMove(notation).expectedCaptures).toEqual([capture])
        expect(engine.applyMove(`${notation}(${coordToString(capture)}${coordToString(capture)})`).success).toBe(false)
        expect(engine.getState()).toEqual(saved)
        play(engine, notation)
        const after = engine.getState()
        expect(after.position[capture.y][capture.x].occupant).toBeNull()
        expect(count(before.position, Player.Defender) - count(after.position, Player.Defender)).toBe(1)
        expect(after.captured).toEqual({ attacker: 0, defender: 1 })
        expect(after.moveHistory).toEqual([explicit])
        expect(before).toEqual(saved)
        const annotated = new HnefataflEngine()
        annotated.reset(layout.map((row) => row.join('')))
        play(annotated, explicit)
        expect(annotated.getState()).toEqual(after)
    })

    test.each([
        { name: 'king capture', layout: kingCapture, setup: '', move: 'D6-E6', captures: 'F6', status: GameStatus.AttackerWin },
        { name: 'encirclement after removing the outside defender', layout: overlap.map((row, y) =>
            y === 4 || y === 6 ? '.....A.....' : y === 5 ? '....AKA....' : row),
          setup: '', move: 'D11-C11', captures: 'B11', status: GameStatus.AttackerWin },
        { name: 'fort after removing the inside attacker', layout: [
            'RA........R', '...........', '...........', '...........', '...........',
            '.....T.....', '..........D', '.........D.', '........D..', '.......DK..', 'R.....D..AR',
          ], setup: 'B11-B10', move: 'I2-I1', captures: 'J1', status: GameStatus.DefenderWin },
    ])('$name has identical automatic and explicit outcomes', ({ layout, setup, move, captures, status }) => {
        const automatic = new HnefataflEngine()
        const explicit = new HnefataflEngine()
        for (const engine of [automatic, explicit]) {
            engine.reset(layout)
            if (setup) play(engine, setup)
        }
        const before = structuredClone(automatic.getState())
        const parsed = parseMove(move)!
        // This fixture must expose the old preview bug, not merely share its final status.
        const missingCaptures = applyMoveToPosition(before.position, parsed)
        expect(getGameStatusAfterMove(missingCaptures, parsed, before.currentPlayer)).toBe(GameStatus.InProgress)
        const preview = automatic.validateMove(move)
        expect(preview).toEqual(explicit.validateMove(`${move}(${captures})`))
        expect(preview.status).toBe(status)
        expect(automatic.getState()).toEqual(before)
        play(automatic, move)
        play(explicit, `${move}(${captures})`)
        expect(automatic.getState()).toEqual(explicit.getState())
        expect(automatic.getState().status).toBe(preview.status)
        expect(automatic.getState().currentPlayer).toBe(before.currentPlayer)
        for (const side of [Player.Attacker, Player.Defender]) {
            expect(count(before.position, side) - count(automatic.getState().position, side))
                .toBe(automatic.getState().captured[side] - before.captured[side])
        }
    })
})

describe('W5 repetition and legal moves', () => {
    test.each(['returning layout', 'fresh layout', 'exact replay'])('king captures beside the corner: %s', (scenario) => {
        const engine = new HnefataflEngine()
        if (scenario === 'exact replay') play(engine, exactReplay)
        else if (scenario === 'returning layout') {
            engine.reset(cornerKing)
            play(engine, 'E10-E11,C11-C9,B10-B11')
        } else {
            engine.reset(cornerKing.map((row, y) => y === 0 ? 'RA........R' : y === 1 ? '....A......' : y === 2 ? 'A.K........' : row))
            play(engine, 'E10-E11')
        }
        const before = structuredClone(engine.getState())
        expect(engine.getPossibleMoves({ x: 2, y: 2 })).toContainEqual({ to: { x: 2, y: 0 }, captures: [{ x: 1, y: 0 }] })
        const preview = engine.validateMove('C9-C11')
        expect(preview.isValid).toBe(true)
        expect(preview).toEqual(engine.validateMove('C9-C11(B11)'))
        play(engine, 'C9-C11')
        const after = engine.getState()
        expect(after.position[0][1].occupant).toBeNull()
        expect(after.position[0][2].occupant?.type).toBe(PieceType.King)
        expect(after.captured.attacker).toBe(before.captured.attacker + 1)
        expect(after.status).toBe(preview.status)
        expect(after.positionHistory).toEqual([positionKey(after.position, Player.Attacker)])
        if (scenario === 'exact replay') {
            const replay = new HnefataflEngine()
            play(replay, after.moveHistory.join(','))
            expect(replay.getState()).toEqual(after)
        }
    })

    test('changed attackers allow a repeated defender layout', () => {
        const engine = new HnefataflEngine()
        const original = extractDefenderPosition(engine.getState().position)
        play(engine, 'D11-D10,F8-E8,D10-C10')
        expect(engine.getPossibleMoves({ x: 4, y: 3 })).toContainEqual({ to: { x: 5, y: 3 }, captures: [] })
        expect(engine.validateMove('E8-F8').isValid).toBe(true)
        play(engine, 'E8-F8')
        expect(extractDefenderPosition(engine.getState().position)).toEqual(original)
        expect(engine.getState().status).toBe(GameStatus.InProgress)
    })

    test.each([false, true])('third full-board occurrence ends the game, offset cycle: %s', (offset) => {
        const engine = new HnefataflEngine()
        if (offset) play(engine, 'D11-D10')
        const cycle = offset ? ['F8-E8', 'D10-C10', 'E8-F8', 'C10-D10'] : ['D11-D10', 'F8-E8', 'D10-D11', 'E8-F8']
        const move = parseMove(cycle[3])!
        play(engine, cycle.slice(0, 3).join(','))
        const beforeRepeat = engine.getState()
        expect(engine.getPossibleMoves(move.from)).toContainEqual({ to: move.to, captures: [], repetition: 'allowed' })
        expect(engine.getState()).toEqual(beforeRepeat)
        play(engine, cycle[3])
        expect(engine.getState().status).toBe(GameStatus.InProgress)
        play(engine, cycle.slice(0, 3).join(','))
        const final = cycle[3]
        const before = structuredClone(engine.getState())
        expect(engine.getPossibleMoves(move.from)).toContainEqual({ to: move.to, captures: [], repetition: 'loss' })
        expect(engine.validateMove(final)).toEqual({ isValid: true, expectedCaptures: [], status: GameStatus.AttackerWin })
        expect(engine.getState()).toEqual(before)
        play(engine, final)
        expect(engine.getState().status).toBe(GameStatus.AttackerWin)
        expect(engine.getState().currentPlayer).toBe(before.currentPlayer)
        expect(engine.getPossibleMoves(move.to)).toEqual([])
        const ended = structuredClone(engine.getState())
        expect(engine.applyMove(cycle[0]).success).toBe(false)
        expect(engine.getState()).toEqual(ended)
    })

    test('side to move is part of the key and capture resets precede repetition', () => {
        const { position, edgeSquares } = layoutFixture(overlap)
        const move = parseMove('D11-C11')!
        const initial = resolveMove(position, Player.Attacker, move, edgeSquares)
        if (!initial.isValid) throw new Error(initial.reason)
        const key = positionKey(initial.position, Player.Defender)
        expect(key).not.toBe(positionKey(initial.position, Player.Attacker))
        const resolved = resolveMove(position, Player.Attacker, move, edgeSquares, [key, key])
        expect(resolved.isValid).toBe(true)
        if (!resolved.isValid) throw new Error(resolved.reason)
        expect(resolved.status).toBe(GameStatus.InProgress)
        expect(resolved.positionHistory).toEqual([key])
        expect(resolved.repetition).toBeUndefined()
    })

    test('occurrences with the opposite side to move do not trigger a loss', () => {
        const engine = new HnefataflEngine()
        const { position, edgeSquares } = layoutFixture([
            'R.........R', 'A..........', '...........', '...........', '...........',
            '.....K.....', '...........', '...........', '...........', '...........', 'R.........R',
        ])
        const move = parseMove('A10-B10')!
        const after = applyMoveToPosition(position, move)
        const opposite = positionKey(after, Player.Attacker)
        const matching = positionKey(after, Player.Defender)
        const differentTurn = resolveMove(position, Player.Attacker, move, edgeSquares, [opposite, opposite])
        expect(differentTurn.status).toBe(GameStatus.InProgress)
        if (!differentTurn.isValid) throw new Error(differentTurn.reason)
        expect(differentTurn.repetition).toBeUndefined()
        expect(resolveMove(position, Player.Attacker, move, edgeSquares, [matching, matching]))
            .toMatchObject({ status: GameStatus.AttackerWin, repetition: 'loss' })
        // Reset starts counting at the initial board, rather than retaining a prior game.
        play(engine, 'D11-D10,F8-E8,D10-D11,E8-F8')
        engine.reset()
        expect(engine.getState().positionHistory).toHaveLength(1)
        expect(engine.getPossibleMoves({ x: 3, y: 0 }).every((candidate) => !candidate.repetition)).toBe(true)
    })

    test('an immediate board win takes precedence over a repetition loss warning', () => {
        const { position, edgeSquares } = layoutFixture([
            'R.K.......R', '...........', 'A..........', '...........', '...........',
            '.....T.....', '...........', '...........', '...........', '...........', 'R.........R',
        ])
        const move = parseMove('C11-A11')!
        const key = positionKey(applyMoveToPosition(position, move), Player.Attacker)
        expect(resolveMove(position, Player.Defender, move, edgeSquares, [key, key]))
            .toMatchObject({ isValid: true, status: GameStatus.DefenderWin, repetition: 'allowed' })
    })

    test('every advertised move validates and applies against the same replay state', () => {
        const engine = new HnefataflEngine()
        play(engine, exactReplay)
        const before = structuredClone(engine.getState())
        let checked = 0
        for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
            const from = { x, y }
            for (const candidate of engine.getPossibleMoves(from)) {
                const notation = `${coordToString(from)}-${coordToString(candidate.to)}`
                const preview = engine.validateMove(notation)
                expect(preview.isValid).toBe(true)
                expect(preview.expectedCaptures).toEqual(candidate.captures)
                const replay = new HnefataflEngine()
                play(replay, exactReplay)
                play(replay, notation)
                expect(replay.getState().status).toBe(preview.status)
                checked++
            }
        }
        expect(checked).toBeGreaterThan(0)
        expect(engine.getState()).toEqual(before)
    })
})


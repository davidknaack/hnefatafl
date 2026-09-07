import { describe, expect, test } from 'vitest'
import { HnefataflEngine } from './HnefataflEngine'
import { initializeGame, STANDARD_BOARD, transformLayoutToPosition } from './board'
import { coordToString } from './coordinates'
import { generateMoveCandidates, generatePossibleMoves } from './moveGenerator'
import { resolveMove, validateMove } from './validator'
import { Coordinate, GameStatus, Move, PieceType, Player } from './types'

const invalidCoordinates: Coordinate[] = [
    { x: -1, y: 0 }, { x: 0, y: -1 }, { x: 11, y: 0 }, { x: 0, y: 11 },
    { x: 1.5, y: 0 }, { x: 0, y: 1.5 }, { x: NaN, y: 0 },
    { x: 0, y: NaN }, { x: Infinity, y: 0 }, { x: 0, y: -Infinity },
]

describe('Coordinate API boundaries', () => {
    test.each(invalidCoordinates)('rejects invalid coordinate %j before indexing', (coord) => {
        const engine = new HnefataflEngine()
        const before = structuredClone(engine.getState())
        const { position, edgeSquares } = initializeGame(STANDARD_BOARD)
        const original = structuredClone(position)
        expect(engine.getPossibleMoves(coord)).toEqual([])
        expect(generateMoveCandidates(position, coord, Player.Attacker)).toEqual([])
        expect(generatePossibleMoves(position, coord, Player.Attacker, edgeSquares)).toEqual([])
        const valid: Move = { from: { x: 3, y: 0 }, to: { x: 3, y: 1 }, captures: [] }
        for (const move of [
            { ...valid, from: coord }, { ...valid, to: coord }, { ...valid, captures: [coord] },
        ]) {
            for (const validate of [validateMove, resolveMove]) {
                expect(validate(position, Player.Attacker, move, edgeSquares)).toEqual({
                    isValid: false, reason: 'Invalid move coordinates',
                    expectedCaptures: [], status: GameStatus.InProgress,
                })
            }
        }
        expect(() => coordToString(coord)).toThrow(RangeError)
        expect(position).toEqual(original)
        expect(engine.getState()).toEqual(before)
    })

    test('raw APIs bound coordinates to the supplied fixture size', () => {
        const { position, edgeSquares } = transformLayoutToPosition(['A..', '.K.', '...'])
        const from = { x: 0, y: 0 }
        expect(generateMoveCandidates(position, { x: 3, y: 0 }, Player.Attacker)).toEqual([])
        expect(validateMove(position, Player.Attacker,
            { from, to: { x: 0, y: 3 }, captures: [] }, edgeSquares).isValid).toBe(false)
        expect(generateMoveCandidates(position, from, Player.Attacker)).toContainEqual({ x: 0, y: 2 })
    })
})

describe('Production layout boundaries', () => {
    const invalidLayouts = [
        [], ['R...R', '..A..', '..K..', '.....', 'R...R'],
        Array.from({ length: 12 }, (_, y) => y === 5 ? '.....K......' : '............'),
        STANDARD_BOARD.map((row, y) => y === 0 ? row.slice(1) : row),
        STANDARD_BOARD.map((row) => row.replace('K', '.')),
        STANDARD_BOARD.map((row) => row.replace('K', 'Kk').slice(0, 11)),
        STANDARD_BOARD.map((row) => row.replace('K', 'KK').slice(0, 11)),
        STANDARD_BOARD.map((row) => row.replace('K', 'kk').slice(0, 11)),
        ...['X', 'r', 't', '\t'].map((char) => STANDARD_BOARD.map((row, y) => y === 0 ? char + row.slice(1) : row)),
    ]
    test.each(invalidLayouts.map((layout, index) => ({ layout, index })))('rejects invalid layout $index and preserves the current game', ({ layout }) => {
        const engine = new HnefataflEngine()
        expect(engine.applyMove('D11-D10').success).toBe(true)
        const before = structuredClone(engine.getState())
        expect(() => initializeGame(layout)).toThrow()
        expect(() => engine.reset(layout)).toThrow()
        expect(engine.getState()).toEqual(before)
        expect(engine.applyMove('F8-E8').success).toBe(true)
    })

    test('accepts lowercase pieces and exactly one lowercase king with unchanged terrain', () => {
        const layout = STANDARD_BOARD.map((row) => row.replace(/[ADK]/g, (char) => char.toLowerCase()))
        expect(initializeGame(layout)).toEqual(initializeGame(STANDARD_BOARD))
        const explicit = layout.map((row, y) => y === 2 ? '.....T.....' : row)
        const { position } = initializeGame(explicit)
        expect(position.flat().filter((square) => square.occupant?.type === PieceType.King)).toHaveLength(1)
        expect(position[5][5].isThrone).toBe(false)
        expect(position[2][5].isThrone).toBe(true)
        const engine = new HnefataflEngine()
        engine.reset(layout)
        expect(engine.applyMove('d11-d10').success).toBe(true)
    })
})

describe('Command parsing and history', () => {
    test.each(['D11-D10(garbage)', 'D11-D10(A12)', 'D11-D10(A1junk)', 'D11-D10(a1)', 'P'])('rejects %s without changing state', (input) => {
        const engine = new HnefataflEngine()
        const before = structuredClone(engine.getState())
        expect(engine.validateMove(input).isValid).toBe(false)
        expect(engine.applyMove(input).success).toBe(false)
        expect(engine.getState()).toEqual(before)
    })

    test.each(['P', '', 'garbage', 'F8-F9(A12)', 'D10-C10'])('commits only the valid prefix before %j and reports its index', (token) => {
        const engine = new HnefataflEngine()
        const prefix = new HnefataflEngine()
        prefix.applyMove('D11-D10')
        expect(engine.applyMoveSequence(`D11-D10,${token},F8-E8`)).toMatchObject({
            success: false, error: expect.stringContaining('Move 2:'),
        })
        expect(engine.getState()).toEqual(prefix.getState())
    })

    test('reports an earlier illegal move before a later syntax error', () => {
        expect(new HnefataflEngine().applyMoveSequence('F8-E8,garbage')).toEqual({
            success: false, error: 'Move 1: Not your piece',
        })
    })

    test('canonicalizes automatic and explicit capture history and replays it', () => {
        const automatic = new HnefataflEngine()
        const explicit = new HnefataflEngine()
        expect(automatic.applyMoveSequence(' d11 - d8 , f8-e8 , f10 - f8 ').success).toBe(true)
        expect(explicit.applyMoveSequence('D11-D8,F8-E8, f10-f8 ( e8 ) ').success).toBe(true)
        expect(explicit.getState()).toEqual(automatic.getState())
        expect(explicit.getState().moveHistory).toEqual(['D11-D8', 'F8-E8', 'F10-F8(E8)'])
        const replay = new HnefataflEngine()
        expect(replay.applyMoveSequence(explicit.getState().moveHistory.join(',')).success).toBe(true)
        expect(replay.getState()).toEqual(explicit.getState())
    })
})

import { describe, expect, test } from 'vitest'
import { HnefataflEngine } from './HnefataflEngine'
import { GameStatus, Player, PieceType } from './types'
import { extractDefenderPosition, initializeGame, STANDARD_BOARD } from './board'

describe('Engine initial state', () => {
    test('Attacker moves first', () => {
        const engine = new HnefataflEngine()
        const state = engine.getState()
        expect(state.currentPlayer).toBe(Player.Attacker)
    })

    test('King starts on throne which is restricted', () => {
        const engine = new HnefataflEngine()
        const position = engine.getState().position
        const size = position.length
        const center = Math.floor(size / 2)
        const throne = position[center][center]
        expect(throne.occupant?.type).toBe(PieceType.King)
        expect(throne.isThrone).toBe(true)
        expect(throne.isRestricted).toBe(true)
    })
})

test('an edge move into a disconnected exit fort ends the game without applying hypothetical captures', () => {
    const engine = new HnefataflEngine()
    engine.reset([
        'RA........R',
        '...........',
        '...........',
        '...........',
        '....D......', // Capturable outside defender is irrelevant to the fort.
        '.....T.....',
        '..........D',
        '.........D.',
        '........D..',
        '.......D.K.',
        'R.....D...R',
    ])

    expect(engine.applyMove('B11-B10').success).toBe(true)
    expect(engine.getState().status).toBe(GameStatus.InProgress)
    expect(engine.validateMove('J2-J1').status).toBe(GameStatus.DefenderWin)
    expect(engine.applyMove('J2-J1').success).toBe(true)
    expect(engine.getState().status).toBe(GameStatus.DefenderWin)
    expect(engine.getState().position[4][4].occupant?.type).toBe(PieceType.Defender)
    expect(engine.getState().captured).toEqual({ attacker: 0, defender: 0 })
    expect(engine.applyMove('B10-B9')).toEqual({
        success: false, error: 'Game is not in progress',
    })
    const ended = structuredClone(engine.getState())
    expect(engine.validateMove('B10-B9')).toEqual({
        isValid: false, reason: 'Game is not in progress',
        expectedCaptures: [], status: GameStatus.DefenderWin,
    })
    expect(engine.getPossibleMoves({ x: 1, y: 1 })).toEqual([])
    expect(engine.getState()).toEqual(ended)
})

describe('Engine command contracts', () => {
    test.each([
        ['garbage', 'Invalid move format'],
        ['C11-C10', 'No piece at source'],
        ['F8-E8', 'Not your piece'],
        ['D11-E11', 'Destination is occupied'],
        ['D11-E10', 'Path is blocked'],
    ])('rejects %s without changing state', (move, reason) => {
        const engine = new HnefataflEngine()
        const before = structuredClone(engine.getState())
        expect(engine.validateMove(move)).toEqual({
            isValid: false, reason, expectedCaptures: [], status: GameStatus.InProgress,
        })
        expect(engine.getState()).toEqual(before)
        const result = engine.applyMove(move)
        expect(result).toEqual({ success: false, error: reason })
        if (result.success) throw new Error('Expected rejection')
        expect(result.error.length).toBeGreaterThan(0)
        expect(engine.getState()).toEqual(before)
    })

    test('preview leaves state unchanged and successful application supplies the next state', () => {
        const engine = new HnefataflEngine()
        const before = structuredClone(engine.getState())
        expect(engine.validateMove('D11-D10')).toEqual({
            isValid: true, expectedCaptures: [], status: GameStatus.InProgress,
        })
        expect(engine.getState()).toEqual(before)
        const result = engine.applyMove('D11-D10')
        if (!result.success) throw new Error(result.error)
        expect(result.newState.position[0][3].occupant).toBeNull()
        expect(result.newState.position[1][3].occupant?.type).toBe(PieceType.Attacker)
        expect(result.newState.currentPlayer).toBe(Player.Defender)
        expect(result.newState.moveHistory).toEqual(['D11-D10'])
        expect(result.newState.status).toBe(GameStatus.InProgress)
    })

    test('sequence failure retains its valid prefix and skips the suffix', () => {
        const engine = new HnefataflEngine()
        const prefix = new HnefataflEngine()
        expect(prefix.applyMove('D11-D10').success).toBe(true)
        expect(engine.applyMoveSequence('D11-D10,garbage,F8-E8')).toEqual({
            success: false, error: 'Invalid move format',
        })
        expect(engine.getState()).toEqual(prefix.getState())
    })

    test('recorded capture history replays the complete state', () => {
        const engine = new HnefataflEngine()
        const result = engine.applyMoveSequence('D11-D8,F8-E8,F10-F8')
        if (!result.success) throw new Error(result.error)
        expect(result.newState.moveHistory).toEqual(['D11-D8', 'F8-E8', 'F10-F8(E8)'])
        expect(result.newState.captured).toEqual({ attacker: 0, defender: 1 })
        expect(result.newState.position[3][4].occupant).toBeNull()
        expect(result.newState.currentPlayer).toBe(Player.Defender)
        expect(result.newState.status).toBe(GameStatus.InProgress)
        const replay = new HnefataflEngine()
        const replayed = replay.applyMoveSequence(result.newState.moveHistory.join(','))
        if (!replayed.success) throw new Error(replayed.error)
        expect(replayed.newState).toEqual(result.newState)
    })

    test('reset clears play state and rebuilds repetition history for a supplied layout', () => {
        const engine = new HnefataflEngine()
        expect(engine.applyMoveSequence('D11-D8,F8-E8,F10-F8').success).toBe(true)
        const layout = STANDARD_BOARD.map((row, y) => y === 1 ? 'A    A     ' : row)
        engine.reset(layout)
        const { position } = initializeGame(layout)
        expect(engine.getState()).toEqual({
            position, currentPlayer: Player.Attacker,
            captured: { attacker: 0, defender: 0 }, moveHistory: [],
            defenderPositions: [extractDefenderPosition(position)], status: GameStatus.InProgress,
        })
        engine.reset()
        expect(engine.getState()).toEqual(new HnefataflEngine().getState())
    })
})

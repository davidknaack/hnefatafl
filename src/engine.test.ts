import { describe, expect, test } from 'vitest'
import { HnefataflEngine } from './HnefataflEngine'
import { GameStatus, Player, PieceType } from './types'

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
})

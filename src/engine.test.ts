import { describe, expect, test } from 'vitest'
import { HnefataflEngine } from './HnefataflEngine'
import { Player, PieceType } from './types'

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

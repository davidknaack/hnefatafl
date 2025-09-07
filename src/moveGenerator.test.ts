import { describe, it, expect } from 'vitest'
import { generatePossibleMoves } from './moveGenerator'
import { initializeGame, STANDARD_BOARD } from './board'
import { Player } from './types'

describe('Move Generator', () => {
    it('should generate possible moves for an attacker piece', () => {
        const gameSetup = initializeGame(STANDARD_BOARD)
        const from = { x: 3, y: 0 } // D11 in coordinate notation
        
        const moves = generatePossibleMoves(
            gameSetup.position,
            from,
            Player.Attacker,
            gameSetup.edgeSquares
        )
        
        // Should have moves in at least one direction
        expect(moves.length).toBeGreaterThan(0)
        
        // All moves should be valid coordinates
        moves.forEach(move => {
            expect(move.to.x).toBeGreaterThanOrEqual(0)
            expect(move.to.x).toBeLessThan(11)
            expect(move.to.y).toBeGreaterThanOrEqual(0)
            expect(move.to.y).toBeLessThan(11)
            expect(Array.isArray(move.captures)).toBe(true)
        })
    })

    it('should generate possible moves for a defender piece', () => {
        const gameSetup = initializeGame(STANDARD_BOARD)
        const from = { x: 5, y: 3 } // F8 in coordinate notation
        
        const moves = generatePossibleMoves(
            gameSetup.position,
            from,
            Player.Defender,
            gameSetup.edgeSquares
        )
        
        // Should have moves in at least one direction
        expect(moves.length).toBeGreaterThan(0)
        
        // All moves should be valid coordinates
        moves.forEach(move => {
            expect(move.to.x).toBeGreaterThanOrEqual(0)
            expect(move.to.x).toBeLessThan(11)
            expect(move.to.y).toBeGreaterThanOrEqual(0)
            expect(move.to.y).toBeLessThan(11)
            expect(Array.isArray(move.captures)).toBe(true)
        })
    })

    it('should return empty array for empty square', () => {
        const gameSetup = initializeGame(STANDARD_BOARD)
        const from = { x: 2, y: 2 } // Empty square
        
        const moves = generatePossibleMoves(
            gameSetup.position,
            from,
            Player.Attacker,
            gameSetup.edgeSquares
        )
        
        expect(moves).toEqual([])
    })

    it('should return empty array for opponent piece', () => {
        const gameSetup = initializeGame(STANDARD_BOARD)
        const from = { x: 5, y: 3 } // Defender piece, but asking for attacker moves
        
        const moves = generatePossibleMoves(
            gameSetup.position,
            from,
            Player.Attacker,
            gameSetup.edgeSquares
        )
        
        expect(moves).toEqual([])
    })

    it('should allow king movement by defender player', () => {
        const gameSetup = initializeGame(STANDARD_BOARD)
        // Create a custom position with king that can move
        const position = gameSetup.position
        
        // Clear some squares around the king to allow movement
        position[5][4].occupant = null // Left of king
        position[5][6].occupant = null // Right of king
        
        const from = { x: 5, y: 5 } // King position
        
        const moves = generatePossibleMoves(
            position,
            from,
            Player.Defender,
            gameSetup.edgeSquares
        )
        
        // King should be able to move now
        expect(moves.length).toBeGreaterThan(0)
    })
})
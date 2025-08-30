import { describe, expect, test } from 'vitest'
import { createInitialBoard } from './board'
import { validateMove } from './validator'
import { Player, Piece, PieceType } from './types'
import { extractDefenderPosition, cloneBoard } from './board'

describe('Validator Tests', () => {

    test('No kings on board fails', () => {
        const boardLayout = [
            "A D A",
            "     ",
            "     ",
            "     ",
            "     "
        ]
        expect(() => createInitialBoard(boardLayout)).toThrowError(/There must be exactly one king on the board/i)
    })

    test('Attacker blocked by piece', () => {
        const boardLayout = [
            "R  K ",
            "     ",
            "  A  ",
            "  D  ",
            "     "
        ]
        const board = createInitialBoard(boardLayout)
        const move = {
            from: { x: 2, y: 2 }, // attacker
            to: { x: 2, y: 4 },   // try to move past defender
            captures: []
        }
        const result = validateMove(board, Player.Attacker, move)

        expect(result.isValid).toBe(false)
        expect(result.reason).toContain("Path is blocked")
    })

    test('Moving to occupied cell fails', () => {
        const boardLayout = [
            "R K  ",
            "     ",
            "  A  ",
            "  D  ",
            "     "
        ]
        const board = createInitialBoard(boardLayout)
        const move = {
            from: { x: 2, y: 2 },
            to: { x: 2, y: 3 }, // occupied by defender
            captures: []
        }
        const result = validateMove(board, Player.Attacker, move)
        expect(result.isValid).toBe(false)
        expect(result.reason).toContain("Destination is occupied")
    })

    test('Moving non-owned piece fails', () => {
        const boardLayout = [
            "R K  ",
            "     ",
            "  A  ",
            "  D  ",
            "     "
        ]
        const board = createInitialBoard(boardLayout)
        const move = {
            from: { x: 2, y: 3 }, // defender
            to: { x: 2, y: 4 },
            captures: []
        }
        const result = validateMove(board, Player.Attacker, move)
        expect(result.isValid).toBe(false)
        expect(result.reason).toContain("Not your piece")
    })

    test('Moving to restricted square fails for non-king', () => {
        const boardLayout = [
            "  K  ",
            "     ",
            "R A  ",
            "     ",
            "     "
        ]
        const board = createInitialBoard(boardLayout)
        const move = {
            from: { x: 2, y: 2 }, // attacker
            to: { x: 0, y: 2 },
            captures: []
        }
        const result = validateMove(board, Player.Attacker, move)
        expect(result.isValid).toBe(false)
        expect(result.reason).toContain("Cannot move to restricted square")
    })

    test('Valid move for king to restricted square', () => {
        const boardLayout = [
            "R K  ",
            "     ",
            "     ",
            "     ",
            "     "
        ]
        const board = createInitialBoard(boardLayout)
        const move = {
            from: { x: 2, y: 0 }, // king
            to: { x: 0, y: 0 },
            captures: []
        }
        const result = validateMove(board, Player.Defender, move)
        expect(result.isValid).toBe(true)
    })

    test('Moving across restricted square successful for non-king', () => {
        const boardLayout = [
            "  K  ",
            "     ",
            "  A  ",
            "  R  ",
            "     "
        ]
        const board = createInitialBoard(boardLayout)
        const moveAttacker = {
            from: { x: 2, y: 2 }, // attacker
            to: { x: 2, y: 4 },
            captures: []
        }
        const result = validateMove(board, Player.Attacker, moveAttacker)
        expect(result.isValid).toBe(true)
    })

    test('Defender cannot repeat board position', () => {
        const boardLayout = [
            "R K  ",
            "     ",
            "  D  ",
            "     ",
            "     "
        ]
        const board = createInitialBoard(boardLayout)
        const history = [extractDefenderPosition(board)]

        const move1 = {
            from: { x: 2, y: 2 },
            to: { x: 2, y: 3 },
            captures: []
        }
        const result1 = validateMove(board, Player.Defender, move1, history)
        expect(result1.isValid).toBe(true)

        const boardAfter = cloneBoard(board)
        boardAfter[2][2].occupant = null
        boardAfter[3][2].occupant = { owner: Player.Defender, type: PieceType.Defender }
        history.push(extractDefenderPosition(boardAfter))

        const move2 = {
            from: { x: 2, y: 3 },
            to: { x: 2, y: 2 },
            captures: []
        }
        const result2 = validateMove(boardAfter, Player.Defender, move2, history)
        expect(result2.isValid).toBe(false)
        expect(result2.reason).toContain('repeat')
    })

    test('Diagonal move is invalid', () => {
        const boardLayout = [
            "R K  ",
            "     ",
            "  A  ",
            "     ",
            "R   R"
        ]
        const board = createInitialBoard(boardLayout)
        const move = {
            from: { x: 2, y: 2 },
            to: { x: 3, y: 3 },
            captures: []
        }
        const result = validateMove(board, Player.Attacker, move)
        expect(result.isValid).toBe(false)
    })

    test('Throne occupied by king is not hostile to defenders', () => {
        const boardLayout = [
            "R   R",
            "A    ",
            " DK  ",
            "     ",
            "R   R"
        ]
        const board = createInitialBoard(boardLayout)
        const move = {
            from: { x: 0, y: 1 },
            to: { x: 0, y: 2 },
            captures: [{ x: 1, y: 2 }]
        }
        const result = validateMove(board, Player.Attacker, move)
        expect(result.isValid).toBe(false) // Invalid capture, so move is invalid
        expect(result.expectedCaptures).toEqual([]) // No expected captures
    })

    test('Throne occupied by king is hostile to attackers', () => {
        const boardLayout = [
            "R   R",
            "D    ",
            " AK  ",
            "     ",
            "R   R"
        ]
        const board = createInitialBoard(boardLayout)
        const move = {
            from: { x: 0, y: 1 },
            to: { x: 0, y: 2 },
            captures: [{ x: 1, y: 2 }]
        }
        const result = validateMove(board, Player.Defender, move)
        expect(result.isValid).toBe(true) 
        expect(result.expectedCaptures).toEqual([{ x: 1, y: 2 }]) 
    })

    test('Edge enclosure captures defenders', () => {
        const boardLayout = [
            "R   R",
            "A    ",
            "D K  ",
            "A    ",
            "RA  R"
        ]
        const board = createInitialBoard(boardLayout)
        const move = {
            from: { x: 1, y: 4 },
            to: { x: 1, y: 2 },
            captures: [{ x: 0, y: 2 }]
        }
        const result = validateMove(board, Player.Attacker, move)
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toContainEqual({ x: 0, y: 2 })
    })

})
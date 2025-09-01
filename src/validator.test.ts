import { describe, expect, test } from 'vitest'
import { createInitialBoard } from './board'
import { validateMove } from './validator'
import { Player, Piece, PieceType, GameStatus } from './types'
import { extractDefenderPosition, cloneBoard } from './board'
import { b } from 'vitest/dist/chunks/suite.d.FvehnV49.js'

describe('Validator Tests', () => {

    test('No kings on board fails initial board creation', () => {
        const boardLayout = [
            "A D A",
            "     ",
            "     ",
            "     ",
            "     "
        ]
        expect(() => createInitialBoard(boardLayout)).toThrowError(/There must be exactly one king on the board/i)
    })

    test('One piece cannot move through another piece', () => {
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
        const result = validateMove(board.board, Player.Attacker, move, board.edges)

        expect(result.isValid).toBe(false)
        expect(result.reason).toContain("Path is blocked")
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('A piece cannot move to a square occupied by another piece', () => {
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
        const result = validateMove(board.board, Player.Attacker, move, board.edges)
        expect(result.isValid).toBe(false)
        expect(result.reason).toContain("Destination is occupied")
        expect(result.status).toBe(GameStatus.InProgress)
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
        const result = validateMove(board.board, Player.Attacker, move, board.edges)
        expect(result.isValid).toBe(false)
        expect(result.reason).toContain("Not your piece")
        expect(result.status).toBe(GameStatus.InProgress)
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
        const result = validateMove(board.board, Player.Attacker, move, board.edges)
        expect(result.isValid).toBe(false)
        expect(result.reason).toContain("Cannot move to restricted square")
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('King may move to a restricted square', () => {
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
        const result = validateMove(board.board, Player.Defender, move, board.edges)
        expect(result.isValid).toBe(true)
        expect(result.status).toBe(GameStatus.DefenderWin)
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
        const result = validateMove(board.board, Player.Attacker, moveAttacker, board.edges)
        expect(result.isValid).toBe(true)
        expect(result.status).toBe(GameStatus.InProgress)
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
        const history = [extractDefenderPosition(board.board)]

        const move1 = {
            from: { x: 2, y: 2 },
            to: { x: 2, y: 3 },
            captures: []
        }
        const result1 = validateMove(board.board, Player.Defender, move1, board.edges, history)
        expect(result1.isValid).toBe(true)
        expect(result1.status).toBe(GameStatus.InProgress)

        const boardAfter = cloneBoard(board.board)
        boardAfter[2][2].occupant = null
        boardAfter[3][2].occupant = { owner: Player.Defender, type: PieceType.Defender }
        history.push(extractDefenderPosition(boardAfter))

        const move2 = {
            from: { x: 2, y: 3 },
            to: { x: 2, y: 2 },
            captures: []
        }
        const result2 = validateMove(boardAfter, Player.Defender, move2, board.edges, history)
        expect(result2.isValid).toBe(false)
        expect(result2.reason).toContain('repeat')
        expect(result2.status).toBe(GameStatus.InProgress)
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
        const result = validateMove(board.board, Player.Attacker, move, board.edges)
        expect(result.isValid).toBe(false)
        expect(result.status).toBe(GameStatus.InProgress)
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
        const result = validateMove(board.board, Player.Attacker, move, board.edges)
        expect(result.isValid).toBe(false)
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.InProgress)
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
        const result = validateMove(board.board, Player.Defender, move, board.edges)
        expect(result.isValid).toBe(true) 
        expect(result.expectedCaptures).toEqual([{ x: 1, y: 2 }]) 
        expect(result.status).toBe(GameStatus.InProgress)
    })
    
    // Test for invalid captures
    test('Specifying incorrect captures is invalid', () => {
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
            captures: [{ x: 2, y: 2 }] // Incorrect capture specified, should be { x: 1, y: 2 }
        }
        const result = validateMove(board.board, Player.Defender, move, board.edges)
        expect(result.isValid).toBe(false)
        expect(result.reason).toContain("Invalid captures")
        expect(result.expectedCaptures).toEqual([{ x: 1, y: 2 }])
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('Left edge enclosure captures defenders', () => {
        const boardLayout = [
            "R     R",
            "       ",
            "A      ",
            "DA K   ",
            "D      ",
            "A      ",
            "RA    R"
        ]
        const board = createInitialBoard(boardLayout)
        // Test with complete captures
        const moveComplete = {
            from: { x: 1, y: 6 },
            to: { x: 1, y: 4 },
            captures: [{ x: 0, y: 3 },{ x: 0, y: 4 }]
        }
        const resultComplete = validateMove(board.board, Player.Attacker, moveComplete, board.edges)
        expect(resultComplete.isValid).toBe(true)
        expect(resultComplete.expectedCaptures).toContainEqual({ x: 0, y: 3 })
        expect(resultComplete.expectedCaptures).toContainEqual({ x: 0, y: 4 })
        expect(resultComplete.status).toBe(GameStatus.InProgress)

        // Test with incomplete captures
        const moveIncomplete = {
            from: { x: 1, y: 6 },
            to: { x: 1, y: 4 },
            captures: [{ x: 0, y: 3 }] // Only one of the two captures
        }
        const resultIncomplete = validateMove(board.board, Player.Attacker, moveIncomplete, board.edges)
        expect(resultIncomplete.isValid).toBe(false)
        expect(resultIncomplete.reason).toContain("Invalid captures")
        expect(resultIncomplete.expectedCaptures).toContainEqual({ x: 0, y: 3 })
        expect(resultIncomplete.expectedCaptures).toContainEqual({ x: 0, y: 4 })
        expect(resultIncomplete.status).toBe(GameStatus.InProgress)
    })

    test('Left edge enclosure captures defenders using hostile restricted square', () => {
        const boardLayout = [
            "R     R",
            "       ",
            "A      ",
            "DA K   ",
            "DA     ",
            "D      ",
            "RA    R"
        ]
        const board = createInitialBoard(boardLayout)
        const move = {
            from: { x: 1, y: 6 },
            to: { x: 1, y: 5 },
            captures: [{ x: 0, y: 3 },{ x: 0, y: 4 },{ x: 0, y: 5 }]
        }
        const result = validateMove(board.board, Player.Attacker, move, board.edges)
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toContainEqual({ x: 0, y: 3 })
        expect(result.expectedCaptures).toContainEqual({ x: 0, y: 4 })
        expect(result.expectedCaptures).toContainEqual({ x: 0, y: 5 })
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('Right edge enclosure captures defenders', () => {
        const boardLayout = [
            "R     R",
            "       ",
            "      A",
            "  K  AD",
            "      D",
            "      A",
            "R    AR"
        ]
        const board = createInitialBoard(boardLayout)
        const move = {
            from: { x: 5, y: 6 },
            to: { x: 5, y: 4 },
            captures: [{ x: 6, y: 3 },{ x: 6, y: 4 }]
        }
        const result = validateMove(board.board, Player.Attacker, move, board.edges)
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toContainEqual({ x: 6, y: 3 })
        expect(result.expectedCaptures).toContainEqual({ x: 6, y: 4 })
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('Left edge enclosure captures defenders using hostile restricted square', () => {
        const boardLayout = [
            "R     R",
            "       ",
            "A      ",
            "DA K   ",
            "DA     ",
            "D      ",
            "RA    R"
        ]
        const board = createInitialBoard(boardLayout)
        const move = {
            from: { x: 1, y: 6 },
            to: { x: 1, y: 5 },
            captures: [{ x: 0, y: 3 },{ x: 0, y: 4 },{ x: 0, y: 5 }]
        }
        const result = validateMove(board.board, Player.Attacker, move, board.edges)
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toContainEqual({ x: 0, y: 3 })
        expect(result.expectedCaptures).toContainEqual({ x: 0, y: 4 })
        expect(result.expectedCaptures).toContainEqual({ x: 0, y: 5 })
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('King may be captured on the throne by four attackers', () => {
        const boardLayout = [
            "R         R",  
            "           ",  
            "           ",  
            "           ",  
            "     A     ",  
            "   A KA    ",  
            "     A     ",  
            "           ",  
            "           ",  
            "           ",  
            "R         R"  
        ]
        const board = createInitialBoard(boardLayout)
        const move = {
            from: { x: 3, y: 5 },
            to: { x: 4, y: 5 },
            captures: [{ x: 5, y: 5 }]
        }
        const result = validateMove(board.board, Player.Attacker, move, board.edges)
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toContainEqual({ x: 5, y: 5 })
        expect(result.status).toBe(GameStatus.AttackerWin)
    })

    test('King may be captured off the throne by four attackers', () => {
        const boardLayout = [
            "R         R",  
            "           ",  
            "           ",  
            "           ",  
            "     A     ",  
            "   A KA    ",  
            "     A     ",  
            "           ",  
            "           ",  
            "           ",  
            "R         R"  
        ]
        const board = createInitialBoard(boardLayout)
        board.board[5][5].isThrone = false;
        board.board[2][5].isThrone = true;
        const move = {
            from: { x: 3, y: 5 },
            to: { x: 4, y: 5 },
            captures: [{ x: 5, y: 5 }]
        }
        const result = validateMove(board.board, Player.Attacker, move, board.edges)
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toContainEqual({ x: 5, y: 5 })
        expect(result.status).toBe(GameStatus.AttackerWin)
    })

    test('King may be captured against the throne by three attackers', () => {
        const boardLayout = [
            "R         R",  
            "           ",  
            "           ",  
            "           ",  
            "     R     ",  
            "   A KA    ",  
            "     A     ",  
            "           ",  
            "           ",  
            "           ",  
            "R         R"  
        ]
        const board = createInitialBoard(boardLayout)
        board.board[5][5].isThrone = false;
        board.board[4][5].isThrone = true;
        const move = {
            from: { x: 3, y: 5 },
            to: { x: 4, y: 5 },
            captures: [{ x: 5, y: 5 }]
        }
        const result = validateMove(board.board, Player.Attacker, move, board.edges)
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toContainEqual({ x: 5, y: 5 })
        expect(result.status).toBe(GameStatus.AttackerWin)
    })

    test('King may not be captured against the border by three attackers', () => {
        const boardLayout = [
            "R         R",  
            "           ",  
            "           ",  
            "           ",  
            "           ",  
            "     R     ",  
            "           ",  
            "           ",  
            "           ",  
            "     A     ",  
            "R  A KA   R"  
        ]
        const board = createInitialBoard(boardLayout)
        board.board[5][5].isThrone = true;
        board.board[10][5].isThrone = false;
        const move = {
            from: { x: 10, y: 3 },
            to: { x: 10, y: 4 },
            captures: [{ x: 10, y: 5 }]
        }
        const result = validateMove(board.board, Player.Attacker, move, board.edges)
        expect(result.isValid).toBe(false)
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('King may not be captured against the border and a restricted square by two attackers', () => {
        const boardLayout = [
            "R         R",  
            "           ",  
            "           ",  
            "           ",  
            "           ",  
            "     R     ",  
            "           ",  
            "           ",  
            "           ",  
            " A         ",  
            "RK A      R"  
        ]
        const board = createInitialBoard(boardLayout)
        board.board[5][5].isThrone = true;
        board.board[10][1].isThrone = false;
        const move = {
            from: { x: 10, y: 3 },
            to: { x: 10, y: 2 },
            captures: [{ x: 10, y: 1 }]
        }
        const result = validateMove(board.board, Player.Attacker, move, board.edges)
        expect(result.isValid).toBe(false)
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.InProgress)
    })

    // test('King in a fort that cannot be captured wins the game', () => {
    //     const boardLayout = [
    //         "R         R",  
    //         "           ",  
    //         "           ",  
    //         "           ",  
    //         "           ",  
    //         "     R     ",  
    //         "           ",  
    //         " A         ",  
    //         "           ",  
    //         "   D D     ",  
    //         "R DK D    R"  
    //     ]
    //     const board = createInitialBoard(boardLayout)
    //     board[5][5].isThrone = true;
    //     board[10][3].isThrone = false;
    //     const move = {
    //         from: { x: 9, y: 5 },
    //         to: { x: 9, y: 4 },
    //         captures: []
    //     }
    //     const result = validateMove(board, Player.Defender, move)
    //     expect(result.isValid).toBe(true)
    //     expect(result.expectedCaptures).toEqual([])
    //     expect(result.status).toBe(GameStatus.DefenderWin)
    // })

    test('Attackers win if defenders fully encircled', () => {
        const boardLayout = [
            "R         R",  
            "     A     ",  
            "           ",  
            "    A A    ",  
            "   A D A   ",  
            "  A DKD A  ",  
            "   A D A   ",  
            "    A A    ",  
            "     A     ",  
            "           ",  
            "R         R"  
        ]
        const board = createInitialBoard(boardLayout)
        const move = {
            from: { x: 5, y: 1 },
            to: { x: 5, y: 2 },
            captures: []
        }
        const result = validateMove(board.board, Player.Attacker, move, board.edges)
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.AttackerWin)
    })
})

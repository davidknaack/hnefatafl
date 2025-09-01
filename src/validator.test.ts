import { describe, expect, test } from 'vitest'
import { renderBoard } from './utils'
import { transformLayoutToPosition } from './board'
import { validateMove } from './validator'
import { Player, PieceType, GameStatus } from './types'
import { extractDefenderPosition, clonePosition } from './board'

describe('Validator Tests', () => {
    test('One piece cannot move through another piece', () => {
        // prettier-ignore
        const boardLayout = [
                "R  K ",
                "     ",
                "  A  ",
                "  D  ",
                "     "
            ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 2, y: 2 }, // attacker
            to: { x: 2, y: 4 }, // try to move past defender
            captures: [],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Attacker,
            move,
            gameSetup.edgeSquares
        )

        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(false)
        expect(result.reason).toContain('Path is blocked')
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('A piece cannot move to a square occupied by another piece', () => {
        // prettier-ignore
        const boardLayout = [
            "R K  ",
            "     ",
            "  A  ",
            "  D  ",
            "     "
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 2, y: 2 },
            to: { x: 2, y: 3 }, // occupied by defender
            captures: [],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Attacker,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(false)
        expect(result.reason).toContain('Destination is occupied')
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('Moving non-owned piece fails', () => {
        // prettier-ignore
        const boardLayout = [
            "R K  ",
            "     ",
            "  A  ",
            "  D  ",
            "     "
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 2, y: 3 }, // defender
            to: { x: 2, y: 4 },
            captures: [],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Attacker,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(false)
        expect(result.reason).toContain('Not your piece')
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('Moving to restricted square fails for non-king', () => {
        // prettier-ignore
        const boardLayout = [
            "  K  ",
            "     ",
            "R A  ",
            "     ",
            "     "
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 2, y: 2 }, // attacker
            to: { x: 0, y: 2 },
            captures: [],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Attacker,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(false)
        expect(result.reason).toContain('Cannot move to restricted square')
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('King may move to a restricted square', () => {
        // prettier-ignore
        const boardLayout = [
            "R K  ",
            "     ",
            "     ",
            "     ",
            "     "
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 2, y: 0 }, // king
            to: { x: 0, y: 0 },
            captures: [],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Defender,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.status).toBe(GameStatus.DefenderWin)
    })

    test('King moving back to the throne (a restricted square) is not a win condition', () => {
        // prettier-ignore
        const boardLayout = [
            "T K  ",
            "     ",
            "     ",
            "     ",
            "     "
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 2, y: 0 }, // king
            to: { x: 0, y: 0 },
            captures: [],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Defender,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('Moving across restricted square successful for non-king', () => {
        // prettier-ignore
        const boardLayout = [
            "  K  ",
            "     ",
            "  A  ",
            "  R  ",
            "     "
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const moveAttacker = {
            from: { x: 2, y: 2 }, // attacker
            to: { x: 2, y: 4 },
            captures: [],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Attacker,
            moveAttacker,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('Defender cannot repeat board position', () => {
        // prettier-ignore
        const boardLayout = [
            "R K  ",
            "     ",
            "  D  ",
            "     ",
            "     "
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const history = [extractDefenderPosition(gameSetup.position)]

        const move1 = {
            from: { x: 2, y: 2 },
            to: { x: 2, y: 3 },
            captures: [],
        }
        const result1 = validateMove(
            gameSetup.position,
            Player.Defender,
            move1,
            gameSetup.edgeSquares,
            history
        )
        expect(result1.isValid).toBe(true)
        expect(result1.status).toBe(GameStatus.InProgress)

        const boardAfter = clonePosition(gameSetup.position)
        boardAfter[2][2].occupant = null
        boardAfter[3][2].occupant = {
            owner: Player.Defender,
            type: PieceType.Defender,
        }
        history.push(extractDefenderPosition(boardAfter))

        const move2 = {
            from: { x: 2, y: 3 },
            to: { x: 2, y: 2 },
            captures: [],
        }
        const result2 = validateMove(
            boardAfter,
            Player.Defender,
            move2,
            gameSetup.edgeSquares,
            history
        )
        expect(result2.isValid).toBe(false)
        expect(result2.reason).toContain('repeat')
        expect(result2.status).toBe(GameStatus.InProgress)
    })

    test('Diagonal move is invalid', () => {
        // prettier-ignore
        const boardLayout = [
            "R K  ",
            "     ",
            "  A  ",
            "     ",
            "R   R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 2, y: 2 },
            to: { x: 3, y: 3 },
            captures: [],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Attacker,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(false)
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('Throne occupied by king is not hostile to defenders', () => {
        // prettier-ignore
        const boardLayout = [
            "R   R",
            "A    ",
            " DK  ",
            "     ",
            "R   R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 0, y: 1 },
            to: { x: 0, y: 2 },
            captures: [{ x: 1, y: 2 }],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Attacker,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(false)
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('Throne occupied by king is hostile to attackers', () => {
        // prettier-ignore
        const boardLayout = [
            "R   R",
            "D    ",
            " AK  ",
            "     ",
            "R   R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 0, y: 1 },
            to: { x: 0, y: 2 },
            captures: [{ x: 1, y: 2 }],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Defender,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toEqual([{ x: 1, y: 2 }])
        expect(result.status).toBe(GameStatus.InProgress)
    })

    // Test for invalid captures
    test('Specifying incorrect captures is invalid', () => {
        // prettier-ignore
        const boardLayout = [
            "R   R",
            "D    ",
            " AK  ",
            "     ",
            "R   R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 0, y: 1 },
            to: { x: 0, y: 2 },
            captures: [{ x: 2, y: 2 }], // Incorrect capture specified, should be { x: 1, y: 2 }
        }
        const result = validateMove(
            gameSetup.position,
            Player.Defender,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(false)
        expect(result.reason).toContain('Invalid captures')
        expect(result.expectedCaptures).toEqual([{ x: 1, y: 2 }])
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('Left edge enclosure captures defenders', () => {
        // prettier-ignore
        const boardLayout = [
            "R     R",
            "       ",
            "A      ",
            "DA K   ",
            "D      ",
            "A      ",
            "RA    R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        // Test with complete captures
        const moveComplete = {
            from: { x: 1, y: 6 },
            to: { x: 1, y: 4 },
            captures: [
                { x: 0, y: 3 },
                { x: 0, y: 4 },
            ],
        }
        const resultComplete = validateMove(
            gameSetup.position,
            Player.Attacker,
            moveComplete,
            gameSetup.edgeSquares
        )
        expect(resultComplete.isValid).toBe(true)
        expect(resultComplete.expectedCaptures).toContainEqual({ x: 0, y: 3 })
        expect(resultComplete.expectedCaptures).toContainEqual({ x: 0, y: 4 })
        expect(resultComplete.status).toBe(GameStatus.InProgress)

        // Test with incomplete captures
        const moveIncomplete = {
            from: { x: 1, y: 6 },
            to: { x: 1, y: 4 },
            captures: [{ x: 0, y: 3 }], // Only one of the two captures
        }
        const resultIncomplete = validateMove(
            gameSetup.position,
            Player.Attacker,
            moveIncomplete,
            gameSetup.edgeSquares
        )
        expect(resultIncomplete.isValid).toBe(false)
        expect(resultIncomplete.reason).toContain('Invalid captures')
        expect(resultIncomplete.expectedCaptures).toContainEqual({ x: 0, y: 3 })
        expect(resultIncomplete.expectedCaptures).toContainEqual({ x: 0, y: 4 })
        expect(resultIncomplete.status).toBe(GameStatus.InProgress)
    })

    test('Left edge enclosure captures defenders using hostile restricted square', () => {
        // prettier-ignore
        const boardLayout = [
            "R     R",
            "       ",
            "A      ",
            "DA K   ",
            "DA     ",
            "D      ",
            "RA    R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 1, y: 6 },
            to: { x: 1, y: 5 },
            captures: [
                { x: 0, y: 3 },
                { x: 0, y: 4 },
                { x: 0, y: 5 },
            ],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Attacker,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toContainEqual({ x: 0, y: 3 })
        expect(result.expectedCaptures).toContainEqual({ x: 0, y: 4 })
        expect(result.expectedCaptures).toContainEqual({ x: 0, y: 5 })
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('Right edge enclosure captures defenders', () => {
        // prettier-ignore
        const boardLayout = [
            "R     R",
            "       ",
            "      A",
            "  K  AD",
            "      D",
            "      A",
            "R    AR"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 5, y: 6 },
            to: { x: 5, y: 4 },
            captures: [
                { x: 6, y: 3 },
                { x: 6, y: 4 },
            ],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Attacker,
            move,
            gameSetup.edgeSquares
        )
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toContainEqual({ x: 6, y: 3 })
        expect(result.expectedCaptures).toContainEqual({ x: 6, y: 4 })
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('Left edge enclosure captures defenders using hostile restricted square', () => {
        // prettier-ignore
        const boardLayout = [
            "R     R",
            "       ",
            "A      ",
            "DA K   ",
            "DA     ",
            "D      ",
            "RA    R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 1, y: 6 },
            to: { x: 1, y: 5 },
            captures: [
                { x: 0, y: 3 },
                { x: 0, y: 4 },
                { x: 0, y: 5 },
            ],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Attacker,
            move,
            gameSetup.edgeSquares
        )
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toContainEqual({ x: 0, y: 3 })
        expect(result.expectedCaptures).toContainEqual({ x: 0, y: 4 })
        expect(result.expectedCaptures).toContainEqual({ x: 0, y: 5 })
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('King may be captured on the throne by four attackers', () => {
        // prettier-ignore
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
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 3, y: 5 },
            to: { x: 4, y: 5 },
            captures: [{ x: 5, y: 5 }],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Attacker,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toContainEqual({ x: 5, y: 5 })
        expect(result.status).toBe(GameStatus.AttackerWin)
    })

    test('King may be captured off the throne by four attackers', () => {
        // prettier-ignore
        const boardLayout = [
            "R         R",  
            "           ",  
            "     T     ",  
            "           ",  
            "     A     ",  
            "   A KA    ",  
            "     A     ",  
            "           ",  
            "           ",  
            "           ",  
            "R         R"  
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 3, y: 5 },
            to: { x: 4, y: 5 },
            captures: [{ x: 5, y: 5 }],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Attacker,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toContainEqual({ x: 5, y: 5 })
        expect(result.status).toBe(GameStatus.AttackerWin)
    })

    test('King may be captured against the throne by three attackers', () => {
        // prettier-ignore
        const boardLayout = [
            "R         R",  
            "           ",  
            "           ",  
            "           ",  
            "     T     ",  
            "   A KA    ",  
            "     A     ",  
            "           ",  
            "           ",  
            "           ",  
            "R         R"  
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 3, y: 5 },
            to: { x: 4, y: 5 },
            captures: [{ x: 5, y: 5 }],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Attacker,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toContainEqual({ x: 5, y: 5 })
        expect(result.status).toBe(GameStatus.AttackerWin)
    })

    test('King may not be captured against the border by three attackers', () => {
        // prettier-ignore
        const boardLayout = [
            "R         R",  
            "           ",  
            "           ",  
            "           ",  
            "           ",  
            "     T     ",  
            "           ",  
            "           ",  
            "           ",  
            "     A     ",  
            "R  A KA   R"  
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 10, y: 3 },
            to: { x: 10, y: 4 },
            captures: [{ x: 10, y: 5 }],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Attacker,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(false)
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('King may not be captured against the border and a restricted square by two attackers', () => {
        // prettier-ignore
        const boardLayout = [
            "R         R",  
            "           ",  
            "           ",  
            "           ",  
            "           ",  
            "     T     ",  
            "           ",  
            "           ",  
            "           ",  
            " A         ",  
            "RK A      R"  
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 10, y: 3 },
            to: { x: 10, y: 2 },
            captures: [{ x: 10, y: 1 }],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Attacker,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(false)
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('King in a false fort (can be captured) does not win the game', () => {
        const boardLayout = [
            "R         R",
            "           ",
            "           ",
            "           ",
            "           ",
            "     T     ",
            "           ",
            "  A A      ",
            "           ",
            "     D     ",
            "R DKD     R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 9, y: 5 },
            to: { x: 9, y: 3 },
            captures: []
        }
        const result = validateMove(gameSetup.position, Player.Defender, move, gameSetup.edgeSquares)
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('King in a fort that cannot be captured wins the game', () => {
        const boardLayout = [
            "R         R",
            "           ",
            "           ",
            "           ",
            "           ",
            "     T     ",
            "           ",
            " A         ",
            "           ",
            "   D D     ",
            "R DK D    R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        gameSetup.position[5][5].isThrone = true;
        gameSetup.position[10][3].isThrone = false;
        const move = {
            from: { x: 9, y: 5 },
            to: { x: 9, y: 4 },
            captures: []
        }
        const result = validateMove(gameSetup.position, Player.Defender, move, gameSetup.edgeSquares)
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.DefenderWin)
    })

    test('Attackers win if defenders fully encircled', () => {
        // prettier-ignore
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
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 5, y: 1 },
            to: { x: 5, y: 2 },
            captures: [],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Attacker,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.AttackerWin)
    })
})

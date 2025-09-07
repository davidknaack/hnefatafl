import { describe, expect, test } from 'vitest'
import { renderBoard } from './utils'
import { transformLayoutToPosition } from './board'
import { validateMove } from './validator'
import { Player, PieceType, GameStatus } from './types'
import { extractDefenderPosition, clonePosition } from './board'

describe('Validator Tests', () => {
    test('One piece cannot move through another piece', () => {
        // Reason: Core game rule, pieces may only move across empty squares.
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
        // Reason: Core game rule, pieces may only move to empty squares.
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
        // Reason: Core game rule, players may only move their own pieces.
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
        // Reason: Core game rule, non-king pieces cannot move to restricted squares.
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

    test('King moving to a restricted square is a win condition', () => {
        // Reason: Core game rule, the king's primary objective is to occupy a restricted square that is not the throne.
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
        // Reason: Core game rule, the king may enter restricted squares.
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
        // Reason: Core game rule, non-king pieces may move across restricted squares when they are unoccupied.
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
        // Reason: Core game rule, the defender cannot repeat a previous board position.
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
        // Reason: Core game rule, pieces may only move in straight lines across unoccupied squares.
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
        // Reason: Core game rule, the throne occupied by the king is not hostile to defenders,
        // so defenders may not be captured using the occupied throne as a hostile square.
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
        // Reason: Core game rule, the throne occupied by the king is hostile to attackers,
        // so attackers may be captured using the occupied throne as a hostile square.
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

    test('King may participate in captures', () => {
        // Reason: Core game rule, the king is a defender and may participate in captures.
        // prettier-ignore
        const boardLayout = [
            "R   R",
            "D    ",
            " AKT ",
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
    
    test('Defenders may move between two attackers without being captured', () => {
        // Reason: Core game rule, captures are the result of movement by an opponent,
        // so pieces may move freely between hostile squares without being captured.
        // prettier-ignore
        const boardLayout = [
            "R     R",
            "       ",
            "A      ",
            " D K   ",
            "A      ",
            "       ",
            "R     R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 1, y: 3 },
            to: { x: 0, y: 3 },
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
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.InProgress)
    })
    
    test('Defenders may move between an attacker and a restricted square without being captured', () => {
        // Reason: Core game rule, captures are the result of movement by an opponent,
        // so pieces may move freely between hostile squares without being captured.
        // prettier-ignore
        const boardLayout = [
            "R     R",
            "       ",
            "A      ",
            " D K   ",
            "R      ",
            "       ",
            "R     R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 1, y: 3 },
            to: { x: 0, y: 3 },
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
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.InProgress)
    })
    
    test('Attackers may move between two defenders without being captured', () => {
        // Reason: Core game rule, captures are the result of movement by an opponent,
        // so pieces may move freely between hostile squares without being captured.
        // prettier-ignore
        const boardLayout = [
            "R     R",
            "       ",
            "D      ",
            " A K   ",
            "D      ",
            "       ",
            "R     R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 1, y: 3 },
            to: { x: 0, y: 3 },
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
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('Attackers may move between a defender and a restricted square without being captured', () => {
        // Reason: Core game rule, captures are the result of movement by an opponent,
        // so pieces may move freely between hostile squares without being captured.
        // prettier-ignore
        const boardLayout = [
            "R     R",
            "       ",
            "D      ",
            " A K   ",
            "D      ",
            "       ",
            "R     R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 1, y: 3 },
            to: { x: 0, y: 3 },
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
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('Specifying incorrect captures is invalid', () => {
        // Reason: Core game rule, captures are mandatory and must be valid.
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

    test('One attacker move may capture two defenders', () => {
        // Reason: Core game rule, all valid captures are performed in a single move.
        // prettier-ignore
        const boardLayout = [
            "R     R",
            "     K ",
            "AD DA  ",
            "  A    ",
            "       ",
            "       ",
            "R     R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 2, y: 3 },
            to: { x: 2, y: 2 },
            captures: [{ x: 1, y: 2 },{ x: 3, y: 2 }],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Attacker,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toEqual([{ x: 1, y: 2 },{ x: 3, y: 2 }])
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('One attackers move may capture three defender', () => {
        // Reason: Core game rule, all valid captures are performed in a single move.
        // prettier-ignore
        const boardLayout = [
            "R A   R",
            "  D  K ",
            "AD DA  ",
            "  A    ",
            "       ",
            "       ",
            "R     R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 2, y: 3 },
            to: { x: 2, y: 2 },
            captures: [{ x: 1, y: 2 },{ x: 3, y: 2 },{ x: 2, y: 1}],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Attacker,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toEqual([{ x: 2, y: 1 },{ x: 1, y: 2},{ x: 3, y: 2 }])
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('One defender move may capture two attackers', () => {
        // Reason: Core game rule, all valid captures are performed in a single move.
        // prettier-ignore
        const boardLayout = [
            "R     R",
            "     K ",
            "DA AD  ",
            "  D    ",
            "       ",
            "       ",
            "R     R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 2, y: 3 },
            to: { x: 2, y: 2 },
            captures: [{ x: 1, y: 2 },{ x: 3, y: 2 }],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Defender,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toEqual([{ x: 1, y: 2 },{ x: 3, y: 2 }])
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('One defender move may capture three attackers', () => {
        // Reason: Core game rule, all valid captures are performed in a single move.
        // prettier-ignore
        const boardLayout = [
            "R D   R",
            "  A  K ",
            "DA AD  ",
            "  D    ",
            "       ",
            "       ",
            "R     R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 2, y: 3 },
            to: { x: 2, y: 2 },
            captures: [{ x: 1, y: 2 },{ x: 3, y: 2 },{ x: 2, y: 1}],
        }
        const result = validateMove(
            gameSetup.position,
            Player.Defender,
            move,
            gameSetup.edgeSquares
        )
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toEqual([{ x: 2, y: 1 },{ x: 1, y: 2},{ x: 3, y: 2 }])
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('Left edge enclosure captures defenders', () => {
        // Reason: Core game rule, the edge enclosure captures defenders, regardless of which
        // board edge the capture occurs on.
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
        // Reason: Core game rule, restricted squares are hostile, and so are relevant
        // to edge enclosures capturing both attackers and defenders.
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
        // Reason: Core game rule, the edge enclosure captures defenders, regardless of which
        // board edge the capture occurs on.
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

    test('Edge capture and regular capture may occur in one move', () => {
        // Reason: Core game rule, all captures that can occur as a result of a move do occur. 
        // prettier-ignore
        const boardLayout = [
            "R     R",
            "     K ",
            "A      ",
            "DA     ",
            "D DA   ",
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
                { x: 2, y: 4 },
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
        expect(resultComplete.expectedCaptures).toContainEqual({ x: 2, y: 4 })
        expect(resultComplete.status).toBe(GameStatus.InProgress)
    })

    test('Left edge enclosure captures attackers using hostile restricted square', () => {
        // Reason: Core game rule, restricted squares are hostile, and so are relevant
        // to edge enclosures capturing both attackers and defenders.
        // prettier-ignore
        const boardLayout = [
            "R     R",
            "       ",
            "D      ",
            "AD K   ",
            "AD     ",
            "A      ",
            "RD    R"
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
            Player.Defender,
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
        // Reason: Core game rule, the king may be captured if surrounded by attackers,
        // the throne is not a safe space.
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
        // Reason: Core game rule, the king may be captured if surrounded by attackers.
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
        // Reason: Core game rule, the king may be captured if surrounded by attackers
        // with a restricted square (even the throne) qualifying as a hostile space.
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
        // Reason: Core game rule, the king may not be captured if it is against the border.
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
        // Reason: Core game rule, the king may not be captured if it is against the border.
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
        // Reason: Core game rule, the king may not be captured if it is against the border.
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

    test('King in a false fort (can be captured) does not win the game 1', () => {
        // Reason: The defender ending move on 2,8 can be captured, leaving the king
        // exposed, so this is not a fort.
        // prettier-ignore
        const boardLayout = [
            "R         R",
            "           ",
            "           ",
            "           ",
            "           ",
            "     T     ",
            "           ",
            "  D        ",
            " A  A      ",
            " D D       ",
            "RDKD      R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 2, y: 7 },
            to: { x: 2, y: 8 },
            captures: []
        }
        const result = validateMove(gameSetup.position, Player.Defender, move, gameSetup.edgeSquares)
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('King in a false fort (not capturable, but not enclosing the king) does not win the game 2', () => {
        // Reason: The defenders are not capturable, but attackers have a path to the king.
        //prettier-ignore
        const boardLayout = [
            "R         R",
            "           ",
            "   DD      ",
            "           ",
            "           ",
            "     T     ",
            "           ",
            "  A A      ",
            "       D   ",
            "   DD D    ",
            "R  DDKDD  R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 7, y: 8 },
            to: { x: 7, y: 9 },
            captures: []
        }
        const result = validateMove(gameSetup.position, Player.Defender, move, gameSetup.edgeSquares)
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('King in a false fort (enclosed attacker exposes the king) does not win the game 3', () => {
        // Reason: Implied rule, the defenders are not capturable, but an attacker (inside the fort)
        // has a path to the king.
        // prettier-ignore
        const boardLayout = [
            "R         R",
            "           ",
            "   DD      ",
            "           ",
            "     T     ",
            "  A A      ",
            "   DDDDD   ",
            "   DDDDD   ",
            "   DDADD   ",
            "   DD D D  ",
            "R  DDKDD  R"
         ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 8, y: 9 },
            to: { x: 7, y: 9 },
            captures: []
        }
        const result = validateMove(gameSetup.position, Player.Defender, move, gameSetup.edgeSquares)
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('King in a fort, on board edge, vertical movement possible', () => {
        // Reason: Core game rule, the defenders win if the king has contact with the board edge, 
        // is able to move, and it is impossible for the attackers to break the fort.
        // prettier-ignore
        const boardLayout = [
            "R         R",
            "           ",
            "           ",
            "           ",
            "           ",
            "     R     ",
            "           ",
            "           ",
            "    D D    ",
            "    D D    ",
            "R   DKD   R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 6, y: 8 },
            to: { x: 5, y: 8 },
            captures: []
        }
        const result = validateMove(gameSetup.position, Player.Defender, move, gameSetup.edgeSquares)
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.DefenderWin)
    })

    test('King in a fort, not on board edge, vertical movement possible', () => {
        // Reason: Core game rule, the defenders don't win if the king is in a fort
        // but does not have contact with the board edge, 
        // prettier-ignore
        const boardLayout = [
            "R         R",
            "           ",
            "           ",
            "           ",
            "           ",
            "     R     ",
            "           ",
            "           ",
            "    D D    ",
            "    DKD    ",
            "R   D D   R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 6, y: 8 },
            to: { x: 5, y: 8 },
            captures: []
        }
        const result = validateMove(gameSetup.position, Player.Defender, move, gameSetup.edgeSquares)
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.InProgress)
    })


    test('King moving to the edge does not win the game', () => {
        // Reason: Core game rule, the defenders don't win if the king only moves to the edge
        // prettier-ignore
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
            "   K D     ",
            "R D  D    R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 3, y: 9 },
            to: { x: 4, y: 9 },
            captures: []
        }
        const result = validateMove(gameSetup.position, Player.Defender, move, gameSetup.edgeSquares)
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.InProgress)
    })

    test('King in a fort, on board edge, horizontal movement possible', () => {
        // prettier-ignore
        // Reason: Core game rule, the defenders win if the king has contact with the board edge, 
        // is able to move, and it is impossible for the attackers to break the fort.
        // prettier-ignore
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
        const move = {
            from: { x: 5, y: 9 },
            to: { x: 4, y: 9 },
            captures: []
        }
        const result = validateMove(gameSetup.position, Player.Defender, move, gameSetup.edgeSquares)
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.DefenderWin)
    })

    test('Captureable defenders adjacent to a fort do not invalidate the fort', () => {
        // Reason: Implied rule, a defender that is adjacent to a fort and is capturable
        // does not make the fort capturable.
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
            " A DA      ",
            "   D D     ",
            "R DK D    R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 5, y: 9 },
            to: { x: 4, y: 9 },
            captures: []
        }
        const result = validateMove(gameSetup.position, Player.Defender, move, gameSetup.edgeSquares)
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.DefenderWin)
    })

    test('A fort must be on the edge of the board', () => {
        // Reason: Core game rule, a fort is only a win if the king is on the edge of the board.
        // prettier-ignore
        const boardLayout = [
            "R         R",
            "           ",
            "           ",
            "           ",
            "           ",
            "     T     ",
            " A DD D    ",
            "   D D     ",
            "   DkD     ",
            "   DDD     ",
            "R         R"
        ]
        const gameSetup = transformLayoutToPosition(boardLayout)
        const move = {
            from: { x: 6, y: 6 },
            to: { x: 5, y: 6 },
            captures: []
        }
        const result = validateMove(gameSetup.position, Player.Defender, move, gameSetup.edgeSquares)
        console.log(renderBoard(gameSetup.position, gameSetup.edgeSquares))
        expect(result.isValid).toBe(true)
        expect(result.expectedCaptures).toEqual([])
        expect(result.status).toBe(GameStatus.InProgress)
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

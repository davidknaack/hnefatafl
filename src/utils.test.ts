import { describe, test, expect } from 'vitest'
import { defendersCanEscape, renderBoard } from './utils'
import {
    transformLayoutToPosition,
    extractEdgeSquares,
    GameSetup,
} from './board'
import { Square, Player, PieceType, Coordinate } from './types'

// Helper to create a test board with the specified layout
function createTestBoardAndEdges(layout: string[]): GameSetup {
    // Use the shared transformation function with test-specific options
    const gameSetup = transformLayoutToPosition(layout)

    return gameSetup
}

describe('defendersCanEscape', () => {
    test('returns true when king is on the edge', (context) => {
        // prettier-ignore
        const { position, edgeSquares } = createTestBoardAndEdges([
            'K....',
            '.....',
            '.....',
            '.....',
            '.....'
        ]);
        console.log(context.task.name)
        console.log(renderBoard(position, edgeSquares))
        expect(defendersCanEscape(position, edgeSquares)).toBe(true)
    })

    test('returns true when a defender is on the edge', (context) => {
        // prettier-ignore
        const { position, edgeSquares } = createTestBoardAndEdges([
            'D....',
            '.....',
            '.....',
            '.....',
            '.....'
        ]);
        console.log(context.task.name)
        console.log(renderBoard(position, edgeSquares))
        expect(defendersCanEscape(position, edgeSquares)).toBe(true)
    })

    test('returns false when an attacker is on the top edge', (context) => {
        // prettier-ignore
        const { position, edgeSquares } = createTestBoardAndEdges([
            'aaaaa',
            'a.d.a',
            'a...a',
            'a...a',
            'aaaaa'
        ]);
        console.log(context.task.name)
        console.log(renderBoard(position, edgeSquares))
        expect(defendersCanEscape(position, edgeSquares)).toBe(false)
    })

    test('returns false when an attacker is on the right edge', (context) => {
        // prettier-ignore
        const { position, edgeSquares } = createTestBoardAndEdges([
            'aaaaa',
            'a.d.a',
            'a...a',
            'a...a',
            'aaaaa'
        ]);
        console.log(context.task.name)
        console.log(renderBoard(position, edgeSquares))
        expect(defendersCanEscape(position, edgeSquares)).toBe(false)
    })

    test('returns true when a defender can reach the edge', (context) => {
        // prettier-ignore
        const { position, edgeSquares } = createTestBoardAndEdges([
            '.....',
            '.....',
            '..d..',
            '.....',
            '.....'
        ]);
        console.log(context.task.name)
        console.log(renderBoard(position, edgeSquares))
        expect(defendersCanEscape(position, edgeSquares)).toBe(true)
    })

    test('returns false when defenders are completely surrounded', (context) => {
        // prettier-ignore
        const { position, edgeSquares } = createTestBoardAndEdges([
            '.....',
            '.aaa.',
            '.ada.',
            '.aaa.',
            '.....'
        ]);
        console.log(context.task.name)
        console.log(renderBoard(position, edgeSquares))
        expect(defendersCanEscape(position, edgeSquares)).toBe(false)
    })

    test('returns false when multiple defenders are surrounded', (context) => {
        // prettier-ignore
        const { position, edgeSquares } = createTestBoardAndEdges([
            'aaaaa',
            'aaaa.',
            'a.kda',
            'aaaaa',
            'aaaaa'
        ]);
        console.log(context.task.name)
        console.log(renderBoard(position, edgeSquares))
        expect(defendersCanEscape(position, edgeSquares)).toBe(false)
    })

    test('returns true for a winding path to the edge', (context) => {
        // prettier-ignore
        const { position, edgeSquares } = createTestBoardAndEdges([
            '.....',
            '.....',
            '..d..',
            '.....',
            '.....'
        ]);
        console.log(context.task.name)
        console.log(renderBoard(position, edgeSquares))
        expect(defendersCanEscape(position, edgeSquares)).toBe(true)
    })

    test('returns false for a large board with isolated defenders', (context) => {
        const layout = Array.from({ length: 10 }, (_, y) =>
            Array.from({ length: 10 }, (_, x) => {
                // Create a ring of attackers around positions (5,5) and (6,5)
                if (
                    (Math.abs(x - 5) <= 1 && Math.abs(y - 5) <= 1) ||
                    (Math.abs(x - 5) <= 1 && Math.abs(y - 6) <= 1)
                ) {
                    if ((x === 5 && y === 5) || (x === 5 && y === 6)) return 'd'
                    return 'a'
                }
                return '.'
            }).join('')
        )

        const { position, edgeSquares } = createTestBoardAndEdges(layout)
        console.log(context.task.name)
        console.log(renderBoard(position, edgeSquares))
        expect(defendersCanEscape(position, edgeSquares)).toBe(false)
    })

    test('returns true for multiple defenders with one escape route', (context) => {
        // prettier-ignore
        const { position, edgeSquares } = createTestBoardAndEdges([
            '.....',
            '.....',
            '..dd.',
            '.aa.a',
            '.....'
        ]);
        console.log(context.task.name)
        console.log(renderBoard(position, edgeSquares))
        expect(defendersCanEscape(position, edgeSquares)).toBe(true)
    })

    test('returns false when edges are blocked', (context) => {
        // prettier-ignore
        const { position, edgeSquares} = createTestBoardAndEdges([
            'aaaaa',
            'a..da',
            'a.d.a',
            'aa.aa',
            'aaaaa'
        ]);
        console.log(context.task.name)
        console.log(renderBoard(position, edgeSquares))
        expect(defendersCanEscape(position, edgeSquares)).toBe(false)
    })
})

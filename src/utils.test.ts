import { describe, test, expect } from 'vitest'
import { layoutFixture } from './test/fixtures'
import { defendersCanEscape, defendersHaveFort } from './utils'
import { extractEdgeSquares } from './board'
import { Square, Player, PieceType, Coordinate } from './types'

describe('defendersCanEscape', () => {
    test('returns true when king is on the edge', () => {
        // prettier-ignore
        const { position, edgeSquares } = layoutFixture([
            'K....',
            '.....',
            '.....',
            '.....',
            '.....'
        ]);
        expect(defendersCanEscape(position, edgeSquares)).toBe(true)
    })

    test('returns true when a defender is on the edge', () => {
        // prettier-ignore
        const { position, edgeSquares } = layoutFixture([
            'D....',
            '.....',
            '.....',
            '.....',
            '.....'
        ]);
        expect(defendersCanEscape(position, edgeSquares)).toBe(true)
    })

    test('returns false when an attacker is on the top edge', () => {
        // prettier-ignore
        const { position, edgeSquares } = layoutFixture([
            'aaaaa',
            'a.d.a',
            'a...a',
            'a...a',
            'aaaaa'
        ]);
        expect(defendersCanEscape(position, edgeSquares)).toBe(false)
    })

    test('returns false when an attacker is on the right edge', () => {
        // prettier-ignore
        const { position, edgeSquares } = layoutFixture([
            'aaaaa',
            'a.d.a',
            'a...a',
            'a...a',
            'aaaaa'
        ]);
        expect(defendersCanEscape(position, edgeSquares)).toBe(false)
    })

    test('returns true when a defender can reach the edge', () => {
        // prettier-ignore
        const { position, edgeSquares } = layoutFixture([
            '.....',
            '.....',
            '..d..',
            '.....',
            '.....'
        ]);
        expect(defendersCanEscape(position, edgeSquares)).toBe(true)
    })

    test('returns false when defenders are completely surrounded', () => {
        // prettier-ignore
        const { position, edgeSquares } = layoutFixture([
            '.....',
            '.aaa.',
            '.ada.',
            '.aaa.',
            '.....'
        ]);
        expect(defendersCanEscape(position, edgeSquares)).toBe(false)
    })

    test('returns false when multiple defenders are surrounded', () => {
        // prettier-ignore
        const { position, edgeSquares } = layoutFixture([
            'aaaaa',
            'aaaa.',
            'a.kda',
            'aaaaa',
            'aaaaa'
        ]);
        expect(defendersCanEscape(position, edgeSquares)).toBe(false)
    })

    test('returns true for an open route to the edge', () => {
        // prettier-ignore
        const { position, edgeSquares } = layoutFixture([
            '.....',
            '.....',
            '..d..',
            '.....',
            '.....'
        ]);
        expect(defendersCanEscape(position, edgeSquares)).toBe(true)
    })

    test('returns false for a large board with isolated defenders', () => {
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

        const { position, edgeSquares } = layoutFixture(layout)
        expect(defendersCanEscape(position, edgeSquares)).toBe(false)
    })

    test('returns true for multiple defenders with one escape route', () => {
        // prettier-ignore
        const { position, edgeSquares } = layoutFixture([
            '.....',
            '.....',
            '..dd.',
            '.aa.a',
            '.....'
        ]);
        expect(defendersCanEscape(position, edgeSquares)).toBe(true)
    })

    test('returns false when edges are blocked', () => {
        // prettier-ignore
        const { position, edgeSquares} = layoutFixture([
            'aaaaa',
            'a..da',
            'a.d.a',
            'aa.aa',
            'aaaaa'
        ]);
        expect(defendersCanEscape(position, edgeSquares)).toBe(false)
    })
})

describe('defendersHaveFort', () => {
    test('returns false when the king is outside the fort wall', () => {
        const { position } = layoutFixture([
            'A..........',
            '...........',
            '...........',
            '...........',
            '...........',
            '...........',
            '...........',
            '...........',
            '.....DDD...',
            '.....DAD...',
            '.....KDD...',
        ])

        expect(defendersHaveFort(position)).toBe(false)
    })

    test('returns true when an enclosed attacker is isolated from the king', () => {
        const { position } = layoutFixture([
            '...........',
            '...........',
            '...........',
            '...........',
            '...........',
            '...........',
            '...........',
            '...........',
            '....DDDDD..',
            '....D.DAD..',
            '....DKDDD..',
        ])

        expect(defendersHaveFort(position)).toBe(true)
    })
})

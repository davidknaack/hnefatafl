import { describe, expect, test } from 'vitest'
import { parseMove, parseMoveSequence } from './parser'

describe('Supported move notation', () => {
    test('parses ranks 10 and 11 and ignores surrounding/interstitial whitespace', () => {
        expect(parseMove(' D11 - D10 ')).toEqual({
            from: { x: 3, y: 0 }, to: { x: 3, y: 1 }, captures: [],
        })
    })

    test('parses every uppercase capture coordinate across repeated calls', () => {
        const expected = {
            from: { x: 3, y: 5 }, to: { x: 3, y: 3 },
            captures: [{ x: 3, y: 4 }, { x: 4, y: 4 }],
        }
        expect(parseMove('D6-D8(D7E7)')).toEqual(expected)
        expect(parseMove('D6-D8(D7E7)')).toEqual(expected)
    })

    test('parses an ordered sequence of supported moves', () => {
        expect(parseMoveSequence('D11-D10, F8-E8')).toEqual([
            { from: { x: 3, y: 0 }, to: { x: 3, y: 1 }, captures: [] },
            { from: { x: 5, y: 3 }, to: { x: 4, y: 3 }, captures: [] },
        ])
    })

    test.each(['', 'garbage', 'A1', 'A1-B12'])('rejects unsupported whole-move syntax: %j', (input) => {
        expect(parseMove(input)).toBeNull()
    })
})

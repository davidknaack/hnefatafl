import { describe, expect, test } from 'vitest'
import { parseMove, parseMoveSequence, serializeMove } from './parser'
import { coordFromString, coordToString } from './coordinates'

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
        expect(parseMoveSequence('D11-D10, F8-E8')).toEqual({ success: true, moves: [
            { from: { x: 3, y: 0 }, to: { x: 3, y: 1 }, captures: [] },
            { from: { x: 5, y: 3 }, to: { x: 4, y: 3 }, captures: [] },
        ] })
    })

    test.each(['', 'garbage', 'A1', 'A1-B12'])('rejects unsupported whole-move syntax: %j', (input) => {
        expect(parseMove(input)).toBeNull()
    })
})

describe('Strict notation boundaries', () => {
    test.each([
        'D11-D10(garbage)', 'D11-D10(A12)', 'D11-D10(A1junk)',
        'D11-D10()', 'D11-D10(A0)', 'D11-D10(L1)', 'D11-D10(A01)',
        'D11-D10(A1,B1)', 'D11-D10(A1)(B1)', 'D11-D10((A1))',
        'D11-D10(A1)junk', 'D11-D10(A1', 'D11-D10A1)', 'P',
    ])('rejects the entire malformed token %j', (input) => {
        expect(parseMove(input)).toBeNull()
        expect(parseMoveSequence(input)).toMatchObject({
            success: false, index: 0, token: input.split(',')[0], moves: [],
        })
    })

    test('normalizes case and whitespace consistently with complete captures', () => {
        const move = parseMove(' d6 - d8 ( d7 E7 a10 k11 ) ')
        expect(move?.captures).toEqual([
            { x: 3, y: 4 }, { x: 4, y: 4 }, { x: 0, y: 1 }, { x: 10, y: 0 },
        ])
        expect(parseMoveSequence(' d6 - d8 ( d7 E7 a10 k11 ) ')).toEqual({ success: true, moves: [move] })
        expect(serializeMove(move!)).toBe('D6-D8(D7E7A10K11)')
        expect(parseMove(serializeMove(move!))).toEqual(move)
        expect(parseMove('D11-D10(a1)')?.captures).toEqual([{ x: 0, y: 10 }])
    })

    test.each(['garbage', 'P', '', 'D11-D10(A12)'])('reports a failed token without dropping it: %j', (token) => {
        const result = parseMoveSequence(`D11-D10,${token},F8-E8`)
        expect(result).toMatchObject({
            success: false, index: 1, token, moves: [parseMove('D11-D10')],
            error: expect.stringContaining('Move 2:'),
        })
    })

    test.each(['', ' ', ',D11-D10', 'D11-D10,'])('rejects empty sequences and empty tokens: %j', (input) => {
        expect(parseMoveSequence(input).success).toBe(false)
    })

    test('round-trips every addressable square through coordinates and move serialization', () => {
        for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
            const coord = { x, y }
            expect(coordFromString(coordToString(coord))).toEqual(coord)
            const move = { from: coord, to: { x: 10 - x, y: 10 - y }, captures: [coord] }
            expect(parseMove(serializeMove(move))).toEqual(move)
        }
    })
})

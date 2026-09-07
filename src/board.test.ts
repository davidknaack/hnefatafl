import { describe, expect, test } from 'vitest'
import { applyMoveToPosition, clonePosition, initializeGame, STANDARD_BOARD, transformLayoutToPosition } from './board'
import { layoutFixture, positionFixture } from './test/fixtures'
import { Piece, PieceType, Player } from './types'

describe('Board ownership', () => {
    test('layout pieces are independent of neighboring pieces, custom mappings, and other boards', () => {
        const occupant: Piece = { owner: Player.Attacker, type: PieceType.Attacker }
        const options = { charMap: { X: { occupant } } }
        const first = transformLayoutToPosition(['XX', 'AA'], options).position
        const second = transformLayoutToPosition(['XX', 'AA'], options).position
        Object.assign(first[0][0].occupant!, { owner: Player.Defender, type: PieceType.King })
        Object.assign(first[1][0].occupant!, { owner: Player.Defender, type: PieceType.Defender })
        expect(first[0][1].occupant).toEqual(occupant)
        expect(first[1][1].occupant).toEqual(occupant)
        expect(second.flat().every((square) => square.occupant?.type === PieceType.Attacker)).toBe(true)
        Object.assign(occupant, { owner: Player.Defender, type: PieceType.King })
        expect(first[0][1].occupant?.type).toBe(PieceType.Attacker)
        expect(second[0][0].occupant?.type).toBe(PieceType.Attacker)
    })

    test.each(['clone', 'move'] as const)('%s detaches both moved and stationary occupants from its input', (operation) => {
        const input = transformLayoutToPosition(['AA.', '.K.', '...']).position
        const original = structuredClone(input)
        const output = operation === 'clone' ? clonePosition(input)
            : applyMoveToPosition(input, { from: { x: 0, y: 0 }, to: { x: 0, y: 2 }, captures: [] })
        const moving = operation === 'clone' ? output[0][0] : output[2][0]
        Object.assign(moving.occupant!, { owner: Player.Defender, type: PieceType.King })
        Object.assign(output[0][1].occupant!, { owner: Player.Defender, type: PieceType.Defender })
        output[1][1].isThrone = false
        output[1][1].isRestricted = false
        output[0].push({ occupant: null, isThrone: false, isRestricted: false })
        expect(input).toEqual(original)
        const savedOutput = structuredClone(output)
        Object.assign(input[1][1].occupant!, { owner: Player.Attacker, type: PieceType.Attacker })
        expect(output).toEqual(savedOutput)
    })
})

describe('Game initialization', () => {
    test('No kings on board fails initial board creation', () => {
        const boardLayout = STANDARD_BOARD.map((row) => row.replace('K', '.'))
        expect(() => initializeGame(boardLayout)).toThrowError(
            /There must be exactly one king on the board/i
        )
    })
})

describe('Layout and position fixture contracts', () => {
    test('layout shorthand puts K on a restricted throne when T is absent', () => {
        const { position } = layoutFixture(['...', '.K.', '...'])
        expect(position[1][1]).toEqual({
            occupant: { owner: Player.Defender, type: PieceType.King },
            isThrone: true, isRestricted: true,
        })
    })

    test('an explicit T separates king and throne in layout shorthand', () => {
        const { position } = layoutFixture(['K..', '.T.', '..R'])
        expect(position[0][0]).toEqual({
            occupant: { owner: Player.Defender, type: PieceType.King },
            isThrone: false, isRestricted: false,
        })
        expect(position[1][1]).toEqual({ occupant: null, isThrone: true, isRestricted: true })
        expect(position[2][2]).toEqual({ occupant: null, isThrone: false, isRestricted: true })
    })

    test('position fixtures require explicit throne terrain even when T is absent', () => {
        const { position, edgeSquares } = positionFixture(['K...', '.R..', '..k.', '....'])
        for (const [x, y] of [[0, 0], [2, 2]]) {
            expect(position[y][x]).toEqual({
                occupant: { owner: Player.Defender, type: PieceType.King },
                isThrone: false, isRestricted: false,
            })
        }
        expect([...edgeSquares]).toContainEqual({ x: 1, y: 1 })
        expect([...edgeSquares]).not.toContainEqual({ x: 2, y: 2 })
    })

    test('position fixtures retain explicit T and R terrain', () => {
        const { position } = positionFixture(['K..', '.T.', '..R'])
        expect(position[1][1]).toEqual({ occupant: null, isThrone: true, isRestricted: true })
        expect(position[2][2]).toEqual({ occupant: null, isThrone: false, isRestricted: true })
    })

    test('low-level fixtures allow small boards without kings', () => {
        for (const create of [layoutFixture, positionFixture]) {
            const { position } = create(['A.', '.D'])
            expect(position).toHaveLength(2)
            expect(position[0][0].occupant?.type).toBe(PieceType.Attacker)
            expect(position[1][1].occupant?.type).toBe(PieceType.Defender)
        }
    })

    test.each([
        { name: 'empty layout', layout: [] },
        { name: 'unequal rows', layout: ['..', '...'] },
    ])('transformation rejects $name', ({ layout }) => {
        expect(() => transformLayoutToPosition(layout)).toThrow()
    })

    test('custom character mappings replace a whole square mapping and preserve other defaults', () => {
        const { position } = transformLayoutToPosition(['KX.', '.A.', '...'], {
            charMap: {
                K: { occupant: { owner: Player.Defender, type: PieceType.King } },
                X: { isRestricted: true },
            },
        })
        expect(position[0][0].isThrone).toBe(false)
        expect(position[0][0].isRestricted).toBe(false)
        expect(position[0][1]).toEqual({ occupant: null, isThrone: false, isRestricted: true })
        expect(position[1][1].occupant).toEqual({ owner: Player.Attacker, type: PieceType.Attacker })
    })
})

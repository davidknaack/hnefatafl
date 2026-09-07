import { describe, expect, test } from 'vitest'
import { initializeGame, transformLayoutToPosition } from './board'
import { layoutFixture, positionFixture } from './test/fixtures'
import { PieceType, Player } from './types'

describe('Game initialization', () => {
    test('No kings on board fails initial board creation', () => {
        // prettier-ignore
        const boardLayout = [
            "A D A",
            "     ",
            "     ",
            "     ",
            "     "
        ]
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

import { describe, expect, it } from 'vitest'
import { layoutFixture } from './test/fixtures'
import { initializeGame, STANDARD_BOARD } from './board'
import { generatePossibleMoves } from './moveGenerator'
import { PieceType, Player, Square, Coordinate } from './types'

// Independent destination enumeration checks the ray walk against exhaustive
// geometry, including passing over (but not landing on) empty restricted squares.
function destinations(
    position: Square[][],
    from: Coordinate,
    player: Player
): Coordinate[] {
    const piece = position[from.y][from.x].occupant
    if (
        !piece ||
        (piece.owner !== player &&
            !(player === Player.Defender && piece.type === PieceType.King))
    )
        return []
    const result: Coordinate[] = []
    for (let y = 0; y < position.length; y++) {
        for (let x = 0; x < position.length; x++) {
            if (position[y][x].occupant) continue
            if (piece.type !== PieceType.King && position[y][x].isRestricted)
                continue
            if (x !== from.x && y !== from.y) continue
            const between =
                x === from.x
                    ? position
                          .slice(Math.min(y, from.y) + 1, Math.max(y, from.y))
                          .map((row) => row[x])
                    : position[y].slice(
                          Math.min(x, from.x) + 1,
                          Math.max(x, from.x)
                      )
            if (between.every((square) => !square.occupant))
                result.push({ x, y })
        }
    }
    return result
}

describe('movement extraction equivalence', () => {
    const fixtures = [
        { name: 'standard opening', setup: initializeGame(STANDARD_BOARD) },
        {
            name: 'restricted transit and blockers',
            setup: layoutFixture([
                'R...R',
                '.A.D.',
                '.R.T.',
                '.K.A.',
                'R...R',
            ]),
        },
        {
            name: 'open king and edge captures',
            setup: layoutFixture([
                'RD.AR',
                '.A...',
                '..K..',
                '..D..',
                'R...R',
            ]),
        },
    ]
    for (const { name, setup } of fixtures) {
        it(`matches exhaustive destinations for every source and side: ${name}`, () => {
            const before = JSON.stringify(setup.position)
            for (const player of [Player.Attacker, Player.Defender]) {
                for (let y = 0; y < setup.position.length; y++) {
                    for (let x = 0; x < setup.position.length; x++) {
                        const from = { x, y }
                        const actual = generatePossibleMoves(
                            setup.position,
                            from,
                            player,
                            setup.edgeSquares
                        )
                        const keys = (coords: Coordinate[]) =>
                            coords.map((c) => `${c.x},${c.y}`).sort()
                        expect(keys(actual.map((move) => move.to))).toEqual(
                            keys(destinations(setup.position, from, player))
                        )
                    }
                }
            }
            expect(JSON.stringify(setup.position)).toBe(before)
        })
    }
})

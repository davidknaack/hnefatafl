import { expect, test } from 'vitest'
import { layoutFixture } from './test/fixtures'
import { getAvailableCaptures } from './rules'
import { Player } from './types'

test('shieldwalls cannot join opposite edges into a fictitious capture line', () => {
    const { position, edgeSquares } = layoutFixture([
        '..A....',
        '.......',
        '...T...',
        '.......',
        '..DDD..',
        '..D.DA.',
        '..DKD..',
    ])
    expect(getAvailableCaptures(position, {
        from: { x: 5, y: 5 }, to: { x: 5, y: 6 }, captures: [],
    }, Player.Attacker, edgeSquares)).toEqual([])
})

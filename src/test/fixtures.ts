import { GameSetup, transformLayoutToPosition } from '../board'
import { PieceType, Player } from '../types'

/** Flexible rule fixture with production shorthand: K implies throne unless T exists.
 * Allows small boards and missing kings; use engine.reset for facade scenarios.
 */
export function layoutFixture(layout: string[]): GameSetup {
    return transformLayoutToPosition(layout)
}

/** Explicit terrain: K is an ordinary king square; only T marks the throne.
 * R marks restricted non-throne terrain. No production king-count validation.
 */
export function positionFixture(layout: string[]): GameSetup {
    return transformLayoutToPosition(layout, {
        charMap: {
            K: { occupant: { owner: Player.Defender, type: PieceType.King } },
            k: { occupant: { owner: Player.Defender, type: PieceType.King } },
        },
    })
}

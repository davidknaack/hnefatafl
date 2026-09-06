import { isSameCoord, isPathClear, canMovePiece, canEnterSquare } from './movement'
import {
    Square,
    Coordinate,
    Move,
    MoveValidationResult,
    Player,
    GameStatus,
} from './types'
import { coordToString } from './coordinates'
import { getAvailableCaptures } from './captures'
import { getGameStatusAfterMove } from './rules'
import { extractDefenderPosition, applyMoveToPosition } from './board'

export function validateMove(
    position: Square[][],
    player: Player,
    move: Move,
    escapeTargets: Set<Coordinate>,
    defenderPositions: string[][] = []
): MoveValidationResult {
    const fromSquare = position[move.from.y][move.from.x]
    const toSquare = position[move.to.y][move.to.x]

    if (!fromSquare.occupant)
        return {
            isValid: false,
            reason: 'No piece at source',
            expectedCaptures: [],
            status: GameStatus.InProgress,
        }

    if (!canMovePiece(fromSquare.occupant, player))
        return {
            isValid: false,
            reason: 'Not your piece',
            expectedCaptures: [],
            status: GameStatus.InProgress,
        }

    if (toSquare.occupant)
        return {
            isValid: false,
            reason: 'Destination is occupied',
            expectedCaptures: [],
            status: GameStatus.InProgress,
        }

    if (!isPathClear(position, move.from, move.to))
        return {
            isValid: false,
            reason: 'Path is blocked',
            expectedCaptures: [],
            status: GameStatus.InProgress,
        }

    if (!canEnterSquare(fromSquare.occupant, toSquare))
        return {
            isValid: false,
            reason: 'Cannot move to restricted square',
            expectedCaptures: [],
            status: GameStatus.InProgress,
        }

    const expectedCaptures = getAvailableCaptures(
        position,
        move,
        player,
        escapeTargets
    )

    // If captures were explicitly provided, validate them
    if (move.captures.length > 0) {
        // Check if provided captures match the expected ones
        if (
            move.captures.length !== expectedCaptures.length ||
            !expectedCaptures.every((expected) =>
                move.captures.some((capture) => isSameCoord(capture, expected))
            )
        ) {
            return {
                isValid: false,
                reason: `Invalid captures. Expected ${expectedCaptures.length} specific captures.`,
                expectedCaptures,
                status: GameStatus.InProgress,
            }
        }

        // Validate that all provided captures are valid
        for (const capture of move.captures) {
            const found = expectedCaptures.some((exp) =>
                isSameCoord(exp, capture)
            )
            if (!found) {
                return {
                    isValid: false,
                    reason: `Invalid capture at ${coordToString(capture)}`,
                    expectedCaptures,
                    status: GameStatus.InProgress,
                }
            }
        }
    }

    // At this point, either no captures were provided, or they exactly match the expected captures

    if (player === 'defender') {
        const pos = extractDefenderPosition(position, move)
        const repeat = defenderPositions.some(
            (p) => p.length === pos.length && p.every((r, i) => r === pos[i])
        )
        if (repeat) {
            return {
                isValid: false,
                reason: 'Move would repeat defender board position',
                expectedCaptures,
                status: GameStatus.InProgress,
            }
        }
    }

    // Determine status on a simulated post-move board (including captures)
    const previewPosition = applyMoveToPosition(position, move, {
        applyCaptures: true,
    })
    const status = getGameStatusAfterMove(previewPosition, move, player)
    return { isValid: true, expectedCaptures, status }
}

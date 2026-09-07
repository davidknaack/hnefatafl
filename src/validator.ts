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
import { applyMoveToPosition } from './board'
import { positionKey } from './repetition'

/** A successful resolution is the complete board transition used for commit. */
export type MoveResolution =
    | (Extract<MoveValidationResult, { isValid: true }> & {
        move: Move
        position: Square[][]
        positionHistory: string[]
        currentPlayer: Player
    })
    | Extract<MoveValidationResult, { isValid: false }>

export function validateMove(
    position: Square[][],
    player: Player,
    move: Move,
    escapeTargets: Set<Coordinate>,
    positionHistory: string[] = []
): MoveValidationResult {
    const result = resolveMove(position, player, move, escapeTargets, positionHistory)
    if (!result.isValid) return result
    return {
        isValid: true, expectedCaptures: result.expectedCaptures, status: result.status,
    }
}

export function resolveMove(
    position: Square[][],
    player: Player,
    move: Move,
    escapeTargets: Set<Coordinate>,
    positionHistory: string[] = []
): MoveResolution {
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

    // Resolve mandatory captures before either status or repetition evaluation.
    const resolvedMove = { ...move, captures: expectedCaptures }
    const previewPosition = applyMoveToPosition(position, resolvedMove, {
        applyCaptures: true,
    })
    const nextPlayer = player === Player.Attacker ? Player.Defender : Player.Attacker
    const key = positionKey(previewPosition, nextPlayer)
    const history = expectedCaptures.length > 0 ? [] : positionHistory
    const nextHistory = [...history, key]
    let status = getGameStatusAfterMove(previewPosition, resolvedMove, player)
    // Immediate board wins take precedence. A third occurrence is applied and
    // ends the game; it is not an illegal move that leaves the game running.
    if (status === GameStatus.InProgress && nextHistory.filter((p) => p === key).length >= 3) {
        status = GameStatus.AttackerWin
    }
    return {
        isValid: true, expectedCaptures, status,
        move: resolvedMove, position: previewPosition, positionHistory: nextHistory,
        currentPlayer: status === GameStatus.InProgress ? nextPlayer : player,
    }
}

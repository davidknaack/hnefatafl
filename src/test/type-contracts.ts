// Compile-only consumer checks, included by npm run typecheck. Never invoked.
import { ApplyMoveResult, GameState, GameStatus, MoveValidationResult, Piece, PieceType, Player } from '../types'
import { LayoutTransformOptions } from '../board'

export function checkContracts(
    result: ApplyMoveResult,
    validation: MoveValidationResult,
    state: GameState,
    piece: Piece
): void {
    if (result.success) {
        const newState: GameState = result.newState
        void newState
    } else {
        const error: string = result.error
        void error
    }
    if (!validation.isValid) {
        const reason: string = validation.reason
        void reason
    }
    // @ts-expect-error Success requires a state.
    const missingState: ApplyMoveResult = { success: true }
    // @ts-expect-error Failure requires an error.
    const missingError: ApplyMoveResult = { success: false }
    // @ts-expect-error A successful result cannot also contain an error.
    const contradictory: ApplyMoveResult = { success: true, newState: state, error: 'error' }
    // @ts-expect-error Failure cannot carry a committed state.
    const failedState: ApplyMoveResult = { success: false, error: 'error', newState: state }
    // @ts-expect-error Invalid validation requires a reason.
    const missingReason: MoveValidationResult = { isValid: false, expectedCaptures: [], status: GameStatus.InProgress }
    // @ts-expect-error Valid validation cannot carry a rejection reason.
    const validReason: MoveValidationResult = { isValid: true, reason: 'error', expectedCaptures: [], status: GameStatus.InProgress }
    // @ts-expect-error Kings belong to the defender.
    const attackerKing: Piece = { owner: Player.Attacker, type: PieceType.King }
    // @ts-expect-error Ordinary pieces must also agree with their owner.
    const defenderAttacker: Piece = { owner: Player.Defender, type: PieceType.Attacker }
    // @ts-expect-error Piece values are readonly; replace the square occupant instead.
    piece.owner = Player.Attacker
    // @ts-expect-error Piece type is readonly too.
    piece.type = PieceType.King
    const mapping: LayoutTransformOptions = { charMap: {
        // @ts-expect-error Custom layout mappings use the same Piece contract.
        X: { occupant: { owner: Player.Attacker, type: PieceType.King } },
    } }
    void [missingState, missingError, contradictory, failedState, missingReason,
        validReason, attackerKing, defenderAttacker, mapping]
}

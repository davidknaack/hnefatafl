import {
    initializeGame,
    STANDARD_BOARD,
} from './board'
import { validateMove as validateRawMove, resolveMove } from './validator'
import { positionKey } from './repetition'
import { parseMove, parseMoveSequence, serializeMove } from './parser'
import { generateMoveCandidates } from './moveGenerator'
import {
    ApplyMoveResult,
    GameState,
    MoveValidationResult,
    Player,
    GameStatus,
    PieceType,
    Coordinate,
    PossibleMove,
} from './types'

export class HnefataflEngine {
    private gameState!: GameState
    private edgeSquares!: Set<Coordinate>

    constructor() {
        this.reset()
    }

    reset(boardLayout: string[] = STANDARD_BOARD): void {
        const gameSetup = initializeGame(boardLayout)
        this.edgeSquares = gameSetup.edgeSquares
        this.gameState = {
            position: gameSetup.position,
            currentPlayer: Player.Attacker,
            captured: { attacker: 0, defender: 0 },
            moveHistory: [],
            positionHistory: [positionKey(gameSetup.position, Player.Attacker)],
            status: GameStatus.InProgress,
        }
    }

    getState(): GameState {
        return this.gameState
    }

    validateMove(moveStr: string): MoveValidationResult {
        if (this.gameState.status !== GameStatus.InProgress)
            return {
                isValid: false,
                reason: 'Game is not in progress',
                expectedCaptures: [],
                status: this.gameState.status,
            }

        const move = parseMove(moveStr)
        if (!move)
            return {
                isValid: false,
                reason: 'Invalid move format',
                expectedCaptures: [],
                status: this.gameState.status,
            }

        return validateRawMove(
            this.gameState.position,
            this.gameState.currentPlayer,
            move,
            this.edgeSquares,
            this.gameState.positionHistory
        )
    }

    applyMove(moveStr: string): ApplyMoveResult {
        if (this.gameState.status !== GameStatus.InProgress)
            return { success: false, error: 'Game is not in progress' }

        const move = parseMove(moveStr)
        if (!move) return { success: false, error: 'Invalid move format' }

        const validation = resolveMove(
            this.gameState.position,
            this.gameState.currentPlayer,
            move,
            this.edgeSquares,
            this.gameState.positionHistory
        )
        if (!validation.isValid)
            return { success: false, error: validation.reason }

        const expectedCaptures = validation.expectedCaptures
        const captured = { ...this.gameState.captured }
        for (const cap of expectedCaptures) {
            const piece = this.gameState.position[cap.y][cap.x].occupant
            if (piece?.type === PieceType.Attacker) captured.attacker++
            else if (piece) captured.defender++
        }

        const moveStrWithCaptures = serializeMove(validation.move)

        const newState: GameState = {
            position: validation.position,
            currentPlayer: validation.currentPlayer,
            captured,
            moveHistory: [...this.gameState.moveHistory, moveStrWithCaptures],
            positionHistory: validation.positionHistory,
            status: validation.status,
        }

        this.gameState = newState

        return { success: true, newState }
    }

    applyMoveSequence(moveList: string): ApplyMoveResult {
        const parsed = parseMoveSequence(moveList)
        for (const [index, move] of parsed.moves.entries()) {
            const result = this.applyMove(serializeMove(move))
            if (!result.success) {
                return { success: false, error: `Move ${index + 1}: ${result.error}` }
            }
        }
        if (!parsed.success) return { success: false, error: parsed.error }
        return { success: true, newState: this.gameState }
    }

    getPossibleMoves(from: Coordinate): PossibleMove[] {
        if (this.gameState.status !== GameStatus.InProgress) return []
        
        const candidates = generateMoveCandidates(
            this.gameState.position,
            from,
            this.gameState.currentPlayer
        )
        return candidates.flatMap((to) => {
            const result = resolveMove(
                this.gameState.position,
                this.gameState.currentPlayer,
                { from, to, captures: [] },
                this.edgeSquares,
                this.gameState.positionHistory
            )
            return result.isValid ? [{ to, captures: result.expectedCaptures }] : []
        })
    }
}

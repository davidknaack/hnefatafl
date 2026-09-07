import {
    clonePosition,
    initializeGame,
    STANDARD_BOARD,
} from './board'
import { validateMove as validateRawMove, resolveMove } from './validator'
import { positionKey } from './repetition'
import { parseMove, parseMoveSequence, serializeMove } from './parser'
import { generateMoveCandidates } from './moveGenerator'
import { GameTag, parseGame, RecordedMove, serializeGame, terminalFor } from './gameFormat'
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
    private tags: GameTag[] = []
    private standardStart = true

    constructor() {
        this.reset()
    }

    reset(boardLayout: string[] = STANDARD_BOARD): void {
        const gameSetup = initializeGame(boardLayout)
        this.tags = []
        this.standardStart = boardLayout.every((row, index) => row === STANDARD_BOARD[index])
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

    /** Return a detached snapshot, including independent squares and pieces. */
    getState(): GameState {
        return {
            ...this.gameState,
            position: clonePosition(this.gameState.position),
            captured: { ...this.gameState.captured },
            moveHistory: [...this.gameState.moveHistory],
            positionHistory: [...this.gameState.positionHistory],
        }
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

        return { success: true, newState: this.getState() }
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
        return { success: true, newState: this.getState() }
    }

    /** Replay from the standard opening; a failed import leaves this engine intact. */
    loadGame(input: string): ApplyMoveResult {
        const parsed = parseGame(input)
        if (!parsed.success) return { success: false, error: parsed.error }
        const replay = new HnefataflEngine()
        for (const [index, move] of parsed.game.moves.entries()) {
            const mover = replay.gameState.currentPlayer
            const result = replay.applyMove(serializeMove(move))
            if (!result.success) return { success: false, error: `Move ${index + 1}: ${result.error}` }
            if (move.terminal && move.terminal !== terminalFor(result.newState.status, mover)) {
                return { success: false, error: `Move ${index + 1}: Terminal marker does not match the game result` }
            }
        }
        if (parsed.game.resigned) {
            const result = replay.resign()
            if (!result.success) return { success: false, error: `Resignation: ${result.error}` }
        }
        this.gameState = replay.gameState
        this.edgeSquares = replay.edgeSquares
        this.tags = parsed.game.tags.map((tag) => ({ ...tag }))
        this.standardStart = true
        return { success: true, newState: this.getState() }
    }

    /** The side to move concedes; resignation is recorded separately from a move. */
    resign(): ApplyMoveResult {
        if (this.gameState.status !== GameStatus.InProgress) return { success: false, error: 'Game is not in progress' }
        if (!this.gameState.moveHistory.length) return { success: false, error: 'At least one move is required before resignation' }
        this.gameState = {
            ...this.gameState,
            status: this.gameState.currentPlayer === Player.Attacker ? GameStatus.DefenderWin : GameStatus.AttackerWin,
            moveHistory: [...this.gameState.moveHistory, '---'],
        }
        return { success: true, newState: this.getState() }
    }

    /** Canonical portable notation. Custom setup serialization is not supported. */
    saveGame(): string {
        if (!this.standardStart) throw new Error('Only games starting from the standard board can be saved')
        const resigned = this.gameState.moveHistory[this.gameState.moveHistory.length - 1] === '---'
        const history = resigned ? this.gameState.moveHistory.slice(0, -1) : this.gameState.moveHistory
        const moves: RecordedMove[] = history.map((text) => {
            const move = parseMove(text)
            if (!move) throw new Error('Invalid internal move history')
            return move
        })
        if (moves.length && !resigned) {
            const mover = moves.length % 2 === 1 ? Player.Attacker : Player.Defender
            moves[moves.length - 1].terminal = terminalFor(this.gameState.status, mover)
        }
        return serializeGame({ tags: this.tags, moves, resigned })
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

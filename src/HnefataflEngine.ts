import { createInitialBoard, STANDARD_BOARD, extractDefenderPosition, applyMoveToBoard } from "./board"
import { validateMove as validateRawMove } from "./validator"
import { parseMove } from "./parser"
import { coordToString } from "./utils"
import { getAvailableCaptures } from "./rules"
import { getGameStatusAfterMove } from "./rules"
import {
    ApplyMoveResult,
    GameState,
    MoveValidationResult,
    Player,
    GameStatus,
    PieceType
} from "./types"

export class HnefataflEngine {
    private state!: GameState

    constructor() {
        this.reset()
    }

    reset(board: string[] = STANDARD_BOARD): void {
        const newBoard = createInitialBoard(board)
        this.state = {
            board: newBoard,
            currentPlayer: Player.Attacker,
            captured: { attacker: 0, defender: 0 },
            moveHistory: [],
            defenderPositions: [extractDefenderPosition(newBoard)],
            status: GameStatus.InProgress
        }
    }

    getState(): GameState {
        return this.state
    }

    validateMove(moveStr: string): MoveValidationResult {
        if (this.state.status !== GameStatus.InProgress) 
            return { isValid: false, reason: "Game is not in progress", expectedCaptures: [], status: this.state.status }

        const move = parseMove(moveStr)
        if (!move) 
            return { isValid: false, reason: "Invalid move format", expectedCaptures: [], status: this.state.status }

        return validateRawMove(this.state.board, this.state.currentPlayer, move, this.state.defenderPositions)
    }

    applyMove(moveStr: string): ApplyMoveResult {
        if (this.state.status !== GameStatus.InProgress) 
            return { success: false, error: "Game is not in progress" }

        const move = parseMove(moveStr)
        if (!move)
            return { success: false, error: "Invalid move format" }

        const validation = validateRawMove(this.state.board, this.state.currentPlayer, move, this.state.defenderPositions)
        if (!validation.isValid) 
            return { success: false, error: validation.reason }

        // Compute available captures from the pre-move board
        const actualCaptures = getAvailableCaptures(this.state.board, move, this.state.currentPlayer)

        // Validate declared captures against available captures
        for (const cap of move.captures) {
            const matched = actualCaptures.find(c => c.x === cap.x && c.y === cap.y)
            if (!matched) 
                return { success: false, error: `Invalid capture specified: ${coordToString(cap)}`}
        }

        // Update capture counters based on pre-move board, then apply move + captures
        for (const cap of move.captures) {
            const cell = this.state.board[cap.y][cap.x]
            if (cell.occupant && cell.occupant.type === PieceType.Attacker) {
                this.state.captured.attacker++
            } else if (cell.occupant && (cell.occupant.type === PieceType.Defender || cell.occupant.type === PieceType.King)) {
                this.state.captured.defender++
            }
        }

        // Generate the next board state with the move applied and captures removed
        const board = applyMoveToBoard(this.state.board, move, { applyCaptures: true })

        // Check for win conditions using rules.ts
        let newStatus: GameStatus = getGameStatusAfterMove(board, move, this.state.currentPlayer)

        const nextPlayer: Player = this.state.currentPlayer === Player.Attacker ? Player.Defender : Player.Attacker

        let defenderPositions = [...this.state.defenderPositions]
        if (move.captures.length > 0) {
            defenderPositions = []
        }
        if (move.captures.length > 0 || this.state.currentPlayer === Player.Defender) {
            defenderPositions.push(extractDefenderPosition(board))
        }

        const newState: GameState = {
            board,
            currentPlayer: newStatus === GameStatus.InProgress ? nextPlayer : this.state.currentPlayer,
            captured: { ...this.state.captured },
            moveHistory: [...this.state.moveHistory, moveStr],
            defenderPositions,
            status: newStatus
        }

        this.state = newState

        return { success: true, newState }
    }

    applyMoveSequence(moveList: string): ApplyMoveResult {
        const parts = moveList.split(",").map(m => m.trim())
        for (const moveStr of parts) {
            const result = this.applyMove(moveStr)
            if (!result.success)
                return result
        }
        return { success: true, newState: this.state }
    }
}

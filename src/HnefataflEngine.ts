import { createInitialBoard, STANDARD_BOARD } from "./board"
import { validateMove as validateRawMove } from "./validator"
import { parseMove } from "./parser"
import { cloneBoard } from "./board"
import { coordToString } from "./utils"
import { getAvailableCaptures } from "./rules"
import { isKingCaptured, isKingEscaped } from "./rules"
import {
  ApplyMoveResult,
  GameState,
  MoveValidationResult,
  Player,
  Move,
  GameStatus,
  Piece
} from "./types"

export class HnefataflEngine {
    private state: GameState

    constructor() {
        this.state = {
            board: createInitialBoard(STANDARD_BOARD),
            currentPlayer: Player.Defender,
            captured: { attacker: 0, defender: 0 },
            moveHistory: [],
            status: GameStatus.InProgress
        }
    }

    getState(): GameState {
        return this.state
    }

    validateMove(moveStr: string): MoveValidationResult {
        if (this.state.status !== GameStatus.InProgress) 
            return { isValid: false, reason: "Game is not in progress", expectedCaptures: [] }

        const move = parseMove(moveStr)
        if (!move) 
            return { isValid: false, reason: "Invalid move format", expectedCaptures: [] }

        return validateRawMove(this.state.board, this.state.currentPlayer, move)
    }

    applyMove(moveStr: string): ApplyMoveResult {
        if (this.state.status !== GameStatus.InProgress) 
            return { success: false, error: "Game is not in progress" }

        const move = parseMove(moveStr)
        if (!move)
            return { success: false, error: "Invalid move format" }

        const validation = validateRawMove(this.state.board, this.state.currentPlayer, move)
        if (!validation.isValid) 
            return { success: false, error: validation.reason }

        const board = cloneBoard(this.state.board)
        const piece = board[move.from.y][move.from.x].occupant
        board[move.from.y][move.from.x].occupant = null
        board[move.to.y][move.to.x].occupant = piece

        const actualCaptures = getAvailableCaptures(board, move, this.state.currentPlayer)
        for (const cap of move.captures) {
            const matched = actualCaptures.find(c => c.x === cap.x && c.y === cap.y)
            if (!matched) 
                return { success: false, error: `Invalid capture specified: ${coordToString(cap)}`}
        }

        for (const cap of move.captures) {
            const cell = board[cap.y][cap.x]
            if (cell.occupant === Piece.Attacker) {
                this.state.captured.attacker++
            } else if (cell.occupant === Piece.Defender || cell.occupant === Piece.King) {
                this.state.captured.defender++
            }
            cell.occupant = null
        }

        // Check for win conditions
        let newStatus: GameStatus = this.state.status
        if (isKingCaptured(board)) {
            newStatus = GameStatus.AttackerWin
        } else if (piece === Piece.King && isKingEscaped(move.to)) {
            newStatus = GameStatus.DefenderWin
        }

        const nextPlayer: Player = this.state.currentPlayer === Player.Attacker ? Player.Defender : Player.Attacker

        const newState: GameState = {
            board,
            currentPlayer: newStatus === GameStatus.InProgress ? nextPlayer : this.state.currentPlayer,
            captured: { ...this.state.captured },
            moveHistory: [...this.state.moveHistory, moveStr],
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

    reset(board: string[] = STANDARD_BOARD): void {
        this.state = {
            board: createInitialBoard(board),
            currentPlayer: Player.Defender,
            captured: { attacker: 0, defender: 0 },
            moveHistory: [],
            status: GameStatus.InProgress
        }
    }
}

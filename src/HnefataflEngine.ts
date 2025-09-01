import { initializeGame, STANDARD_BOARD, extractDefenderPosition, applyMoveToPosition, GameSetup, extractEscapePoints } from "./board"
import { validateMove as validateRawMove } from "./validator"
import { parseMove } from "./parser"
import { coordToString } from "./utils"
import { getGameStatusAfterMove } from "./rules"
import {
    ApplyMoveResult,
    GameState,
    MoveValidationResult,
    Player,
    GameStatus,
    PieceType,
    Coordinate
} from "./types"

export class HnefataflEngine {
    private gameState!: GameState
    private escapePoints!: Set<Coordinate>

    constructor() {
        this.reset()
    }

    reset(boardLayout: string[] = STANDARD_BOARD): void {
        const gameSetup = initializeGame(boardLayout)
        this.escapePoints = gameSetup.escapePoints
        this.gameState = {
            position: gameSetup.position,
            currentPlayer: Player.Attacker,
            captured: { attacker: 0, defender: 0 },
            moveHistory: [],
            defenderPositions: [extractDefenderPosition(gameSetup.position)],
            status: GameStatus.InProgress
        }
    }

    getState(): GameState {
        return this.gameState
    }

    validateMove(moveStr: string): MoveValidationResult {
        if (this.gameState.status !== GameStatus.InProgress) 
            return { isValid: false, reason: "Game is not in progress", expectedCaptures: [], status: this.gameState.status }

        const move = parseMove(moveStr)
        if (!move) 
            return { isValid: false, reason: "Invalid move format", expectedCaptures: [], status: this.gameState.status }

        return validateRawMove(this.gameState.position, this.gameState.currentPlayer, move, this.escapePoints, this.gameState.defenderPositions)
    }

    applyMove(moveStr: string): ApplyMoveResult {
        if (this.gameState.status !== GameStatus.InProgress) 
            return { success: false, error: "Game is not in progress" }

        const move = parseMove(moveStr)
        if (!move)
            return { success: false, error: "Invalid move format" }

        const validation = validateRawMove(this.gameState.position, this.gameState.currentPlayer, move, this.escapePoints, this.gameState.defenderPositions)
        if (!validation.isValid) 
            return { success: false, error: validation.reason }

        // Use the expected captures from the validator
        const expectedCaptures = validation.expectedCaptures;
        
        // Create a new move object with the expected captures
        const moveWithCaptures = { 
            from: move.from, 
            to: move.to, 
            captures: expectedCaptures 
        };
        
        // Update capture counters based on expected captures
        for (const cap of expectedCaptures) {
            const square = this.gameState.position[cap.y][cap.x]
            if (square.occupant && square.occupant.type === PieceType.Attacker) {
                this.gameState.captured.attacker++
            } else if (square.occupant && (square.occupant.type === PieceType.Defender || square.occupant.type === PieceType.King)) {
                this.gameState.captured.defender++
            }
        }

        // Generate the next position with the move applied and captures removed
        const position = applyMoveToPosition(this.gameState.position, moveWithCaptures, { applyCaptures: true })

        // Check for win conditions
        let newStatus: GameStatus = getGameStatusAfterMove(position, move, this.gameState.currentPlayer)

        const nextPlayer: Player = this.gameState.currentPlayer === Player.Attacker ? Player.Defender : Player.Attacker

        let defenderPositions = [...this.gameState.defenderPositions]
        if (expectedCaptures.length > 0) {
            defenderPositions = []
        }
        if (expectedCaptures.length > 0 || this.gameState.currentPlayer === Player.Defender) {
            defenderPositions.push(extractDefenderPosition(position))
        }

        // Create a move string that includes captures if they occurred
        let moveStrWithCaptures = moveStr;
        if (expectedCaptures.length > 0) {
            // Check if the move string already has captures notation
            if (!moveStr.includes('(')) {
                // Add the captures to the notation
                const capturesNotation = '(' + expectedCaptures.map(c => coordToString(c)).join('') + ')';
                moveStrWithCaptures = moveStr + capturesNotation;
            }
        }

        const newState: GameState = {
            position,
            currentPlayer: newStatus === GameStatus.InProgress ? nextPlayer : this.gameState.currentPlayer,
            captured: { ...this.gameState.captured },
            moveHistory: [...this.gameState.moveHistory, moveStrWithCaptures],
            defenderPositions,
            status: newStatus
        }

        this.gameState = newState

        return { success: true, newState }
    }

    applyMoveSequence(moveList: string): ApplyMoveResult {
        const parts = moveList.split(",").map(m => m.trim())
        for (const moveStr of parts) {
            const result = this.applyMove(moveStr)
            if (!result.success)
                return result
        }
        return { success: true, newState: this.gameState }
    }
}

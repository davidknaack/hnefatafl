import { createInitialBoard } from "./board";
import { validateMove as validateRawMove } from "./validator";
import { parseMove } from "./parser";
import { cloneBoard } from "./board";
import { coordToString } from "./utils";
import { getAvailableCaptures } from "./rules"; // we'll stub this initially
import { isKingCaptured, isKingEscaped } from "./rules";
import {
  ApplyMoveResult,
  GameState,
  MoveValidationResult,
  Player,
  Move
} from "./types";

export class HnefataflEngine {
  private state: GameState;

  constructor() {
    this.state = {
      board: createInitialBoard(),
      currentPlayer: "defender",
      captured: { attacker: 0, defender: 0 },
      moveHistory: [],
      status: "in_progress"
    };
  }

  getState(): GameState {
    return this.state;
  }

  validateMove(moveStr: string): MoveValidationResult {
    const move = parseMove(moveStr);
    if (!move) {
      return { isValid: false, reason: "Invalid move format", expectedCaptures: [] };
    }

    return validateRawMove(this.state.board, this.state.currentPlayer, move);
  }

    applyMove(moveStr: string): ApplyMoveResult {
    const move = parseMove(moveStr);
    if (!move) {
        return { success: false, error: "Invalid move format" };
    }

    const validation = validateRawMove(this.state.board, this.state.currentPlayer, move);
    if (!validation.isValid) {
        return { success: false, error: validation.reason };
    }

    const board = cloneBoard(this.state.board);
    const piece = board[move.from.y][move.from.x].occupant;
    board[move.from.y][move.from.x].occupant = null;
    board[move.to.y][move.to.x].occupant = piece;

    const actualCaptures = getAvailableCaptures(board, move, this.state.currentPlayer);
    for (const cap of move.captures) {
        const matched = actualCaptures.find(c => c.x === cap.x && c.y === cap.y);
        if (!matched) {
        return {
            success: false,
            error: `Invalid capture specified: ${coordToString(cap)}`
        };
        }
    }

    for (const cap of move.captures) {
        const cell = board[cap.y][cap.x];
        if (cell.occupant === "attacker") {
        this.state.captured.attacker++;
        } else if (cell.occupant === "defender" || cell.occupant === "king") {
        this.state.captured.defender++;
        }
        cell.occupant = null;
    }

    // Check for win conditions
    let newStatus: GameState["status"] = "in_progress";
    if (isKingCaptured(board)) {
        newStatus = "attacker_win";
    } else if (piece === "king" && isKingEscaped(move.to)) {
        newStatus = "defender_win";
    }

    const nextPlayer: Player = this.state.currentPlayer === "attacker" ? "defender" : "attacker";

    const newState: GameState = {
        board,
        currentPlayer: newStatus === "in_progress" ? nextPlayer : this.state.currentPlayer,
        captured: { ...this.state.captured },
        moveHistory: [...this.state.moveHistory, moveStr],
        status: newStatus
    };

    this.state = newState;

    return { success: true, newState };
    }

  applyMoveSequence(moveList: string): ApplyMoveResult {
    const parts = moveList.split(",").map(m => m.trim());
    for (const moveStr of parts) {
      const result = this.applyMove(moveStr);
      if (!result.success) return result;
    }
    return { success: true, newState: this.state };
  }

  reset() {
    this.state = {
      board: createInitialBoard(),
      currentPlayer: "defender",
      captured: { attacker: 0, defender: 0 },
      moveHistory: [],
      status: "in_progress"
    };
  }
}

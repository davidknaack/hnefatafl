export enum Player {
    Attacker = "attacker",
    Defender = "defender"
}

export enum Piece {
    Attacker = "attacker",
    Defender = "defender",
    King = "king"
}

export enum GameStatus {
    InProgress = "in_progress",
    AttackerWin = "attacker_win",
    DefenderWin = "defender_win"
}

export interface Coordinate {
    x: number // 0-based column
    y: number // 0-based row
}

export interface Move {
    from: Coordinate
    to: Coordinate
    captures: Coordinate[]
}

export interface CellState {
    occupant: Piece | null
    isThrone: boolean
    isRestricted: boolean
}

export interface GameState {
    board: CellState[][]
    currentPlayer: Player
    captured: {
        attacker: number
        defender: number
    }
    moveHistory: string[]
    defenderPositions: string[][]
    status: GameStatus
}

export interface MoveValidationResult {
    isValid: boolean
    reason?: string
    expectedCaptures: Coordinate[]
}

export interface ApplyMoveResult {
    success: boolean
    error?: string
    newState?: GameState
}

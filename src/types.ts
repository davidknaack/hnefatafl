export enum Player {
    Attacker = 'attacker',
    Defender = 'defender',
}

export enum PieceType {
    Attacker = 'attacker',
    Defender = 'defender',
    King = 'king',
}

/** Readonly in TypeScript; board helpers and engine snapshots copy these values. */
export type Piece =
    | { readonly owner: Player.Attacker; readonly type: PieceType.Attacker }
    | { readonly owner: Player.Defender; readonly type: PieceType.Defender | PieceType.King }

export enum GameStatus {
    InProgress = 'in_progress',
    AttackerWin = 'attacker_win',
    DefenderWin = 'defender_win',
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

export interface Square {
    occupant: Piece | null
    isThrone: boolean
    isRestricted: boolean
}

/** Engine-returned states are detached, mutable snapshots, never live views. */
export interface GameState {
    position: Square[][]
    currentPlayer: Player
    captured: {
        attacker: number
        defender: number
    }
    moveHistory: string[]
    /** Full-board/side-to-move keys since initialization or the last capture. */
    positionHistory: string[]
    status: GameStatus
}

/** Captures and status are available on both branches, including diagnostics. */
export type MoveValidationResult = {
    expectedCaptures: Coordinate[]
    status: GameStatus
} & (
    | { isValid: true; reason?: never }
    | { isValid: false; reason: string }
)

/** Narrow on success before consuming the detached state snapshot or error. */
export type ApplyMoveResult =
    | { success: true; newState: GameState; error?: never }
    | { success: false; error: string; newState?: never }

export interface PossibleMove {
    to: Coordinate
    captures: Coordinate[]
}

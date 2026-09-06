import { Coordinate, Square, Piece, Player, PieceType } from './types'

export function isSameCoord(a: Coordinate, b: Coordinate): boolean {
    return a.x === b.x && a.y === b.y
}

export function isPathClear(
    position: Square[][],
    from: Coordinate,
    to: Coordinate
): boolean {
    if (from.x !== to.x && from.y !== to.y) return false // not orthogonal

    const dx = Math.sign(to.x - from.x)
    const dy = Math.sign(to.y - from.y)

    let x = from.x + dx
    let y = from.y + dy

    while (x !== to.x || y !== to.y) {
        if (position[y][x].occupant) return false
        x += dx
        y += dy
    }

    return true
}

/** Preserves the defender's king ownership exception used by both callers. */
export function canMovePiece(piece: Piece, player: Player): boolean {
    return (
        piece.owner === player ||
        (player === Player.Defender && piece.type === PieceType.King)
    )
}

export function canEnterSquare(piece: Piece, square: Square): boolean {
    return piece.type === PieceType.King || !square.isRestricted
}

import { Coordinate, Square, PieceType } from './types'

// Helper to render the board as text for debugging
// Empty edge squares are rendered as 'e' unless occupied,
// then the occupied piece type is rendered as uppercase,
// indicating a defender (D/d) or attacker (A/a) that is on
// an edge square.
export function renderBoard(position: Square[][], edgeSquares: Set<Coordinate>) {
    const edgeKeys = new Set(
        Array.from(edgeSquares).map((c) => `${c.x},${c.y}`)
    )
    let out = ''
    for (let y = 0; y < position.length; y++) {
        for (let x = 0; x < position[0].length; x++) {
            const key = `${x},${y}`
            const isEdge = edgeKeys.has(key)
            const cell = position[y][x]

            if ( cell.occupant?.type === PieceType.King) {
                out += isEdge ? 'K' : 'k'
            } else if ( cell.occupant?.type === PieceType.Defender) {
                out += isEdge ? 'D' : 'd'
            } else if (cell.occupant?.type === PieceType.Attacker) {
                out += isEdge ? 'A' : 'a'
            } else if ( !cell.occupant && cell.isThrone) {
                out += isEdge ? 'T' : 't'
            } else {
                out += isEdge ? 'e' : '.'
            }
        }
        out += '\n'
    }
    return out
}


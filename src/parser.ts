import { Move } from './types'
import { coordFromString, coordToString } from './coordinates'
import { MOVE_RE, CAPTURE_RE } from './patterns'

export function parseMove(input: string): Move | null {
    const cleaned = input.replace(/\s+/g, '').toUpperCase()
    const match = MOVE_RE.exec(cleaned)
    if (!match) return null

    const from = coordFromString(match[1])
    const to = coordFromString(match[2])
    if (!from || !to) return null

    const captures = []
    const captureChunk = match[3]
    if (captureChunk) {
        // The whole capture section has already matched the strict grammar.
        for (const token of captureChunk.match(CAPTURE_RE) ?? []) {
            const cap = coordFromString(token)
            if (!cap) return null
            captures.push(cap)
        }
    }

    return { from, to, captures }
}

/** Uppercase, whitespace-free notation; captures retain their supplied order. */
export function serializeMove(move: Move): string {
    const captures = move.captures.length
        ? `(${move.captures.map(coordToString).join('')})` : ''
    return `${coordToString(move.from)}-${coordToString(move.to)}${captures}`
}

export type MoveSequenceParseResult =
    | { success: true; moves: Move[] }
    | { success: false; moves: Move[]; index: number; token: string; error: string }

/** On failure, moves contains the parsed prefix and index is zero-based. */
export function parseMoveSequence(input: string): MoveSequenceParseResult {
    const moves: Move[] = []
    const tokens = input.split(',')
    for (const [index, part] of tokens.entries()) {
        const token = part.trim()
        const move = parseMove(token)
        if (!move) {
            const reason = token.toUpperCase() === 'P'
                ? 'Passes are not supported' : 'Invalid move format'
            return { success: false, moves, index, token, error: `Move ${index + 1}: ${reason}` }
        }
        moves.push(move)
    }
    return { success: true, moves }
}

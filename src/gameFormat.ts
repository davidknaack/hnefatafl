import { Coordinate, GameStatus, Move, Player } from './types'
import { BOARD_SIZE, coordToString } from './coordinates'

export type Terminal = '++' | '--'
export interface RecordedMove extends Move { terminal?: Terminal }
export interface GameTag { name: string; value: string }
export interface GameRecord {
    tags: GameTag[]
    moves: RecordedMove[]
    resigned: boolean
}
export type GameParseResult =
    | { success: true; game: GameRecord }
    | { success: false; error: string }

const square = '[a-z]\\s*[0-9]+'
const movePattern = new RegExp(
    `(${square})\\s*-\\s*(${square})(?:\\s*x\\s*(${square}(?:\\s*[/x]\\s*${square})*))?(?:\\s*(\\+\\+|--(?!-)))?`, 'iy'
)
const csvTrailer = /\s*,\s*\d+\s*,\s*\d+\s*,\s*(?:Ongoing|Black|White|Draw)\s*$/i

function readSquare(text: string): Coordinate | null {
    const clean = text.replace(/\s/g, '').toLowerCase()
    const x = clean.charCodeAt(0) - 97
    const rank = Number(clean.slice(1))
    if (x < 0 || x >= BOARD_SIZE || !Number.isInteger(rank) || rank < 1 || rank > BOARD_SIZE) return null
    return { x, y: BOARD_SIZE - rank }
}

/** Consume a game or a Copenhagen CSV row, ignoring its redundant summary. */
export function parseGame(input: string): GameParseResult {
    if (csvTrailer.test(input)) {
        input = input.replace(csvTrailer, '')
        // The library's timeout is an external result, not a move or resignation.
        input = input.replace(/\s+timeout\s*$/i, '')
    }
    const game: GameRecord = { tags: [], moves: [], resigned: false }
    let offset = 0
    const skipSpace = () => { while (/\s/.test(input[offset] ?? '') && offset < input.length) offset++ }
    skipSpace()
    while (input[offset] === '[') {
        const end = input.indexOf(']', offset + 1)
        const body = input.slice(offset + 1, end)
        const colon = body.indexOf(':')
        if (end < 0 || colon < 1 || body.includes('[')) return { success: false, error: `Tag ${game.tags.length + 1}: Invalid tag format` }
        const name = body.slice(0, colon).trim()
        const value = body.slice(colon + 1).trim()
        if (!name || /[\r\n]/.test(name + value)) return { success: false, error: `Tag ${game.tags.length + 1}: Invalid tag format` }
        game.tags.push({ name, value })
        offset = end + 1
        skipSpace()
    }
    while (offset < input.length) {
        const index = game.moves.length + 1
        if (input.slice(offset).trim() === '---' && game.moves.length > 0) {
            game.resigned = true
            return { success: true, game }
        }
        movePattern.lastIndex = offset
        const match = movePattern.exec(input)
        if (!match) return { success: false, error: `Move ${index}: Invalid move format` }
        const from = readSquare(match[1])
        const to = readSquare(match[2])
        const captures = match[3] ? match[3].split(/[/x]/i).map(readSquare) : []
        if (!from || !to || captures.some((capture) => !capture)) {
            return { success: false, error: `Move ${index}: Square must be on the 11×11 board` }
        }
        const uniqueCaptures = (captures as Coordinate[]).filter((capture, index, all) =>
            all.findIndex((other) => other.x === capture.x && other.y === capture.y) === index
        )
        const move: RecordedMove = { from, to, captures: uniqueCaptures }
        if (match[4]) move.terminal = match[4] as Terminal
        game.moves.push(move)
        offset = movePattern.lastIndex
        if (offset < input.length && !/\s/.test(input[offset])) {
            return { success: false, error: `Move ${index}: Invalid move format or missing whitespace separator` }
        }
        skipSpace()
    }
    return game.moves.length ? { success: true, game } : { success: false, error: 'Move 1: Expected a move' }
}

export function terminalFor(status: GameStatus, mover: Player): Terminal | undefined {
    if (status === GameStatus.InProgress) return undefined
    const winner = status === GameStatus.AttackerWin ? Player.Attacker : Player.Defender
    return mover === winner ? '++' : '--'
}

export function serializeRecordedMove(move: RecordedMove): string {
    const squareText = (coord: Coordinate) => coordToString(coord).toLowerCase()
    // Capture order carries no meaning. Sort by file, then numeric rank.
    const captures = [...move.captures].sort((a, b) => a.x - b.x || b.y - a.y)
    const suffix = captures.length ? `x${captures.map(squareText).join('/')}` : ''
    return `${squareText(move.from)}-${squareText(move.to)}${suffix}${move.terminal ?? ''}`
}

/** Serialize a replay-validated record with one tag per line and one move line. */
export function serializeGame(game: GameRecord): string {
    if (!game.moves.length) throw new Error('Cannot save a game without moves')
    const tags = game.tags.map(({ name, value }) => {
        if (!name.trim() || /[:\[\]\r\n]/.test(name) || /[\[\]\r\n]/.test(value)) throw new Error('Invalid tag format')
        return `[${name.trim()}:${value.trim()}]\n`
    }).join('')
    return tags + game.moves.map(serializeRecordedMove).join(' ') + (game.resigned ? ' ---' : '')
}

import { coordFromString } from './coordinates'
import { Coordinate } from './types'

export const MAX_COMMENT_LENGTH = 500
export const TRUNCATED_COMMENT_MARKER = '… (comment truncated)'
const MAX_NAME_LENGTH = 80
export interface MoveComment { text: string; author?: string; truncated?: boolean }
export type BoardReference = { from: Coordinate; to?: Coordinate }
export type CommentPart = { text: string; mention?: string; reference?: BoardReference }
const characters = (text: string) => Array.from(text)
const validName = (text: string) => !!text.trim() && characters(text.trim()).length <= MAX_NAME_LENGTH && !/[\[\]{}\r\n\\]/.test(text)

/** The explicit bracketed prefix avoids interpreting ordinary prose with colons as an author. */
export function normalizeComment(text: string, author?: string, truncated = false): MoveComment {
    if (author !== undefined && !validName(author)) throw new Error('Comment names must be 1–80 characters without brackets, braces, backslashes or newlines')
    text = text.replace(/\r\n?/g, '\n').trim()
    if (text.endsWith(TRUNCATED_COMMENT_MARKER)) {
        text = text.slice(0, -TRUNCATED_COMMENT_MARKER.length); truncated = true
    }
    const chars = characters(text)
    if (chars.length > MAX_COMMENT_LENGTH) truncated = true
    if (truncated) text = chars.slice(0, MAX_COMMENT_LENGTH - characters(TRUNCATED_COMMENT_MARKER).length).join('')
    return { text, ...(author === undefined ? {} : { author: author.trim() }), ...(truncated ? { truncated: true } : {}) }
}

/** Read the chain following a move. Braces and backslashes in text may be escaped. */
export function readMoveComments(input: string, offset = 0): { comments: MoveComment[]; offset: number } {
    const comments: MoveComment[] = []
    const skipSpace = () => { while (offset < input.length && /\s/.test(input[offset])) offset++ }
    skipSpace()
    while (input[offset] === '{') {
        offset++
        let body = '', closed = false, escapedPrefix = false
        while (offset < input.length) {
            const char = input[offset++]
            if (char === '}') { closed = true; break }
            if (char === '\\' && /[{}\\\[]/.test(input[offset] ?? '')) {
                if (input[offset] === '[' && !body.trim()) escapedPrefix = true
                body += input[offset++]
            }
            else body += char
        }
        if (!closed) throw new Error('Unclosed move comment')
        const prefix = !escapedPrefix && /^\s*\[([^\]\r\n]*)\]:/.exec(body)
        comments.push(prefix && validName(prefix[1]) ? normalizeComment(body.slice(prefix[0].length), prefix[1]) : normalizeComment(body))
        if (offset < input.length && !/\s/.test(input[offset]) && input[offset] !== '{') throw new Error('Missing whitespace after move comment')
        skipSpace()
    }
    return { comments, offset }
}

export function serializeComments(comments: readonly MoveComment[] = []): string {
    return comments.map(value => {
        const comment = normalizeComment(value.text, value.author, value.truncated)
        const text = comment.text + (comment.truncated ? TRUNCATED_COMMENT_MARKER : '')
        let escaped = text.replace(/[\\{}]/g, char => `\\${char}`)
        if (comment.author === undefined && /^\[[^\]\r\n]*\]:/.test(text)) escaped = `\\${escaped}`
        return ` {${comment.author === undefined ? '' : `[${comment.author}]:`}${escaped}}`
    }).join('')
}

/** Tokens are rendered as text nodes/buttons, never HTML. Invalid references remain literal. */
export function commentParts(text: string): CommentPart[] {
    const result: CommentPart[] = []
    const tokens = /\[([^\]\r\n]+)\]|<([^<>\r\n]+)>/g
    let offset = 0, match: RegExpExecArray | null
    while ((match = tokens.exec(text))) {
        if (match.index > offset) result.push({ text: text.slice(offset, match.index) })
        const part: CommentPart = { text: match[0] }
        if (match[1] && validName(match[1])) part.mention = match[1].trim()
        if (match[2]) {
            const reference = /^([a-k](?:[1-9]|1[01]))(?:-([a-k](?:[1-9]|1[01])))?$/i.exec(match[2])
            const from = reference && coordFromString(reference[1]), to = reference?.[2] ? coordFromString(reference[2]) : undefined
            if (from && (!to || ((from.x === to.x || from.y === to.y) && (from.x !== to.x || from.y !== to.y)))) {
                part.reference = { from, ...(to ? { to } : {}) }
            }
        }
        result.push(part); offset = tokens.lastIndex
    }
    if (offset < text.length) result.push({ text: text.slice(offset) })
    return result
}

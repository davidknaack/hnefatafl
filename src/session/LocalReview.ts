import { HnefataflEngine } from '../HnefataflEngine'
import { GameTag, parseGame, serializeGame } from '../gameFormat'
import { parseMove } from '../parser'
import { GameStatus } from '../types'

export const MAX_STUDY_BYTES = 2 * 1024 * 1024
const MAX_LINES = 128, MAX_MOVES = 2048, MAX_REPLAY_MOVES = 16384

interface Line { id: string; parent: string | null; at: number; description: string; moves: string[]; status: GameStatus }
export interface ReviewLine { id: string; label: string; parent: string | null; at: number; description: string; firstMove: string | null; length: number; depth: number }
export interface ReviewChoice { line: string; ply: number; label: string; description: string; move: string }
export interface LocalReviewView {
    line: string
    label: string
    cursor: number
    moves: string[]
    status: GameStatus
    lines: ReviewLine[]
    next: ReviewChoice[]
}

function label(id: string): string { return id === 'main' ? 'Main game' : `Variant ${id.slice(1)}` }
function description(value: unknown): string {
    if (typeof value !== 'string' || value.length > 120 || /[\r\n]/.test(value)) throw new Error('Variant descriptions must be at most 120 characters on one line')
    return value.trim()
}

/** Always reconstruct through the engine, including captures, repetition and resignation. */
function replay(commands: readonly string[], tags: GameTag[]): HnefataflEngine {
    const engine = new HnefataflEngine()
    if (!commands.length) return engine
    const resigned = commands[commands.length - 1] === '---'
    const moves = (resigned ? commands.slice(0, -1) : commands).map(command => {
        const move = parseMove(command)
        if (!move) throw new Error('Invalid study move command')
        return move
    })
    const result = engine.loadGame(serializeGame({ tags, moves, resigned }))
    if (!result.success) throw new Error(result.error)
    return engine
}

function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid study object')
    return value as Record<string, unknown>
}

function readTags(value: unknown): GameTag[] {
    if (!Array.isArray(value) || value.length > 128) throw new Error('Invalid study tags (maximum 128)')
    return value.map(value => {
        const tag = object(value)
        if (typeof tag.name !== 'string' || !tag.name.trim() || tag.name.length > 128 || /[:\[\]\r\n]/.test(tag.name)
            || typeof tag.value !== 'string' || tag.value.length > 2048 || /[\[\]\r\n]/.test(tag.value)) throw new Error('Invalid study tag (names up to 128 characters, values up to 2048)')
        return { name: tag.name, value: tag.value }
    })
}

/** Local, standard-opening study. Each variant stores only its suffix after a parent position. */
export class LocalReview {
    private lines = new Map<string, Line>()
    private active = 'main'
    private cursor = 0
    private tags: GameTag[] = []

    constructor(engine?: HnefataflEngine) {
        const state = engine?.getState()
        if (state && state.moveHistory.length > MAX_MOVES) throw new Error('Game line exceeds 2048 moves')
        this.lines.set('main', { id: 'main', parent: null, at: 0, description: '', moves: state?.moveHistory ?? [], status: state?.status ?? GameStatus.InProgress })
        this.cursor = state?.moveHistory.length ?? 0
        if (this.cursor && engine) {
            const parsed = parseGame(engine.saveGame())
            if (parsed.success) this.tags = readTags(parsed.game.tags)
        }
    }

    private path(id: string): string[] {
        const line = this.lines.get(id)
        if (!line) throw new Error('Unknown game variant')
        return line.parent ? [...this.path(line.parent).slice(0, line.at), ...line.moves] : [...line.moves]
    }

    get atTip(): boolean { return this.cursor === this.path(this.active).length }
    get hasContent(): boolean { return this.lines.size > 1 || this.lines.get('main')!.moves.length > 0 }

    view(): LocalReviewView {
        const active = this.lines.get(this.active)!, moves = this.path(this.active)
        let trunk = active
        while (trunk.parent && this.cursor <= trunk.at) trunk = this.lines.get(trunk.parent)!
        const next: ReviewChoice[] = [], trunkMoves = this.path(trunk.id)
        if (this.cursor < trunkMoves.length) {
            const target = active.at > this.cursor && moves[this.cursor] === trunkMoves[this.cursor] ? active.id : trunk.id
            next.push({ line: target, ply: this.cursor + 1, label: label(trunk.id), description: trunk.description, move: trunkMoves[this.cursor] })
        }
        for (const line of this.lines.values()) {
            if (line.parent === trunk.id && line.at === this.cursor && line.moves.length) {
                next.push({ line: line.id, ply: this.cursor + 1, label: label(line.id), description: line.description, move: line.moves[0] })
            }
        }
        if (next.length > 1 && next[0].label === label(trunk.id)) next[0].line = trunk.id
        const lines = [...this.lines.values()].map(line => {
            let depth = 0, parent = line.parent
            while (parent) { depth++; parent = this.lines.get(parent)!.parent }
            return { id: line.id, label: label(line.id), parent: line.parent, at: line.at, description: line.description,
                firstMove: line.parent ? line.moves[0] ?? null : null, length: this.path(line.id).length, depth }
        })
        return { line: this.active, label: label(this.active), cursor: this.cursor, moves, status: active.status, lines, next }
    }

    seek(id: string, ply: number): HnefataflEngine {
        const path = this.path(id)
        if (!Number.isSafeInteger(ply) || ply < 0 || ply > path.length) throw new Error('Move is outside this game line')
        const engine = replay(path.slice(0, ply), this.tags)
        // Backward navigation leaves a variant at its fork, including nested forks.
        // Explicit line selection/loading can still select an unplayed variant there.
        if (id === this.active && ply < this.cursor) {
            let line = this.lines.get(id)!
            while (line.parent && ply <= line.at) line = this.lines.get(line.parent)!
            id = line.id
        }
        this.active = id; this.cursor = ply
        return engine
    }

    append(command: string, status: GameStatus): void {
        const line = this.lines.get(this.active)!
        line.moves.push(command); line.status = status; this.cursor++
    }

    canAppend(): boolean {
        return this.path(this.active).length < MAX_MOVES && [...this.lines.values()].reduce((sum, line) => sum + this.path(line.id).length, 0) + 1 <= MAX_REPLAY_MOVES
    }

    branch(text: string): void {
        this.addBranch(text)
    }

    branchWithMove(command: string, text: string): HnefataflEngine {
        const engine = replay(this.path(this.active).slice(0, this.cursor), this.tags)
        const result = engine.applyMove(command)
        if (!result.success) throw new Error(result.error)
        const state = result.newState
        this.addBranch(text, { command: state.moveHistory[state.moveHistory.length - 1], status: state.status })
        return engine
    }

    private addBranch(text: string, firstMove?: { command: string; status: GameStatus }): void {
        const note = description(text)
        if (this.lines.size >= MAX_LINES) throw new Error('This study already has 127 variants')
        let parent = this.lines.get(this.active)!
        while (parent.parent && this.cursor <= parent.at) parent = this.lines.get(parent.parent)!
        const total = [...this.lines.values()].reduce((sum, line) => sum + this.path(line.id).length, 0)
        const length = this.cursor + (firstMove ? 1 : 0)
        if (length > MAX_MOVES) throw new Error('Game line exceeds 2048 moves')
        if (total + length > MAX_REPLAY_MOVES) throw new Error('The study replay limit has been reached')
        let index = 1
        while (this.lines.has(`v${index}`)) index++
        const id = `v${index}`
        this.lines.set(id, { id, parent: parent.id, at: this.cursor, description: note,
            moves: firstMove ? [firstMove.command] : [], status: firstMove?.status ?? GameStatus.InProgress })
        this.active = id
        if (firstMove) this.cursor++
    }

    describe(id: string, text: string): void {
        const line = this.lines.get(id)
        if (!line?.parent) throw new Error('Select a variant to describe')
        line.description = description(text)
    }

    save(): string {
        if (this.lines.size === 1) return replay(this.path('main'), this.tags).saveGame()
        const text = JSON.stringify({ format: 'hnefatafl-study', version: 1, tags: this.tags,
            main: this.lines.get('main')!.moves,
            variants: [...this.lines.values()].filter(line => line.parent).map(({ id, parent, at, description, moves }) => ({ id, parent, at, description, moves })),
            view: { line: this.active, ply: this.cursor },
        }, null, 2)
        if (new TextEncoder().encode(text).byteLength > MAX_STUDY_BYTES) throw new Error('Study exceeds the 2 MiB size limit')
        return text
    }

    static load(input: string): { study: LocalReview; engine: HnefataflEngine } {
        if (new TextEncoder().encode(input).byteLength > MAX_STUDY_BYTES) throw new Error('Study exceeds the 2 MiB size limit')
        const raw = object(JSON.parse(input))
        if (raw.format !== 'hnefatafl-study' || raw.version !== 1) throw new Error('Unsupported variant saved-game format or version')
        const study = new LocalReview()
        study.tags = readTags(raw.tags)
        const commands = (value: unknown): string[] => {
            if (!Array.isArray(value) || value.length > MAX_MOVES || value.some(item => typeof item !== 'string' || item.length > 1024)) throw new Error('Invalid or oversized study move list')
            return [...value] as string[]
        }
        const main = study.lines.get('main')!
        main.moves = commands(raw.main)
        if (!Array.isArray(raw.variants) || raw.variants.length >= MAX_LINES) throw new Error('Too many game variants')
        for (const value of raw.variants) {
            const line = object(value)
            if (typeof line.id !== 'string' || !/^v[1-9]\d{0,5}$/.test(line.id) || study.lines.has(line.id)
                || typeof line.parent !== 'string' || !Number.isSafeInteger(line.at) || Number(line.at) < 0) throw new Error('Invalid or duplicate variant identity/fork')
            study.lines.set(line.id, { id: line.id, parent: line.parent, at: Number(line.at), description: description(line.description), moves: commands(line.moves), status: GameStatus.InProgress })
        }
        const visiting = new Set<string>(), paths = new Map<string, string[]>()
        const resolve = (id: string): string[] => {
            if (paths.has(id)) return paths.get(id)!
            const line = study.lines.get(id)
            if (!line || visiting.has(id)) throw new Error('Missing parent or cyclic game variants')
            visiting.add(id)
            const parent = line.parent ? resolve(line.parent) : []
            if (line.at > parent.length || (line.parent !== 'main' && line.parent && line.at <= study.lines.get(line.parent)!.at)) throw new Error('Variant fork is outside its parent line')
            const path = [...parent.slice(0, line.at), ...line.moves]
            if (path.length > MAX_MOVES) throw new Error('Game line exceeds 2048 moves')
            visiting.delete(id); paths.set(id, path)
            return path
        }
        let total = 0
        for (const line of study.lines.values()) { total += resolve(line.id).length; if (total > MAX_REPLAY_MOVES) throw new Error('Study exceeds the replay limit') }
        for (const line of study.lines.values()) {
            try {
                const state = replay(paths.get(line.id)!, study.tags).getState()
                line.status = state.status
                line.moves = state.moveHistory.slice(line.at)
            } catch (error) { throw new Error(`${label(line.id)}: ${error instanceof Error ? error.message : 'Invalid game'}`) }
        }
        const view = object(raw.view)
        if (typeof view.line !== 'string' || typeof view.ply !== 'number') throw new Error('Invalid study review position')
        return { study, engine: study.seek(view.line, view.ply) }
    }
}

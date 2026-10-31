import { HnefataflEngine } from '../HnefataflEngine'
import { parseMove, serializeMove } from '../parser'
import { positionKey } from '../repetition'
import { GameOutcome, Move } from '../types'
import { failure, id, object, readJson, Result, text } from '../../shared/json'

export const MAX_MOVES = 2048
/** Leave room inside the 64 KiB wire limit for both relay and peer envelopes. */
export const MAX_RECORD_BYTES = 60 * 1024
export const MAX_MOVE_LENGTH = 512
export interface OnlineGameRecordV1 {
    formatVersion: 1
    gameId: string
    setup: 'standard-11-v1'
    revision: number
    moves: string[]
    stateCheck: { positionKey: string; outcome: GameOutcome | null }
}
export interface ReplayedRecord { record: OnlineGameRecordV1; engine: HnefataflEngine }

/** File then numeric rank, independent of rule discovery order. */
export function canonicalMove(move: Move): string {
    return serializeMove({ ...move, captures: [...move.captures].sort((a, b) => a.x - b.x || b.y - a.y) })
}

function replay(gameId: unknown, moves: unknown, requireCaptures: boolean): Result<ReplayedRecord> {
    if (!id(gameId)) return failure('Invalid game ID')
    if (!Array.isArray(moves) || moves.length > MAX_MOVES || !moves.every((m) => text(m, MAX_MOVE_LENGTH))) {
        return failure('Expected at most 2048 bounded move commands')
    }
    const engine = new HnefataflEngine()
    const canonical: string[] = []
    for (const [index, command] of moves.entries()) {
        const move = parseMove(command)
        if (!move) return failure(`Move ${index + 1}: Invalid move format`)
        const result = engine.applyMove(command)
        if (!result.success) return failure(`Move ${index + 1}: ${result.error}`)
        const resolved = canonicalMove(parseMove(result.newState.moveHistory[index])!)
        if (requireCaptures && canonicalMove(move) !== resolved) return failure(`Move ${index + 1}: Complete actual captures required`)
        canonical.push(resolved)
    }
    const state = engine.getState()
    return { success: true, value: { engine, record: {
        formatVersion: 1, gameId, setup: 'standard-11-v1', revision: canonical.length,
        moves: canonical, stateCheck: {
            positionKey: positionKey(state.position, state.currentPlayer), outcome: state.outcome,
        },
    } } }
}

/** Local encoder: replay standard-opening commands, discover captures, then canonicalize. */
export function createGameRecord(gameId: string, moves: readonly string[]): Result<ReplayedRecord> {
    const bounded = readJson({ gameId, moves }, MAX_RECORD_BYTES)
    if (!bounded.success) return bounded
    if (!object(bounded.value)) return failure('Expected record commands')
    const result = replay(bounded.value.gameId, bounded.value.moves, false)
    if (!result.success) return result
    const output = readJson(result.value.record, MAX_RECORD_BYTES)
    return output.success ? result : output
}

/** Receiver: independently replay everything. No active engine is accepted or mutated. */
export function decodeGameRecord(input: unknown): Result<ReplayedRecord> {
    const bounded = readJson(input, MAX_RECORD_BYTES)
    if (!bounded.success) return bounded
    const v = bounded.value
    if (!object(v)) return failure('Expected game record')
    if (v.formatVersion !== 1) return failure('Unsupported record version')
    if (v.setup !== 'standard-11-v1') return failure('Unsupported initial setup')
    if (!Array.isArray(v.moves) || v.revision !== v.moves.length) return failure('Revision must equal move count')
    if (!object(v.stateCheck) || !text(v.stateCheck.positionKey, 256)) return failure('Invalid state check')
    const check = v.stateCheck
    const outcome = check.outcome
    if (outcome !== null && (!object(outcome) || !text(outcome.winner) || !text(outcome.reason))) {
        return failure('Invalid outcome')
    }
    const result = replay(v.gameId, v.moves, true)
    if (!result.success) return result
    const expected = result.value.record.stateCheck
    if (check.positionKey !== expected.positionKey ||
        (outcome === null ? expected.outcome !== null : !expected.outcome ||
            outcome.winner !== expected.outcome.winner || outcome.reason !== expected.outcome.reason)) {
        return failure('Replayed position/outcome does not match state check')
    }
    return result
}

export type RecordRelation = 'equal' | 'extends' | 'prefix' | 'divergent' | 'different-game'
/** Compare validated canonical records; relation describes incoming relative to local. */
export function compareRecords(local: OnlineGameRecordV1, incoming: OnlineGameRecordV1): RecordRelation {
    if (local.gameId !== incoming.gameId || local.setup !== incoming.setup) return 'different-game'
    if (local.moves.slice(0, Math.min(local.moves.length, incoming.moves.length))
        .some((move, i) => move !== incoming.moves[i])) return 'divergent'
    if (local.moves.length === incoming.moves.length) {
        const a = local.stateCheck, b = incoming.stateCheck
        return a.positionKey === b.positionKey && a.outcome?.winner === b.outcome?.winner &&
            a.outcome?.reason === b.outcome?.reason ? 'equal' : 'divergent'
    }
    return incoming.moves.length > local.moves.length ? 'extends' : 'prefix'
}

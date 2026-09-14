import { describe, expect, test } from 'vitest'
import { createGameRecord, decodeGameRecord, canonicalMove, compareRecords, MAX_MOVES, MAX_RECORD_BYTES } from './record'
import { parseMove } from '../parser'
import { Player } from '../types'
import { Result } from '../../shared/json'

function value<T>(result: Result<T>): T {
    if (!result.success) throw new Error(result.error)
    return result.value
}
const capture = ['D11-D8', 'F8-E8', 'F10-F8']
const cycle = ['D11-D10', 'F8-E8', 'D10-D11', 'E8-F8']

describe('Online complete game records', () => {
    test.each([[], ['D11-D10'], capture, [...cycle, ...cycle]].map((moves) => ({ moves })))('round-trips $moves through replay', ({ moves }) => {
        const created = value(createGameRecord('game-1', moves))
        const restored = value(decodeGameRecord(JSON.stringify(created.record)))
        expect(restored.record).toEqual(created.record)
        expect(restored.engine.getState()).toEqual(created.engine.getState())
        expect(restored.engine).not.toBe(created.engine)
        expect(created.record.revision).toBe(moves.length)
        if (!moves.length) expect(restored.record.stateCheck.outcome).toBeNull()
        if (moves.length === 8) expect(restored.record.stateCheck.outcome).toEqual({ winner: Player.Attacker, reason: 'repetition' })
    })

    test('local encoding discovers captures; incoming records must include them', () => {
        const { record, engine } = value(createGameRecord('game-1', capture))
        expect(record.moves[2]).toBe('F10-F8(E8)')
        expect(engine.saveGame()).toBe('d11-d8 f8-e8 f10-f8xe8')
        const missing = structuredClone(record)
        missing.moves[2] = 'F10-F8'
        expect(decodeGameRecord(missing)).toMatchObject({ success: false, error: expect.stringContaining('Complete actual captures') })
        for (const command of ['F10-F8(E7)', 'F10-F8(E8E8)', 'F10-F8(E8E7)']) {
            expect(decodeGameRecord({ ...record, moves: [...capture.slice(0, 2), command] }).success).toBe(false)
        }
    })

    test('capture canonicalization is stable and does not mutate supplied move order', () => {
        const move = parseMove('D6-D8(K11A10A2)')!
        const before = structuredClone(move)
        expect(canonicalMove(move)).toBe('D6-D8(A2A10K11)')
        expect(move).toEqual(before)
    })

    test('different capture discovery orders compare equally after a real standard-game replay', () => {
        const moves = 'd1-d3 f8-i8 j6-j9 e7-e10 j9-e9 d6-d9 f10-f9 g7-g10 e9-e10 h6-h9 k8-j8 g6-g9 k6-i6 f6-h6 a8-h8 f7-h7 f9-f8 h9-j9 k7-i7 h7-h9 i7-i10 h6-h7 i6-i7 e6-j6 i10-j10 j6-j7 d3-i3 h7-i7 h11-i11 h9-k9 i11-i9 i7-h7 g11-i11 h7-h2 k4-k2 h2-j2 h1-j1 g5-g2 i3-g3 j7-j3 k5-k3 f4-k4'.split(' ')
        const created = value(createGameRecord('game-1', moves))
        expect(created.record.moves[41]).toBe('F4-K4(K2K3)')
        const reversed = structuredClone(created.record)
        reversed.moves[41] = 'f4-k4(k3k2)'
        const decoded = value(decodeGameRecord(reversed))
        expect(compareRecords(created.record, decoded.record)).toBe('equal')
        expect(decoded.engine.getState()).toEqual(created.engine.getState())
    })

    test('failure after a valid prefix exposes no candidate and leaves caller state untouched', () => {
        const local = value(createGameRecord('game-1', ['A8-C8']))
        const before = local.engine.getState()
        const bad = { ...local.record, moves: ['D11-D10', 'D10-D9'], revision: 2 }
        const result = decodeGameRecord(bad)
        expect(result).toEqual({ success: false, error: 'Move 2: Not your piece' })
        expect(local.engine.getState()).toEqual(before)
        expect(local.record.moves).toEqual(['A8-C8'])
    })

    test('preserves repetition history for subsequent continued play', () => {
        const first = value(createGameRecord('game-1', [...cycle, ...cycle.slice(0, 3)]))
        const second = value(decodeGameRecord(first.record))
        expect(first.engine.applyMove(cycle[3])).toEqual(second.engine.applyMove(cycle[3]))
        expect(second.engine.getState().outcome?.reason).toBe('repetition')
    })

    test('input, candidate and returned record have independent ownership', () => {
        const input = value(createGameRecord('game-1', [...cycle, ...cycle])).record
        const result = value(decodeGameRecord(input))
        input.moves[0] = 'corrupt'
        input.stateCheck.outcome!.reason = 'king_escape'
        expect(result.record.moves[0]).toBe('D11-D10')
        result.record.stateCheck.outcome!.winner = Player.Defender
        result.record.moves.length = 0
        expect(result.engine.getState().outcome).toEqual({ winner: Player.Attacker, reason: 'repetition' })
        expect(result.engine.getState().moveHistory).toHaveLength(8)
    })

    test.each([
        { formatVersion: 2 }, { setup: 'custom' }, { gameId: '' }, { revision: 2 },
        { revision: '0' }, { moves: null }, { moves: [null], revision: 1 },
        { moves: ['---'], revision: 1 }, { moves: ['P'], revision: 1 },
        { moves: ['D11-D10++'], revision: 1 }, { stateCheck: null },
        { stateCheck: { positionKey: 'wrong', outcome: null } },
    ])('rejects malformed/unsupported record %j', (change) => {
        const { record } = value(createGameRecord('game-1', []))
        expect(decodeGameRecord({ ...record, ...change }).success).toBe(false)
    })

    test.each([undefined, {}, { winner: 'attacker', reason: 'repetition' }, { winner: 'unknown', reason: 'unknown' }])(
        'rejects an invalid/mismatched outcome %j', (outcome) => {
            const { record } = value(createGameRecord('game-1', []))
            expect(decodeGameRecord({ ...record, stateCheck: { ...record.stateCheck, outcome } }).success).toBe(false)
        }
    )

    test('rejects a false reason even when the winner matches, and moves after completion', () => {
        const { record } = value(createGameRecord('game-1', [...cycle, ...cycle]))
        record.stateCheck.outcome!.reason = 'king_capture'
        expect(decodeGameRecord(record).success).toBe(false)
        expect(createGameRecord('game-1', [...cycle, ...cycle, 'D11-D10']).success).toBe(false)
    })

    test('checks byte, move-count and command-length bounds before replay', () => {
        const { record } = value(createGameRecord('game-1', []))
        const moves = Array(MAX_MOVES + 1).fill('D11-D10')
        expect(decodeGameRecord({ ...record, moves, revision: moves.length }).success).toBe(false)
        expect(createGameRecord('game-1', moves).success).toBe(false)
        expect(createGameRecord('game-1', [' '.repeat(513)]).success).toBe(false)
        expect(createGameRecord('game-1', new Array<string>(1)).success).toBe(false)
        // This JSON is shorter in UTF-16 characters than the byte limit.
        const oversized = JSON.stringify({ ...record, extra: '界'.repeat(MAX_RECORD_BYTES / 3) })
        expect(oversized.length).toBeLessThan(MAX_RECORD_BYTES)
        expect(decodeGameRecord(oversized)).toMatchObject({ success: false, error: expect.stringContaining('bytes') })
        expect(decodeGameRecord('{').success).toBe(false)
        expect(decodeGameRecord(null).success).toBe(false)
    })

    test('compares ancestry, not merely revision', () => {
        const a = value(createGameRecord('game-1', [])).record
        const b = value(createGameRecord('game-1', ['D11-D10'])).record
        const c = value(createGameRecord('game-1', ['A8-C8', 'F8-E8'])).record
        expect(compareRecords(a, b)).toBe('extends')
        expect(compareRecords(b, a)).toBe('prefix')
        expect(compareRecords(b, b)).toBe('equal')
        expect(compareRecords(b, c)).toBe('divergent')
        expect(compareRecords(b, value(createGameRecord('game-1', ['A8-C8'])).record)).toBe('divergent')
        expect(compareRecords(b, { ...b, gameId: 'game-2' })).toBe('different-game')
    })
})

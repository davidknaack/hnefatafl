import { describe, expect, test } from 'vitest'
import { HnefataflEngine } from './HnefataflEngine'
import { ApplyMoveResult, GameState, GameStatus, PieceType, Player } from './types'

function stateFrom(result: ApplyMoveResult): GameState {
    if (!result.success) throw new Error(result.error)
    return result.newState
}

describe('Detached engine snapshots', () => {
    test.each(['getState', 'applyMove', 'applyMoveSequence'] as const)(
        '%s exposes no mutable engine references', (method) => {
            const engine = new HnefataflEngine()
            const control = new HnefataflEngine()
            const snapshot = method === 'getState' ? engine.getState()
                : stateFrom(engine[method]('D11-D10'))
            if (method !== 'getState') stateFrom(control.applyMove('D11-D10'))
            const sibling = engine.getState()
            const original = structuredClone(sibling)

            // Object.assign exercises JavaScript writes despite readonly Piece fields.
            Object.assign(snapshot.position[0][4].occupant!, {
                owner: Player.Defender, type: PieceType.King,
            })
            expect(snapshot.position[0][5].occupant?.type).toBe(PieceType.Attacker)
            snapshot.position[0][5].occupant = null
            snapshot.position[5][5].isThrone = false
            snapshot.position[0][0].isRestricted = false
            snapshot.position[1][0] = { occupant: null, isThrone: true, isRestricted: true }
            snapshot.position[2].splice(0, 1)
            snapshot.position.splice(3, 1)
            snapshot.captured.attacker = 100
            snapshot.captured.defender = 100
            snapshot.moveHistory.push('corrupted')
            snapshot.positionHistory.splice(0, snapshot.positionHistory.length, 'corrupted')
            snapshot.currentPlayer = Player.Defender
            snapshot.status = GameStatus.AttackerWin

            expect(sibling).toEqual(original)
            expect(engine.getState()).toEqual(original)
            const nextMove = method === 'getState' ? 'D11-D10' : 'F8-E8'
            expect(engine.validateMove(nextMove)).toEqual(control.validateMove(nextMove))
            expect(engine.getPossibleMoves({ x: 4, y: 0 }))
                .toEqual(control.getPossibleMoves({ x: 4, y: 0 }))
            expect(engine.applyMove(nextMove)).toEqual(control.applyMove(nextMove))
            expect(sibling).toEqual(original)
        }
    )

    test('reads and command results remain consistent across captures, failed commands, and reset', () => {
        const engine = new HnefataflEngine()
        const initial = engine.getState()
        const first = stateFrom(engine.applyMove('D11-D8'))
        const second = stateFrom(engine.applyMoveSequence('F8-E8'))
        const beforeCapture = engine.getState()
        const snapshots = [initial, first, second, beforeCapture]
        const saved = structuredClone(snapshots)

        const captured = stateFrom(engine.applyMove('F10-F8'))
        expect(captured.captured.defender).toBe(1)
        expect(captured.position[3][4].occupant).toBeNull()
        expect(beforeCapture.position[3][4].occupant?.type).toBe(PieceType.Defender)
        expect(beforeCapture.captured.defender).toBe(0)
        expect(snapshots).toEqual(saved)
        const savedCaptured = structuredClone(captured)

        expect(engine.applyMove('garbage').success).toBe(false)
        // Sequence failure still commits the valid prefix.
        expect(engine.applyMoveSequence('E7-D7,garbage')).toEqual({
            success: false, error: 'Move 2: Invalid move format',
        })
        expect(engine.getState().moveHistory).toHaveLength(4)
        expect(() => engine.reset(['K'])).toThrow()
        engine.reset()
        expect(engine.getState()).toEqual(initial)
        expect(captured).toEqual(savedCaptured)
        expect(snapshots).toEqual(saved)
    })

    test('mutating preview and generated capture coordinates does not affect later commands', () => {
        const engine = new HnefataflEngine()
        engine.reset([
            'RD.A......R', '.A.........', '...........', '...........', '...........',
            '.....K.....', '...........', '...........', '...........', '...........', 'R.........R',
        ])
        const before = engine.getState()
        const preview = engine.validateMove('D11-C11')
        const generated = engine.getPossibleMoves({ x: 3, y: 0 })
        const expectedPreview = structuredClone(preview)
        const expectedMoves = structuredClone(generated)
        expect(preview.expectedCaptures).toEqual([{ x: 1, y: 0 }])
        preview.expectedCaptures[0].x = 10
        preview.expectedCaptures.push({ x: 0, y: 0 })
        const captureMove = generated.find((move) => move.captures.length > 0)!
        captureMove.to.x = 10
        captureMove.captures[0].y = 10
        generated.length = 0
        expect(engine.getState()).toEqual(before)
        expect(engine.validateMove('D11-C11')).toEqual(expectedPreview)
        expect(engine.getPossibleMoves({ x: 3, y: 0 })).toEqual(expectedMoves)
        expect(stateFrom(engine.applyMove('D11-C11')).captured.defender).toBe(1)
    })
})

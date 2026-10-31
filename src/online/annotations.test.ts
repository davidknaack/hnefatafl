import { expect, test } from 'vitest'
import { decodeAnnotations, emptyAnnotations, mergeAnnotations, screenName } from './annotations'
test('screen names are display text, allow Unicode and collisions, and preserve author-format constraints', () => {
    expect(screenName('  Alex  ')).toBe('Alex')
    expect(screenName('')).toBe('')
    expect(screenName('♔ 王')).toBe('♔ 王')
    expect(screenName('😀'.repeat(80))).toHaveLength(160)
    for (const value of ['x'.repeat(81), '[Alex]', 'a{b', 'a\\b', 'a\nb', 'a\u0000b']) expect(() => screenName(value)).toThrow()
    const state = emptyAnnotations('game-1')
    state.profiles = { attacker: { revision: 1, name: 'Alex' }, defender: { revision: 1, name: 'Alex' } }
    expect(decodeAnnotations(state).profiles).toEqual(state.profiles)
})
test('append-only event merging is deterministic, idempotent, bounded per seat and validates exact ancestry', () => {
    const a = emptyAnnotations('game-1'), b = emptyAnnotations('game-1')
    a.comments.push({ id: 'a', seat: 'attacker', text: 'A', order: 1, prefix: ['D11-D8'] })
    b.comments.push({ id: 'b', seat: 'defender', text: 'B', order: 1, prefix: ['D11-D8'] })
    expect(mergeAnnotations(a, b)).toEqual(mergeAnnotations(b, a))
    expect(mergeAnnotations(mergeAnnotations(a, b), a).comments).toHaveLength(2)
    const changed = structuredClone(a); changed.comments[0].text = 'Other'
    expect(() => mergeAnnotations(a, changed)).toThrow('Conflicting comment')
    expect(() => mergeAnnotations(a, emptyAnnotations('other-game'))).toThrow()
    const illegal = structuredClone(a); illegal.comments[0].prefix = ['A1-A2']
    expect(() => decodeAnnotations(illegal)).toThrow()
    const many = emptyAnnotations('game-1')
    for (let i = 0; i < 65; i++) many.comments.push({ ...a.comments[0], id: `a-${i}` })
    expect(() => decodeAnnotations(many)).toThrow('storage limit')
    const long = structuredClone(a); long.comments[0].text = '😀'.repeat(501)
    expect(() => decodeAnnotations(long)).toThrow()
})

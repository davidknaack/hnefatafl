import { expect, test } from 'vitest'
import { HnefataflEngine } from '../HnefataflEngine'
import { displayHistory, gameDetail, gameHeading } from './presentation'

test('history and capture display follow replay and explain a terminal result rather than the retained turn', () => {
    const engine = new HnefataflEngine()
    expect(gameHeading(engine.getState())).toBe('Attackers to move')
    engine.loadGame('d11-d8 f8-e8 f10-f8 ---')
    const before = engine.getState()
    expect(displayHistory(before)).toEqual(['d11-d8', 'f8-e8', 'f10-f8xe8', 'Resigned'])
    expect(gameHeading(before)).toBe('Attackers win')
    expect(gameDetail(before)).toBe('The other side resigned.')
    expect(engine.getState()).toEqual(before)
})

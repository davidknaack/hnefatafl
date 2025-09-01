import { describe, expect, test } from 'vitest'
import { initializeGame, transformLayoutToPosition } from './board'

describe('Validator Tests', () => {

    test('No kings on board fails initial board creation', () => {
        const boardLayout = [
            "A D A",
            "     ",
            "     ",
            "     ",
            "     "
        ]
        expect(() => initializeGame(boardLayout)).toThrowError(/There must be exactly one king on the board/i)
    })
});
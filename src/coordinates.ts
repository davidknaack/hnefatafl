import { Coordinate } from './types'
import { COORD_CAPTURE_RE } from './patterns'
import { isValidCoordinate } from './movement'

export const BOARD_SIZE = 11

export function coordFromString(input: string): Coordinate | null {
    const match = COORD_CAPTURE_RE.exec(input.trim().toUpperCase())
    if (!match) return null
    const file = match[1].charCodeAt(0) - 65
    const rank = BOARD_SIZE - parseInt(match[2], 10)
    return { x: file, y: rank }
}

export function coordToString(coord: Coordinate): string {
    if (!isValidCoordinate(coord, BOARD_SIZE)) {
        throw new RangeError('Coordinate must be an integer square on the 11×11 board')
    }
    const file = String.fromCharCode(65 + coord.x)
    const rank = BOARD_SIZE - coord.y
    return `${file}${rank}`
}


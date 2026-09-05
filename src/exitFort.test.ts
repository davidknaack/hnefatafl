import { describe, expect, test } from 'vitest'
import { transformLayoutToPosition } from './board'
import { defendersHaveFort } from './utils'
import { PieceType, Player } from './types'

// Unlike the layout shorthand's default, an edge king is not on the throne.
function board(layout: string[]) {
    return transformLayoutToPosition(layout, {
        charMap: {
            K: { occupant: { owner: Player.Defender, type: PieceType.King } },
        },
    }).position
}

function rotate(layout: string[]): string[] {
    return layout.map((_, y) =>
        layout.map((row) => row[y]).reverse().join('')
    )
}

const cases = [
    {
        name: 'requires a king',
        layout: [
            'A....',
            '.....',
            '..DD.',
            '..D.D',
            '..D.D',
        ],
        win: false,
    },
    {
        name: 'requires the king to be on an edge',
        layout: [
            'A....',
            '..DD.',
            '..DKD',
            '..D.D',
            '..DDD',
        ],
        win: false,
    },
    {
        name: 'requires a legal king move on the actual board',
        layout: [
            'A....',
            '.....',
            '..DDD',
            '..DDD',
            '..DKD',
        ],
        win: false,
    },
    {
        name: 'rejects an open route to the king',
        layout: [
            'A....',
            '.....',
            '..DD.',
            '..D..',
            '..DKD',
        ],
        win: false,
    },
    {
        name: 'accepts a supported wall and uses the board edge as a barrier',
        layout: [
            'A......',
            '.......',
            '.......',
            '.......',
            '..DDD..',
            '..D.D..',
            '..DKD..',
        ],
        win: true,
    },
    {
        name: 'requires no defender adjacent to the king',
        layout: [
            'A......',
            '.......',
            '.......',
            '.DDDDD.',
            '.D...D.',
            '.D...D.',
            '.D.K.D.',
        ],
        win: true,
    },
    {
        name: 'allows disconnected diagonal defenders to isolate the king',
        layout: [
            'A......',
            '.......',
            '.......',
            '......D',
            '.....D.',
            '....D..',
            '...D.K.',
        ],
        win: true,
    },
    {
        name: 'does not need two actual attackers to capture an exposed wall',
        layout: [
            'A......',
            '.......',
            '.......',
            '.......',
            '.....DD',
            '....D.K',
            '.....DD',
        ],
        win: false,
    },
    {
        name: 'ignores capturable defenders attached to an intact fort',
        layout: [
            'A......',
            '.......',
            '.......',
            '...D...',
            '..DDD..',
            '..D.D..',
            '..DKD..',
        ],
        win: true,
    },
    {
        name: 'allows an extra defender inside the king protected area',
        layout: [
            'A......',
            '.......',
            '.DDDDD.',
            '.D.D.D.',
            '.D...D.',
            '.D...D.',
            '.D.K.D.',
        ],
        win: true,
    },
    {
        name: 'rejects an attacker in the king pocket',
        layout: [
            'A......',
            '.......',
            '.DDDDD.',
            '.D...D.',
            '.D.A.D.',
            '.D...D.',
            '.D.K.D.',
        ],
        win: false,
    },
    {
        name: 'accepts an attacker in a separate sealed pocket sharing the wall',
        layout: [
            'A......',
            '.......',
            '.......',
            '.......',
            '.DDDDD.',
            '.D.DAD.',
            '.DKDDD.',
        ],
        win: true,
    },
    {
        name: 'does not invent a capture move from two immobilized attacker pockets',
        layout: [
            '.......',
            '.......',
            '..DDD..',
            '.DADAD.',
            '..D.D..',
            '..D.D..',
            '..DKD..',
        ],
        win: true,
    },
    {
        name: 'does not let attackers turn on a restricted corner',
        layout: [
            'R.A....',
            'KD.....',
            '.D.....',
            'D......',
            '.......',
            '.......',
            '.......',
        ],
        win: true,
    },
    {
        name: 'does not treat an empty throne as an impassable barrier',
        layout: [
            'A......',
            '.......',
            '.......',
            '.......',
            '..DTD..',
            '..D.D..',
            '..DKD..',
        ],
        win: false,
    },
    {
        name: 'can reach a king directly across an empty throne',
        layout: [
            'A....',
            '.....',
            '.....',
            '..D..',
            '.DTK.',
        ],
        win: false,
    },
    {
        name: 'does not award an empty board a vacuous fort win',
        layout: [
            '.....',
            '.....',
            '.....',
            '.....',
            '..K..',
        ],
        win: false,
    },
    {
        name: 'still tests fort structure when no actual attackers remain',
        layout: [
            '.......',
            '.......',
            '.......',
            '.......',
            '..DDD..',
            '..D.D..',
            '..DKD..',
        ],
        win: true,
    },
    {
        name: 'still removes a breakable wall when no actual attackers remain',
        layout: [
            '.......',
            '.......',
            '.......',
            '.......',
            '.....DD',
            '....D.K',
            '.....DD',
        ],
        win: false,
    },
    {
        // First (1,2) can be captured against the throne. This opens access to
        // the right-hand pocket, allowing (2,1) to be sandwiched. Only then can
        // attackers cross the throne vertically and reach the king.
        name: 'recursively removes defenders as captures open new attacker regions',
        layout: [
            'RADDR',
            '..D..',
            '.DT..',
            'DD.DD',
            'RDK.R',
        ],
        win: false,
    },
    {
        // The two top defenders protect each other against ordinary capture.
        // A shieldwall uses the right corner and the extra restricted square
        // at (2,1). Removing the pair opens a straight route down column 2,
        // through both restricted squares, to the king.
        name: 'requires shieldwall removal to discover a route to the king',
        layout: [
            'RADDR',
            'D.R..',
            '.DT.D',
            'DD.D.',
            'R.K.R',
        ],
        win: false,
    },
] as const

describe('exit fort structural rule', () => {
    for (const scenario of cases) {
        // Every edge and both scan orders must give the same answer.
        for (const reflected of [false, true]) {
            let layout: string[] = [...scenario.layout]
            if (reflected) layout = layout.map((row) => [...row].reverse().join(''))
            for (let turns = 0; turns < 4; turns++) {
                const position = board(layout)
                test(`${scenario.name} (rotation ${turns}, reflected ${reflected})`, () => {
                    const before = structuredClone(position)
                    expect(defendersHaveFort(position)).toBe(scenario.win)
                    expect(position).toEqual(before)
                })
                layout = rotate(layout)
            }
        }
    }

    test.each([[0, 0], [6, 0], [0, 4], [3, 6]])(
        'attacker relocation within the outside region does not change breakability (%i, %i)',
        (x, y) => {
            const position = board([
                '.......', '.......', '.......', '.......', '.....DD', '....D.K', '.....DD',
            ])
            position[y][x].occupant = { owner: Player.Attacker, type: PieceType.Attacker }
            expect(defendersHaveFort(position)).toBe(false)
        }
    )
})

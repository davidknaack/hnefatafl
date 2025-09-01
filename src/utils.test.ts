import { describe, test, expect } from 'vitest';
import { defendersCanEscape } from './utils';
import { transformLayoutToBoard, extractEdges } from './board';
import { CellState, Player, PieceType } from './types';

// Helper to create a test board with the specified layout
function createTestBoardAndEdges(layout: string[]): { board: CellState[][], edges: Set<string> } {
    // Use the shared transformation function with test-specific options
    const board = transformLayoutToBoard(layout);

    return board;
}

// Helper to render the board as text for debugging
// Empty edge squares are rendered as 'e' unless occupied,
// then the occupied piece type is rendered as uppercase,
// indicating a defender (D/d) or attacker (A/a) that is on
// an edge square.
function renderBoard(board: CellState[][], edges: Set<string>) {
    let out = '';
    for (let y = 0; y < board.length; y++) {
        for (let x = 0; x < board[0].length; x++) {
            const key = `${x},${y}`;
            const isEdge = edges.has(key);
            const cell = board[y][x];
            
            if (cell.occupant?.type === PieceType.Defender || cell.occupant?.type === PieceType.King) {
                out += isEdge ? 'D' : 'd';
            } else if (cell.occupant?.type === PieceType.Attacker) {
                out += isEdge ? 'A' : 'a';
            } else {
                out += isEdge ? 'e' : '.';
            }
        }
        out += '\n';
    }
    return out;
}

describe('defendersCanEscape', () => {
  test('returns true when a defender is on the edge', () => {
    const { board, edges } = createTestBoardAndEdges([
      'D....',
      '.....',
      '.....',
      '.....',
      '.....'
    ]);
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(true);
  });

  test('returns false when an attacker is on the top edge', () => {
    const { board, edges } = createTestBoardAndEdges([
      'aaaaa',
      'a.d.a',
      'a...a',
      'a...a',
      'aaaaa'
    ]);
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(false);
  });

  test('returns false when an attacker is on the right edge', () => {
    const { board, edges } = createTestBoardAndEdges([
      'aaaaa',
      'a.d.a',
      'a...a',
      'a...a',
      'aaaaa'
    ]);
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(false);
  });

  test('returns true when a defender can reach the edge', () => {
    const { board, edges } = createTestBoardAndEdges([
      '.....',
      '.....',
      '..d..',
      '.....',
      '.....'
    ]);
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(true);
  });

  test('returns false when defenders are completely surrounded', () => {
    const { board, edges } = createTestBoardAndEdges([
      '.....',
      '.aaa.',
      '.ada.',
      '.aaa.',
      '.....'
    ]);
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(false);
  });

  test('returns false when multiple defenders are surrounded', (context) => {
    const { board, edges } = createTestBoardAndEdges([
      'aaaaa',
      'aaaa.',
      'a.dda',
      'aaaaa',
      'aaaaa'
    ]);
    console.log(context.task.name);
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(false);
  });

  test('returns true for a winding path to the edge', () => {
    const { board, edges } = createTestBoardAndEdges([
      '.....',
      '.....',
      '..d..',
      '.....',
      '.....'
    ]);
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(true);
  });

  test('returns false for a large board with isolated defenders', () => {
    const layout = Array.from({ length: 10 }, (_, y) => 
      Array.from({ length: 10 }, (_, x) => {
        // Create a ring of attackers around positions (5,5) and (6,5)
        if ((Math.abs(x - 5) <= 1 && Math.abs(y - 5) <= 1) ||
            (Math.abs(x - 5) <= 1 && Math.abs(y - 6) <= 1)) {
          if ((x === 5 && y === 5) || (x === 5 && y === 6)) return 'd';
          return 'a';
        }
        return '.';
      }).join('')
    );
    
    const { board, edges } = createTestBoardAndEdges(layout);
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(false);
  });

  test('returns true for multiple defenders with one escape route', () => {
    const { board, edges } = createTestBoardAndEdges([
      '.....',
      '.....',
      '..dd.',
      '.aa.a',
      '.....'
    ]);
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(true);
  });

  test('returns false when edges are blocked', () => {
    const { board, edges } = createTestBoardAndEdges([
      'aaaaa',
      'a..da',
      'a.d.a',
      'aa.aa',
      'aaaaa'
    ]);
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(false);
  });
});

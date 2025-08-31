// Helper to render the board as text
function renderBoard(board: any[][], edges: Set<string>) {
  let out = '';
  for (let y = 0; y < board.length; y++) {
    for (let x = 0; x < board[0].length; x++) {
      const key = `${x},${y}`;
      let isEdge = false;
      if (edges.has(key)) {
        isEdge = true;
      } 
      if (board[y][x] === 'defender') {
        out += isEdge ? 'D' : 'd';
      } else if (board[y][x] === 'attacker') {
        out += isEdge ? 'A' : 'a';
      } else {
        if (!isEdge) {
          out += '.';
        } else {
          out += 'e';
        }
      }
    }
    out += '\n';
  }
  return out;
}

import { describe, test, expect } from 'vitest';
import { defendersCanEscape } from './utils';

describe('defendersCanEscape', () => {
  function makeBoard(rows: number, cols: number, fill: any = null) {
    return Array.from({ length: rows }, () => Array(cols).fill(fill));
  }

  test('returns true when a defender is on the edge', () => {
    const board = makeBoard(5, 5);
    board[0][2] = 'defender';
    const edges = new Set<string>(['2,0']);
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(true);
  });

  test('returns false when an attacker is on the top edge', () => {
    const board = makeBoard(5, 5);
    board[0][2] = 'attacker';
    board[1][2] = 'defender';
    const edges = new Set<string>(['2,0']);
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(false);
  });

  test('returns false when an attacker is on the right edge', () => {
    const board = makeBoard(5, 5);
    board[1][4] = 'attacker';
    board[1][3] = 'defender';
    const edges = new Set<string>(['4,1']);
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(false);
  });

  test('returns true when a defender can reach the edge', () => {
    const board = makeBoard(5, 5);
    board[2][2] = 'defender';
    const edges = new Set<string>(['2,0', '2,4', '0,2', '4,2']);
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(true);
  });

  test('returns false when defenders are completely surrounded', () => {
    const board = makeBoard(5, 5);
    board[2][2] = 'defender';
    board[1][2] = 'attacker';
    board[3][2] = 'attacker';
    board[2][1] = 'attacker';
    board[2][3] = 'attacker';
    const edges = new Set<string>(['2,0', '2,4', '0,2', '4,2']);
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(false);
  });

  test('returns false when multiple defenders are surrounded', (context) => {
    const board = makeBoard(5, 5);
    board[2][2] = 'defender';
    board[2][3] = 'defender';
    board[1][2] = 'attacker';
    board[3][2] = 'attacker';
    board[2][1] = 'attacker';
    board[2][4] = 'attacker';
    board[1][3] = 'attacker';
    board[3][3] = 'attacker';
    board[2][4] = 'attacker';
    const edges = new Set<string>(['2,0', '2,4', '0,2', '4,2']);
    console.log(context.task.name);
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(false);
  });

  test('returns true for a winding path to the edge', () => {
    const board = makeBoard(5, 5);
    board[2][2] = 'defender';
    board[1][2] = null;
    board[0][2] = null;
    board[2][1] = null;
    board[2][0] = null;
    const edges = new Set<string>(['2,0', '2,4', '0,2', '4,2']);
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(true);
  });

  test('returns false for a large board with isolated defenders', () => {
    const board = makeBoard(10, 10);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx !== 0 || dy !== 0) {
          board[5 + dy][5 + dx] = 'attacker';
          board[6 + dy][5 + dx] = 'attacker';
        }
      }
    }
    board[5][5] = 'defender';
    board[6][5] = 'defender';
    const edges = new Set<string>();
    for (let i = 0; i < 10; i++) {
      edges.add(`0,${i}`);
      edges.add(`9,${i}`);
      edges.add(`${i},0`);
      edges.add(`${i},9`);
    }
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(false);
  });

  test('returns true for multiple defenders with one escape route', () => {
    const board = makeBoard(5, 5);
    board[2][2] = 'defender';
    board[2][3] = 'defender';
    board[1][2] = 'attacker';
    board[2][1] = 'attacker';
    board[2][4] = 'attacker';
    board[1][3] = 'attacker';
    board[3][3] = 'attacker';
    const edges = new Set<string>(['2,0', '2,4', '0,2', '4,2']);
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(true);
  });

  test('returns false when edges are blocked', () => {
    const board = makeBoard(5, 5);
    board[2][2] = 'defender';
    board[2][3] = 'defender';
    board[1][2] = 'attacker';
    board[2][1] = 'attacker';
    board[2][4] = 'attacker';
    board[1][3] = 'attacker';
    board[3][0] = 'attacker';
    board[3][3] = 'attacker';
    const edges = new Set<string>(['2,0',  '0,2', '4,2']);
    console.log(renderBoard(board, edges));
    expect(defendersCanEscape(board, edges)).toBe(false);
  });
});

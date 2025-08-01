# Intro

I'm just playing with GitHub Copilot and OpenAI's agent mode in here.
The general idea is to build a Hnefatafl game that runs in-browser (static hosting)
and that I can maybe use with a RL setup to make an AI opponent.

It's probably, like, 95% AI generated code.

✅ Engine is designed for use in the browser via Vite.
🧪 If reused in Node.js or other environments (e.g., RL training), a build step or bundler (e.g., esbuild, vite-node) must resolve imports. That is not currently a requirement.

# Overview / Idea / Plan

## Hnefatafl Engine – Simplified SRS

Target: Browser-compatible TypeScript module for use with web components

✅ Core Features
1. Board Initialization

    Standard 11×11 Hnefatafl layout

    Defenders, King, and Attackers placed per classic rules

    Throne and corners marked for special rules

2. Game State Representation
    ```ts
    interface GameState {
      board: CellState[][];
      currentPlayer: "attacker" | "defender";
      captured: {
        attacker: number;
        defender: number;
      };
      moveHistory: string[];
      status: "in_progress" | "attacker_win" | "defender_win";
    }
    ```
    ```ts
    interface CellState {
      occupant: "attacker" | "defender" | "king" | null;
      isThrone: boolean;
      isCorner: boolean;
    }
    ```
3. Move Format

    Moves are strings like:

    ```
    "E5-E6"                // No capture
    "E7-E6(F9)"            // Single capture
    "D6-D8(D7E7)"          // Multiple captures
    "E5-E6, E7-E6(F9)"     // Sequence of moves
    ```

4. Validation API

    ```ts
    function validateMove(move: string): MoveValidationResult;
    ```
    ```ts
    interface MoveValidationResult {
      isValid: boolean;
      reason?: string;
      expectedCaptures: string[]; // e.g. ["F9", "D7"]
    }
    ```
    Parses one move at a time

    Does not apply the move

    Provides list of available captures for the move, but allows player to choose whether to apply them

    Handles 0–4 capture directions (orthogonal only; max 3 is realistic but 4 is technically possible)

5. Commit API

    ```ts
    function applyMove(move: string): ApplyMoveResult;
    ```
    ```ts
    interface ApplyMoveResult {
      success: boolean;
      error?: string;
      newState?: GameState;
    }
    ```
    Revalidates move string

    Checks if listed captures match what’s possible

    Applies piece movement and capture(s)

    Advances turn if valid

    Returns updated game state or error

6. Game History Parsing

    ```ts
    function applyMoveSequence(moves: string): ApplyMoveResult;
    ```
    Input: comma-separated string of moves

    Applies moves in order, halts on first error

    Returns final state or error

7. Design Constraints

    No exceptions for validation errors — use clean return types

    No mandatory captures

    Moves must explicitly list desired captures, even if they’re available

    Support for use inside a web component context

    Engine must be fully functional in static files

    No external state or async behavior

    Minimal external dependencies (or none)

    📌 Notes
    Capturing multiple enemy pieces in one move is possible (up to 4).

    If a move could capture but the player opts not to list any captures, it is legal.

    Captures indicated that are not possible are rejected by the validator.


# Design Philosophy

Modular: Small, focused files/classes for parsing, validation, state, and rules

Functional core + encapsulated engine class: Core logic is mostly pure functions (easy to test), wrapped by a stateful engine object

Stateless validation: Move validation can be run without mutating state (needed for preview in UI)

Web-component-friendly: No reliance on external frameworks or servers
# Hnefatafl Game Engine

Hnefatafl is a TypeScript-based game engine that implements the classic Norse board game. The engine runs in browsers via Vite and includes a debug UI for testing game functionality.

Always reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.

## Working Effectively

- Bootstrap, build, and test the repository:
  - `npm install` -- takes 5 seconds. Installs TypeScript, Vite, and Vitest dependencies.
  - `npm run build` -- takes 250ms. NEVER CANCEL. Very fast Vite build.
  - `npm test` -- takes 1 second. NEVER CANCEL. Runs Vitest test suite.
- Run the development environment:
  - ALWAYS run `npm install` first if node_modules is missing.
  - Development server: `npm run dev` -- starts on http://localhost:5173
  - Production preview: `npm run preview` -- serves built files on http://localhost:4173
- Type checking:
  - `npx tsc --noEmit` -- checks TypeScript without building (has 1 known error, doesn't break build)

## Validation

- ALWAYS manually validate any changes by running the application and testing game functionality.
- Navigate to the UI, click on game pieces, validate moves, and ensure the game state updates correctly.
- Test complete end-to-end scenarios: select pieces, make moves, verify captures, check win conditions.
- The application shows a 11x11 Hnefatafl board with attackers (A), defenders (D), and king (K).
- Interactive elements: piece selection, move validation, game state display, and JSON debugging output.
- ALWAYS verify the debug UI loads correctly and displays the game board with proper piece positioning.
- Test that clicking pieces updates the "From" field and shows possible moves.
- Verify that the validate/apply buttons work correctly with proper error messages for invalid moves.

## Build Issues and Warnings

- **TypeScript Error (IGNORE)**: There is 1 TypeScript compilation error related to PossibleMove import in HnefataflEngine.ts. This does NOT break the build due to Vite's handling. Do not attempt to fix this unless specifically working on that issue.
- **Test Failures (IGNORE)**: 4 out of 61 tests fail consistently. These are existing issues related to fort validation logic and are NOT build-breaking. Test results: "4 failed | 57 passed (61)".
- **No Linting**: The project does not have ESLint configured. Only Prettier is available for formatting with config in `.prettierrc`.
- **No CI/CD**: There are no GitHub Actions workflows in the repository.

## Common Tasks

The following are validated commands and their expected outputs:

### Repository Root Files
```
ls -la [repo-root]
.git/
.gitignore
.prettierrc
README.md
package.json
package-lock.json
public/
src/
tsconfig.json
vite.config.ts
```

### Package.json Scripts
```json
{
  "scripts": {
    "repomix": "npx repomix@latest",
    "testlive": "vitest",
    "test": "npx vitest run",
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

### Source Code Structure
```
src/
├── HnefataflEngine.ts    # Main engine class
├── board.ts              # Board initialization and utilities
├── board.test.ts         # Board tests
├── engine.test.ts        # Engine tests
├── moveGenerator.ts      # Move generation logic
├── moveGenerator.test.ts # Move generation tests
├── parser.ts             # Move string parsing
├── patterns.ts           # Board pattern definitions
├── rules.ts              # Game rules implementation
├── types.ts              # TypeScript type definitions
├── utils.ts              # Utility functions
├── utils.test.ts         # Utility tests
├── validator.ts          # Move validation logic
└── validator.test.ts     # Validation tests
```

### Public Assets
```
public/
├── index.html           # Game UI with interactive board
└── main.js              # Entry point that imports engine
```

## Key Design Principles

- **Modular Architecture**: Small, focused files for parsing, validation, state, and rules
- **Functional Core**: Core logic uses pure functions (easy to test), wrapped by stateful engine
- **Stateless Validation**: Move validation runs without mutating state (needed for UI preview)
- **Web Component Friendly**: No external framework dependencies, works with static hosting
- **Browser Compatible**: Designed for browser use via Vite, supports static file deployment

## Game Engine Usage

The main entry point is `HnefataflEngine` class which provides:
- `reset()` - Initialize game with standard or custom board
- `validateMove()` - Check if a move is valid without applying it
- `applyMove()` - Apply a move and return new game state
- `generatePossibleMoves()` - Get all possible moves for current player
- `getGameState()` - Get current game state and status

## Move Format

Moves use chess-like notation:
- Basic move: `"E5-E6"`
- With capture: `"E7-E6(F9)"`
- Multiple captures: `"D6-D8(D7E7)"`

## Testing Notes

- Test suite uses Vitest framework
- Tests run in ~1 second and provide good coverage
- 4 tests consistently fail (related to fort validation logic) - this is expected
- Console output during tests shows board visualizations for debugging
- NEVER attempt to fix the failing tests unless specifically working on fort validation

## Known Limitations

- TypeScript strict mode enabled but has import-related error that doesn't break functionality
- No automated linting in CI (only local Prettier available)
- Game logic has some edge cases in fort validation (hence failing tests)
- No automated deployment or release process configured
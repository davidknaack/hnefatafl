# Local production client

The default `/hnefatafl/` entry now serves a local two-player client. It is the
first implementation milestone from the [readiness review](production-client-readiness-2026-10-17.md).
Two people control opposite sides on one browser board. Online controls remain
available in the development harness at `/hnefatafl/debug.html`; they are not yet
integrated into the production client.

## Implemented experience

- Light and dark palettes follow the browser's color preference, including live
  preference changes, native controls, board highlights, dialogs and fields.
  Piece colors retain their side identity in both modes. No theme override is
  stored, and changing preference does not reset the game or keyboard focus.
- A responsive 11×11 board, fixed orientation, file/rank labels, dark attackers,
  ivory defenders and a crowned king. Select a current-side piece, then a legal
  destination to commit. Reselect, select the same piece again, use Clear
  selection or press Escape to cancel. Recent moves briefly show an origin ghost
  and directional arrow.
- Legal destinations come from `GameSession`; repeated positions are advisory
  and remain playable. Allowed repeats show `↻`; a repetition loss shows `↻!`.
  Labels describe captures and repetition consequences without relying on color.
- Persistent square buttons, one board Tab stop, arrow traversal, row Home/End,
  Ctrl+Home/End for board corners, and native Enter/Space activation. Board
  publications update buttons rather than replacing the focused square.
- Turn, objectives, remaining pieces, captured counts, paired move history and
  readable outcome reasons. Live feedback announces selection, played moves,
  captures and results. A terminal result stops board play and retains export.
- Ordered comments for the selected move, with author names/Anonymous, colored
  mentions, truncation badges and a compact scrollable list above the entry field.
  Square and move-reference buttons preview an independent board overlay on
  hover/focus/tap, without changing the game. Text and JSON saves retain comments.
- Native modal dialogs for rules help, import, export and replacement. Help
  opens at its heading. Replacement defaults to keeping the current game, and
  native Escape cancels without changing it.
- Import replays the entire input into a candidate `LocalGameSession`. Invalid
  input preserves the board and selection. Replacing a nonempty game requires
  explicit confirmation; a cancelled candidate is disposed. New game has the
  same replacement protection.
- Load game includes an indexed test game selector, preserving all 1,752 rows
  of the supplied Copenhagen corpus. Selection only fills the editable Game
  notation draft; Load game still performs normal replay and confirmation.
  Typing your own notation clears the selection. The corpus is fetched on first
  use, and failures leave custom loading available with retry on reopening.
- Save / copy shows canonical portable notation. Copy uses the clipboard and
  offers a selectable-text fallback on failure; Download creates
  `hnefatafl-game.txt`. Empty games cannot be exported. Current local and imported
  games, including variants and the review position, are saved automatically.

No engine rules, protocol or recovery-storage schema changed. Local review and
variant analysis are now implemented; see [game review and the JSON format](game-review.md).
Resignation controls, AI and rematches remain deferred. Existing
imported resignation records still replay and display their results.

## Ownership and developer entries

| Location | Responsibility |
| --- | --- |
| `src/client/main.ts` | Production bootstrap and hot-reload cleanup |
| `src/client/client.ts` | Local client binding, dialogs and validated replacement |
| `src/client/localGameStorage.ts` | Guarded local autosave and replay-validated restoration |
| `src/client/board.ts` | Persistent square rendering, accessible labels, roving focus and keyboard input |
| `src/moveComments.ts`, `src/client/comments.ts`, `src/client/boardReferences.ts` | Comment syntax, display/entry and noninteractive board-reference overlays |
| `src/client/presentation.ts` | Outcome wording and canonical display history |
| `src/client/review.ts`, `src/session/LocalReview.ts` | Move navigation, variants, descriptions and replay-validated JSON studies |
| `src/client/gameLibrary.ts`, `src/client/data/` | On-demand, indexed Copenhagen test corpus and provenance |
| `src/session/SessionOwner.ts` | Shared unbind-before-dispose session replacement |
| `public/index.html`, `public/main.js` | Production entry and markup |
| `public/debug.html`, `public/debug.js` | Original local/online development harness |
| `public/client-acceptance.html` | Repeatable production-client browser checks |
| `public/acceptance.html` | Existing online/harness browser checks, now loading `debug.html` |

Both consumers use `SessionOwner` and `GameSession`. Debug-specific online/recovery
orchestration remains in `src/ui/sessionControls.ts`; it has not been copied into
the local client. The production entry never reads or replaces the online recovery
slot, including when an older online game exists in browser storage. Integrating
that orchestration with production controls is a later milestone.

Vite builds only the default entry. The harness and both browser runners are
development-only HTML entries and must remain absent from `dist/`. No framework,
browser-test package, font service or other dependency was added.

## Local autosave

The production client writes one `localStorage` slot per browser origin:
`hnefatafl.local-game.v1`. It contains the existing version-1 JSON study format,
even for an ordinary game or an empty opening. This retains the complete main
line, all variant suffixes/descriptions, tags and selected `{ line, ply }` view.
Ordinary Save / copy exports continue using portable notation.

Committed moves, variant creation/description edits, review navigation and
confirmed replacements save synchronously through the active session's
subscription. Selection and unconfirmed dialog drafts do not change the copy.
New game saves the empty opening so the previous record cannot reappear on
refresh. No unload event or prompt is needed. Replacement unsubscribes the old
session before disposal, preventing stale writes.

Startup replay-validates every line with the existing 2 MiB study bounds before
binding the restored session. An unreadable or invalid slot leaves a fresh board
and an explanatory status; an invalid copy remains untouched until the player
changes or replaces the game. Failed writes preserve the previous storage value
and show Save / copy guidance; a later successful write clears that status.
The online recovery slot is never read or replaced.

Initial and imported positions snap into place without move slides, captures,
ghosts, arrows or win messages. The local session exposes the generation of its
latest load/reset so even an import extending the current record by one move
is distinguished from playing that move. Ordinary review/play still animates,
including returning to a winning move after navigating away.

Storage is local to this browser/profile and origin, including the port. It is
one current game, not a permanent library: starting/loading another game replaces
it, and clearing site data removes it. Save / copy keeps an independent backup.

## Acceptance gate

Run the normal repository test, type-check, tooling-format, browser build and
relay build commands. With `npm run dev` running, open:

`http://localhost:5173/hnefatafl/client-acceptance.html`

Choose **Run client checks**. Expected: **43 passed; 0 failed**. The runner uses
actual production markup, the real client binding and disposable local sessions.
It covers opening state, side gating, selection/cancellation, keyboard navigation,
focus retention, moves/capture/export, atomic invalid import, cancelled/confirmed
replacement, terminal repetition and stale queued work after replacement/disposal.
Same-origin iframe checks exercise actual layout viewports at 320, 390, 768 and
1200 CSS pixels, verifying no horizontal overflow, square board proportions and
the intended one/two-column layout. They are layout checks, not physical-device
touch or screen-reader testing. A separate iframe check changes the actual
preferred scheme from light to dark and back during play, checking text contrast
on primary surfaces and preservation of history, selection and keyboard focus.
The runner page also offers isolated light/dark previews for visual inspection.
Library checks cover real corpus indexing/validation, switching/editing drafts,
late responses, disposal, fetch failures and retry without blocking custom import.
Review checks cover complete-history navigation, move-list jumps, sibling
variants, described continuation choices, JSON restoration, file/drop loading,
oversized inputs and file-read races.
Autosave checks use injected in-memory storage and remount the actual client,
covering full game/variant retention, selected branch/ply, replacement/cancellation,
storage failures, corrupt snapshots and static loaded/restored winning positions.
Iframe layout checks and theme previews disable persistence so they cannot read
or replace a player's actual saved game.
Comment checks cover ordered authors/anonymous text, mentions and contrast,
500-character Unicode entry, truncation persistence, safe text rendering,
square/arrow previews and cleanup, branch ownership and JSON/autosave round trips.
Responsive checks include long names and unbroken comments at every width.
Board feedback checks cover side/destination-only hover eligibility, contrasting
piece-sized rings and muted red selection, translucent origin pieces, 420 ms slides,
growing arrows with fixed heads, cancellation during rapid navigation/selection,
the shared 180 ms ease-out on arrival, indicator cleanup, and reduced motion.
Reduced motion skips piece slides, arrow growth and feedback transitions. It shows
a static ghost/arrow briefly (420 ms). Normal motion checks verify natural
animation-clock progress, including the piece's actual intermediate position.
Legal dots enter in an outward sequence: the adjacent square has no delay, then
10 ms per additional square (at most 90 ms on this board), followed by the existing
110 ms ease. Removal has no added delay, legal moves are immediately playable,
and reduced motion shows all dots immediately.
Both themes use #7c8488 escape squares without a decorative border or glyph.
Captured pieces stay visible as noninteractive visual copies until the moving
piece's slide finishes, then fade out together with the origin ghost and arrow
over 180 ms with shared ease-out timing and no additional hold. The engine
position, capture counts and accessible square labels commit immediately. All
victims, including kings and simultaneous captures, follow the same timing.
New actions, review navigation, reset, disposal or resize cancel pending capture
effects and snap to the committed position. Reduced motion removes victims instantly.
Browser checks verify shared start times, duration, intermediate fade opacity and
simultaneous cleanup of the captures, origin ghost and arrow.
Winning positions show a two-line Attacker/Defender WIN message over the last
move's destination after the piece arrives. The message grows around that fixed
center, eases in/out over 1.8 seconds, and leaves the permanent result heading in
place. It uses the actual winner (including defender repetition losses), replays
when reviewing the terminal move, and clears on navigation/replacement/disposal.
Resignation has no winning movement, so its message uses the board center.
Reduced motion shows a static message. Browser checks cover both winners,
intermediate growth/centering, cancellation and both escape corners at 320, 390,
768 and 1200 CSS pixels.
The permanent result explanation sits beneath Game finished on the right of the
60-pixel turn bar. It can use two compact lines on narrow layouts, with the full
reason also retained in live feedback. The bar height and board position stay
unchanged between play and game end; responsive win checks verify both directions
across the final move.

### October 18, 2026 move-comment check

Using Node `v24.19.0` and installed dependencies, **595 Vitest tests across 27
files** passed, including 14 notation/engine/review comment checks. Source/tests,
Vite configuration and relay TypeScript checks, tooling formatting and browser/
relay builds passed. The production browser runner passed **43 checks; 0 failed**.
All five comment checks passed, along with extended long-comment responsive
checks and light/dark mention contrast. Both theme previews were visually checked
with authored comments, mentions and references. The built app restored the
existing local game at its original ply with the new comment panel and no move/
win animation or observed browser errors. No engine rules or online message/
recovery schemas changed; no dependency install, hosted CI or deployment occurred.

### October 18, 2026 local autosave check

Node `v24.19.0` with the installed dependencies passed **581 Vitest tests across
26 files**, source/tests, Vite configuration and relay TypeScript checks, tooling
formatting and browser/relay builds. The production browser runner passed
**38 checks; 0 failed**, including all five autosave/static-load checks. No
dependency installation, hosted CI or public deployment was performed.
The built preview retained ply 2 of a three-move record through a real browser
reload, with matching current-move selection, complete export and no transient
board effects. Returning to the original ply 3 and opening a new page restored
that position too. The preview's original record/view was retained, with no
observed browser warning/error logs.

### October 18, 2026 board refinement check

Review/variant work was committed first as `ef45971`. Board refinements remain a
separate change. Node `v24.19.0` passed all 572 Vitest tests in 25 files, all three
TypeScript checks, tooling formatting and browser/relay builds. The production
browser runner passed all 33 checks. Pointer/keyboard review and the escape-square
appearance were also checked in the built preview and both theme previews.

Also run the [existing online acceptance runner](online-acceptance.md) against a
local relay after lifecycle-owner changes. Expected: **9 passed; 0 failed**.
These browser runners are manually invoked and do not run in Vitest or hosted CI.

Manual checks before release:

1. Play with pointer input and with keyboard Enter and Space, including one
   capture. Confirm selection, side changes, highlights, history and counts.
2. Open help at its heading; close it with Escape and check restored focus.
   Cancel a nonempty new game with Escape; retain its history and opener focus.
3. Copy and read back canonical notation. Download and inspect the text file.
   Load it and confirm the same record. Check clipboard-denial fallback in a
   browser that denies clipboard access.
4. Inspect phone and desktop layouts, including the bottom of the board, player
   panels, history and long dialog content. Check the built/preview entry as well
   as development. Verify developer HTML/test scripts are absent from `dist/`.

## October 17, 2026 verification

Using Node `v24.19.0` and installed dependencies, direct Node command equivalents
were used because npm was absent from the shell PATH:

- Vitest: **551 passed, 24 files**. New unit checks cover session replacement,
  queued-command invalidation, idempotent cleanup and result/history presentation.
- Source/tests, Vite configuration and relay TypeScript checks: passed.
- Tooling formatting, browser production build and relay build: passed.
- Local production-client browser runner: **10 passed; 0 failed**.
- Existing online/harness runner: **9 passed; 0 failed**, using loopback relay
  port 18787 because the default 8787 listener was unavailable in this environment.
- Actual keyboard Enter commit retained focus; rules opened at the heading;
  native Escape cancelled replacement and returned focus to New game. Actual
  clipboard readback and the downloaded text file both contained
  `d11-d8 f8-e8 f10-f8xe8`.
- Built/preview entry: pointer and Space-key play, three moves including a
  capture, matching history/counts and no observed browser errors. Inspected
  production output contains only app HTML and bundled JavaScript/CSS.

No fresh dependency install, hosted CI, physical-device touch test, screen-reader
audit, public deployment or public-network check was performed. Clipboard-denial
fallback is implemented but was not forced in this browser. The existing online
manual refresh/backup evidence remains in the P6–P8 progress log.

### Browser preference follow-up

The client now follows `prefers-color-scheme`, with matching browser theme-color
metadata and native-control color schemes. CSS alone responds to preference
changes; no listener, saved override or session replacement is involved. Visual
inspection covered both palettes, and the expanded browser runner passed
**11 checks**, including live light/dark/light changes and primary-surface text
contrast. The 551 unit tests, type checks, tooling formatting and browser build
also passed. The debug harness retains its existing separate stylesheet.

### Test library follow-up

The complete supplied corpus is now available in Load game as Game 1 through
Game 1752, corresponding to original source rows. Provenance, CC0 designation
and the unchanged file hash are recorded in `src/client/data/README.md`. No
records were filtered to hide existing rules disagreements. The original CSV
summary stays visible in the draft and is handled by the existing import adapter.

The browser runner now passes **15 checks**. New checks cover real corpus
indexing and validation, switching entries, manual edits, delayed fetches,
disposal and failure/retry. The 551 tests, type checks, tooling formatting and
production build also passed. The built app was checked with Game 1, Game 2 and
custom notation; selecting/editing preserved the current board. The CSV is
included as a separate 616 KB production asset and fetched only when the import
dialog first requests it.

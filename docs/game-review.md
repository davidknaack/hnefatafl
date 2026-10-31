# Local game review and variants

Production local play includes start, previous, next and end controls directly
below the board. Selecting a move in the Moves tab shows the position **after**
that move. The complete selected line stays in the move list; reviewing an early
position never deletes later moves. Keyboard arrows/Home/End also move through
the focused move list. The Moves and Variants tabs support arrow-key selection.

Play continues normally at the end of a line. At an earlier position, select a
piece and destination as usual. **Create a variant** then identifies the move,
parent line and ply, and asks for an optional description. Confirming creates
the variant and plays that first move together. Cancel or Escape discards the
proposed move without changing the game or creating an empty variant.
The optional description can contain
up to 120 characters and can be changed later with **Edit description** in the
Variants tab. The main game and every existing variant stay intact. Multiple
variants can start at the same position, and variants can have their own branches.
Stepping or jumping backward to a variant's fork selects its parent line; crossing
several forks selects the appropriate ancestor. The branch label and Variants tab
selection follow that position.
Step back from a terminal position before trying a different move.

The Variants tab lists each line's parent, fork position, first alternative move
and description, without expanding all of its moves. Selecting a variant shows
its first distinguishing move (or its fork position while unplayed). Selecting
Main game returns to the main line's end. When the next position offers more
than one continuation, the next arrow gains a small dropdown indicator and opens a keyboard-accessible chooser showing
the moves, line identities and descriptions. Cancelling does not navigate.

## Save and load

Without variants, Save / copy retains the existing portable text format and
`hnefatafl-game.txt` filename. It always saves the **complete recorded game**,
including moves after the position currently being reviewed.

Once a variant exists, Save / copy automatically exports a JSON study containing
the main game, all variants, their descriptions and the selected review position.
Copy and Download use that same content; the filename is `hnefatafl-study.json`.
An unplayed variant is retained too, so its description and intended fork survive.
The production client automatically saves the current game/study and selected
branch/ply in this browser, including future moves while reviewing the opening.
Refreshing or returning to the app restores that view without board animations.
Starting or loading another game replaces the automatic copy; explicit export
keeps separate records. See [local autosave](production-client.md#local-autosave).

Load game accepts either format through pasted text, **Choose file**, or a file
dropped into the dialog. Test-library selection remains available. A chosen or
dropped file only fills the editable Game notation draft; the user reviews it
and chooses Load game. Editing that draft cancels an outstanding file read and
clears the test-library selection. A late response cannot overwrite a newer draft
or a disposed dialog. Read failures and oversized files preserve the current
game. Replacing any nonempty game/study requires confirmation even while viewing
its opening position.

Every imported line is independently replayed through the same engine before the
whole study is adopted. Invalid JSON, unsupported versions, illegal moves,
unknown parents, cycles, invalid forks and invalid review cursors leave the
existing study unchanged. Files are read in the browser; no upload service is
involved.

## Move comments

The compact comment box below the record displays the selected ply's ordered
comments, with a 150-pixel scroll limit and an entry field below. Adding a comment
does not move the cursor or discard future moves. Local entries are Anonymous;
the consumer can supply a `commentAuthor` provider when named users are available.
No local naming controls or mention notifications are implemented.

Portable notation accepts multiple `{text}` comments after a move. Authorship is
explicit: `{[Alice]:An opening for [Bob]}`. Ordinary `Alice:` and `D1:D4` inside
anonymous prose are not authors. Body text may span lines and may escape literal
braces/backslashes with `\{`, `\}` and `\\`. Anonymous text beginning `[name]:`
is saved with `\[` so it cannot become an author on reload.

The limit is 500 Unicode characters per comment body. Overlong imports are
truncated, reserving room for `… (comment truncated)` within the limit. That
reserved suffix survives text/JSON saves; viewers show it as a Truncated badge.
Names are at most 80 characters. Existing whole-study input/replay bounds remain.

`[Bob]` in body text is a colored mention. `<D3>` previews a square; `<D1-D4>`
previews an orthogonal arrow between distinct valid squares. Unknown or invalid
tokens remain ordinary text. Hover/focus shows a preview until leave/blur; tap or
keyboard activation shows it for 1.8 seconds. Escape and navigation clear it.
When the board is offscreen, activation brings it into view, respecting reduced motion.
The independent SVG layer never sends a move or changes selection or state.

Comments on inherited trunk moves belong to that ancestor and are shared by its
variants. Comments on an alternative continuation belong only to that branch,
even when it plays the same move as another line. JSON keeps comments inline in
each move string, for example:

```json
"main": [
  "D11-D10 {[Alice]:An opening} {[Bob]:Consider <D11-D9>, [Alice]!}",
  "F8-E8 {should have played D1:D4}"
]
```

Autosave, portable export, JSON studies and file loading retain the comment
chains and truncation status. Replays use unannotated engine commands; comment
edits publish a new generation without replaying board animations.

## JSON format, version 1

```json
{
  "format": "hnefatafl-study",
  "version": 1,
  "tags": [{ "name": "Event", "value": "Analysis" }],
  "main": ["D11-D10", "F8-E8", "D10-C10"],
  "variants": [
    {
      "id": "v1",
      "parent": "main",
      "at": 1,
      "description": "Defend the eastern escape",
      "moves": ["F8-I8"]
    }
  ],
  "view": { "line": "v1", "ply": 2 }
}
```

`main` contains complete engine move commands from the standard opening, including
resolved captures. Commands use the engine notation (for example `F10-F8(E8)`);
`---` is a final resignation entry. Inline comments follow the command. The
importer also accepts portable move tokens; saving canonicalizes commands while
preserving comments. No rules identifier or unchecked board snapshot is accepted.

Each variant has a unique `v`-prefixed positive numeric ID. `parent` identifies
`main` or another variant. `at` is the number of parent-line history entries
retained before appending the variant's own `moves` suffix. For example, `at: 1`
in the example keeps `D11-D10` and replaces the next continuation with `F8-I8`.
Nested branches fork after their parent's own fork. Branching earlier is
normalized to the appropriate ancestor. Variant order does not determine ancestry;
the importer resolves parent IDs and rejects cycles. Two variants may share their
first move and still retain distinct identities/descriptions.

`view.ply` is an absolute history-entry count on `view.line`, with zero denoting
the opening. A final resignation is an entry as well. `tags` holds the original
portable metadata, independent of navigation and branching. Unknown versions are
rejected instead of guessed or migrated.

Bounds: 2 MiB UTF-8 input/files, 128 lines including the main game, 2,048 entries
per complete line, and 16,384 total entries replayed across all lines (including
shared prefixes). There are at most 128 metadata tags, with 128-character names
and 2,048-character values. Descriptions are at most 120 characters on one line.
These checks also keep newly created/exported studies reloadable within the same
format's limits.

## Implementation and validation

`LocalGameSession({ review: true })` enables local review. The production client
uses it for new/imported games. The debug harness retains its default linear
`LocalGameSession()` behavior. The raw online session keeps its existing live
protocol/recovery format; the production `OnlineStudySession` wrapper adds
[independent live review and shared comments](production-online-client.md).

`SessionView.review` is detached and includes the selected line/cursor, complete
line commands/status, variant summaries, available next choices and the current
move's comments. The ordinary
`state` describes the **reviewed position**, with repetition history, captures,
side to move and outcome rebuilt by engine replay. Navigation/branch/description
commands carry the observed generation and invalidate queued/stale moves. Legal
move selection remains available at reviewed positions. A past-position move
requires `submitVariant` rather than ordinary `submitMove`; replay, move validation,
description and study bounds all pass before the variant and its first move are
published together. Stale dialogs cannot mutate a newer position. Board
rendering continues to consume only session state/capabilities.

Tests cover prefix equivalence, captures, repetition and resignation endings,
sibling/nested/same-move branches, metadata, detached views, JSON round trips,
unordered ancestry, invalid/cyclic/bounded data and stale commands. Browser
acceptance covers navigation and move selection, descriptions and fork choices,
JSON restoration, file/drop input and file-read races alongside the existing
local-client checks. Both browser runners remain development-only entries.

### October 17, 2026 verification

The prior production-client work was committed first as checkpoint `51fe5f2`.
Review/variant changes were then implemented separately on the same branch.
With Node `v24.19.0` and installed dependencies:

- **572 tests passed across 25 files**, including 21 focused review/study tests.
- Source/tests, Vite configuration and relay TypeScript checks passed; tooling
  formatting, browser build, relay build and Git whitespace checks passed.
- Production-client browser runner: **22 passed; 0 failed**, including move-driven
  variant confirmation/cancellation, stale-dialog rejection, and synchronized
  branch labels and variant selection when stepping/jumping back across nested forks.
- Existing online/harness browser runner: **9 passed; 0 failed**, using local
  relay port 18787. Local review did not change its linear session behavior.
- Actual browser clipboard and JSON download contained the full main game and
  described variant. The native file chooser filled the JSON draft without
  loading it; confirmed loading exported exactly the same study afterward.
- Built/preview entry restored the JSON study and passed move-list navigation,
  keyboard stepping with retained focus, keyboard tab selection and variant
  selection, with no observed browser errors. Both palettes and responsive
  layout remain covered by the production-client browser runner.
- The navigation buttons use larger 26-pixel SVG arrows in 44-pixel targets.
  Next has an arrow and an optional fork indicator, with its accessible label retained.
  Backward fork transitions were also checked in the built preview.

The initial file/drop check exposed a delayed dialog-close event cancelling a
new file read after reopening. Opening/cancelling now invalidates earlier reads
synchronously, and delayed close events only clean up a still-closed dialog.
The regression check passed after this correction. Drag-and-drop is exercised
through browser `File`/`DataTransfer` events; the native picker and download were
also checked directly. No physical-device drag test, screen-reader audit, hosted
CI, dependency installation, public deployment or network release was performed.

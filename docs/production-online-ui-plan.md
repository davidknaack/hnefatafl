# Production online-play UI plan

Approved October 18, 2026. Planned from the `online-play` branch at `bc141c6`.
The implementation now covers O1–O5 locally; see
[production behavior and validation](production-online-client.md). Public relay
hosting and independent-network release checks remain separate handoff work.

## Goal and starting point

Bring the existing create/join online game into the production UI, with optional
screen names, clear connection/recovery controls, and the same polished board,
history, accessibility and responsive behavior as local play.

The agreed initial scope includes read-only review and shared move comments
during play and after a board result, while both players remain in the room.
The user confirmed live review and shared comments on October 18, 2026.
Variants remain a local-study feature.

The existing implementation supplies most of the gameplay infrastructure:

| Existing component | Reuse or gap |
| --- | --- |
| `OnlineGameSession` | Reuse room assignment, seat/turn gating, replay validation, acceptance, reconnect and conflict handling. It currently exposes only the live position, with no names, review or comments. |
| `GameSession` and `SessionOwner` | Keep detached views, capability checks, generation guards and unbind-before-dispose replacement. |
| `src/ui/sessionControls.ts` | Extract its lifecycle/recovery policy from debug markup and command binding; use it from both consumers. |
| `src/client` | Extend the existing production shell, board, dialogs, player cards, history and comments. No framework migration is needed. |
| Online record version 1 | Keep canonical moves and replay checks. It currently excludes comments and player metadata. |
| Online recovery version 1 | Preserve credentials, records, endpoint matching, resume intent and stale-write protection. Add separately versioned presentation/annotation storage. |
| Local studies/autosave | Preserve variants, comments, selected position and the independent local save. Reuse replay/import for local continuation. |

References: [production client](production-client.md), [session API](online-session.md),
[recovery](browser-recovery.md), [online protocol](online-protocol.md),
[local review/comments](game-review.md), [online acceptance](online-acceptance.md).

## Entry and room setup

Keep the current local board as the immediate default. Change **New game** to
open a small chooser with **Local game**, **Create online game**, and
**Join online game**. A pending saved online game also gets an explicit resume
entry. Opening or cancelling setup leaves the current game intact.

**Create online game** asks for:

- **Your name (optional)**, prefilled from this browser's last confirmed name.
- **Your side**: Attackers or Defenders, with a reminder that attackers move first.
- **Create game** and **Cancel**.

**Join online game** asks for the same name and a six-character room code.
Normalize surrounding whitespace and letter case; keep validation errors beside
the field. The joiner receives the remaining side from room assignment.

After creation, show a compact waiting area with the selectable room code,
**Copy code**, **Copy invite link**, the assigned side, and **Leave room**.
The invite contains only the app location and room code. Opening it prefills the
join dialog and still requires a deliberate Join action. It never overrides a
restored game or joins a second room automatically.

If online play has no usable configured relay, show a short unavailable message
in this chooser and retain local play. Relay configuration belongs to deployment;
players should not need to enter a WebSocket address.

When replacing a game or a different saved online seat, explain exactly which
record will be replaced and offer the existing export path. Prepare the new
session separately and adopt it after assignment, so failed creation/join leaves
the current board and previous recovery save available. Cancelling an assigned
but unadopted candidate must explicitly release its room membership.

## Screen names and identity

Names are self-reported display text. They never identify or reserve a player.
There is no availability lookup, uniqueness check, login, or account creation.

- Internally identify a participant by the room's game ID and assigned seat,
  scoped to the relay endpoint. The existing private token resumes that seat.
  No new global player ID is needed.
- Permit identical names, names differing only in case, and changes of name.
  Compare and route players by seat, never by normalized name.
- Use a trimmed optional name of up to 80 Unicode characters. Reuse the existing
  comment-author restrictions on brackets, braces, backslashes and newlines,
  and reject control characters. Explain invalid input without silently changing
  a confirmed name. A blank name displays the assigned side.
- On player cards, always retain the side and a **You** or **Opponent** label.
  For example, `Alex · Attackers · You` and `Alex · Defenders · Opponent`.
  Presence belongs to that seat, even when both cards say Alex.
- A small **Change name** action edits this seat's name and the browser default
  for future rooms. A new name does not take a seat, reset a game or alter past
  comment bylines. Unconfirmed form edits are not persisted or sent.
- Keep the browser default separate from per-game participant metadata. On resume,
  use the name retained for that game; changing a default elsewhere must not
  silently rename a resumed player.
- New online comments retain the author's seat and the name at creation. Render
  side/You context in online bylines so duplicate names remain distinguishable.
  Imported/local comments with only author text stay valid.
- Existing `[name]` mentions remain text highlights. With colliding names they
  are inherently ambiguous; they do not select a unique player, grant ownership,
  or send targeted notifications.

Use plain-text rendering and the current author-name formatting rules. The
shared local board keeps its anonymous comment behavior, since two people share
that browser and one remembered name cannot identify both of them.

## Production layout and game states

Retain the current board and sidebar layout. Make the mode strip dynamic:
**Local game** or **Online game · Room ABC234**. Put room sharing and connection
actions in a compact expandable room panel. Add names and per-seat presence to
the existing Attackers/Defenders cards without removing counts or capture labels.

Keep three independent facts visible: the live turn/result, connection status,
and whether browser recovery has saved successfully.

| Session condition | Player-facing behavior |
| --- | --- |
| Connecting | “Connecting to the room…”; moves disabled; cancellation available. |
| Waiting before the opponent joins | Show the code/invite and “Waiting for another player”; moves disabled. |
| Opponent temporarily absent | “Opponent disconnected. Waiting for them to return”; retain names, record and review. |
| Synchronizing | “Synchronizing game…”; moves disabled. |
| Local move awaiting acceptance | Show the committed move once and “Waiting for opponent to confirm…”; retain it for recovery. |
| Ready, your turn | “Your turn — Attackers/Defenders”; allow moves only through the session's capabilities and at the live position. |
| Ready, opponent's turn | Name plus side identifies who is to move; history/review/comments remain available. |
| Disconnected/error | Retain the board and record; explain the error and offer applicable Reconnect, Save / copy and Continue locally actions. |
| Room closed/expired | Explain that the room cannot resume; retain export and local continuation. Leaving a room is not a resignation or a board result. |
| Game finished | Retain the result and reason, full record, review, export and connected comments. Connection messages cannot replace the result. |

Room-full, room-not-found and seat-in-use errors need distinct useful wording.
A duplicate tab must not evict a live seat. Reconnect resumes the existing room;
it does not silently create another room or enqueue offline moves.

Preserve native dialogs, focus return, keyboard board controls, status
announcements, light/dark palettes and reduced motion. Reserve space for status
changes so reconnects do not repeatedly move the board. Long names and error text
must wrap at the existing 320/390/768/1200-pixel acceptance widths.

## Review and comments during online play

Maintain an independent local review cursor over the canonical online main line.
Seeking must never change the live engine, its turn, its move list or a peer's
cursor. Reuse the review controls and move-list navigation with online behavior:

- At the live end, follow new moves and use the normal move/capture effects.
- When reviewing an earlier move, retain that position as new live moves arrive.
  Show **Reviewing move 8 of 12**, a **Return to live** action, and a new-move
  indicator. Announce if it becomes the player's turn without changing focus.
- Disable board play at historical positions and provide a visible explanation.
  Do not offer Create a variant from the online board. Returning to live is
  required before submitting a move, even if the historical side matches.
- Keep live turn/result information distinct from the historical position's
  side to move. Do not show a historical review position as “Your turn”.
- Retain the existing 500-character move comments, mentions and board-reference
  previews. Either seat may comment on any played main-line move, independent
  of whose turn it is. Comments at the opening remain unavailable.
- Bind a comment to the game and exact canonical move prefix, not just a current
  cursor number. New comments do not navigate the other browser or replay board
  effects. Incoming comments on another move can show a count/indicator.
- Keep comment drafts when another move, comment or name arrives. Explicit
  navigation/replacement should handle a nonempty draft deliberately rather
  than accidentally clearing it through a session publication.
- Distinguish pending/local comments from peer-confirmed comments. While offline,
  retain a draft and allow reading; disable new shared submissions until the
  annotation channel is ready. A disconnect must not erase a submitted comment.

The live session continues to own gameplay. Add a presentation/review adapter
with explicit live and displayed state and a cursor generation. Do not replace
the live session with a `LocalGameSession` whenever the user seeks. Guard both
the observed session generation and the presented position when submitting a
move; clear stale selections on seek, connection loss and replacement.

For variants or local continuation, provide **Continue locally** (or **Open local
study** after completion). Prepare a full replay including names/comments first,
confirm the departure, mark online recovery inactive, then release the connection
and adopt the local study. Its moves and variants stay local and use the existing
local autosave. Disconnecting this tab leaves the peer waiting; explicitly
**Leave room** ends the room for both players and requires wording to that effect.

## Metadata, synchronization and saving

Names and shared comments are additional session features; they cannot be
implemented by changing DOM controls alone. Keep the canonical version-1 game
record and its ancestry/acknowledgement rules unchanged. Add versioned peer
feature messages for participant metadata and annotations through the relay's
existing extensible peer envelope.

Choose the smallest complete feature contract in the first milestone:

- Advertise feature versions so an older debug client can still play moves.
  Where shared comments are unsupported, show that fact and disable shared entry;
  never claim successful delivery to a client that ignores the feature.
- Names are seat-scoped metadata with a revision. Publish on assignment, confirmed
  name change and resynchronization. Missing names fall back to the side label.
- Comments are append-only events with independent event IDs, author seat, name
  snapshot, exact move reference and deterministic ordering. Event IDs identify
  comments, not players. Merge simultaneous additions without duplicate entries
  or replacing one seat's comments with the other seat's snapshot.
- Exchange complete bounded annotation state on initial synchronization and
  reconnect. Include explicit acknowledgement for shared delivery. Bound the
  total annotation state to fit a feature envelope under the existing 64 KiB
  wire ceiling, with count/size preflight and a visible “comment limit reached”
  outcome before committing an addition. Keep the engine record's separate
  60 KiB ceiling. Fix exact annotation limits in the feature contract and tests.
- Handle a comment referring to an as-yet-unreceived move by retaining it within
  bounds until that exact prefix is validated. A branch mismatch must not attach
  it to an unrelated move. Duplicates and reconnects must be idempotent.
- Feature delivery has its own pending status and bounded retry policy. It must
  neither acknowledge a game record nor change the gameplay acceptance state.
  A malformed optional feature cannot adopt a board or erase saved comments.
- Bind newly authored metadata/comments to the assigned socket seat. Recovered
  feature state may contain retained events from both participants. Names never
  authorize a comment or a move; the existing casual trust model remains.

Keep the local-game and credential-bearing online recovery slots separate.
Store names, annotation state, pending delivery and the online review cursor in a
bounded, versioned sidecar keyed by endpoint/game/seat. Older recovery version-1
saves must still open with side-label names and empty annotations. Do not rely on
extra fields that the current recovery decoder discards.

Guard sidecar reads/writes and stale-tab changes as carefully as recovery. Report
game-save and annotation-save failures accurately: one successful write cannot
imply both were saved. A missing/invalid sidecar must not make a valid game or
its credentials unrecoverable; preserve unsupported bytes for backup.

Persist the active mode so a player who deliberately returns to local play does
not automatically rejoin an old room on refresh. Starting online retains the
previous local autosave. Resume an active online game only at its original,
currently configured relay, following the existing endpoint checks. An invite
or archived recovery cannot override this choice silently.

Ordinary Save / copy exports the complete game with seat-name metadata and all
received comments, even while viewing an earlier move. Use the existing portable
author syntax; this is a display snapshot and need not encode unique player IDs.
Local studies retain variants normally. Shared exports and invitation links
contain no seat token. Private recovery backup remains a separate labeled action
and must retain the new sidecar as well as the existing recovery data.

## Implementation milestones

Each milestone should be independently reviewable, with its relevant tests and
documentation. No changes to engine rules or public deployment are needed to
start this work.

| Milestone | Work and completion evidence |
| --- | --- |
| O1 — Lifecycle and feature contracts | Extract reusable session/recovery orchestration from `src/ui/sessionControls.ts`; generalize the production mount beyond `mountLocalClient`. Settle displayed/live state, names, feature acknowledgements, annotation bounds, startup precedence and sidecar format. Both existing consumers retain their behavior; old saves and clients remain usable. |
| O2 — Production room flow and names | Add chooser/create/join/waiting UI, invite/code sharing, participant cards, optional name/change-name, all connection/error states, safe replacement, reconnect/leave and production recovery. Two independent browsers can complete and refresh an ordinary game, including with identical names. |
| O3 — Online main-line review | Add the independent cursor, history navigation, Return to live, new-move indicators and historical-board input guard. Live moves arriving during review preserve the displayed position, current-turn messaging and keyboard focus. |
| O4 — Shared comments and export | Add feature synchronization/merge, pending feedback, authored bylines, profile rename behavior, comment drafts, sidecar persistence, portable export and replay-validated local continuation. Simultaneous comments and reconnects converge without losses or duplicates. |
| O5 — Acceptance and handoff | Extend production browser checks against a real local relay, run the full regression gates, verify built output and update user/deployment docs. Validate public WSS/origins on independent networks when a relay is hosted. |

O2 is the first playable production-online checkpoint. The agreed release scope
finishes O1–O5, including live review and shared comments. O2 alone is an internal
checkpoint rather than completion of the requested online UI.

## Acceptance scenarios

- Create as either side, share code/link, join the remaining side, alternate moves,
  capture and finish. Each browser can play only its assigned live turn.
- Create/join with the exact same screen name. Verify cards, turn messages,
  comment bylines, rename and reconnect use seats. Test empty, Unicode and long
  names, the name limit, invalid delimiters and literal HTML-looking text.
- Refresh one player and both players; restore room/seat/name/record/comments,
  disable moves until gameplay synchronization, and restore review position.
- Review an earlier move while the opponent moves and comments. Keep the cursor,
  draft and focus; show the new move/turn; reject any historical-board move.
- Add comments concurrently, lose acknowledgements and reconnect. Both clients
  retain each comment exactly once in the same order on the correct move.
- Change a name after commenting. Update the player card and future bylines;
  retain old bylines and permit matching opponent names throughout.
- Try an old client, unsupported feature version, malformed metadata, an unknown
  move reference and annotation limits. Preserve valid board state and useful
  recovery, with accurate feature feedback.
- Exercise room-full/not-found, duplicate tab, peer absence, connection loss,
  room closure, relay restart and divergent histories. Preserve exports and
  never silently roll back, recreate a room or resend an engine command.
- Deny storage, exceed quota, corrupt the sidecar and change the configured relay.
  Preserve existing records; never send saved credentials to a different relay.
- Cancel or fail create/join/replacement and retain the existing local study and
  saved online seat. Continue locally, refresh and verify local autosave restores
  it without resuming or publishing the abandoned online branch.
- Save while reviewing the opening. Export every move/comment with names, load
  it into the local reviewer, and inspect shared output for credential absence.
- Check responsive layouts, duplicate/long names, long status text, both palettes,
  keyboard/touch operation, reduced motion and focus retention during updates.

Run the repository's test/type-check/format/build/server-build gates, the expanded
production browser runner with isolated storage, and the existing debug online
runner. Check two independent profiles and a real refresh, clipboard readback and
the built preview. Developer entries must remain absent from production output.

## Separate follow-ups

Resignation needs an explicit online command/record decision: the engine's local
resign method is turn-based and online record version 1 excludes resignation.
Do not label Leave as resign or infer a loss from disconnect. Rematches, negotiated
undo, shared variants, general chat, clocks, spectators, matchmaking and accounts
are separate product work. Public relay hosting remains the documented deployment
handoff, not a prerequisite to implementing or testing this UI locally.

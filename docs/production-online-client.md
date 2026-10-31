# Production online play

The default client supports local play and online rooms. Configure `VITE_RELAY_URL`
for online play; without a usable endpoint local play remains available. The
approved design is in [the implementation plan](production-online-ui-plan.md).

## Playing together

Choose **New game**, then **Create online game**. Enter an optional name, choose
a side and create the room. Attackers move first. Expand room options to copy its
code or invitation. The other player chooses **Join online game**, enters the
code/name and receives the remaining seat. Invitations prefill setup without
joining automatically. Successful joins consume the invitation fragment so
refresh resumes without reopening setup. Failed create/join preserves the board
and previous recovery; a new seat replaces it only after confirmation/assignment.

Names are display text, with no accounts or uniqueness checks. Both players may
use the same name. Side headings and You/Opponent labels distinguish them; game
ID, assigned seat and private credentials identify the session. Names allow up
to 80 Unicode characters, with existing comment-author delimiter restrictions
and no control characters. Empty names fall back to the side. **Change name**
updates this seat and the remembered default for future rooms; historical comment
bylines stay unchanged. Local shared-board entries remain anonymous.

Only the assigned side can play its live turn. Waiting, synchronization and
disconnection pause moves. Unacknowledged moves remain committed once for
reconciliation. Connection, outcome and browser-save status are independent.
Reconnect is deliberate, resumes the same room and never recreates a lost room.

## Live review and comments

Navigation is private to each browser. New moves retain a historical cursor.
**Return to live** reports moves ahead and restores the latest position before
play. The turn heading still describes the live game. Online historical boards
are read-only; variants belong to local studies.

Either connected player can comment on any played move. Simultaneous additions
merge into the same order without duplicates. Bylines retain name-at-creation,
side and You/Opponent context. Mentions are text highlights even when names
collide. References preview independently and never play/acknowledge a move.
A draft pins its move when a live update arrives. Navigation retains online
drafts in memory per move; incoming comments preserve keyboard focus. Drafts do
not survive refresh/replacement; departure confirmations explain this. Offline
players can read and retain a draft, but shared submission needs a compatible
connected peer. Pending delivery is explicit. A lost acknowledgement retries
once; reconnect resends retained annotations without duplication.

Bodies allow 500 Unicode characters. Each seat has a maximum of 64 comments and
a 22 KiB serialized budget including its profile and exact move references. The
combined state is bounded to 48 KiB. Per-seat reservation keeps concurrent valid
additions mergeable. Long canonical prefix references may reach the byte limit
first. Preflight rejects additions visibly instead of silently dropping them.

## Saving and departure

Gameplay keeps the existing `hnefatafl.online.recent.v1` private recovery format.
The token-free `hnefatafl.online.presentation.v1` slot stores names, comments and
the review cursor. `hnefatafl.client.preferences.v1` remembers default name and
active mode. Local studies retain their independent autosave.

Refresh restores the seat/record/presentation; moves wait for gameplay sync and
retained annotations are resent. Older version-1 recovery works without a
presentation copy. Corrupt/unsupported presentation data cannot block valid
gameplay recovery and is preserved for backup. Stale tabs cannot overwrite
another tab's changed copy. Game and annotation save failures are reported
separately. Credentials go only to the original currently configured valid
relay; missing/changed endpoints open review without sending credentials.

**Save / copy** includes the full line, seat-name tags and retained comments on
that canonical line, including while reviewing the opening. It contains no
credentials. **Private recovery backup** packages retained recovery/presentation
bytes, including incompatible data, and contains credentials. It is available in
room options and setup when recovery bytes exist. Keep it private; importing
private backups is not implemented.

**Continue locally** replays names/comments into a local study, disables automatic
online resume and disconnects this browser. The peer waits; local moves never go
online, and normal local variants/autosave apply. **Leave room** closes the room
for both players while retaining review/export. Neither action resigns the game.
Connected players can still comment after a board result. Rooms are ephemeral,
with one recent online seat per origin, and are lost on relay restart. Hosting,
resignation, rematches, shared variants and general chat remain separate work.

## Implementation and validation

`application.ts` composes the production shell and online controls; isolated
`mountLocalClient` has no runtime relay/configuration dependency. `onlineControls.ts`
owns setup, candidate adoption, room actions, startup and presentation persistence.
`SessionRecovery` shares private-save policy with the debug UI, including
unchanged-save and stale-write handling.

`OnlineStudySession` wraps the live `OnlineGameSession`. Its detached views expose
displayed `state` and `liveState`; historical commands are rejected at the session
boundary. The raw session retains engine/transport/game-acknowledgement ownership.
Optional `annotations-v1` snapshots and `annotations-ack-v1` messages use the
existing peer envelope without changing game record version 1. Acknowledgements
correlate game ID and peer message ID. Profiles have seat-scoped revisions;
append-only comments have event IDs, seat/name snapshots, logical order and exact
canonical prefixes. Comment IDs are not player IDs. References appear only after
their exact prefix is in validated live history. Legacy clients still play moves;
shared entry needs positive feature support. Feature failures cannot adopt a board
or satisfy a gameplay acknowledgement.

Run repository test/type-check/format/browser-build/server-build gates. At
`client-acceptance.html`, run local checks and **Run online client checks** with
a loopback relay. Both use isolated storage and actual production markup. Also
run the original `acceptance.html` harness after shared recovery changes.
The online runner covers rooms, duplicate names, turns, captures, private review,
drafts, concurrent comments, rename snapshots, focus, export, restoration, failed
join, local continuation and closed-room review. Real iframe viewports at
320/390/768/1200 pixels cover long duplicate names in both palettes using inert
recovery. These do not establish physical-device or screen-reader coverage.
Developer entries remain excluded from production output.

### October 18, 2026 verification

Using Node `v24.19.0` and installed dependencies, all **606 tests in 30 files**,
the three TypeScript checks, tooling formatting, browser build and relay build
passed. The local production browser runner passed **43 checks**, the production
online runner passed **9**, and the original debug online runner passed **9**,
all with zero failures. Production output contains only app HTML and assets.

The built preview and a separate development origin both used the real loopback
relay. Manual checks covered duplicate Alex names, assigned seats, keyboard and
pointer moves, a capture, a shared authored comment, full clipboard record and
invitation readback, real refresh recovery, and invitation consumption. Updating
an invitation fragment in an already-open app opened setup without replacing
its current room. Final built-page inspection showed no console errors. The
online layout check includes that same-page invitation case in an isolated frame.
No dependency installation, public hosting/deployment, hosted CI, independent
external-network check, physical-device test or screen-reader audit was performed.

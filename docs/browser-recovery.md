# Browser recovery (P7)

The production UI now reuses this gameplay recovery format and adds a separate
names/comments/review sidecar and active-mode preference. Its local continuation
uses local autosave. See [production online recovery](production-online-client.md#saving-and-departure).
The debug-harness behaviors below remain its reference baseline.

The debug UI saves the most recent online game in `localStorage` under
`hnefatafl.online.recent.v1`. There is one slot per browser origin, not a game
library. In this debug harness, local games and moves made after Continue Locally
are not autosaved; use Copy Game to retain those moves. The production local
client has its own [separate autosave slot](production-client.md#local-autosave).

The version-1 envelope contains the relay endpoint, room/game IDs, seat and private
reconnect token, client version, save time, complete canonical record, automatic
resume intent, and an optional conflicting record. The envelope is bounded to
128 KiB; each record retains P2's 60 KiB/2,048-move limits. Nothing is stored on the
relay. Room codes and ordinary Copy Game output never include reconnect tokens.

## Refresh and recovery

Credentials and zero-move records are saved as soon as assignment succeeds. Local
commits (including moves awaiting acknowledgement), adopted records, and inactive
room status are saved synchronously from session updates. Unchanged snapshots are
not rewritten just to change timestamps. The visible recovery status reports
whether saving succeeded; it is independent of connection and board outcome.

On startup the whole stored envelope is checked, the game is replayed into a fresh
engine, and its state/outcome check must match. An active save appears immediately
with moves disabled while its connection/synchronization proceeds. Automatic
reconnect sends credentials only when the saved endpoint matches the currently
configured valid `VITE_RELAY_URL`. A missing, changed or insecure configuration
opens the valid record for review without sending credentials. Software major
version differences warn; successful replay is the compatibility gate.

Both players can refresh while the same relay process retains the room. A duplicate
live seat reports `seat_in_use` and never evicts the first browser. If an old socket
is still awaiting heartbeat cleanup, use Reconnect after it is released; no
unbounded automatic retry loop is added. After relay restart, reconnect reports
room loss but preserves the replayed board and Copy Game. It never recreates a room.

Leave, New Local Game and Continue Locally mark the saved online record for review
without automatic resume. Continue Locally prepares its local replay first and
then disconnects the online owner. After refresh, Review Saved Game can reopen the
archived online record with moves/reconnect disabled; Continue Locally can then
start a separate local continuation. That continuation's moves never go online.
Conflicting histories are retained together with automatic reconnect disabled.

## Failures, replacement and backups

Storage access denial, quota errors, failed readback, corrupt JSON, unsupported
versions, invalid credentials and failed replay do not erase existing data or
replace it with a blank game. Local play remains available. In-memory online play
also continues if a save fails, but refresh recovery is unavailable for those
unsaved changes; the UI says to keep the tab open and Copy Game.

Starting another online game explicitly confirms replacement of any saved slot.
Replacement occurs only after assignment, so a failed connection does not erase
the previous save. Ordinary writes refuse shorter/divergent histories, different
seats, or a slot changed since this instance last read/wrote it. This is a small
stale-write safeguard, not transactional cross-tab coordination. Use one active
online identity per origin; for two-player testing use separate profiles or
`localhost` and `127.0.0.1` origins with both allowed by the relay.

Download Private Recovery Backup saves the retained storage bytes unchanged,
including incompatible data, to a local JSON file. **It contains private room
credentials; keep it private.** It does not upload anything, and it may represent
the last successful save rather than current unsaved moves. Copy Game remains the
credential-free way to share a valid nonempty game. Backup importing and a saved
game library are outside P7. Storage faults are tested through an injected storage
port; production uses browser `localStorage` with all access guarded.

The APIs are in `src/online/recovery.ts`. `RecoveryStore.load()` returns empty,
saved, invalid or unavailable; `save()` returns success/failure without throwing
storage errors. `permitReplacement()` is used only after UI confirmation.
`OnlineGameSession` now accepts `autoConnect: false` for inert review. The UI
session owner handles persistence and refresh orchestration; board rendering and
the relay remain unaware of storage.

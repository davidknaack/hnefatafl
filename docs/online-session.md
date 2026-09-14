# Online session API (P5)

`src/session/OnlineGameSession.ts` implements `GameSession` using the P2 record
codec and P4 relay. It is browser code with no DOM or storage dependency. The
debug UI starts with `LocalGameSession`; P6's `bindSessionControls` owns replacement
when the user creates/joins a room or continues locally.

```ts
const session = new OnlineGameSession({
    endpoint: 'ws://127.0.0.1:8787/relay',
    start: { type: 'create', side: 'attacker' },
})
const unsubscribe = session.subscribe(view => {
    // Render state and capabilities; view.online contains credential-free status.
})
const view = session.getView()
await session.submitMove('D11-D10', view.generation)
// When this owner is replaced:
unsubscribe()
session.dispose()
```

Use `start: { type: 'join', roomCode }` for the other player. Construction opens
the connection immediately, but moves remain disabled until assignment and peer
synchronization finish. Options reject invalid endpoints/limits. Restored input
is replayed before opening a socket; invalid recovery data throws so the caller
can preserve it instead of overwriting it with an empty game.

## Ownership and lifecycle

- `getView()` and subscriber views are detached. `online` reports room/game IDs,
  peer presence, pending acceptance, an error and a nonblocking version warning.
  Tokens are deliberately absent. Board outcome is independent of connection state.
- `getRecovery()` returns a detached `{ endpoint, credentials, record }`, or null
  before assignment. Credentials contain room/game IDs, seat and private token.
  P7's UI owner wraps this in its versioned storage envelope. The session itself does not write storage.
  Never log or share that object. Resume with
  `start: { type: 'resume', credentials: saved.credentials, record: saved.record }`.
- `reconnect()` deliberately replaces the transport and resumes the same seat.
  It clears pending work and runs recovery; it does not reset the game or recreate
  an expired room. There is no background connection retry loop. A closed session
  or retained branch conflict cannot reconnect.
- `leave()` sends explicit leave when connected and closes online play, retaining
  the record. `dispose()` only releases this browser's connection, listeners and
  timers; the relay reserves its seat. Both reject future moves and are idempotent.
- `getConflictRecord()` returns a detached competing record after divergence.
  The local record stays available through `getRecovery()`. Keep both for later
  diagnosis/export. Invalid records never replace the live game.
- `saveGame()` exports portable game text for nonempty games, including after
  disconnect/leave/disposal. Zero-move records are available through `getRecovery()`.
  Import/reset are always rejected online. P6's explicit local continuation
  prepares a local replay, then disposes the online owner before local play.

## Synchronization and commands

Validation, highlights and moves require the assigned side's turn, a nonterminal
board, a present peer and `ready` connection state. Commands use the observed
session generation; asynchronous submission checks it again before committing.
Subscriptions publish lifecycle changes as well as moves. Equal duplicate records
are acknowledged without a new board generation when status is unchanged.

Every local move is first replayed into a candidate complete record. Both outgoing
and relay-wrapped JSON are checked against the wire limit before adoption. Invalid
or oversized candidates leave the live engine untouched. A successful result means
the local move was committed once; it does **not** mean the peer acknowledged it.
The view becomes `syncing` with pending acceptance. If sending fails, that local
extension remains available and the connection becomes `disconnected`.

Acknowledgements must match the current connection, sent message ID, game,
revision, sync ID and current record. A valid single-move peer extension can also
prove acceptance of the pending prefix. Established play checks the peer's turn;
a larger suffix requires a response to a newly requested recovery exchange.
Recovery accepts either side's historical moves after complete replay and prefix
verification. Shorter records never roll back local history. Branches stop online
play and retain both records. Unknown feature messages are ignored; known malformed
messages and wrong identities stop synchronization with an error.

Assignment times out after 5 seconds by default. A synchronization/acceptance
timeout requests and resends the current record once; the next timeout stops the
connection with a synchronization error. It never reruns a move command or grows
an offline queue. Peer absence cancels this deadline and enters `waiting`; a new
presence event starts recovery. Reconnect/dispose invalidates old callbacks,
acknowledgements and timers. Records remain in memory through these transitions.

Transport, message IDs and timers are injectable through `OnlineSessionOptions`
for tests. Production defaults use native WebSocket, UUIDs and normal timers.
`timeoutMs` is configurable; `maxWireBytes` can lower, but cannot raise, the shared
64 KiB limit. Client output buffering is bounded to 256 KiB. The adapter in
`src/online/socket.ts` removes every listener when detached.

The implementation is tested with controlled message ordering/loss and two native
WebSocket sessions against the real relay. P6 adds controls and deliberate reconnect;
P7 adds browser storage and refresh recovery. Production hosting remains later work. See
[relay setup](relay.md), [wire protocol](online-protocol.md), and
[progress](online-play-progress.md).

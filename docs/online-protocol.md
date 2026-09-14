# Lightweight online protocol — version 1

P2 supplies pure contracts/codecs only. Room operations, sockets, session adoption,
retry handling, persistence, and UI integration are not implemented yet.

## Ownership and APIs

`shared/json.ts` and `shared/relayProtocol.ts` have no engine or Node imports.
The relay validates the envelope and membership; peer bodies remain opaque.
`src/online/record.ts` and `messages.ts` belong to the browser/client layer and
use the existing engine for independent replay.

All decoders return `{ success: true, value }` or `{ success: false, error }`.
They accept JSON text or already-parsed JSON values and detach input through a
bounded JSON round-trip. Wire text must be checked before parsing; the text path
does this. The object path is for bounded parsed JSON, not arbitrary class instances.
Additional fields are ignored in known envelopes/records; opaque peer payloads
are retained. Invalid core messages fail rather than becoming unknown features.

| API | Contract |
| --- | --- |
| `createGameRecord(gameId, moves)` | Replay local standard-opening commands, discover captures, and return `{ record, engine }`. Empty commands are valid. |
| `decodeGameRecord(input)` | Validate complete incoming record and replay into a new engine; return `{ record, engine }` only on complete success. |
| `canonicalMove(move)` | Uppercase existing command notation with captures sorted by file then numeric rank, without modifying the input. |
| `compareRecords(local, incoming)` | For validated canonical records, return `equal`, `extends`, `prefix`, `divergent`, or `different-game`, describing incoming relative to local. |
| `decodeClientMessage(input)` | Validate/normalize a client-to-relay envelope, without game semantics. |
| `decodeRelayMessage(input)` | Validate/normalize a relay-to-client envelope. |
| `decodePeerMessage(input)` | Decode a `relayed` envelope and client-owned core body, check game association, and replay game records. Unknown typed features return `type: 'unsupported'`. |
| `acknowledgesRecord(ack, sent, sentMessageId)` | Compare message ID, game ID, revision and sync ID. Caller must additionally check connection generation. |
| `versionWarning(local, remote)` | Nonblocking major-version diagnostic; does not reject a compatible replay. |

`createGameRecord` takes commands, not a mutable engine state or a custom setup.
Use it for a standard-opening online game. It intentionally allows local commands
without capture annotations; the result always includes the full resolved captures.
The receiver rejects omitted, duplicate, or incorrect captures. Equivalent case,
whitespace and capture order normalize to the same record. No third move grammar
is introduced; legacy engine history ordering and portable file notation are unchanged.

## Complete record

```ts
interface OnlineGameRecordV1 {
    formatVersion: 1
    gameId: string
    setup: 'standard-11-v1'
    revision: number
    moves: string[]
    stateCheck: {
        positionKey: string
        outcome: GameOutcome | null
    }
}
```

`revision` equals `moves.length`, including zero. Moves start from the standard
11×11 opening and contain no tags, resignation, pass, or terminal suffix. Outcome
is reconstructed from replay, including repetition. `stateCheck` compares full
piece placement, the **engine state's currentPlayer**, and exact outcome winner
and reason. After a win, currentPlayer remains the mover; do not substitute the
last repetition-history key, which uses the next side. Fixed setup supplies terrain.

The receiver's engine reconstructs counters and repetition history; neither is
trusted from the wire. A supplied outcome never overrides replay. A bad later move
returns failure without exposing its partially played candidate. Only the future
session layer may adopt a successful candidate; no active engine is passed into
these codecs. Record arrays/outcome and candidate engine own separate mutable data.

Encode a returned record with `JSON.stringify(record)` inside the peer envelope.
Decoding always returns normalized data. Compare only decoded/locally-created
records, never raw revisions or unchecked move lists. A greater revision does not
prove ancestry; branches are `divergent`. Equality also checks the final state check.

## Wire envelopes

Every envelope includes `protocolVersion: 1`, `messageId`, and `clientVersion`.
IDs contain 1–64 ASCII letters/digits/underscore/hyphen. Generate new message IDs
per transmission; keep a pending send associated with its exact record. Client
software metadata comes from `CLIENT_VERSION` in `src/online/clientVersion.ts`,
injected by Vite/Vitest from `package.json`. Non-Vite consumers must supply this
build constant or their own metadata; the module has no runtime Node dependency.

Unknown protocol/record versions fail explicitly. Software version differences
do not themselves fail: major differences can warn, and replay/state checking
decides compatibility. `setup` is an opening identifier, not a pinned rules version.

Client-to-relay types:

| Type | Additional fields |
| --- | --- |
| `create` | `side: 'attacker' \| 'defender'` |
| `join` | `roomCode` |
| `resume` | `roomCode`, `gameId`, `token` |
| `leave` | None; socket membership determines the room |
| `peer` | `body: { type, payload }` |

Room codes are six letters/digits 2–9, normalized to uppercase. The relay can
generate codes from a smaller alphabet to avoid ambiguous letters. Tokens are
opaque URL-safe strings up to 256 characters; randomness/issuance belongs to P4.

Relay-to-client types:

| Type | Additional fields |
| --- | --- |
| `assigned` | `requestId`, `roomCode`, `gameId`, `seat`, private `token` |
| `presence` | `gameId`, `peerConnected: boolean` |
| `relayed` | `gameId`, socket-derived `senderSeat`, `body` |
| `error` | `requestId`, bounded `code`, bounded `message` |

The relay must derive `senderSeat`/game membership from the established socket;
decoding a client message drops claimed top-level sender/game/token fields from
a `peer` request. Only `resume` consumes a token. Do not forward assignment tokens.
Shape checking is not authentication or membership enforcement.

For `relayed`, preserve the original peer envelope's message ID and the peer's
established client version. Other relay-originated messages use the relay build
version and a new relay message ID. Assignment/error `requestId` refers to the
client control request; for a malformed request without a usable ID, P4 can use
the reserved diagnostic ID `unknown`. Error codes are extensible (e.g.
`room_not_found`, `room_full`, `seat_in_use`, `invalid_token`, `room_closed`).

## Core peer bodies and examples

Create and join (each line is an independent message):

```json
{"protocolVersion":1,"messageId":"create-1","clientVersion":"1.0.0","type":"create","side":"defender"}
{"protocolVersion":1,"messageId":"join-1","clientVersion":"1.0.0","type":"join","roomCode":"ABC234"}
{"protocolVersion":1,"messageId":"assigned-1","clientVersion":"1.0.0","type":"assigned","requestId":"create-1","roomCode":"ABC234","gameId":"game-1","seat":"defender","token":"private-seat-token"}
{"protocolVersion":1,"messageId":"error-1","clientVersion":"1.0.0","type":"error","requestId":"join-1","code":"room_full","message":"Both seats are occupied"}
```

Begin a recovery exchange by sending this body through `type: 'peer'`:

```json
{"type":"sync-request","payload":{"gameId":"game-1","syncId":"sync-1"}}
```

Reply with `type: 'game-record'` and payload `{ record, syncId: 'sync-1' }`.
For ordinary play, `syncId` is explicitly `null`; omission is invalid. A concrete
empty record message can be constructed without inventing a board signature:

```ts
const created = createGameRecord('game-1', [])
if (!created.success) throw new Error(created.error)
const message = {
    protocolVersion: 1, messageId: 'record-1', clientVersion: CLIENT_VERSION,
    type: 'peer',
    body: { type: 'game-record', payload: { record: created.value.record, syncId: 'sync-1' } },
}
const wireText = JSON.stringify(message)
```

After successful replay/adoption, acknowledge the original record message:

```json
{"type":"record-ack","payload":{"gameId":"game-1","revision":0,"recordMessageId":"record-1","syncId":"sync-1"}}
```

An acknowledgement does not contain a game record or prove that a socket send
was accepted. P5 must correlate it against the pending message's exact record
and live connection generation. Clear pending sends on connection replacement;
old acks cannot make a new session ready. The sync ID is echoed, not invented by
the responder. Concurrent recovery requests can be answered independently using
their respective sync IDs. Duplicate records can be acknowledged again without
reapplying a move. A valid extending record can also prove acceptance of its
prefix; that state-machine behavior remains P5.

Unknown body types such as `chat` retain arbitrary JSON payloads through relay
decoding. Client core decoding returns an unsupported feature result and leaves
handling to a future feature; it does not disconnect the room. Known core type
names with invalid payloads are errors and must not be ignored as future features.

## Bounds and remaining integration responsibilities

- Maximum wire JSON: 64 KiB in UTF-8 bytes, checked before parsing text.
- Maximum record JSON: 60 KiB, reserving envelope space inside the wire limit.
- Maximum moves: 2,048; command length: 512 characters. These are limits, not a
  promise that every combination of maxima fits the total byte budget.
- Feature names: up to 64 lowercase letters/digits/hyphens, starting with a letter.
  Error text: 512 characters; software version strings: 64 characters.

P4 must enforce the same byte limit on incoming and forwarded envelopes, bind
socket identities, issue tokens/IDs, and implement room lifecycle/resource limits.
Unknown peer payloads near the full limit can grow when wrapped for forwarding;
check the final forwarded size rather than assuming incoming size is sufficient.
P5 must preflight the complete prospective move record/envelope before committing
live state, gate actions by seat, handle stale/duplicate/branch records, require
current-connection acknowledgement, and adopt candidates atomically. P7 adds
storage-envelope versioning and recovery. None of those behaviors are claimed
by P2's pure shape/replay tests.

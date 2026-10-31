# Lightweight Online Play — General Specification

## Purpose

Add lightweight online multiplayer support to the Hnefatafl application so that two people on different computers can easily play a game together.

The intended experience is deliberately informal:

* the players already know each other;
* one player creates a game;
* the application provides a short game identifier;
* that identifier is shared out-of-band through text, chat, voice, etc.;
* the second player joins using that identifier;
* both players can then play the game through the normal player-oriented UI.

The goal is to make remote play feel almost as lightweight as opening the application locally and handing someone the other side of the board.

This is **not intended to be a traditional online game platform**.

The server should be small, disposable, and easy to replace later if the project grows into something requiring more sophisticated infrastructure.

---

## Architectural Vision

The existing Hnefatafl engine runs in the browser and is intended to contain the authoritative implementation of game rules and move validation.

Online play should preserve that architecture.

The server should primarily provide:

* temporary room creation;
* connection of two peers;
* lightweight identification of each peer within a room;
* message relay between those peers;
* basic connection and room lifecycle handling.

The server should **not become the Hnefatafl engine**.

In particular, the server does not need to:

* understand board positions;
* validate moves;
* calculate captures;
* determine whose turn it is;
* determine game results;
* reconstruct games;
* store authoritative game histories;
* persist completed games.

Both clients have the game engine and are capable of validating and replaying the game themselves.

The server should therefore be thought of as an **ephemeral two-peer communication and synchronization service**, rather than as a game server.

---

## Trust Model

The initial feature is designed for casual games between people who already have some level of trust.

There is currently no requirement to defend against:

* cheating;
* malicious clients;
* falsified moves;
* tampered histories;
* alternate client implementations;
* ranked-play abuse;
* denial-of-service beyond reasonable basic safeguards.

The implementation should not introduce major architectural complexity in anticipation of those concerns.

If future requirements include ranked games, public matchmaking, persistent accounts, competition, or untrusted clients, a more authoritative server architecture can be introduced at that time.

---

## Game Synchronization Model

Clients should exchange the **complete current game record**, rather than only individual move deltas.

Hnefatafl game histories are very small, generally hundreds of bytes and unlikely to become more than a few kilobytes even in unusually long games. Optimizing this traffic is therefore unnecessary.

A complete game update gives several useful properties:

* each message is largely self-contained;
* the receiving client can reconstruct the board by replaying the game;
* missing an earlier message is much less significant;
* reconnecting or refreshed clients can recover state from the other player;
* history divergence can be detected;
* future protocol extensions can use the same mechanism;
* debugging synchronization problems is easier.

The exact serialization and message format are implementation details and may be designed as appropriate.

The important semantic concept is:

> A client sends its current game record, and the receiving client independently verifies and reconstructs that game using its local engine.

Normal play will generally result in the received game being the receiver's existing history plus one new move, but the communication model should not depend exclusively on incremental updates.

---

## Client Version Information

Messages representing game state should include enough client metadata to identify the software version that produced them.

This is primarily intended for diagnostics and compatibility warnings.

The project can initially rely on normal semantic-versioning conventions rather than maintaining a detailed compatibility matrix.

A version difference should not automatically imply that two clients cannot communicate.

Actual compatibility is better determined by whether the receiving client can successfully load, validate, and replay the received game.

If versions differ substantially, particularly across major versions, the UI may warn the players that incompatibility is possible.

---

## Reconnection and Browser Refresh

Online games should tolerate simple browser refreshes and temporary connection loss where practical, without requiring server-side game persistence.

Clients should keep useful local session information in browser local storage, including their current game history and whatever connection/session information is appropriate.

When a client reconnects, the two peers may exchange their current complete game records and recover synchronization.

The initial implementation does not require sophisticated conflict resolution.

The intended trust model allows simple policies, such as treating the continuously connected player's state as the preferred state when a reconnecting client needs to recover.

If histories cannot be reconciled cleanly, the application may report a synchronization problem rather than attempting distributed conflict resolution.

Local storage also provides useful protection if the server disappears entirely: the player should still retain their game record for local review or continuation.

---

## Room Model

Rooms are temporary and exist only to connect two players.

A typical workflow is:

1. Player A creates an online game.
2. The service provides a short human-friendly game identifier.
3. Player A communicates that identifier to Player B out-of-band.
4. Player B joins the room.
5. The service associates the two active clients with that room.
6. Messages are relayed between them.
7. The room eventually expires after the game ends or the players leave.

The service may retain minimal ephemeral information needed to operate the room, such as:

* active connections;
* room identifier;
* peer/session identifiers;
* side or role assignment;
* reconnect information;
* last activity time.

This is operational session state, not persistent game state.

No database should be required for the initial system unless some unexpectedly compelling implementation constraint makes one necessary.

---

## Player Identity

Accounts and authentication are explicitly out of scope.

The system may still use opaque temporary tokens or similar mechanisms internally to distinguish the two clients, support reconnection, or prevent accidental duplication of a player's slot.

Such mechanisms should remain invisible or nearly invisible to the user.

The user-facing identity model should remain essentially:

* this game;
* this side;
* the other player.

---

## Side Assignment

The application should support determining which player controls attackers and which controls defenders.

The exact UX may be chosen during implementation.

Possible approaches include:

* creator chooses a side;
* joining player receives the remaining side;
* side assignment is randomized;
* creator selects "random."

The architecture should not assume that one particular side always creates the game.

---

## General Peer Messaging

The online communication layer should not be designed solely around game-state synchronization.

It should support lightweight typed messages between the two peers so that future player-oriented features can be added without redesigning the server.

Examples include:

* current game record;
* ping / latency information;
* chat messages;
* resignation;
* draw or end-game acknowledgement if later useful;
* undo request;
* undo response;
* rematch request;
* rematch response;
* presence/status information;
* synchronization request;
* other UI-level interactions.

The server generally does not need to understand the semantics of these messages.

Where practical, it should behave as a generic relay.

This is an important extensibility goal: many improvements to the online player experience should be implementable entirely in the client while continuing to use the same simple server infrastructure.

---

## Undo and Analysis

Local games may allow unrestricted undo, replay, and branching as part of analysis.

Online games are different.

A player should not be able to silently rewrite the shared game history.

If online undo is later added, it should be modeled as a social interaction between the players, for example:

* one player requests that one or more moves be undone;
* the other player explicitly accepts or declines;
* if accepted, both clients adopt the revised shared game.

The communication system should be capable of supporting this kind of feature, but sophisticated online undo behavior does not need to be implemented as part of the initial multiplayer work unless it naturally fits.

---

## Failure Philosophy

The system should prefer understandable failure over complex recovery.

For example:

* if a received game cannot be replayed, report a synchronization or compatibility error;
* if peer histories unexpectedly diverge, warn rather than attempting elaborate automatic merging;
* if a temporary room disappears, retain the local game and allow the user to continue or save it locally;
* if the other player disconnects, make that state clear in the UI.

The expected environment is casual and trusted enough that rare failure states can be handled manually.

The architecture should not grow significantly merely to eliminate every possible failure mode.

---

## Relationship to the Local Game Model

Online play should reuse the same underlying game and board UI used for local play wherever possible.

The UI should not contain separate implementations of Hnefatafl for local and online games.

Instead, online play primarily changes:

* which side the local player is allowed to control;
* where updates from the opposing side originate;
* whether history-changing operations are allowed;
* whether peer communication features are available.

The board should ideally ask the surrounding session logic whether the local user may act, rather than embedding assumptions about online mode directly into board behavior.

This will also make future AI support easier.

---

## Future AI Compatibility

AI play is out of scope for this work, but the architecture should not make it difficult to add.

Two future AI modes are anticipated:

### Local AI

An AI engine runs entirely in the browser and controls one side.

### Hosted AI

A more capable AI engine runs on remote infrastructure and controls one side.

From the player UI's perspective, these should eventually resemble other controller types rather than requiring fundamentally different board behavior.

A useful long-term conceptual model is that each side of a session is controlled by something such as:

* local human;
* remote human;
* local AI;
* remote AI.

There is no requirement to implement this abstraction formally now, but new multiplayer architecture should avoid making it difficult to introduce later.

---

## Persistence

Persistent server-side game storage is out of scope.

Clients should retain useful recent game/session data locally in the browser.

Completed games may be:

* copied;
* saved locally;
* reviewed locally;
* used as the basis for analysis.

A future server may add durable game storage, user accounts, game libraries, correspondence play, or other persistent features.

Those possibilities should not influence the initial design enough to undermine the lightweight nature of the current system.

---

## Non-Goals

The initial online feature does not need:

* user accounts;
* authentication;
* profiles;
* friend lists;
* matchmaking;
* public game browsing;
* ratings;
* rankings;
* tournaments;
* spectators;
* server-authoritative rules;
* server-side move validation;
* anti-cheat systems;
* persistent game storage;
* correspondence games;
* sophisticated conflict resolution;
* compatibility matrices;
* extensive moderation systems;
* a general-purpose game backend.

These features may be reconsidered later if actual product needs emerge.

---

## Design Principle

The guiding principle is:

> Make it extremely easy for two people who already know each other to play Hnefatafl together online, while adding as little permanent infrastructure as possible.

Prefer straightforward client logic and a small disposable relay service over building infrastructure for hypothetical future requirements.

The client already contains the game engine and should remain responsible for understanding Hnefatafl.

The server exists primarily to help two browsers find each other and exchange information.

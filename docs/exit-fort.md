# Defender win by exit fort

The king must currently be on a board edge and have at least one legal move.
Otherwise no exit-fort evaluation is needed.

With the defenders and king fixed in place, successively remove every defender
that attackers could legally capture. Recompute attacker access after each round
of removals. The defenders win only if the surviving formation still separates
every attacker from the king. Reaching the king means obtaining a navigable route
to it; attackers do not have to prove they could capture the king.

Capture capacity is structural. Attackers may be supplied in unlimited numbers
anywhere in their accessible regions, regardless of their exact current squares.
There is no search for a sequence of setup moves, and defenders never voluntarily
leave the formation. Both ordinary captures and shieldwalls apply.

The barrier can include the board edge and restricted board features. Defenders
need not be connected or adjacent to the king. Capturable defenders do not spoil
a fort if their removal leaves the king isolated. An attacker in a separate
sealed pocket also does not spoil it, unless captures eventually open a route
from that pocket to the king.

## Access and capture semantics

- Actual attacker squares seed the accessible regions. Attackers do not obstruct
  each other during this structural analysis. Relocating an attacker within the
  same region or changing its region's attacker count does not change the result.
- An empty restricted square can be crossed in a straight line, as in the move
  validator, but an attacker cannot stop or turn there. Restricted squares can
  still provide hostile capture support under the normal capture rules.
- Captures must admit a legal final attacker move. The evaluator supplies all
  accessible supporting attackers, clears each possible arrival ray, and asks
  the same capture evaluator used by actual moves what that move would capture.
  This checks capture legality without searching the future game tree.
- For synthetic positions with zero attackers, hypothetical attackers seed the
  regions outside the king's region under attacker movement rules. At least one such usable square
  must exist; an otherwise empty board is not an exit fort.

## Implementation and regression examples

`src/exitFort.ts` works on copies of the board. Each successful removal round
strictly reduces the number of defenders, so evaluation terminates. It can return
false as soon as access reaches the king: later removals cannot close that route.
The public `defendersHaveFort` export remains available from `src/utils.ts`.

`src/captures.ts` is shared by fort analysis and normal moves. Shieldwall scanning
uses the four actual board edges; it must not join opposite edge squares into
fictitious rows or columns. `src/rules.ts` preserves its existing capture exports.

The tests include these two nontrivial cases (`R` is restricted, `T` is the throne):

```text
Recursive ordinary captures    Shieldwall breakthrough
RADDR                          RADDR
..D..                          D.R..
.DT..                          .DT.D
DD.DD                          DD.D.
RDK.R                          R.K.R
```

In the first, capturing the defender left of the throne opens the right pocket.
That makes the defender above the throne capturable; removing it opens a route
through the throne to the king. A single capture-removal round misses the loss.

In the second, the two top defenders resist ordinary capture but can be captured
as a shieldwall. Removing them opens a straight route down through the two
restricted squares to the king. Ignoring shieldwalls incorrectly awards a win.

Fort fixtures are checked on all four edges and reflected to catch directional
errors. Tests also verify that hypothetical captures never mutate the real board.

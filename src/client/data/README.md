# Test game corpus

`copenhagen.csv` is copied unchanged from the supplied reference checkout,
`Hnefatafl-DCampbell/tests/copenhagen.csv`. The reference project's `REUSE.toml`
marks this file `CC0-1.0`, with `SPDX-FileCopyrightText = "NONE"`. Its test reader
identifies the records as aagenielsen.dk game records. No reference engine code
is included.

SHA-256: `321cc3657ddddc148085dea01ab6f0dd55dce7a9966d0fff81d5a05b02bd1764`.

There are 1,752 nonempty rows, without a header. User-facing Game 1 is row 1;
retain this order and do not filter records based on the current engine's rules.
Some records have known replay disagreements with this engine, documented in
the September 5 project review. Selection only copies a row into the import
draft; normal complete replay validation still happens on Load game.

Each row includes move notation followed by capture totals and a result label.
The existing import adapter accepts those CSV summaries and derives the actual
state/result from replay. The file is emitted as a separate Vite asset and
fetched on demand, not bundled into the initial application JavaScript.

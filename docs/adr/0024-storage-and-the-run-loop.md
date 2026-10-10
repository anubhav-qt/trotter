# 0024. One SQLite database, and a run loop that stores everything as it happens

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · depends on [0003](0003-run-on-the-owners-pc.md), [0005](0005-pi-fork-and-cliproxyapi.md), [0007](0007-tauri-app-and-separate-processes.md), [0012](0012-auditor-chat.md), [0013](0013-trader-chat-per-stock-and-trade-master.md), [0014](0014-every-chat-compacts-itself.md), [0021](0021-reuse-proven-open-source.md), [0023](0023-the-shared-data-format.md)

## Context

The agents need somewhere to keep their chats, runs, transcripts, the action log and every version of every record ([0023](0023-the-shared-data-format.md)), on the owner's PC ([0003](0003-run-on-the-owners-pc.md)), readable by the harness and the engine, which run as their own processes ([0007](0007-tauri-app-and-separate-processes.md)). The version order that 0023 left to storage has to be enforced there.

## Decision

**The database**

- One SQLite file (under `data/`, which git ignores), opened through Node 24's built-in `node:sqlite`, in WAL mode so other processes can read while one writes. Writes take the lock up front (`BEGIN IMMEDIATE`) and wait up to 5 seconds for another process's write.
- `packages/store` (`@trotter/store`) is the only code that touches it. Each row keeps its whole object as JSON, checked with `checkValue` on the way in and on the way out; the other columns are copies kept for lookups and constraints.
- Tables change only through numbered migrations, applied in order and tracked with SQLite's `user_version`. A database newer than the code is refused, not changed.

**What the database enforces**

- Records, transcripts and the action log are only ever added to: triggers refuse any update or delete, raw SQL included.
- A change, a retirement or a rejection names the version it was made from, which must still be the latest; if the record has moved on, nothing is stored and the writer reads it again. The kind never changes, and a change after version 1 must say why.
- An undo copies an earlier version's body and status into a new latest version and names the version it put back.
- One trader chat per stock (by ISIN), one chat each for the Trade Master, Lessons and the Auditor, and one run at a time per chat. Runs still going when the harness starts were cut off when it last stopped, and are marked interrupted.

**The run loop** (`harness/src/run-chat.ts`, on the forked pi agent loop)

- A run starts from the chat's whole transcript plus a new opening message, and ends done, failed (with the error), stopped or interrupted.
- Every message is stored as it ends and every tool call is logged as it finishes, so a run cut off halfway still leaves its record. The system prompt is kept on the run, not in the transcript, since it's rebuilt for every run; the Auditor can read what the chat was told each time.
- The action log entry for a call holds its arguments, the model's visible thinking and text in the message that made it, the result, and the records the tool read and wrote, as the tool reports them.
- Tool arguments are checked with `checkValue` before the tool runs, in place of pi's coercion (which turns a missing number into 0). A call that fails never runs, and the model gets every problem back.
- Tool calls run one at a time, in the order the model made them.

**Considered**

- Postgres, as in Seelie: a server to run and look after, for one PC.
- better-sqlite3: proven and almost the same API, but a native module to install for each Node version. It's the fallback if `node:sqlite` (stability 1.2, release candidate, in Node 24) changes.
- DuckDB: built for analysis over columns, such as years of prices; it may hold the engine's price history later, but not these records.
- Plain JSON files: no transactions or constraints, so the version order couldn't be enforced.
- An ORM such as Drizzle: another layer over SQL that is short enough to read as it is.

## Consequences

- Compaction ([0014](0014-every-chat-compacts-itself.md)) isn't built yet, so for now a run reads its chat's whole transcript.
- The prompts a run takes come from the templates in `prompts/` once they exist ([0020](0020-prompts-as-nunjucks-templates.md)); the run loop has no prompt text of its own.
- Backing up Trotter means backing up the database file; SQLite's online backup works while it runs.
- If the engine's price history outgrows SQLite, it moves to its own store; the records stay here.

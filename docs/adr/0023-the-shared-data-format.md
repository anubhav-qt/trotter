# 0023. The shared data format: versioned records, handovers and one check

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · depends on [0004](0004-typescript-everywhere.md), [0009](0009-one-workspace-biome-node-test.md), [0012](0012-auditor-chat.md), [0013](0013-trader-chat-per-stock-and-trade-master.md), [0014](0014-every-chat-compacts-itself.md), [0018](0018-agents-hand-over-json.md), [0019](0019-agents-nominate-stocks.md), [0022](0022-trader-chats-take-their-time.md)

## Context

The harness, the engine and the app pass records to each other, and the agents hand each other JSON ([0018](0018-agents-hand-over-json.md)). The format has to be defined once ([0004](0004-typescript-everywhere.md)), in a shared package ([0009](0009-one-workspace-biome-node-test.md)).

## Decision

- **`packages/schemas`** (`@trotter/schemas`) holds the typebox schemas, and one `checkValue` that every boundary uses. It returns the value typed, or throws a `SchemaError` listing every problem with its path, which a tool hands back to the agent so it can fix its handover.
- **Closed objects**: a field the schema doesn't name is an error, so a misspelt field is caught instead of silently dropped.
- **Stocks are keyed by ISIN**, with the symbol alongside for reading. The ISIN is the same on NSE and BSE and survives a rename, so a company listed on both has one trader chat. Code checks the pair against the engine's list of stocks.
- **Versioned records**: everything an agent writes is a version of a record: its id, version number, kind, status (active, retired, rejected, disputed), when it was written, who wrote it (a chat with its run and model, a data tool's model call, code, or the owner), why it changed, and on an undo which version it puts back. Nothing is overwritten; a change, a retirement or an undo is a new version.
- **Chats, runs and the action log**: a chat has a role, and a trader chat its stock. A run records what woke the chat (a schedule, or records such as news, a brief or a plan coming due) and the model it ran on. The action log keeps every tool call with its arguments, reasoning and result, the records the chat had seen and the ones it wrote.
- **Handovers**: briefs, findings, lessons, nominations, trader decisions, questions and answers, sector notes, patterns, and compaction summaries. A trader decision is act now (with its orders), plan and wait (with what it's waiting for and when to wake it: a time, or the price reaching a level), or do nothing ([0022](0022-trader-chats-take-their-time.md)). A question goes to a chat by its role, or to a trader chat by its stock.
- **Facts from data tools** are versioned records that also say when they became known and where they came from (source URL, when fetched, when published).
- **Added later, with what uses them**: each kind of fact (prices, news analysis, filing figures) with its data tool; questions to the news and filings analysis with that analysis; the engine's messages (orders, scores, positions, budgets) with the engine.

## Consequences

- A new kind of handover or fact is a schema here, a prompt template ([0020](0020-prompts-as-nunjucks-templates.md)) and their tests.
- Records cite each other by exact version, so what an agent saw can always be read back as it was.
- Storage must keep every version and enforce the order between them (each version follows the last, an undo points back): checked in code when storage is built.

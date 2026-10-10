# 0014. Every chat saves, then compacts itself at 400,000 tokens

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · depends on [0010](0010-lessons-from-losses.md), [0012](0012-auditor-chat.md), [0013](0013-trader-chat-per-stock-and-trade-master.md)

## Context

Every Trotter chat is long running: a trader chat lives for as long as its stock does, and the Trade Master runs every hour. Each run adds to the context. Past a point the context gets slow, uses up the subscription limits, and the model gets worse at using it. The owner set the limit at about 400,000 tokens.

## Decision

- **Every chat compacts**: trader chats, the Trade Master, the Lessons chat and the Auditor.
- **When**: before a run, if the chat's context has reached 400,000 tokens, or 60% of its model's window if that is smaller (a model with a 200,000 token window compacts at 120,000). Both numbers are settings. If a single run crosses the limit, the chat compacts at the next step boundary, never in the middle of a tool call.
- **Step 1, save**: the chat gets one turn to store, through its normal tools, anything not stored yet: notes, data it gathered, things it meant to do ("check again after Thursday's results"), open questions. Most of it is already stored as it happens; this catches the rest.
- **Step 2, summarise**: the chat writes a very small summary, under about 2,000 tokens, in fixed sections checked by a schema:
  - so far: a few lines on what has happened;
  - learnings;
  - feedback it received (Auditor findings, Trade Master briefs, lessons);
  - do's and don'ts;
  - immediate next steps.

  An earlier summary is folded into the new one.
- **No numbers carried over**: prices, positions, P&L and scores come from the engine at the next run, never from a summary.
- **Step 3, continue**: the chat goes on from its instructions, the active lessons, its notes and the summary. The full transcript stays in storage. Compaction only shortens what the model reads; the Auditor and the Lessons chat can still read every message.
- **The summary is a versioned record**: the Auditor checks it like any other change (a dropped finding, a made up fact) and can put the previous one back.

Seelie's `compact.ts` works the same way at 60% of the window but keeps the last 3 runs word for word. Trotter keeps none, as the owner asked, because the save step and the next steps section carry whatever was in progress.

## Consequences

- If the save step or the summary fails, the chat stays as it was, the run goes ahead, and compaction is tried again before the next run. A chat that would overflow its model's window stops and reports in the app instead of silently losing context.
- A 400,000 token context is sent on every model call. Prompt caching softens that, but if the subscription limits start to bite, the limit is the first setting to lower.

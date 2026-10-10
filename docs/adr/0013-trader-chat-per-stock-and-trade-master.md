# 0013. A trader chat for every stock, and a Trade Master over them

Status: Accepted; amended by [0022](0022-trader-chats-take-their-time.md), [0025](0025-budgets-learn-in-paper-trading.md)
Date: 2026-10-11

See also: [ADR index](README.md) · depends on [0006](0006-agent-picks-engine-enforces.md), [0010](0010-lessons-from-losses.md), [0011](0011-fully-autonomous-agent.md), [0012](0012-auditor-chat.md) · amends [0006](0006-agent-picks-engine-enforces.md) and [0012](0012-auditor-chat.md) · depended on by [0014](0014-every-chat-compacts-itself.md)

## Context

[0006](0006-agent-picks-engine-enforces.md) had one trading agent. The owner wants a separate chat for each stock, so each one builds up its own history with that stock, and a Trade Master that watches all of them and looks for patterns no single chat can see.

## Decision

**A trader chat per stock**

- Every stock gets its own long-running chat the first time it makes the shortlist. It stays dormant while the stock is neither held nor shortlisted, and wakes with its history when the stock returns.
- It runs after the close whenever its stock is shortlisted or held, and on events for that stock: its news, a large price move, its results, an Auditor finding or a Trade Master brief.
- It decides whether to trade its stock, and sizes and times the trade. Its order tool is bound to its stock and has no symbol argument, so it can't trade anything else.
- The engine splits the capital into a budget per stock, in code, from the hard limits and the scores. A trader chat sizes within its stock's budget.
- The engine checks orders one at a time against every hard limit, so chats running side by side can't breach a limit together.
- Only trader chats place orders. This replaces "only one agent ever trades" in [0012](0012-auditor-chat.md).

**A Trade Master chat**

- It watches every trade, open and closed, paper and live, and the reasoning of every trader chat.
- It runs every hour while the market is open, and once after the close.
- Its jobs:
  - Sort good and bad trades by sector, industry and type of company (size, PSU or private, exporter, rate sensitive), and find what is working and what isn't.
  - Read the sentiment and news for every sector and company involved, and spot a trend building in a sector or a type of company.
  - Find hidden concentration: positions in different sectors that share one driver, such as crude, the rupee, interest rates or US tech spending.
  - Judge the market regime (trend, India VIX, breadth, FII/DII flows) and whether it suits the trades being taken.
  - Catch inconsistency: two trader chats reading the same news in opposite ways, or one ignoring a lesson the others follow.
  - Compare the engine's scores with outcomes, sector by sector, and report when they stop predicting. It never changes the engine; the report is for the owner and for retraining.
  - Keep a calendar of sector results seasons and policy dates (RBI meetings, the Budget), and wake the affected trader chats ahead of them.
- More jobs get added over time, each recorded in an ADR.
- What it writes:
  - sector and theme notes, with their evidence, which trader chats read for their stock's sectors;
  - briefs to particular trader chats, which must act on them or explain why not in their next run;
  - patterns from winners and losers, sent to the Lessons chat.
- Same bounds as every agent: it never places orders, never changes the hard limits and never asks for approval. Its notes and briefs are versioned records the Auditor reviews like any other change.

## Consequences

- Many chats share the subscription limits; the local GPU models do the bulk news work.
- Storage needs chats as records: each has a role (trader, Trade Master, Lessons, Auditor) and, for a trader, its stock.
- The Lessons chat now learns from winners too, through the Trade Master's patterns. There is still one shared set of lessons; a lesson can name the sectors it applies to.

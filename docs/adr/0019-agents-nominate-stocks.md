# 0019. Agents can nominate stocks for the shortlist

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · amends [0006](0006-agent-picks-engine-enforces.md) · depends on [0013](0013-trader-chat-per-stock-and-trade-master.md), [0017](0017-trade-any-listed-stock.md), [0018](0018-agents-hand-over-json.md)

## Context

With every listed stock in play ([0017](0017-trade-any-listed-stock.md)), the engine's scores alone would miss a story they haven't caught yet: a small company's big order in a regional paper, say. The owner wants the agents' reasoning to find stocks too.

## Decision

- **The shortlist has two sources**: the engine's scores, and nominations from agents.
- **Who nominates**: the Trade Master, the news and filings analysis, and trader chats (for a competitor, supplier or customer they came across).
- **A nomination is a handover** ([0018](0018-agents-hand-over-json.md)): the stock, the evidence (the records behind it), the horizon, how long it stays nominated, and the reasoning as free text.
- **A nominee gets a trader chat** like any shortlisted stock. The engine still scores it, sets its budget and applies every hard limit. A low score doesn't block a nominee, but its trader chat sees the score.
- Nominations are versioned records the Auditor reviews.

## Consequences

- Code compares how nominated stocks do against score-shortlisted ones, so it's measured whether nominations add value, and which agents nominate well.
- Nominations per day are capped (a setting), so they can't flood the subscription limits.

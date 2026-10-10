# 0025. Budgets learn per stock in paper trading, then come down to ₹1 lakh

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · amends [0013](0013-trader-chat-per-stock-and-trade-master.md) · depends on [0002](0002-scope-nse-swing-paper-first.md), [0006](0006-agent-picks-engine-enforces.md), [0011](0011-fully-autonomous-agent.md), [0017](0017-trade-any-listed-stock.md)

## Context

[0013](0013-trader-chat-per-stock-and-trade-master.md) has the engine split the capital into a budget per stock from the hard limits and the scores. The owner wants Trotter to learn over time which stocks deserve more money and which less, and to learn it in paper trading before real money is at stake, then see how that split works at the real budget of ₹1 lakh.

## Decision

- **Budgets learn from results**: the engine's split also weighs how trading each stock has gone for Trotter, so stocks that trade well get more money and stocks that don't get less. Code calculates it from the trades on record, like every budget.
- **Paper trading has two phases**:
  1. **Learning**: paper capital is effectively unlimited, and stocks get deliberately different amounts, so the results show which stocks deserve more. Every hard limit still applies ([0017](0017-trade-any-listed-stock.md)'s liquidity, price band and surveillance limits included).
  2. **Coming down**: still on paper, the total capital comes down step by step to ₹1 lakh, with the split learned in phase 1, to see how it works at the size that will go live.
- Go-live is still the owner's decision from the metrics ([0002](0002-scope-nse-swing-paper-first.md)).

## Consequences

- Paper fills must be realistic at any size: the paper broker fills against each stock's real volume and price bands, or what phase 1 learns won't carry over to ₹1 lakh.
- At ₹1 lakh some budgets will be smaller than one share of a high priced stock, or too small for the fixed charges on a sell; phase 2 is where that shows.
- Every trade and decision is already stored by stock ([0024](0024-storage-and-the-run-loop.md)), so nothing new needs storing for this yet.
- Decided with the owner when the engine is built: how the starting amounts differ, what counts as trading well, how fast budgets move, and when and how fast capital comes down.

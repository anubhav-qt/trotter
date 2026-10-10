# 0017. Trade any listed stock, not just the Nifty 100/200

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · amends [0002](0002-scope-nse-swing-paper-first.md) · depends on [0006](0006-agent-picks-engine-enforces.md), [0016](0016-the-goal.md)

## Context

[0002](0002-scope-nse-swing-paper-first.md) limited trading to Nifty 100/200 stocks. The owner wants the agents' reasoning to find the best trades wherever they are, small and penny stocks included, where regional news matters most and is often first.

## Decision

- **Any equity listed on NSE or BSE** can be traded. Still cash delivery and the swing horizon from [0002](0002-scope-nse-swing-paper-first.md); still no F&O.
- **The data tools cover every listed stock** ([DATA.md](../DATA.md)). The engine scores all of them every day, and the shortlist is what the trader chats see.
- **Small stocks carry risks the engine guards against in code**, as hard limits:
  - liquidity: a minimum average daily traded value, and a position no larger than a small share of it, so a position can always be closed;
  - price bands: the engine knows each stock's circuit band and never counts on selling a stock stuck at its lower circuit;
  - surveillance: the exchanges' ASM and GSM lists and trade for trade stocks are known to the engine, and the restricted stages are blocked;
  - manipulation: tip channel pushes and sudden crowd hype are warning signs ([DATA.md](../DATA.md)), and the Trade Master watches for them.
- The owner sets these limits' values before the first paper order, like every hard limit ([0011](0011-fully-autonomous-agent.md)).

## Consequences

- The universe grows from 200 stocks to several thousand. Bulk work runs on the GPU and in code; LLM time goes to the shortlist and to stocks where something stands out.
- The data tools also fetch each day's price bands, ASM and GSM lists and trade for trade series from the exchanges.

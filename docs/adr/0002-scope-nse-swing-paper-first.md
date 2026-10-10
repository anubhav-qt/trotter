# 0002. NSE cash equities, swing horizon, paper trading first

Status: Accepted; amended by [0017](0017-trade-any-listed-stock.md)
Date: 2026-10-11

See also: [ADR index](README.md) · depended on by [0006](0006-agent-picks-engine-enforces.md)

## Context

Professional algo firms in India earn most of their profit in index options through speed, colocation and capital a personal system can't match. SEBI's FY26 study found 87.7% of individual F&O traders lost money. A personal system's realistic edge is a horizon the fast players ignore, with strict risk rules.

## Decision

- **Market:** NSE cash equities from the Nifty 100/200. F&O can come later, mainly for hedging; the instrument model stays general enough to add it.
- **Horizon:** swing, days to weeks, on daily and intraday (15 minute or hourly) bars.
- **Rollout:** paper trading first. The owner decides go-live from the metrics. The drawdown halt limit is set after paper trading.
- **Broker:** a pluggable interface. Paper trading needs only market data; the execution broker is chosen at go-live, free first (₹0 delivery brokerage matters for capital under ₹1 lakh).
- **Accounts:** one operator, possibly several family accounts. Offering it to others would need SEBI registration.

## Consequences

- Latency doesn't matter, so the stack can favour simplicity (see [0004](0004-typescript-everywhere.md)).
- SEBI's retail algo rules (in force since 2026-04-01) apply at go-live: a broker-registered static IP, daily 2FA login, at most 10 orders per second per exchange without registration, Algo-ID tagging, limit orders rather than market orders.

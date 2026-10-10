# 0016. The goal: beat professionals at swing trading, with any model

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · builds on [0002](0002-scope-nse-swing-paper-first.md), [0005](0005-pi-fork-and-cliproxyapi.md), [0011](0011-fully-autonomous-agent.md)

## Context

Professional algorithmic trading firms win on computing power: speed, colocation, huge models over tick data. Trotter can't and won't compete there. The owner's aim is different.

## Decision

- **The goal**: find the best way to build a fully autonomous agent harness that swing trades better than humans, including finance professionals.
- **Not the goal**: out-computing quant firms. No speed race, no tick-level strategies, no infrastructure arms race.
- **Any model**: the harness works with any capable model. The edge comes from the harness (its data, tools, lessons, auditing and limits), not from one model.

## Consequences

- Prompts and tools aren't tied to one model family. Every decision records which model made it, so models can be compared on the same paper trades.
- Success is measured the way professionals are judged: returns after costs and taxes, against the index and active funds, adjusted for risk and drawdown. The exact benchmarks are settled before go-live.
- Compute goes where it raises judgement (better data, better analysis, our own models on the GPU), not into speed.

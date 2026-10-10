# 0006. The agent picks trades; the engine computes and enforces

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · depends on [0002](0002-scope-nse-swing-paper-first.md), [0005](0005-pi-fork-and-cliproxyapi.md)

## Context

The owner wants the Trotter agent to make the trades. An LLM can misread data, fail mid task, or lose access to its model. Its judgement also can't be backtested: it has seen historical prices and news in training, so replaying the past would be peeking at the answers.

## Decision

1. The harness gathers data every day (global, Indian political and financial, company and competitor news; corporate filings; analyst views; FII/DII flows, India VIX, global cues), analyses it, and writes structured, timestamped data in a defined format.
2. The engine combines that with price history into 0 to 100 scores per stock per horizon, target prices and ranges, and later ML/RL model outputs, then ranks a shortlist of candidates.
3. The agent picks, sizes and times trades from that shortlist, and can veto. It runs after the close each day, plus on events.
4. The engine checks every order against hard risk limits the agent can't change, then sends it to the paper broker (later a real one).

## Consequences

- The LLM never computes a number the engine relies on.
- If the agent goes silent, the engine holds its positions with protective stops at the broker.
- The agent's own trading is tested only by paper trading forward in time. The engine's scores are tested by backtests.
- Everything the harness produces is stored with when it was known, so future models can train on it without lookahead.

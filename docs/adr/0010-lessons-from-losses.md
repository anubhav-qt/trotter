# 0010. A Lessons chat that learns from losing trades

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · depends on [0005](0005-pi-fork-and-cliproxyapi.md), [0006](0006-agent-picks-engine-enforces.md) · depended on by [0011](0011-fully-autonomous-agent.md)

## Context

The owner wants the system to learn from its own mistakes, in paper and live trading alike, and to carry what it learns across every chat instead of repeating mistakes.

## Decision

- **A Lessons chat in the harness**: a routine with its own long-running conversation (as Seelie's routines work). It runs after every closed losing trade, paper or live, and as a weekly review.
- **What it reads**: the trade; the agent's reasoning recorded at the moment it decided; the exact data the agent saw then (point in time); what happened afterwards; the engine's scores at the time. It can use the harness's data tools and the web.
- **What it does**: names the cause from a fixed list (bad data, ignored signal, position too large, stop too tight or too loose, results-day or event risk, market regime change, wrong score, slippage, bad luck), connects it to earlier lessons, and proposes fixes. Before writing a lesson it checks it against all trades, winners included: a rule that avoids this loss but would have skipped more winners isn't a lesson.
- **Lessons are memory across chats**, stored in the database. Each lesson has its evidence (the trades behind it), when it was created and revised, and a status. The Lessons chat adds, merges, improves and retires lessons; a retired lesson keeps its reason instead of being deleted. The active list is capped (about 30) so lessons consolidate instead of piling up.
- **Fully automatic**: a lesson goes live for the trading agent as soon as the Lessons chat writes it. The owner chose this over an evidence gate or approving each lesson.
- **Limits stay out of reach**: lessons can never change the engine's hard risk limits. When a limit looks wrong, the weekly review says so in its report; it never asks for approval ([0011](0011-fully-autonomous-agent.md)).

## Consequences

- Every decision the trading agent makes must be stored with its reasoning and the data it saw, or there is nothing to learn from.
- With no gate, a lesson drawn from noise reaches the trading agent straight away. Every lesson change is logged and shown in the app so the owner can see and undo it.
- The trading agent's context includes the active lessons, so the cap also keeps its prompt small.

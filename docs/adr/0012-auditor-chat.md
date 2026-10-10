# 0012. An Auditor chat that reviews every change and can undo it

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · depends on [0010](0010-lessons-from-losses.md), [0011](0011-fully-autonomous-agent.md)

## Context

With no approvals anywhere ([0011](0011-fully-autonomous-agent.md)), nothing stops a weird, suspicious, unnecessary or bad change before it happens. The owner wants a second agent to catch them after the fact, undo them, and teach the Lessons chat ([0010](0010-lessons-from-losses.md)) from what it undoes.

## Decision

- **An Auditor chat in the harness**: a routine with its own long-running conversation. It runs daily after the trading agent's run, and wakes on triggers: an unusually large order, a burst of trades, lessons flipping back and forth, data that fails its checks.
- **What it reads**: the action log (every tool call with its arguments, the reasoning behind it and its result), lesson changes, and the data the harness wrote. It can use the harness's data tools and the web.
- **What it can undo**: anything stored as a change. Every change an agent makes is a versioned record that keeps the previous value, so undo is always defined:
  - a lesson goes back to its previous version;
  - bad harness data (a number misread from an article, say) is marked rejected, not deleted, so the engine stops using it and the history stays;
  - agent memory and settings changes are reverted.
- **Trades it hands over**: a filled trade can't be undone, and the Auditor never places orders. It writes a finding the trading agent must act on in its next run: exit, or justify staying in. Only one agent ever trades.
- **Feedback to Lessons**: every undo goes to the Lessons chat with the reason, so the Lessons chat learns from it. A lesson the Auditor undid comes back only with new evidence; disagreements between the two show in the weekly report.
- **Same bounds as every agent**: it can't change the hard risk limits, it never asks for approval, and its own actions are logged and shown in the app.

## Consequences

- The storage design must be append-only with previous values (versioned records), for lessons, harness data, memory and settings alike. Point-in-time storage already points this way.
- The action log must hold enough to judge a change later: arguments, reasoning, result and the data seen.

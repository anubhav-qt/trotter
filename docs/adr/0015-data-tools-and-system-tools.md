# 0015. Two kinds of agent tools: data tools and system tools

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · depends on [0006](0006-agent-picks-engine-enforces.md), [0013](0013-trader-chat-per-stock-and-trade-master.md)

## Context

Everything the agents decide rests on the data they gather, so the owner wants the tools that fetch it designed with the most care, and wants to be asked about every choice the owner's own words don't settle. The rest of the tools are plumbing.

## Decision

- **Data tools** reach outside Trotter: prices, news, filings, analyst views, market-wide signals, the web. Every choice about them that the owner hasn't already settled (which sources, how fresh, how deep, what counts as trustworthy, what to do when sources disagree) is asked, one question at a time, before the tool is built. The answers are written down as decisions.
- **System tools** only touch Trotter's own records and the engine: reading scores and positions, placing orders through the engine, reading and writing lessons, notes, briefs, findings and memory. These are designed in the codebase without asking, following [the engineering standard](../ENGINEERING.md).
- A tool is one kind or the other, never both. A tool that fetches from outside and also writes Trotter's records is split in two.

## Consequences

- Building data tools waits on the owner's answers; system tools can be built straight away.
- Each data tool records where every value came from and when it was known, so a bad source can be traced and its data marked rejected ([0012](0012-auditor-chat.md)).

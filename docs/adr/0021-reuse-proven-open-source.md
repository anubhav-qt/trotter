# 0021. Reuse proven open source; build only what's new

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · amends [0004](0004-typescript-everywhere.md) · depends on [0005](0005-pi-fork-and-cliproxyapi.md), [0016](0016-the-goal.md)

## Context

Crawlers, article extractors, OCR, translation, search, PDF parsing, technical indicators, model inference: most of what Trotter needs has already been built and tuned by others. The owner wants our effort to go into what's new: the agents, the logic and thinking behind them, and the system as a whole.

## Decision

- **Look before building.** Before writing anything, look for a mature open source project that already does it well. Use it, and write only Trotter's own logic: the agents, their tools' logic, handovers, scoring, risk, lessons and auditing.
- **What counts as proven**: actively maintained, widely used, tested, and under a licence that allows our use (MIT, Apache 2.0 and BSD first; any other is checked before use).
- **Any language for a reused tool.** Code we write stays TypeScript ([0004](0004-typescript-everywhere.md)). A tool in another language (SearXNG, Python OCR or translation models) runs as its own process or service, behind a schema-checked boundary. This widens [0004](0004-typescript-everywhere.md)'s "Python only for training".
- **Use it as it is**: adapt it with configuration or a thin wrapper. Fork only when we must, as with pi ([0005](0005-pi-fork-and-cliproxyapi.md)), keeping its licence and marking our changes.
- Each choice is recorded with the alternatives considered: in the commit for a small one, in an ADR or [DATA.md](../DATA.md) for a big one.

## Consequences

- More processes to run. The harness and the engine supervise them, and a tool that is down is reported in the app, never silently skipped.
- More code from outside, so supply chain care matters: exact pins, the two week rule ([ENGINEERING.md](../ENGINEERING.md)), official release downloads only, checksums verified where published.

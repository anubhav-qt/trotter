# 0001. Archive v0.5.0 and start from scratch

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · depended on by [0004](0004-typescript-everywhere.md)

## Context

Trotter v0.5.0 was a Next.js research app: it scored NSE stocks, drew volatility ranges, kept a track record and ran a walk-forward backtest. The new goal is different in kind: an agent-driven trading system with its own engine, harness and desktop app. Growing the old app into that would carry its shape (a web app with API routes) into a system that isn't one.

## Decision

Move all of v0.5.0 into `archive/v0.5.0/` (also tagged `v0.5.0`; `master` stayed there) and rebuild from an empty root. The archive is reference only: read it when remaking a feature, never import from it, edit it, or follow its conventions.

## Consequences

- Useful parts (NSE archive parsing, Upstox and Yahoo history, scoring, ranges, track record, backtest) are ported by reading, not reused as is.
- The archive's CI workflow no longer runs.

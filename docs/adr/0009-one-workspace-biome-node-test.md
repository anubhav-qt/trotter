# 0009. One npm workspace, checked by Biome, tsc and node:test

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · depends on [0004](0004-typescript-everywhere.md)

## Context

With everything in TypeScript, the engine, harness and app should share one set of versions, one config and one check, and the harness and engine need a shared package for the data format between them.

## Decision

- One npm workspace at the root: `packages/*` (the pi fork now, the shared data format and other libraries later), `harness`, and later `trotter_trader` and `app`. One lockfile, exact versions.
- `npm run check` runs Biome (format and lint), `tsc --noEmit` and Node's built-in test runner. Biome enforces what it can of the [engineering standard](../ENGINEERING.md): no nested ternaries, braces on every block, no `any`, no non-null `!`. The pi fork keeps upstream's looser lint rules.
- No build step: Node 24 runs the TypeScript directly.

## Consequences

- New packages are added to the workspace and to `tsconfig.json`'s `include`, and their tests to the `test` script.

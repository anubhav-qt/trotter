# 0004. TypeScript everywhere

Status: Accepted; amended by [0021](0021-reuse-proven-open-source.md)
Date: 2026-10-11

See also: [ADR index](README.md) · depends on [0001](0001-archive-and-restart.md), [0002](0002-scope-nse-swing-paper-first.md) · depended on by [0009](0009-one-workspace-biome-node-test.md)

## Context

The engine was first planned in Rust. Rust's main advantage, speed, doesn't matter for swing trading: ten years of daily bars for 500 stocks is about 1.25 million rows, which Node backtests in seconds.

## Decision

The engine, the harness and the app frontend are TypeScript on Node 24. Rust is used only for Tauri's shell, or later for a measured hot spot (large parameter sweeps, reinforcement learning simulators). Python is used only for training ML models.

## Consequences

- One language: the data format between the harness and the engine is defined once, in a shared package.
- Indian brokers (Zerodha, Upstox, Fyers, Angel One) ship official JavaScript/TypeScript SDKs; none ships an official Rust one.
- The archive's TypeScript is easy to port.
- We give up Rust's stricter compiler for the order and risk code; strict TypeScript, schemas at every boundary and tests make up most of it.

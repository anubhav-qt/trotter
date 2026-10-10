# 0007. Trotter is a Tauri desktop app; the engine and agent are their own processes

Status: Accepted
Date: 2026-10-11

See also: [ADR index](README.md) · depends on [0003](0003-run-on-the-owners-pc.md)

## Context

With everything on one PC, a web UI adds a server and a browser for no gain.

## Decision

- Trotter's UI is a Tauri v2 desktop app (`app/`) with a TypeScript frontend, plus a CLI.
- The engine (`trotter_trader/`) and the harness (`harness/`) run as their own always-on processes. pi needs Node's file, network and process APIs, so the agent can't live in the app's webview anyway.
- The app talks to both over local connections.

## Consequences

- The window is not the system: closing the app never stops the engine or a scheduled agent run. The app may start them if they aren't running, but doesn't own them.
- Control is from the PC only.

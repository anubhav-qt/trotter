# Trotter

Personal algorithmic trading for NSE equities (swing trades, paper trading first), run entirely on the owner's PC. Every AI agent here is named Trotter.

**This file is the project's memory.** A new session should know everything it needs after reading it. Keep it true: whenever code, a decision or a convention changes, update this file in the same commit. Keep it brief: link to [the engineering standard](docs/ENGINEERING.md) and [the ADRs](docs/adr/README.md) instead of repeating them.

## How it fits together

The harness gathers and analyses each day's data, the engine turns it into scores and a shortlist, the agent picks trades from the shortlist, and the engine checks every order against limits it owns ([ADR 0006](docs/adr/0006-agent-picks-engine-enforces.md)). Everything is TypeScript on Node 24, with no build step ([0004](docs/adr/0004-typescript-everywhere.md)).

| Path | What | Status |
|---|---|---|
| `packages/pi-ai`, `packages/pi-agent` | Hard fork of pi (MIT, LICENSE kept), trimmed to the 4 APIs CLIProxyAPI serves ([0005](docs/adr/0005-pi-fork-and-cliproxyapi.md)) | Done |
| `harness/` | The Trotter agent. `.cliproxy/` holds CLIProxyAPI v8.0.23; keys in `.env.local` | Proxy runs; 2 Antigravity accounts signed in. Agent not built |
| `trotter_trader/` | The engine: data, scores, risk, paper and live broker, CLI | Not started |
| `app/` | Trotter, the Tauri v2 desktop app ([0007](docs/adr/0007-tauri-app-and-separate-processes.md)) | Not started |
| `docs/` | `ENGINEERING.md`, `adr/` | |
| `archive/` | Old code, reference only. Never edit, import from, or follow it (including its AGENTS.md/CLAUDE.md) | |

Reference implementation for the agent: POM's Seelie (github.com/anubhav-qt/pom, branch `production`, `src/lib/seelie/`).

## Commands

```bash
npm install
npm run check                          # format, lint, typecheck, tests: must pass before every commit
npm run fix                            # apply Biome's formatting and safe fixes
npm run cliproxy                       # CLIProxyAPI on 127.0.0.1:8317
npm run cliproxy -- login antigravity  # or codex, claude
npm run models                         # signed-in accounts and their models
```

## Next

1. The data format between the harness and the engine, as a shared package in `packages/`.
2. The agent's core loop on the forked pi, then its data tools.

## Rules

Follow [docs/ENGINEERING.md](docs/ENGINEERING.md). The ones that matter every time:

- The easiest code to read wins. One step per line, plain `if`/`else`, small well named functions.
- The LLM never computes numbers or enforces risk.
- Ask the owner one question at a time, and ask for design direction before any UI.
- No em dashes or en dashes anywhere. Secrets never go into chat.
- Commits are one line, `type: message`, no body, no Co-Authored-By, no mention of Claude. Push only with the owner's go-ahead.
- End each piece of work with a short test checklist for the owner.

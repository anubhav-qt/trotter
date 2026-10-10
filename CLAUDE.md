# Trotter

Personal algorithmic trading for any stock listed on NSE or BSE (swing trades, paper trading first, [ADR 0017](docs/adr/0017-trade-any-listed-stock.md)), run entirely on the owner's PC. Every AI agent here is named Trotter.

**The goal** ([ADR 0016](docs/adr/0016-the-goal.md)): a fully autonomous harness, working with any capable model, that swing trades better than humans and finance professionals. Not a compute race with quant firms: the edge is the harness's data, tools, lessons and auditing.

**This file is the project's memory.** A new session should know everything it needs after reading it. Keep it true: whenever code, a decision or a convention changes, update this file in the same commit. Keep it brief: link to [the engineering standard](docs/ENGINEERING.md) and [the ADRs](docs/adr/README.md) instead of repeating them.

## How it fits together

- **Daily loop** ([ADR 0006](docs/adr/0006-agent-picks-engine-enforces.md)): the harness gathers and analyses the day's data, the engine turns it into scores and a shortlist (plus stocks agents nominate, [0019](docs/adr/0019-agents-nominate-stocks.md)), and the engine checks every order against limits it owns.
- **Trader chats** ([0013](docs/adr/0013-trader-chat-per-stock-and-trade-master.md)): one long-running chat per stock decides whether to trade it, within a budget the engine sets. Only trader chats place orders, each only for its own stock.
- **Trade Master** ([0013](docs/adr/0013-trader-chat-per-stock-and-trade-master.md)): every market hour, finds patterns across all trades by sector, company type, sentiment and news, and briefs the trader chats and the Lessons chat.
- **Fully autonomous** ([0011](docs/adr/0011-fully-autonomous-agent.md)): no tool ever asks for approval. The owner-set hard limits and kill switch are the only bounds.
- **Lessons chat** ([0010](docs/adr/0010-lessons-from-losses.md)): studies every losing trade and keeps a capped set of lessons the trader chats follow.
- **Auditor chat** ([0012](docs/adr/0012-auditor-chat.md)): reviews the action log, undoes bad changes, hands bad trades back to their trader chat, and tells the Lessons chat why.
- **Compaction** ([0014](docs/adr/0014-every-chat-compacts-itself.md)): at 400,000 tokens every chat saves what isn't stored yet, then keeps only a small summary.
- **So:** every decision is stored with its reasoning and the data it saw, and every change an agent makes is a versioned record that keeps its previous value.
- Everything is TypeScript on Node 24, with no build step ([0004](docs/adr/0004-typescript-everywhere.md)).

| Path | What | Status |
|---|---|---|
| `packages/pi-ai`, `packages/pi-agent` | Hard fork of pi (MIT, LICENSE kept), trimmed to the 4 APIs CLIProxyAPI serves ([0005](docs/adr/0005-pi-fork-and-cliproxyapi.md)) | Done |
| `harness/` | The Trotter agents (trader chats, Trade Master, Lessons, Auditor). `.cliproxy/` holds CLIProxyAPI v8.0.23; keys in `.env.local` | Proxy runs; 2 Antigravity accounts signed in. Agent not built |
| `trotter_trader/` | The engine: data, scores, risk, paper and live broker, CLI | Not started |
| `app/` | Trotter, the Tauri v2 desktop app ([0007](docs/adr/0007-tauri-app-and-separate-processes.md)) | Not started |
| `prompts/` | Every agent prompt, as Nunjucks templates; no prompt text in code ([0020](docs/adr/0020-prompts-as-nunjucks-templates.md)) | Not started |
| `docs/` | `ENGINEERING.md`, `DATA.md` (what the data tools fetch and why), `adr/` | |
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
- The LLM reads and analyses, returning schema-checked JSON; code does every calculation on it and enforces risk.
- Reuse proven open source for everything that isn't Trotter's own logic; a tool in another language runs as its own process ([0021](docs/adr/0021-reuse-proven-open-source.md)).
- Agents never read each other's raw output: every handover is metrics in a schema plus free text reasoning, validated and stored by code, then rendered into the next agent's input from a template ([0018](docs/adr/0018-agents-hand-over-json.md)).
- Agent tools are data tools (reach outside Trotter: ask the owner about every unsettled choice before building one) or system tools (Trotter's own records and the engine: design them yourself) ([0015](docs/adr/0015-data-tools-and-system-tools.md)).
- Ask the owner one question at a time, and ask for design direction before any UI.
- No em dashes or en dashes anywhere. Secrets never go into chat.
- Commits are one line, `type: message`, no body, no Co-Authored-By, no mention of Claude. Push only with the owner's go-ahead.
- End each piece of work with a short test checklist for the owner.

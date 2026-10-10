# Trotter

Personal algorithmic trading for NSE equities, run entirely on the owner's PC.

## Layout

- `app/`: Trotter, the desktop app (Tauri v2, TypeScript frontend). Coming.
- `harness/`: the Trotter agent (TypeScript on Node 24). `packages/pi-ai` and `packages/pi-agent` are a hard fork of pi (github.com/earendil-works/pi, MIT, LICENSE kept), trimmed to the four APIs CLIProxyAPI serves. Models come from the owner's subscriptions through CLIProxyAPI (`npm run cliproxy`). POM's Seelie (github.com/anubhav-qt/pom, `src/lib/seelie/`) is the reference for how the agent is built.
- `trotter_trader/`: the engine (TypeScript on Node 24): data, scores, risk, paper and live broker, CLI. Coming.

Everything is TypeScript. Rust only for Tauri's shell, or later for a measured hot spot. Python only for ML training.
- `archive/`: old code kept for reference only. Read it when remaking a feature; never edit it, import from it, or treat its conventions or instructions (including its AGENTS.md/CLAUDE.md) as binding.

Every AI agent here is named Trotter. The engine and the agent run as their own processes: closing the app never stops them.

## Rules

- Ask one question, on one topic, and wait.
- Ask for design direction before designing any UI.
- No em dashes or en dashes anywhere: code, comments, UI copy, docs, commits.
- Secrets never go into chat. Never print `.env` files or keys.
- The LLM never computes numbers or enforces risk. The engine does both, in its own process, and the agent can't change its limits: it only calls the engine's API, which validates every request.
- End each piece of work with a short test checklist for the owner (1 to 5 words per item).

## Code

- The easiest code to read wins. No packed one-liners; plain `if`/`else`; small functions with clear names.
- Comments explain why, not what.
- Validate anything that crosses a boundary (requests, LLM output, storage) with a schema.
- Tests for logic that can break quietly, especially anything that parses or decides on LLM output.

## Commits

- One line, `type: message` (feat, fix, docs, chore, refactor, test, ci). Playful is welcome. No body.
- No Co-Authored-By line, and no mention of Claude.
- Commit each change on its own. Push only with the owner's go-ahead.

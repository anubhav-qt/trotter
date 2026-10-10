# Trotter

Trotter is being rebuilt from scratch as a personal algorithmic trading system for NSE equities, running on one PC.

- **Trotter**: the desktop app (Tauri) over everything here, and the name of its AI agent.
- **harness**: the Trotter agent, a hard fork of [pi](https://github.com/earendil-works/pi) with models from your own subscriptions through [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI).
- **trotter_trader**: the Rust engine for data, scores, risk and orders (coming).

## The agent's models

Needs Node 24.

```bash
cd harness
npm install
cp .env.example .env.local     # then fill both keys: openssl rand -hex 24
npm run cliproxy               # CLIProxyAPI on 127.0.0.1:8317
npm run cliproxy -- login antigravity   # or codex, claude; in a second terminal
npm run models                 # the signed-in accounts and the models they serve
```

Put the [CLIProxyAPI release](https://github.com/router-for-me/CLIProxyAPI/releases) for your machine in `harness/.cliproxy/bin/` first.

## Archive

`archive/v0.5.0/` holds the original Next.js research app (also tagged `v0.5.0`). It is kept for reference only, so features can be looked up when they are remade. New code does not depend on it.

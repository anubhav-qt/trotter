# Architecture Decision Records

Every significant decision, in the order it was made. Each ADR links to the ones it depends on and the ones that build on it. An accepted ADR isn't edited; a later one supersedes it, and its status says so.

Format: `NNNN-short-title.md` with Status, Date, See also, then Context, Decision and Consequences.

| ADR | Title | Summary |
|---|---|---|
| [0001](0001-archive-and-restart.md) | Archive v0.5.0 and start from scratch | The old Next.js app lives in `archive/v0.5.0/` as reference only. |
| [0002](0002-scope-nse-swing-paper-first.md) | NSE cash equities, swing horizon, paper trading first | Nifty 100/200 stocks held days to weeks; broker chosen at go-live; SEBI retail algo rules apply then. |
| [0003](0003-run-on-the-owners-pc.md) | Everything runs on the owner's PC | Local GPU, RAM and disk at no cost; a static IP is arranged before go-live. |
| [0004](0004-typescript-everywhere.md) | TypeScript everywhere | Engine, harness and app in TypeScript on Node 24; Rust only for Tauri's shell or a hot spot; Python only for training. |
| [0005](0005-pi-fork-and-cliproxyapi.md) | The agent is a hard fork of pi, with models through CLIProxyAPI | pi trimmed to four APIs; subscriptions through a local CLIProxyAPI; Antigravity to build, Claude to paper trade. |
| [0006](0006-agent-picks-engine-enforces.md) | The agent picks trades; the engine computes and enforces | Harness gathers data, engine scores and shortlists, agent picks, engine checks every order against limits it owns. |
| [0007](0007-tauri-app-and-separate-processes.md) | Trotter is a Tauri desktop app; the engine and agent are their own processes | Closing the window never stops trading or a scheduled run. |
| [0008](0008-charts-from-numbers-and-own-cnn.md) | Charts: exact patterns from numbers, plus our own chart CNN | No vision LLM on screenshots; our own CNN on charts we render; the GPU also for local news models and OCR. |
| [0009](0009-one-workspace-biome-node-test.md) | One npm workspace, checked by Biome, tsc and node:test | `npm run check` gates every change; no build step. |

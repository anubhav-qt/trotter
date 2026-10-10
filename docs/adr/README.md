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
| [0010](0010-lessons-from-losses.md) | A Lessons chat that learns from losing trades | After every loss and weekly, it finds the cause, links past lessons and keeps a set of lessons that go live automatically; never touches risk limits. |
| [0011](0011-fully-autonomous-agent.md) | The agent is fully autonomous: no approvals anywhere | No tool asks first; the owner-set hard limits and kill switch are the only bounds; the daily broker 2FA login stays a human step at go-live. |
| [0012](0012-auditor-chat.md) | An Auditor chat that reviews every change and can undo it | Daily and on triggers; undoes versioned changes, hands bad trades to the trading agent, and feeds every undo to the Lessons chat. |
| [0013](0013-trader-chat-per-stock-and-trade-master.md) | A trader chat for every stock, and a Trade Master over them | Each stock has its own chat that trades only it, within an engine-set budget; the Trade Master finds patterns across all trades every hour and briefs the trader chats and the Lessons chat. |
| [0014](0014-every-chat-compacts-itself.md) | Every chat saves, then compacts itself at 400,000 tokens | It stores what isn't stored yet, then keeps only a small summary of learnings, feedback, do's and don'ts and next steps; the full transcript stays in storage. |
| [0015](0015-data-tools-and-system-tools.md) | Two kinds of agent tools: data tools and system tools | Data tools reach outside Trotter and are designed with the owner, one question at a time; system tools only touch Trotter's own records and the engine. |
| [0016](0016-the-goal.md) | The goal: beat professionals at swing trading, with any model | A fully autonomous harness that swing trades better than humans and finance professionals; not a compute race with quant firms; the edge is the harness, not one model. |
| [0017](0017-trade-any-listed-stock.md) | Trade any listed stock, not just the Nifty 100/200 | Any NSE or BSE equity, still cash delivery swing trades; liquidity, circuit band and surveillance limits in the engine guard the small stocks. |
| [0018](0018-agents-hand-over-json.md) | Agents hand over schema-checked JSON, read in code | Every handover between agents is metrics in a schema plus free text reasoning; code validates, stores and calculates, then builds the next agent's input from a template. |
| [0019](0019-agents-nominate-stocks.md) | Agents can nominate stocks for the shortlist | The shortlist is the engine's scores plus nominations from agents' reasoning; nominees get trader chats under the same limits, and code measures whether nominations pay off. |
| [0020](0020-prompts-as-nunjucks-templates.md) | Every prompt is a Nunjucks template in prompts/ | No prompt text in code; templates hold wording, not logic; tested with fixture JSON; one template for every model. |
| [0021](0021-reuse-proven-open-source.md) | Reuse proven open source; build only what's new | Look for a mature open source project before writing anything; our effort goes into the agents and the system; reused tools in other languages run as their own processes. |
| [0022](0022-trader-chats-take-their-time.md) | Trader chats take their time: no forced action | After any feedback or news a trader chat can think, ask other agents and tools for more, then act now, plan and wait, or do nothing; the engine's limits never wait. |
| [0023](0023-the-shared-data-format.md) | The shared data format: versioned records, handovers and one check | `@trotter/schemas` holds every schema and the one check at every boundary; stocks keyed by ISIN; everything agents write is a versioned record; fact kinds and engine messages are added with what uses them. |
| [0024](0024-storage-and-the-run-loop.md) | One SQLite database, and a run loop that stores everything as it happens | `@trotter/store` on `node:sqlite` keeps chats, runs, transcripts, the action log and every record version, enforcing their order; every message and tool call of a run is stored as it happens. |
| [0025](0025-budgets-learn-in-paper-trading.md) | Budgets learn per stock in paper trading, then come down to ₹1 lakh | The engine gives stocks that trade well more money; paper trading starts with effectively unlimited capital split unevenly, then comes down step by step to ₹1 lakh with what it learned. |

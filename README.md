# Trotter v0.5.0
### Quantitative research for NSE stocks — scored, verified, and held to account

Trotter scores Indian (NSE) stocks for three horizons (1 week, 1 month, 6 months) with a deterministic model, shows a volatility-based price range instead of an invented target, and **records every call it makes and grades it later against the Nifty 50**. A backtester replays the same scoring code over past years so you can see whether the score actually has skill before trusting it.

> Trotter is a research tool, not financial advice. A score is only worth what its backtest and track record show.

---

## How it works

```
NSE archives ─┐ (equity list, Nifty index members + industry, official daily closes)
Upstox  ──────┼─► SQLite (./data/trotter.db) ─► scoring ─► ranges ─► track record
Yahoo   ──────┘   (database first, sources       (pure function   (graded vs Nifty 50
                  as fallbacks, cross-checked)     of daily bars)    after each horizon)
```

- **Data, free and account-less.** Daily history comes from Upstox's public candle API, with Yahoo Finance as the fallback. The instrument list, Nifty 50/100/200/500 membership, industries and NSE's own official closing prices come from NSE's archive files. Everything is stored in SQLite, so each stock's history is downloaded once and then updated incrementally.
- **Data checks.** Unfinished sessions are dropped. Re-adjusted history (splits, bonuses) is detected and reloaded. A series with an unexplained >30% jump or a stalled feed loses to a cleaner source. The latest close is cross-checked against NSE's official file. Problems are shown in the UI as warnings rather than hidden.
- **Scoring (`src/lib/scoring.ts`).** Momentum, valuation (P/E vs the median of Nifty 500 industry peers), volume (last full session vs the 3-month average), news sentiment (FinBERT on Indian news) and volatility, out of 100. It is a pure function of completed daily bars, so the live app and the backtest run the same code. `MODEL_VERSION` tags every call.
- **Price ranges (`src/lib/ranges.ts`).** An 80% range per horizon, built from recent volatility that fades toward the stock's 1-year norm. It says how far the price typically moves, not which way.
- **AI is optional and never sets numbers.** Gemini only writes the plain-language reasoning and the chart "Deep Dive" commentary. Without `GOOGLE_API_KEY` everything else works.
- **Track record (`src/lib/track-record.ts`).** Each research run, plus a daily snapshot of a whole index, is recorded. When a call's horizon has passed, it is graded: did BUY calls beat the Nifty 50, did AVOID calls lag it, did the price land inside the range?

---

## Run it locally

```bash
npm install
cp .env.example .env.local   # all optional
npm run sync                 # load the NSE instrument list (also happens automatically)
npm run dev                  # http://localhost:3000
```

Requires Node.js 22+.

### Jobs

| Command | What it does |
|---|---|
| `npm run sync` | Refresh NSE equities, ISINs, index membership and industries |
| `npm run backtest -- --universe "NIFTY 100"` | Walk-forward backtest; report saved to `data/reports/` |
| `npm run snapshot -- --universe "NIFTY 50"` | Score every stock in the index and record the calls (`--no-news` to skip FinBERT) |
| `npm run grade` | Grade calls whose horizon has passed |
| `npm run backup` | Consistent copy of the database to `data/backups/` (keeps 7) |
| `npm run worker` | Scheduler: snapshot + grade + backup every weekday at 19:00 IST, instrument sync on Mondays (`-- --now` to run immediately) |

### Reading the backtest

The first backtest downloads ~10 years of history per stock, which takes a few minutes; later runs come from the database.

- **IC** is the rank correlation between the score and the next N sessions' return. 0 means no skill; 0.02–0.05 is typical of real, modest signals; t ≥ 2 means it is unlikely to be luck.
- **Quintile spread** is the average return of the top 20% by score minus the bottom 20%.
- **Per-factor IC** shows which ingredients help and which hurt, so you know what to re-weight.
- **Range coverage** shows how often the "80%" range actually held.
- The report lists its caveats. In particular, the universe is today's index members (survivorship bias), and P/E and news have no point-in-time history, so only the price-based factors are truly tested. The live track record covers the rest.

---

## Deploy with Docker (ThinkPad primary, Oracle Cloud fallback)

The same `docker-compose.yml` runs on both machines. It builds natively on x86_64 and on Oracle's ARM (Ampere) instances.

```bash
mkdir -p data && sudo chown 1000:1000 data   # once; containers run as uid 1000
cp .env.example .env                         # optional keys
docker compose up -d --build
```

- `app` is the web UI on port 3000, with a healthcheck at `/api/health`.
- `worker` runs the daily jobs. **Run the worker on one host at a time** so the two databases don't diverge.
- Everything lives in `./data`: `trotter.db`, `backups/`, `reports/`, and the FinBERT model cache (downloaded on first use).

**Keeping the fallback warm.** The worker writes `data/backups/trotter-YYYY-MM-DD.db` every evening. Copy those to Oracle, e.g. with a ThinkPad cron entry at 20:00 IST:

```bash
rsync -a ~/trotter/data/backups/ oracle:~/trotter/data/backups/
```

**Failing over.** On Oracle, start from the newest backup:

```bash
cp data/backups/$(ls data/backups | tail -1) data/trotter.db
docker compose up -d
```

NSE sometimes blocks cloud-provider IP ranges. If that happens on Oracle, prices still flow from Upstox and Yahoo; only the official-close cross-check shows "not cross-checked".

---

## Configuration

See `.env.example`. All variables are optional:

| Variable | Default | Purpose |
|---|---|---|
| `GOOGLE_API_KEY` | — | Gemini reasoning and Deep Dive |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Override when Google retires a model |
| `UPSTOX_ACCESS_TOKEN` | — | Higher Upstox rate limits (not required) |
| `TROTTER_DB_PATH` | `./data/trotter.db` | Database location |
| `TROTTER_HISTORY_SOURCES` | `upstox,yahoo` | Source priority |
| `TROTTER_HISTORY_YEARS` | `10` | History depth on first download |
| `TROTTER_UNIVERSE` | `NIFTY 50` | Index the daily snapshot scores |
| `TROTTER_SNAPSHOT_NEWS` | `true` | Run FinBERT during snapshots |
| `TROTTER_MODEL_CACHE` | inside `node_modules` | FinBERT model cache directory |

## Development

```bash
npm test          # Vitest: parsers, data fallbacks, scoring golden test, range calibration, backtester, grading
npm run typecheck
npm run lint
```

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and a production build on every push and pull request.

## Known limits

- Scores use end-of-day data only. Intraday charts (1D/1W) come from Yahoo for display and are never scored.
- P/E and EPS come from Yahoo, the only free source. Sector P/E is computed from those snapshots across Nifty 500 peers.
- Exchange holidays aren't modelled explicitly. The data layer backs off when an expected session doesn't appear.

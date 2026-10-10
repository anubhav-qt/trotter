# Data tools

What the data tools fetch, from where, and why. Each choice was asked of the owner one question at a time ([ADR 0015](adr/0015-data-tools-and-system-tools.md)). Agreed 2026-10-11. Every tool reuses proven open source where it can ([ADR 0021](adr/0021-reuse-proven-open-source.md)).

## Coverage

- **Every stock listed on NSE or BSE**, as trading covers them all ([ADR 0017](adr/0017-trade-any-listed-stock.md)): prices, filings and news. Shortlisted and held stocks and their competitors get the deepest analysis; the rest get the GPU model's tagging and are analysed in depth when something stands out.
- **Exchange risk lists daily**: price bands, ASM and GSM stages, trade for trade series.

## Prices

- **Official end of day**: NSE's archive files (bhavcopy), free, no account. The reference every other price is checked against.
- **Daily and intraday candles**: Upstox's public candle endpoints (`api.upstox.com/v3/historical-candle`), free, no account. Checked 2026-10-11: daily and 15 minute candles answer without auth, as in the old app. Not a promise from Upstox; if they close, NSE's files remain.
- **History, all of it** (the disk has room): Upstox daily candles from 2000 (split and bonus adjusted) and 1 minute candles from January 2022 (checked 2026-10-11; mid 2021 returns nothing); NSE's unadjusted bhavcopies as far back as NSE has them. We keep the raw files and build our own adjusted series from corporate actions, with Upstox as a cross-check.
- **No survivorship bias**: delisted stocks and past index membership are kept, so backtests see the universe as it was on each day, not today's winners.
- **No broker account during paper trading**. Only the broker chosen at go-live needs one, and the owner opens it.

## What tools may read

- **Anything public**, by any means, with any open source tool that finds or extracts it (crawlers, article extractors, PDF and OCR tools, search engines).
- **Never** unpublished price sensitive information (trading on it is insider trading under SEBI's PIT regulations), and never past a login or paywall that isn't ours.
- Requests are paced and cached so sources don't block us, and every value keeps its source URL and when it was fetched.

## News

- **Languages**: English, Hindi and the regional languages with a business press (Gujarati, Marathi, Tamil, Telugu, Kannada, Bengali, Malayalam and others). Regional outlets often break local company news first, so speed and coverage are worth the translation work. Articles are translated by an open source model on the GPU (IndicTrans2 covers all 22 scheduled languages) before analysis; the original is kept.
- **Trust**: outlets start in tiers: exchange filings, regulators (SEBI, RBI, PIB) and wire services (PTI, Reuters) first; major business press next; blogs, small sites and social posts last. Each outlet's trust then moves with how often its reports prove right, computed in code from outcomes and Auditor rejections, never set by an LLM. A claim from a single low tier source counts only once another source confirms it.

## Experts

- **Everyone counts, by track record**: brokerage research, SEBI registered analysts, fund managers, TV and YouTube experts, X accounts. Every call (stock, direction, target, horizon, date) is recorded, and code works out each expert's hit rate and returns from how the calls turned out. That record, not reputation, sets the weight.
- **Tip channels** (Telegram, WhatsApp) are never a reason to buy. A stock being pushed there counts only as a warning that it may be getting pumped.

## Crowd

- **A measured signal, not a reason**: Reddit (r/IndianStreetBets, r/IndiaInvestments), ValuePickr, Moneycontrol message boards, public X posts and Google Trends give mention counts and crowd mood per stock. Code tracks whether they predict anything. They're used mainly to spot hype and sudden attention, never as a reason on their own.

## Filings

- **All of them**, from NSE and BSE:
  - announcements and results: board meetings, quarterly results with XBRL financials, orders, mergers, dividends, buybacks, management changes;
  - ownership: shareholding patterns, promoter pledges, insider trades, takeover disclosures, bulk and block deals;
  - concall transcripts and investor presentations: guidance, tone, and what management avoids answering;
  - annual reports, related party deals, auditor remarks, credit rating changes.
- **How they're read**: PDFs go through OCR on the GPU, then the LLM gets both the OCR text and the PDF and returns its analysis and the figures as schema-checked JSON. Code calculates from that JSON, and checks figures against XBRL wherever XBRL has them.

## Fundamentals

- **Our own, from filings**: revenue, profit, debt and cash flow come from the XBRL results and annual reports above. Code works out every ratio (P/E, ROE, debt to equity, growth) with our own prices, point in time, so a ratio is what it was on that day, not what it is after restatements. Screener and Yahoo are only a cross-check.

## Competitors

- **NSE industry, plus the agent's finds**: a stock's peers start from NSE's industry classification. The agent adds the real rivals it finds in filings, concalls and news, including unlisted and global ones (Accenture for Infosys), each with its reason and source, as versioned records the Auditor reviews.

## Web search

- **Our own SearXNG** on this PC: an open source search engine that queries Google, Bing, DuckDuckGo and others at once. Free, no quotas, and the same for any model ([0016](adr/0016-the-goal.md)). Pages it finds are read by the data tools like any other public page.

## Market wide and macro

- **Market wide**: FII and DII flows, F&O open interest, put call ratio and FII derivative positions, India VIX, breadth (advances and declines), from the exchanges' daily files.
- **Global**: world indices, crude, gold, the rupee, the dollar index, US yields; global news from GDELT (free, history from 2015) and RSS.
- **Macro**: RBI policy, inflation, IIP, GDP, GST collections, PMI, monthly auto sales, power demand, the monsoon (IMD).

## Intraday

- Held, shortlisted and nominated stocks: 1 minute candles, every minute while the market is open.
- Everything else: market wide snapshots (one request covers a whole index) to catch large moves that should wake a trader chat or prompt a nomination.

## Schedule

- **Market hours**: filings every minute, news every few minutes, all languages; the Trade Master every hour.
- **Before the open (8:00 IST)**: overnight global news and cues.
- **After the close**: bhavcopy, FII and DII flows, bulk and block deals, F&O files, risk lists; then the engine's scores and the trader chats' run.
- **Overnight and weekends**: deep reading on the GPU (concalls, annual reports, backfills).

## Keeping and checking

- **Keep everything raw, forever**: articles, PDFs, exchange files, transcripts, compressed. Revisit when the disk is half full.
- **When sources disagree**, code decides, never an LLM: an official structured source (exchange files, XBRL) wins; otherwise the higher trust source wins; a gap beyond a set tolerance marks the value disputed, the engine doesn't use it until it's settled, and the Auditor sees every dispute.

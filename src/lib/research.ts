import { classifyNews } from './finbert'
import { buildNarrativePrompt, createLLM, NarrativeSchema, type Narrative } from './llm'
import { getFundamentals, type Fundamentals } from './market/fundamentals'
import { getDailyHistory } from './market/history'
import { ensureInstruments, getInstrument } from './market/instruments'
import type { DailyBar } from './market/types'
import { verifyLatestClose } from './market/verify'
import { fetchTickerNews } from './news'
import type { NewsSummary, ResearchResult } from './research-types'
import { computeAnalyses, HORIZONS, MODEL_VERSION, type SentimentCounts } from './scoring'
import { mean, simpleReturns, stdev } from './stats'
import { recordPredictions, summarizeTrackRecord, type Origin } from './track-record'

// The full research pipeline, shared by the interactive API and the daily
// snapshot job so both produce (and record) identical calls.

export const RESEARCH_STEPS = 7

export interface ResearchOptions {
  onStatus?: (message: string, step: number) => void
  /** Fetch news and run FinBERT (default true). */
  news?: boolean
  /** Ask the LLM for narrative reasoning (default: when GOOGLE_API_KEY is set). */
  narrative?: boolean
  origin?: Origin
}

/** Human-readable stats for the trailing N sessions (for the LLM prompt). */
function windowStats(bars: DailyBar[], sessions: number): string {
  const slice = bars.slice(-(sessions + 1))
  if (slice.length < 2) return `${sessions} sessions: n/a`
  const closes = slice.map(b => b.close)
  const chg = ((closes[closes.length - 1] / closes[0] - 1) * 100).toFixed(2)
  const vol = (stdev(simpleReturns(closes)) * 100).toFixed(2)
  return `${sessions} sessions: ${chg}% (H:${Math.max(...closes).toFixed(2)} L:${Math.min(...closes).toFixed(2)} daily vol:${vol}%)`
}

export async function runResearch(symbol: string, opts: ResearchOptions = {}): Promise<ResearchResult> {
  const status = opts.onStatus ?? (() => {})
  const wantNews = opts.news ?? true
  const wantNarrative = opts.narrative ?? Boolean(process.env.GOOGLE_API_KEY)

  // 1. Resolve the instrument
  status('Resolving symbol against the NSE instrument list...', 1)
  await ensureInstruments()
  const instrument = getInstrument(symbol)
  if (!instrument) throw new Error(`"${symbol}" is not a listed NSE equity. Search for it by name instead.`)

  // 2. Price history (database first, then Upstox → Yahoo), verified against NSE
  status(`Loading daily price history for ${symbol}...`, 2)
  const history = await getDailyHistory(symbol)
  const bars = history.bars
  const verification = await verifyLatestClose(symbol, bars)
  const last = bars[bars.length - 1]
  status(`${bars.length} sessions from ${history.source} up to ${last.date} — ${verification.detail}`, 2)
  const warnings = [...history.warnings]
  if (bars.length < 253) warnings.push(`Only ${bars.length} sessions of history; some factors use shorter windows or defaults.`)

  // 3. Fundamentals and sector P/E
  status('Fetching P/E, EPS and industry peer valuations...', 3)
  let fundamentals: Fundamentals | null = null
  try {
    fundamentals = await getFundamentals(symbol)
    warnings.push(...fundamentals.warnings)
  } catch (err) {
    warnings.push(`Fundamentals unavailable (${(err as Error).message}).`)
  }

  // 4. News + FinBERT sentiment
  let sentiment: SentimentCounts | null = null
  let classified: Awaited<ReturnType<typeof classifyNews>> | null = null
  if (wantNews) {
    status(`Fetching 30 days of news for ${instrument.name}...`, 4)
    try {
      const articles = await fetchTickerNews(symbol, instrument.name, 30)
      status(`Running FinBERT sentiment on ${articles.length} headlines...`, 4)
      classified = await classifyNews(articles, (done, total) => status(`FinBERT: classified ${done}/${total} headlines...`, 4))
      sentiment = { positive: classified.positive.length, negative: classified.negative.length, neutral: classified.neutral.length }
    } catch (err) {
      warnings.push(`News sentiment unavailable (${(err as Error).message}); scored as neutral.`)
    }
  }

  // 5. Deterministic scores and volatility ranges
  status('Computing quantitative scores and price ranges for 3 horizons...', 5)
  const analyses = computeAnalyses({ bars, valuation: fundamentals, sentiment })

  // 6. Optional narrative. Scores are already final; a failure here changes nothing.
  if (wantNarrative && process.env.GOOGLE_API_KEY) {
    status('Writing analyst commentary...', 6)
    try {
      const histSummary = [5, 21, 63, 126, 252].map(n => windowStats(bars, n)).join('\n')
      const prompt = buildNarrativePrompt(symbol, instrument.name, last.close, last.date, histSummary, fundamentals, sentiment, analyses)
      const narrative = await createLLM().withStructuredOutput<Narrative>(NarrativeSchema).invoke(prompt)
      for (const h of HORIZONS) if (narrative[h]?.reasoning) analyses[h].reasoning = narrative[h].reasoning
    } catch (err) {
      console.error('LLM narrative failed:', err)
      status(`AI commentary unavailable (${(err as Error).message}) — scores are unaffected.`, 6)
    }
  } else {
    status('Skipping AI commentary (GOOGLE_API_KEY not set).', 6)
  }

  // 7. Record the call so it can be graded later
  status('Recording this call in the track record...', 7)
  recordPredictions({ symbol, asOf: last.date, entryPrice: last.close, analyses, origin: opts.origin ?? 'research' })

  const year = bars.slice(-252)
  const priorVolumes = bars.slice(-64, -1).map(b => b.volume).filter(v => v > 0)
  const fmt = (items: NonNullable<typeof classified>['positive']): NewsSummary[] =>
    items.map(i => ({
      title: i.title,
      link: i.link,
      publisher: i.publisher,
      publishedAt: i.publishedAt,
      reason: `${(i.confidence * 100).toFixed(0)}% confidence`,
    }))

  return {
    symbol,
    name: instrument.name,
    industry: instrument.industry,
    modelVersion: MODEL_VERSION,
    asOf: last.date,
    lastClose: last.close,
    quote: fundamentals?.quote ?? null,
    analyses,
    stats: {
      marketCap: fundamentals?.marketCap ?? null,
      pe: fundamentals?.pe ?? null,
      sectorPe: fundamentals?.sectorPe ?? null,
      peerCount: fundamentals?.peerCount ?? 0,
      eps: fundamentals?.eps ?? null,
      lastVolume: last.volume || null,
      avgVolume: priorVolumes.length ? mean(priorVolumes) : null,
      high52: Math.max(...year.map(b => b.high)),
      low52: Math.min(...year.map(b => b.low)),
    },
    news: {
      good: classified ? fmt(classified.positive).slice(0, 6) : [],
      bad: classified ? fmt(classified.negative).slice(0, 6) : [],
      neutral: classified ? fmt(classified.neutral).slice(0, 4) : [],
    },
    data: {
      historySource: history.source,
      sessions: bars.length,
      firstDate: bars[0].date,
      fetchedAt: history.fetchedAt,
      stale: history.stale,
      verification,
      warnings,
    },
    trackRecord: summarizeTrackRecord({ symbol }),
  }
}

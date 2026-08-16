// Deterministic scoring engine.
// All factor scores are computed from market data in code so that the same
// inputs always produce the same score — the LLM only writes narrative on top.

export type Horizon = 'weekly' | 'monthly' | 'longterm'
export const HORIZONS: Horizon[] = ['weekly', 'monthly', 'longterm']

export type Verdict = 'STRONG BUY' | 'BUY' | 'HOLD' | 'CAUTIOUS' | 'AVOID'

export interface FactorScore {
  score: number
  max: number
  detail: string
}

export interface HorizonAnalysis {
  score: number
  verdict: Verdict
  reasoning: string
  targetPrice: number | null
  breakdown: {
    momentum: FactorScore
    valuation: FactorScore
    volume: FactorScore
    sentiment: FactorScore
    volatility: FactorScore
  }
}

export interface QuoteData {
  price: number | null
  change: number | null
  changePercent: number | null
  currency: string
  marketCap: number | null
  volume: number | null
  avgVolume: number | null
  dayHigh: number | null
  dayLow: number | null
  fiftyTwoWeekHigh: number | null
  fiftyTwoWeekLow: number | null
  pe: number | null
  eps: number | null
}

export interface SentimentCounts {
  positive: number
  negative: number
  neutral: number
}

interface HistPoint {
  close: number
  date: string
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Percent change over the trailing `days` window, or null if not enough data. */
function pctChange(hist: HistPoint[], days: number): number | null {
  const cutoff = Date.now() - days * 86400000
  const slice = hist.filter(h => new Date(h.date).getTime() >= cutoff)
  if (slice.length < 2) return null
  const first = slice[0].close
  const last = slice[slice.length - 1].close
  if (!first) return null
  return ((last - first) / first) * 100
}

/** Daily return volatility (stdev, in %) over the trailing `days` window. */
function realizedVol(hist: HistPoint[], days: number): number | null {
  const cutoff = Date.now() - days * 86400000
  const closes = hist.filter(h => new Date(h.date).getTime() >= cutoff).map(h => h.close)
  if (closes.length < 5) return null
  const rets: number[] = []
  for (let i = 1; i < closes.length; i++) rets.push((closes[i] - closes[i - 1]) / closes[i - 1])
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length
  return Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) * 100
}

const fmtPct = (n: number | null) => (n === null ? 'n/a' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`)

/** Momentum 0–25: blended trailing returns, windows and scale chosen per horizon. */
function scoreMomentum(hist: HistPoint[], horizon: Horizon): FactorScore {
  // [shortWindow, longWindow, shortWeight, scale (% move that saturates the score)]
  const cfg: Record<Horizon, [number, number, number, number]> = {
    weekly: [7, 30, 0.65, 6],
    monthly: [30, 90, 0.6, 12],
    longterm: [180, 365, 0.5, 35],
  }
  const [wShort, wLong, shortWeight, scale] = cfg[horizon]
  const rShort = pctChange(hist, wShort)
  const rLong = pctChange(hist, wLong)

  if (rShort === null && rLong === null) {
    return { score: 12, max: 25, detail: 'Insufficient price history to measure momentum.' }
  }
  const blended =
    rShort !== null && rLong !== null
      ? rShort * shortWeight + rLong * (1 - shortWeight)
      : (rShort ?? rLong)!

  const score = Math.round(clamp(12.5 + (blended / scale) * 12.5, 0, 25))
  const trend = blended > 1 ? 'positive' : blended < -1 ? 'negative' : 'flat'
  return {
    score,
    max: 25,
    detail: `${wShort}d ${fmtPct(rShort)}, ${wLong}d ${fmtPct(rLong)} — ${trend} trend for this horizon.`,
  }
}

/** Valuation 0–20: trailing P/E bands adjusted by position in the 52-week range. */
function scoreValuation(quote: QuoteData): FactorScore {
  const { pe, eps, price, fiftyTwoWeekHigh, fiftyTwoWeekLow } = quote

  let base: number
  let peNote: string
  if (eps !== null && eps < 0) {
    base = 5
    peNote = 'negative earnings'
  } else if (pe === null) {
    base = 10
    peNote = 'P/E unavailable'
  } else if (pe < 10) { base = 18; peNote = `P/E ${pe.toFixed(1)} (deep value)` }
  else if (pe < 18) { base = 16; peNote = `P/E ${pe.toFixed(1)} (attractive)` }
  else if (pe < 28) { base = 13; peNote = `P/E ${pe.toFixed(1)} (fair)` }
  else if (pe < 45) { base = 9; peNote = `P/E ${pe.toFixed(1)} (rich)` }
  else if (pe < 70) { base = 6; peNote = `P/E ${pe.toFixed(1)} (expensive)` }
  else { base = 3; peNote = `P/E ${pe.toFixed(1)} (very expensive)` }

  let posNote = ''
  if (price !== null && fiftyTwoWeekHigh !== null && fiftyTwoWeekLow !== null && fiftyTwoWeekHigh > fiftyTwoWeekLow) {
    const pos = (price - fiftyTwoWeekLow) / (fiftyTwoWeekHigh - fiftyTwoWeekLow)
    if (pos < 0.3) { base += 2; posNote = `, trading in the lower third of its 52-week range` }
    else if (pos > 0.92) { base -= 2; posNote = `, trading near its 52-week high` }
  }

  return { score: Math.round(clamp(base, 0, 20)), max: 20, detail: `${peNote}${posNote}.` }
}

/** Volume 0–15: relative volume, read as confirmation of the prevailing move. */
function scoreVolume(quote: QuoteData, hist: HistPoint[]): FactorScore {
  const { volume, avgVolume } = quote
  if (!volume || !avgVolume) {
    return { score: 7, max: 15, detail: 'Volume data unavailable.' }
  }
  const ratio = volume / avgVolume
  const r7 = pctChange(hist, 7) ?? 0
  const direction = r7 >= 0 ? 1 : -1
  // Elevated volume confirms the current move; quiet tape is neutral.
  const score = Math.round(clamp(7.5 + (ratio - 1) * 5 * direction, 0, 15))
  const level = ratio > 1.5 ? 'heavy' : ratio > 1.1 ? 'above-average' : ratio < 0.7 ? 'light' : 'normal'
  return {
    score,
    max: 15,
    detail: `${level.charAt(0).toUpperCase() + level.slice(1)} volume at ${ratio.toFixed(2)}x the 3-month average, ${direction > 0 ? 'confirming' : 'pressuring'} the recent move.`,
  }
}

/** Sentiment 0–25: FinBERT positive/negative balance, weighted by coverage depth. */
function scoreSentiment(sentiment: SentimentCounts): FactorScore {
  const { positive, negative, neutral } = sentiment
  const polar = positive + negative
  const total = polar + neutral
  if (total === 0) {
    return { score: 12, max: 25, detail: 'No recent news coverage found.' }
  }
  if (polar === 0) {
    return { score: 12, max: 25, detail: `${total} recent articles, all neutral in tone.` }
  }
  const ratio = (positive - negative) / polar // -1 .. 1
  const coverage = Math.min(1, polar / 10) // thin coverage pulls toward neutral
  const score = Math.round(clamp(12.5 + ratio * 12.5 * coverage, 0, 25))
  const tone = ratio > 0.2 ? 'net positive' : ratio < -0.2 ? 'net negative' : 'mixed'
  return {
    score,
    max: 25,
    detail: `FinBERT on 30d of news: ${positive} positive / ${negative} negative / ${neutral} neutral — ${tone} tone.`,
  }
}

/** Volatility 0–15: lower realized volatility scores higher; long horizons penalize it harder. */
function scoreVolatility(hist: HistPoint[], horizon: Horizon): FactorScore {
  const window: Record<Horizon, number> = { weekly: 30, monthly: 90, longterm: 365 }
  const penalty: Record<Horizon, number> = { weekly: 2.2, monthly: 2.8, longterm: 3.5 }
  const vol = realizedVol(hist, window[horizon])
  if (vol === null) {
    return { score: 7, max: 15, detail: 'Insufficient history to measure volatility.' }
  }
  // ~1% daily stdev is calm; each extra point of vol costs `penalty` points.
  const score = Math.round(clamp(15 - Math.max(0, vol - 1) * penalty[horizon], 0, 15))
  const level = vol < 1.2 ? 'low' : vol < 2.2 ? 'moderate' : vol < 3.5 ? 'elevated' : 'high'
  return {
    score,
    max: 15,
    detail: `${vol.toFixed(2)}% daily volatility over ${window[horizon]}d — ${level} risk for this horizon.`,
  }
}

export function verdictForScore(score: number): Verdict {
  if (score >= 75) return 'STRONG BUY'
  if (score >= 60) return 'BUY'
  if (score >= 45) return 'HOLD'
  if (score >= 30) return 'CAUTIOUS'
  return 'AVOID'
}

/** Compute the full deterministic analysis for all three horizons. */
export function computeAnalyses(
  quote: QuoteData,
  hist: HistPoint[],
  sentiment: SentimentCounts
): Record<Horizon, HorizonAnalysis> {
  const out = {} as Record<Horizon, HorizonAnalysis>
  for (const horizon of HORIZONS) {
    const breakdown = {
      momentum: scoreMomentum(hist, horizon),
      valuation: scoreValuation(quote),
      volume: scoreVolume(quote, hist),
      sentiment: scoreSentiment(sentiment),
      volatility: scoreVolatility(hist, horizon),
    }
    const score =
      breakdown.momentum.score +
      breakdown.valuation.score +
      breakdown.volume.score +
      breakdown.sentiment.score +
      breakdown.volatility.score
    out[horizon] = {
      score,
      verdict: verdictForScore(score),
      // Default reasoning assembled from factor details; replaced by the LLM narrative when available.
      reasoning: `${breakdown.momentum.detail} ${breakdown.sentiment.detail} ${breakdown.valuation.detail}`,
      targetPrice: null,
      breakdown,
    }
  }
  return out
}

// Deterministic scoring engine.
// Every factor is computed from completed daily sessions (plus optional
// valuation and news inputs), so the same inputs always give the same score —
// and the backtester can replay this exact function on any past date.

import type { DailyBar } from './market/types'
import { priceRange, type PriceRange } from './ranges'
import { mean, simpleReturns, stdev } from './stats'

/** Bump whenever scoring logic changes, so track records never mix models. */
export const MODEL_VERSION = 'score-v2'

export type Horizon = 'weekly' | 'monthly' | 'longterm'
export const HORIZONS: Horizon[] = ['weekly', 'monthly', 'longterm']

/** Trading sessions each horizon looks ahead — used for ranges, backtests and grading calls. */
export const HORIZON_DAYS: Record<Horizon, number> = { weekly: 5, monthly: 21, longterm: 126 }

export type Verdict = 'STRONG BUY' | 'BUY' | 'HOLD' | 'CAUTIOUS' | 'AVOID'
export const VERDICTS: Verdict[] = ['STRONG BUY', 'BUY', 'HOLD', 'CAUTIOUS', 'AVOID']

export type FactorName = 'momentum' | 'valuation' | 'volume' | 'sentiment' | 'volatility'
export const FACTORS: FactorName[] = ['momentum', 'valuation', 'volume', 'sentiment', 'volatility']

export interface FactorScore {
  score: number
  max: number
  detail: string
}

export interface HorizonAnalysis {
  score: number
  verdict: Verdict
  reasoning: string
  range: PriceRange | null
  breakdown: Record<FactorName, FactorScore>
}

export interface ValuationInputs {
  pe: number | null
  eps: number | null
  /** Median trailing P/E of Nifty 500 peers in the same industry. */
  sectorPe: number | null
  peerCount: number
}

export interface SentimentCounts {
  positive: number
  negative: number
  neutral: number
}

export interface ScoreInputs {
  /** Completed sessions, oldest first, ending on the as-of date. */
  bars: DailyBar[]
  valuation?: ValuationInputs | null
  sentiment?: SentimentCounts | null
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const fmtPct = (n: number | null) => (n === null ? 'n/a' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`)
const PERIOD_LABEL: Record<number, string> = { 5: '1w', 21: '1m', 63: '3m', 126: '6m', 252: '1y' }

/** Percent change over the last `sessions` sessions, or null without enough history. */
export function sessionReturn(bars: DailyBar[], sessions: number): number | null {
  if (bars.length <= sessions) return null
  const last = bars[bars.length - 1].close
  const first = bars[bars.length - 1 - sessions].close
  return (last / first - 1) * 100
}

/** Momentum 0–25: blended trailing returns, windows and scale chosen per horizon. */
function scoreMomentum(bars: DailyBar[], horizon: Horizon): FactorScore {
  // [short window, long window, short weight, % move that saturates the score]
  const cfg: Record<Horizon, [number, number, number, number]> = {
    weekly: [5, 21, 0.65, 6],
    monthly: [21, 63, 0.6, 12],
    longterm: [126, 252, 0.5, 35],
  }
  const [wShort, wLong, shortWeight, scale] = cfg[horizon]
  const rShort = sessionReturn(bars, wShort)
  const rLong = sessionReturn(bars, wLong)

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
    detail: `${PERIOD_LABEL[wShort]} ${fmtPct(rShort)}, ${PERIOD_LABEL[wLong]} ${fmtPct(rLong)} — ${trend} trend for this horizon.`,
  }
}

/** Valuation 0–20: P/E relative to industry peers (absolute bands as fallback), adjusted by 52-week position. */
function scoreValuation(valuation: ValuationInputs | null | undefined, bars: DailyBar[]): FactorScore {
  const { pe = null, eps = null, sectorPe = null, peerCount = 0 } = valuation ?? {}

  let base: number
  let peNote: string
  if (eps !== null && eps < 0) {
    base = 5
    peNote = 'negative earnings'
  } else if (pe === null || pe <= 0) {
    base = 10
    peNote = 'P/E unavailable'
  } else if (sectorPe !== null && peerCount >= 3) {
    const rel = pe / sectorPe
    const [points, label]: [number, string] =
      rel < 0.6 ? [18, 'deep discount to sector'] :
      rel < 0.85 ? [16, 'below sector'] :
      rel < 1.15 ? [13, 'in line with sector'] :
      rel < 1.5 ? [9, 'premium to sector'] :
      rel < 2 ? [6, 'steep premium to sector'] :
      [3, 'extreme premium to sector']
    base = points
    peNote = `P/E ${pe.toFixed(1)} vs sector median ${sectorPe.toFixed(1)} across ${peerCount} peers (${rel.toFixed(2)}x, ${label})`
  } else {
    if (pe < 10) { base = 18; peNote = `P/E ${pe.toFixed(1)} (deep value)` }
    else if (pe < 18) { base = 16; peNote = `P/E ${pe.toFixed(1)} (attractive)` }
    else if (pe < 28) { base = 13; peNote = `P/E ${pe.toFixed(1)} (fair)` }
    else if (pe < 45) { base = 9; peNote = `P/E ${pe.toFixed(1)} (rich)` }
    else if (pe < 70) { base = 6; peNote = `P/E ${pe.toFixed(1)} (expensive)` }
    else { base = 3; peNote = `P/E ${pe.toFixed(1)} (very expensive)` }
    peNote += ', no sector comparison available'
  }

  let posNote = ''
  const year = bars.slice(-252)
  if (year.length >= 20) {
    const high = Math.max(...year.map(b => b.high))
    const low = Math.min(...year.map(b => b.low))
    if (high > low) {
      const pos = (year[year.length - 1].close - low) / (high - low)
      if (pos < 0.3) { base += 2; posNote = ', trading in the lower third of its 52-week range' }
      else if (pos > 0.92) { base -= 2; posNote = ', trading near its 52-week high' }
    }
  }

  return { score: Math.round(clamp(base, 0, 20)), max: 20, detail: `${peNote}${posNote}.` }
}

/** Volume 0–15: last session's volume vs its 3-month average, read as confirmation of the recent move. */
function scoreVolume(bars: DailyBar[]): FactorScore {
  const prior = bars.slice(-64, -1).map(b => b.volume).filter(v => v > 0)
  const last = bars[bars.length - 1]
  if (!last || last.volume <= 0 || prior.length < 20) {
    return { score: 7, max: 15, detail: 'Volume data unavailable.' }
  }
  const ratio = last.volume / mean(prior)
  const direction = (sessionReturn(bars, 5) ?? 0) >= 0 ? 1 : -1
  // Elevated volume confirms the current move; quiet tape is neutral.
  const score = Math.round(clamp(7.5 + (ratio - 1) * 5 * direction, 0, 15))
  const level = ratio > 1.5 ? 'heavy' : ratio > 1.1 ? 'above-average' : ratio < 0.7 ? 'light' : 'normal'
  return {
    score,
    max: 15,
    detail: `${level.charAt(0).toUpperCase() + level.slice(1)} volume at ${ratio.toFixed(2)}x the 3-month average in the last session, ${direction > 0 ? 'confirming' : 'pressuring'} the recent move.`,
  }
}

/** Sentiment 0–25: FinBERT positive/negative balance, weighted by coverage depth. */
function scoreSentiment(sentiment: SentimentCounts | null | undefined): FactorScore {
  if (!sentiment) {
    return { score: 12, max: 25, detail: 'News sentiment not available.' }
  }
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
function scoreVolatility(bars: DailyBar[], horizon: Horizon): FactorScore {
  const window: Record<Horizon, number> = { weekly: 21, monthly: 63, longterm: 252 }
  const penalty: Record<Horizon, number> = { weekly: 2.2, monthly: 2.8, longterm: 3.5 }
  const closes = bars.slice(-(window[horizon] + 1)).map(b => b.close)
  if (closes.length < 6) {
    return { score: 7, max: 15, detail: 'Insufficient history to measure volatility.' }
  }
  const vol = stdev(simpleReturns(closes)) * 100
  // ~1% daily stdev is calm; each extra point of vol costs `penalty` points.
  const score = Math.round(clamp(15 - Math.max(0, vol - 1) * penalty[horizon], 0, 15))
  const level = vol < 1.2 ? 'low' : vol < 2.2 ? 'moderate' : vol < 3.5 ? 'elevated' : 'high'
  return {
    score,
    max: 15,
    detail: `${vol.toFixed(2)}% daily volatility over ${PERIOD_LABEL[window[horizon]]} — ${level} risk for this horizon.`,
  }
}

export function verdictForScore(score: number): Verdict {
  if (score >= 75) return 'STRONG BUY'
  if (score >= 60) return 'BUY'
  if (score >= 45) return 'HOLD'
  if (score >= 30) return 'CAUTIOUS'
  return 'AVOID'
}

/** Compute the full deterministic analysis for all three horizons as of the last bar. */
export function computeAnalyses({ bars, valuation, sentiment }: ScoreInputs): Record<Horizon, HorizonAnalysis> {
  const out = {} as Record<Horizon, HorizonAnalysis>
  // Horizon-independent factors are computed once.
  const valuationScore = scoreValuation(valuation, bars)
  const volumeScore = scoreVolume(bars)
  const sentimentScore = scoreSentiment(sentiment)

  for (const horizon of HORIZONS) {
    const breakdown: Record<FactorName, FactorScore> = {
      momentum: scoreMomentum(bars, horizon),
      valuation: valuationScore,
      volume: volumeScore,
      sentiment: sentimentScore,
      volatility: scoreVolatility(bars, horizon),
    }
    const score = FACTORS.reduce((sum, f) => sum + breakdown[f].score, 0)
    out[horizon] = {
      score,
      verdict: verdictForScore(score),
      // Default reasoning assembled from factor details; replaced by the LLM narrative when available.
      reasoning: `${breakdown.momentum.detail} ${breakdown.sentiment.detail} ${breakdown.valuation.detail}`,
      range: priceRange(bars, HORIZON_DAYS[horizon]),
      breakdown,
    }
  }
  return out
}

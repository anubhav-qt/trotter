import type { DailyBar } from './market/types'
import { logReturns, mean } from './stats'

// Likely price ranges from volatility alone — no forecast of direction.
// "There's an ~80% chance the price ends between low and high after N
// sessions", assuming no drift. The backtester measures how often that
// actually held, so the 80% claim is checked rather than taken on faith.

export interface PriceRange {
  /** Target probability that the closing price lands inside [low, high]. */
  coverage: number
  horizonDays: number
  low: number
  high: number
  /** Horizon volatility of log returns (e.g. 0.06 = 6%). */
  sigma: number
}

export const RANGE_COVERAGE = 0.8
const Z = 1.2815515655446004 // 90th percentile of the standard normal → two-sided 80%
const EWMA_LAMBDA = 0.94 // RiskMetrics daily decay: recent days dominate "current" volatility
const PERSISTENCE = 0.97 // daily mean reversion of volatility toward its 1-year level (~23-day half-life)
const LOOKBACK = 252
const MIN_BARS = 64

/** Exponentially weighted daily variance (zero mean), seeded with the first 20 returns. */
export function ewmaVariance(rets: number[], lambda = EWMA_LAMBDA): number {
  const seedN = Math.min(20, rets.length)
  let v = mean(rets.slice(0, seedN).map(r => r * r))
  for (let i = seedN; i < rets.length; i++) v = lambda * v + (1 - lambda) * rets[i] ** 2
  return v
}

/**
 * Total variance over `h` sessions when today's daily variance `now` decays
 * geometrically toward the long-run level `longRun`: short horizons follow
 * the current regime, long horizons revert to the stock's normal.
 */
export function horizonVariance(now: number, longRun: number, h: number, persistence = PERSISTENCE): number {
  const decay = (persistence * (1 - persistence ** h)) / (1 - persistence)
  return h * longRun + (now - longRun) * decay
}

export function priceRange(bars: DailyBar[], horizonDays: number): PriceRange | null {
  if (bars.length < MIN_BARS) return null
  const rets = logReturns(bars.slice(-(LOOKBACK + 1)).map(b => b.close))
  const longRun = mean(rets.map(r => r * r))
  const variance = horizonVariance(ewmaVariance(rets), longRun, horizonDays)
  if (!(variance > 0)) return null

  const sigma = Math.sqrt(variance)
  const price = bars[bars.length - 1].close
  return {
    coverage: RANGE_COVERAGE,
    horizonDays,
    low: price * Math.exp(-Z * sigma),
    high: price * Math.exp(Z * sigma),
    sigma,
  }
}

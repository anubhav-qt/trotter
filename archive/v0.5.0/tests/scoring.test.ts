import { describe, expect, it } from 'vitest'
import { computeAnalyses, HORIZONS, sessionReturn, verdictForScore, type ScoreInputs } from '@/lib/scoring'
import { addDays } from '@/lib/market/time'
import type { DailyBar } from '@/lib/market/types'
import { makeBars } from './helpers'

const summary = (bars: DailyBar[], extra: Omit<ScoreInputs, 'bars'> = {}) => {
  const a = computeAnalyses({ bars, ...extra })
  return Object.fromEntries(HORIZONS.map(h => [h, { score: a[h].score, verdict: a[h].verdict, factors: Object.fromEntries(Object.entries(a[h].breakdown).map(([k, v]) => [k, v.score])) }]))
}

describe('computeAnalyses', () => {
  const bars = makeBars(400, { seed: 42 })

  it('is deterministic and pinned to known output (golden test)', () => {
    expect(summary(bars)).toEqual(summary(bars))
    expect(summary(bars, { valuation: { pe: 22, eps: 40, sectorPe: 30, peerCount: 8 }, sentiment: { positive: 6, negative: 2, neutral: 5 } }))
      .toMatchInlineSnapshot(`
        {
          "longterm": {
            "factors": {
              "momentum": 14,
              "sentiment": 18,
              "valuation": 16,
              "volatility": 13,
              "volume": 6,
            },
            "score": 67,
            "verdict": "BUY",
          },
          "monthly": {
            "factors": {
              "momentum": 14,
              "sentiment": 18,
              "valuation": 16,
              "volatility": 13,
              "volume": 6,
            },
            "score": 67,
            "verdict": "BUY",
          },
          "weekly": {
            "factors": {
              "momentum": 4,
              "sentiment": 18,
              "valuation": 16,
              "volatility": 13,
              "volume": 6,
            },
            "score": 57,
            "verdict": "HOLD",
          },
        }
      `)
  })

  it('depends only on the bars, not on the wall clock', () => {
    const shifted = bars.map(b => ({ ...b, date: addDays(b.date, 2000) }))
    expect(summary(shifted)).toEqual(summary(bars))
  })

  it('scores a steady uptrend above a steady downtrend', () => {
    const up = makeBars(300, { drift: 0.004, vol: 0.005, seed: 3 })
    const down = makeBars(300, { drift: -0.004, vol: 0.005, seed: 3 })
    for (const h of HORIZONS) {
      expect(computeAnalyses({ bars: up })[h].breakdown.momentum.score).toBeGreaterThan(20)
      expect(computeAnalyses({ bars: down })[h].breakdown.momentum.score).toBeLessThan(5)
    }
  })

  it('reads heavy volume as confirming the recent move', () => {
    const up = makeBars(120, { drift: 0.003, vol: 0, seed: 5 })
    const down = makeBars(120, { drift: -0.003, vol: 0, seed: 5 })
    const spike = (b: DailyBar[]) => [...b.slice(0, -1), { ...b[b.length - 1], volume: 3_000_000 }]
    expect(computeAnalyses({ bars: spike(up) }).weekly.breakdown.volume.score).toBe(15)
    expect(computeAnalyses({ bars: spike(down) }).weekly.breakdown.volume.score).toBe(0)
    expect(computeAnalyses({ bars: up }).weekly.breakdown.volume.detail).toMatch(/last session/)
  })

  it('values P/E against the sector median when enough peers exist', () => {
    const v = (pe: number, sectorPe: number | null, peerCount: number) =>
      computeAnalyses({ bars, valuation: { pe, eps: 10, sectorPe, peerCount } }).monthly.breakdown.valuation
    expect(v(15, 30, 10).detail).toMatch(/0\.50x, deep discount to sector/)
    expect(v(45, 30, 10).detail).toMatch(/premium to sector/)
    // A P/E of 45 is "rich" in absolute terms but in line for a sector trading at 45.
    expect(v(45, 45, 10).score).toBeGreaterThan(v(45, null, 0).score)
    expect(v(45, 30, 2).detail).toMatch(/no sector comparison/)
    expect(computeAnalyses({ bars, valuation: { pe: 20, eps: -3, sectorPe: 25, peerCount: 9 } }).monthly.breakdown.valuation.detail)
      .toMatch(/negative earnings/)
  })

  it('treats missing sentiment and valuation as neutral', () => {
    const a = computeAnalyses({ bars }).monthly.breakdown
    expect(a.sentiment).toMatchObject({ score: 12, detail: 'News sentiment not available.' })
    expect(a.valuation.detail).toMatch(/P\/E unavailable/)
  })

  it('handles short histories without throwing', () => {
    const a = computeAnalyses({ bars: makeBars(3) })
    expect(a.longterm.breakdown.momentum.detail).toMatch(/Insufficient/)
    expect(a.longterm.range).toBeNull()
  })

  it('attaches a price range per horizon, widening with the horizon', () => {
    const a = computeAnalyses({ bars })
    const width = (h: 'weekly' | 'monthly' | 'longterm') => a[h].range!.high - a[h].range!.low
    expect(width('weekly')).toBeLessThan(width('monthly'))
    expect(width('monthly')).toBeLessThan(width('longterm'))
    expect(a.weekly.range!.horizonDays).toBe(5)
  })
})

describe('helpers', () => {
  it('measures returns over sessions, not calendar days', () => {
    const bars = makeBars(10, { vol: 0, drift: Math.log(1.01) })
    expect(sessionReturn(bars, 5)).toBeCloseTo((1.01 ** 5 - 1) * 100, 6)
    expect(sessionReturn(bars, 10)).toBeNull()
  })

  it('maps scores to verdicts', () => {
    expect([80, 75, 74, 60, 59, 45, 44, 30, 29].map(verdictForScore)).toEqual([
      'STRONG BUY', 'STRONG BUY', 'BUY', 'BUY', 'HOLD', 'HOLD', 'CAUTIOUS', 'CAUTIOUS', 'AVOID',
    ])
  })
})

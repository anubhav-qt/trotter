import { describe, expect, it } from 'vitest'
import { formatBacktestMarkdown, judgeSignal, runBacktest } from '@/lib/backtest'
import type { DailyBar } from '@/lib/market/types'
import { makeBars } from './helpers'

function universe(n: number, bars: number, drift: (k: number) => number): Map<string, DailyBar[]> {
  return new Map(Array.from({ length: n }, (_, k) => [`S${k}`, makeBars(bars, { seed: 100 + k, vol: 0.015, drift: drift(k) })]))
}

describe('runBacktest', () => {
  it('finds no skill in pure random walks', () => {
    const report = runBacktest(universe(30, 900, () => 0), { universe: 'random' })
    for (const h of ['weekly', 'monthly'] as const) {
      expect(Math.abs(report.horizons[h]!.composite.meanIC!)).toBeLessThan(0.05)
    }
  })

  it('detects a planted momentum effect', () => {
    // Each stock keeps its own trend, so past winners keep winning.
    const report = runBacktest(universe(30, 900, k => (k - 15) * 0.0002), { universe: 'trending' })
    const monthly = report.horizons.monthly!
    expect(monthly.factors.momentum!.meanIC).toBeGreaterThan(0.1)
    expect(monthly.factors.momentum!.tStat).toBeGreaterThan(2)
    expect(judgeSignal(monthly.factors.momentum)).toMatch(/positive signal/)
    expect(monthly.quintiles.spreadPct).toBeGreaterThan(0)
    expect(monthly.verdicts['STRONG BUY'].avgExcessPct ?? 1).toBeGreaterThan(monthly.verdicts.AVOID.avgExcessPct ?? 0)
  })

  it('marks factors that cannot vary on prices alone as not testable', () => {
    const report = runBacktest(universe(10, 600, () => 0))
    expect(report.horizons.weekly!.factors.sentiment).toBeNull()
    expect(report.horizons.weekly!.factors.momentum).not.toBeNull()
  })

  it('checks the 80% ranges against what happened', () => {
    const range = runBacktest(universe(30, 900, () => 0)).horizons.weekly!.range
    expect(range.insideShare).toBeGreaterThan(0.72)
    expect(range.insideShare).toBeLessThan(0.88)
    expect(range.insideShare! + range.belowShare! + range.aboveShare!).toBeCloseTo(1, 10)
  })

  it('uses non-overlapping periods for rank statistics', () => {
    const report = runBacktest(universe(10, 900, () => 0))
    const weekly = report.horizons.weekly!.composite.periods
    const monthly = report.horizons.monthly!.composite.periods
    expect(monthly).toBeLessThan(weekly / 3)
    expect(report.horizons.longterm!.composite.periods).toBeLessThan(monthly)
  })

  it('never scores a stock before its warm-up history exists', () => {
    const report = runBacktest(universe(10, 250, () => 0))
    expect(report.horizons).toEqual({})
  })

  it('renders a plain-language report with caveats', () => {
    const md = formatBacktestMarkdown(runBacktest(universe(10, 600, () => 0), { universe: 'NIFTY 50' }))
    expect(md).toMatch(/^# Backtest — NIFTY 50/)
    expect(md).toMatch(/## weekly \(5 sessions\)/)
    expect(md).toMatch(/Survivorship bias/)
    expect(md).toMatch(/\| sentiment \| n\/a \| n\/a \| not testable on prices alone \|/)
  })
})

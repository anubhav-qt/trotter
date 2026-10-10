import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computeAnalyses, MODEL_VERSION } from '@/lib/scoring'
import { gradePending, gradePrediction, recordPredictions, summarizeTrackRecord } from '@/lib/track-record'
import { getDailyHistory } from '@/lib/market/history'
import { BENCHMARK, type DailyBar } from '@/lib/market/types'
import { getDb } from '@/lib/db'
import { freshDb, makeBars } from './helpers'

vi.mock('@/lib/market/history', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/market/history')>()),
  getDailyHistory: vi.fn(),
}))

const linear = (start: string, n: number, from: number, step: number): DailyBar[] =>
  makeBars(n, { start, vol: 0 }).map((b, i) => {
    const close = from + step * i
    return { ...b, open: close, high: close, low: close, close }
  })

beforeEach(() => {
  freshDb()
  vi.mocked(getDailyHistory).mockReset()
})

describe('gradePrediction', () => {
  const stock = linear('2026-01-01', 40, 100, 1) // +1 per session
  const bench = linear('2026-01-01', 40, 1000, 1) // +0.1% per session-ish
  const call = { id: 1, symbol: 'X', as_of: stock[10].date, horizon_days: 5, entry_price: 110, range_low: 105, range_high: 120 }

  it('measures return and excess over the benchmark across N sessions', () => {
    const g = gradePrediction(call, stock, bench)!
    expect(g.exitDate).toBe(stock[15].date)
    expect(g.returnPct).toBeCloseTo((115 / 110 - 1) * 100, 10)
    expect(g.benchmarkReturnPct).toBeCloseTo((1015 / 1010 - 1) * 100, 10)
    expect(g.excessReturnPct).toBeCloseTo(g.returnPct - g.benchmarkReturnPct!, 10)
    expect(g.inRange).toBe(true)
  })

  it('waits until the horizon has elapsed', () => {
    expect(gradePrediction({ ...call, as_of: stock[36].date }, stock, bench)).toBeNull()
  })

  it('is unaffected by a split after the call (uses the adjusted series)', () => {
    // Recorded at 110 before a 1:2 split; the provider later halves all history.
    const adjusted = stock.map(b => ({ ...b, close: b.close / 2 }))
    const g = gradePrediction(call, adjusted, bench)!
    expect(g.returnPct).toBeCloseTo((115 / 110 - 1) * 100, 10)
    expect(g.inRange).toBe(true)
  })

  it('drops the benchmark when it is stale', () => {
    expect(gradePrediction(call, stock, bench.slice(0, 12))!.excessReturnPct).toBeNull()
  })
})

describe('recording and summarizing', () => {
  it('records one call per symbol, session and horizon, then grades and summarizes them', async () => {
    const stock = linear('2026-01-01', 200, 100, 0.5) // rising
    const bench = linear('2026-01-01', 200, 1000, 0) // flat
    const asOf = stock[60]
    const analyses = computeAnalyses({ bars: stock.slice(0, 61) })

    recordPredictions({ symbol: 'UP', asOf: asOf.date, entryPrice: asOf.close, analyses, origin: 'snapshot' })
    recordPredictions({ symbol: 'UP', asOf: asOf.date, entryPrice: asOf.close, analyses, origin: 'research' }) // duplicate ignored
    expect((getDb().prepare('SELECT COUNT(*) AS n FROM predictions').get() as { n: number }).n).toBe(3)

    vi.mocked(getDailyHistory).mockImplementation(async symbol => ({
      symbol, bars: symbol === BENCHMARK ? bench : stock, source: 'upstox', fetchedAt: '', stale: false, warnings: [],
    }))
    const res = await gradePending(new Date('2026-12-31T12:00:00Z'))
    expect(res).toEqual({ graded: 3, pending: 0, errors: [] })

    const summary = summarizeTrackRecord({ symbol: 'UP' })
    expect(summary.modelVersion).toBe(MODEL_VERSION)
    expect(summary.firstCall).toBe(asOf.date)
    // A steady uptrend scores bullish on momentum, and it did beat a flat index.
    const weekly = summary.horizons.weekly
    expect(weekly.graded).toBe(1)
    expect(analyses.weekly.verdict).toMatch(/BUY/)
    expect(weekly.bullish).toMatchObject({ calls: 1, hitRate: 1 })
    expect(weekly.bullish.avgExcessPct).toBeGreaterThan(0)

    // Grading is idempotent.
    expect(await gradePending(new Date('2026-12-31T12:00:00Z'))).toEqual({ graded: 0, pending: 0, errors: [] })
  })

  it('skips calls that cannot be due yet without fetching anything', async () => {
    const bars = makeBars(100, { start: '2026-06-01' })
    recordPredictions({ symbol: 'X', asOf: '2026-10-06', entryPrice: 100, analyses: computeAnalyses({ bars }), origin: 'research' })
    expect(await gradePending(new Date('2026-10-07T12:00:00Z'))).toEqual({ graded: 0, pending: 3, errors: [] })
    expect(getDailyHistory).not.toHaveBeenCalled()
  })
})

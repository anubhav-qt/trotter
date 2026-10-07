import { getDb } from './db'
import { getDailyHistory } from './market/history'
import { addDays, istDate } from './market/time'
import { BENCHMARK, type DailyBar } from './market/types'
import { HORIZON_DAYS, HORIZONS, MODEL_VERSION, type Horizon, type HorizonAnalysis, type Verdict } from './scoring'

// Every call Trotter makes is stored, then graded once its horizon has passed:
// did the stock beat the Nifty 50 over the following N sessions, and did the
// price land inside the predicted range?

export type Origin = 'research' | 'snapshot'

const BULLISH: Verdict[] = ['STRONG BUY', 'BUY']
const BEARISH: Verdict[] = ['CAUTIOUS', 'AVOID']

export function recordPredictions(args: {
  symbol: string
  asOf: string
  entryPrice: number
  analyses: Record<Horizon, HorizonAnalysis>
  origin: Origin
}): void {
  const db = getDb()
  const insert = db.prepare(
    `INSERT OR IGNORE INTO predictions
       (created_at, origin, model_version, symbol, as_of, horizon, horizon_days, score, verdict, entry_price, range_low, range_high)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  const now = new Date().toISOString()
  db.transaction(() => {
    for (const h of HORIZONS) {
      const a = args.analyses[h]
      insert.run(now, args.origin, MODEL_VERSION, args.symbol, args.asOf, h, HORIZON_DAYS[h], a.score, a.verdict,
        args.entryPrice, a.range?.low ?? null, a.range?.high ?? null)
    }
  })()
}

// ---------- Grading ----------

export interface PendingPrediction {
  id: number
  symbol: string
  as_of: string
  horizon_days: number
  entry_price: number
  range_low: number | null
  range_high: number | null
}

export interface Grade {
  exitDate: string
  returnPct: number
  benchmarkReturnPct: number | null
  excessReturnPct: number | null
  inRange: boolean | null
}

/** Index of the last bar dated on or before `date`, or -1. */
function lastOnOrBefore(bars: DailyBar[], date: string): number {
  let lo = 0, hi = bars.length - 1, found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (bars[mid].date <= date) { found = mid; lo = mid + 1 } else hi = mid - 1
  }
  return found
}

/**
 * Grade one call from current (split-adjusted) history. Returns are measured
 * on the adjusted series, so a split between call and grading can't distort them.
 * Null when the horizon hasn't elapsed yet.
 */
export function gradePrediction(p: PendingPrediction, bars: DailyBar[], benchmark: DailyBar[] | null): Grade | null {
  const i = lastOnOrBefore(bars, p.as_of)
  if (i < 0 || i + p.horizon_days >= bars.length) return null
  const entry = bars[i]
  const exit = bars[i + p.horizon_days]
  const ret = exit.close / entry.close - 1

  let benchRet: number | null = null
  if (benchmark) {
    const bi = lastOnOrBefore(benchmark, entry.date)
    const be = lastOnOrBefore(benchmark, exit.date)
    // Only trust the benchmark if it has data up to (nearly) the exit date.
    if (bi >= 0 && be > bi && benchmark[be].date >= addDays(exit.date, -4)) {
      benchRet = benchmark[be].close / benchmark[bi].close - 1
    }
  }

  let inRange: boolean | null = null
  if (p.range_low !== null && p.range_high !== null) {
    const moved = 1 + ret
    inRange = moved >= p.range_low / p.entry_price && moved <= p.range_high / p.entry_price
  }

  return {
    exitDate: exit.date,
    returnPct: ret * 100,
    benchmarkReturnPct: benchRet === null ? null : benchRet * 100,
    excessReturnPct: benchRet === null ? null : (ret - benchRet) * 100,
    inRange,
  }
}

/** Grade every call whose horizon has elapsed. Safe to run repeatedly. */
export async function gradePending(now: Date = new Date()): Promise<{ graded: number; pending: number; errors: string[] }> {
  const db = getDb()
  const pending = db
    .prepare('SELECT id, symbol, as_of, horizon_days, entry_price, range_low, range_high FROM predictions WHERE evaluated_at IS NULL')
    .all() as PendingPrediction[]

  // N sessions take at least N * 7/5 calendar days; skip calls that can't be due yet.
  const today = istDate(now)
  const due = pending.filter(p => addDays(p.as_of, Math.floor((p.horizon_days * 7) / 5)) <= today)
  if (due.length === 0) return { graded: 0, pending: pending.length, errors: [] }

  const errors: string[] = []
  let benchmark: DailyBar[] | null = null
  try {
    benchmark = (await getDailyHistory(BENCHMARK, { now })).bars
  } catch (err) {
    errors.push(`Benchmark unavailable: ${(err as Error).message}`)
  }

  const update = db.prepare(
    `UPDATE predictions SET exit_date = ?, return_pct = ?, benchmark_return_pct = ?, excess_return_pct = ?,
       in_range = ?, evaluated_at = ? WHERE id = ?`
  )
  let graded = 0
  const bySymbol = Map.groupBy(due, p => p.symbol)
  for (const [symbol, calls] of bySymbol) {
    let bars: DailyBar[]
    try {
      bars = (await getDailyHistory(symbol, { now })).bars
    } catch (err) {
      errors.push(`${symbol}: ${(err as Error).message}`)
      continue
    }
    for (const p of calls) {
      const g = gradePrediction(p, bars, benchmark)
      if (!g) continue
      update.run(g.exitDate, g.returnPct, g.benchmarkReturnPct, g.excessReturnPct,
        g.inRange === null ? null : Number(g.inRange), now.toISOString(), p.id)
      graded++
    }
  }
  return { graded, pending: pending.length - graded, errors }
}

// ---------- Summary ----------

export interface GradeBucket {
  calls: number
  avgReturnPct: number | null
  avgExcessPct: number | null
  /** Share of calls that went the predicted way vs the Nifty 50 (null for HOLD). */
  hitRate: number | null
}

export interface HorizonRecord {
  graded: number
  pending: number
  bullish: GradeBucket
  hold: GradeBucket
  bearish: GradeBucket
  /** Share of graded calls whose exit price fell inside the predicted 80% range. */
  rangeCoverage: number | null
}

export interface TrackRecordSummary {
  modelVersion: string
  symbol: string | null
  firstCall: string | null
  horizons: Record<Horizon, HorizonRecord>
}

interface GradedRow {
  horizon: Horizon
  verdict: Verdict
  return_pct: number | null
  excess_return_pct: number | null
  in_range: number | null
  evaluated_at: string | null
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

function bucket(rows: GradedRow[], direction: 1 | -1 | 0): GradeBucket {
  const excess = rows.map(r => r.excess_return_pct).filter((x): x is number => x !== null)
  return {
    calls: rows.length,
    avgReturnPct: avg(rows.map(r => r.return_pct).filter((x): x is number => x !== null)),
    avgExcessPct: avg(excess),
    hitRate: direction === 0 || excess.length === 0 ? null : excess.filter(x => x * direction > 0).length / excess.length,
  }
}

export function summarizeTrackRecord(opts: { symbol?: string; modelVersion?: string } = {}): TrackRecordSummary {
  const modelVersion = opts.modelVersion ?? MODEL_VERSION
  const symbol = opts.symbol ?? null
  const where = `model_version = ?${symbol ? ' AND symbol = ?' : ''}`
  const params = symbol ? [modelVersion, symbol] : [modelVersion]
  const db = getDb()
  const rows = db
    .prepare(`SELECT horizon, verdict, return_pct, excess_return_pct, in_range, evaluated_at FROM predictions WHERE ${where}`)
    .all(...params) as GradedRow[]
  const first = db.prepare(`SELECT MIN(as_of) AS d FROM predictions WHERE ${where}`).get(...params) as { d: string | null }

  const horizons = {} as Record<Horizon, HorizonRecord>
  for (const h of HORIZONS) {
    const all = rows.filter(r => r.horizon === h)
    const graded = all.filter(r => r.evaluated_at !== null)
    const ranged = graded.filter(r => r.in_range !== null)
    horizons[h] = {
      graded: graded.length,
      pending: all.length - graded.length,
      bullish: bucket(graded.filter(r => BULLISH.includes(r.verdict)), 1),
      hold: bucket(graded.filter(r => r.verdict === 'HOLD'), 0),
      bearish: bucket(graded.filter(r => BEARISH.includes(r.verdict)), -1),
      rangeCoverage: ranged.length ? ranged.filter(r => r.in_range === 1).length / ranged.length : null,
    }
  }
  return { modelVersion, symbol, firstCall: first.d, horizons }
}

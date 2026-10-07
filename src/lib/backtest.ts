import type { DailyBar } from './market/types'
import {
  computeAnalyses, FACTORS, HORIZON_DAYS, HORIZONS, MODEL_VERSION, VERDICTS,
  type FactorName, type Horizon, type HorizonAnalysis, type Verdict,
} from './scoring'
import { mean, spearman, stdev } from './stats'

// Walk-forward evaluation of the scoring model. On each evaluation date every
// stock is scored using only data available up to that date, then compared
// with what its price did over the following N sessions. The question it
// answers: do higher scores actually lead to better returns than lower ones?

export interface BacktestOptions {
  horizons?: Horizon[]
  /** Sessions of history required before a stock is first scored. */
  warmupBars?: number
  /** Sessions between evaluation dates. */
  stepBars?: number
  /** Minimum stocks on a date for cross-sectional statistics. */
  minCrossSection?: number
  universe?: string
}

/** How well a score ranks stocks by subsequent return (Spearman information coefficient). */
export interface RankSignal {
  /** Average IC across non-overlapping evaluation dates; >0 means higher score → higher return. */
  meanIC: number | null
  tStat: number | null
  /** Share of dates with a positive IC. */
  positiveShare: number | null
  periods: number
}

export interface VerdictStats {
  observations: number
  avgForwardPct: number | null
  /** Average return relative to the equal-weighted universe on the same dates. */
  avgExcessPct: number | null
  beatUniverseRate: number | null
}

export interface HorizonReport {
  horizonDays: number
  observations: number
  composite: RankSignal
  /** Per factor; null where the factor doesn't vary in a price-only backtest. */
  factors: Record<FactorName, RankSignal | null>
  quintiles: { topAvgPct: number | null; bottomAvgPct: number | null; spreadPct: number | null; universeAvgPct: number | null }
  verdicts: Record<Verdict, VerdictStats>
  range: { coverage: number; insideShare: number | null; belowShare: number | null; aboveShare: number | null }
}

export interface BacktestReport {
  modelVersion: string
  universe: string
  symbols: number
  from: string | null
  to: string | null
  horizons: Partial<Record<Horizon, HorizonReport>>
  caveats: string[]
}

interface Observation {
  date: string
  analysis: HorizonAnalysis
  exit: number // close N sessions later
  forward: number // fractional return over the horizon
}

/** Bars handed to the scorer: enough for every window it uses (1 year + margin). */
const SCORING_WINDOW = 300

function rankSignal(perDate: Array<number | null>): RankSignal {
  const ics = perDate.filter((x): x is number => x !== null)
  if (ics.length < 2) return { meanIC: ics[0] ?? null, tStat: null, positiveShare: ics.length ? Number(ics[0] > 0) : null, periods: ics.length }
  const sd = stdev(ics)
  return {
    meanIC: mean(ics),
    tStat: sd > 0 ? (mean(ics) / sd) * Math.sqrt(ics.length) : null,
    positiveShare: ics.filter(x => x > 0).length / ics.length,
    periods: ics.length,
  }
}

const avgOrNull = (xs: number[]) => (xs.length ? mean(xs) : null)

export function runBacktest(series: Map<string, DailyBar[]>, opts: BacktestOptions = {}): BacktestReport {
  const horizons = opts.horizons ?? HORIZONS
  const warmup = opts.warmupBars ?? 252
  const step = opts.stepBars ?? 5
  const minN = opts.minCrossSection ?? 5

  // Master calendar: every session any stock traded.
  const calendar = [...new Set([...series.values()].flatMap(bars => bars.map(b => b.date)))].sort()
  const index = new Map([...series].map(([sym, bars]) => [sym, new Map(bars.map((b, i) => [b.date, i]))]))

  // Score every stock on every evaluation date once; all horizons share the work.
  const byDate: Array<{ date: string; obs: Record<Horizon, Observation[]> }> = []
  for (let t = 0; t < calendar.length; t += step) {
    const date = calendar[t]
    const obs = Object.fromEntries(horizons.map(h => [h, [] as Observation[]])) as Record<Horizon, Observation[]>
    for (const [symbol, bars] of series) {
      const i = index.get(symbol)!.get(date)
      if (i === undefined || i < warmup) continue
      const due = horizons.filter(h => i + HORIZON_DAYS[h] < bars.length)
      if (due.length === 0) continue
      const analyses = computeAnalyses({ bars: bars.slice(Math.max(0, i + 1 - SCORING_WINDOW), i + 1) })
      for (const h of due) {
        const exit = bars[i + HORIZON_DAYS[h]].close
        obs[h].push({ date, analysis: analyses[h], exit, forward: exit / bars[i].close - 1 })
      }
    }
    byDate.push({ date, obs })
  }

  const report: BacktestReport = {
    modelVersion: MODEL_VERSION,
    universe: opts.universe ?? 'custom',
    symbols: series.size,
    from: null,
    to: null,
    horizons: {},
    caveats: [],
  }

  for (const h of horizons) {
    const dates = byDate.filter(d => d.obs[h].length >= minN)
    if (dates.length === 0) continue
    report.from = !report.from || dates[0].date < report.from ? dates[0].date : report.from
    report.to = !report.to || dates[dates.length - 1].date > report.to ? dates[dates.length - 1].date : report.to

    // Rank statistics use non-overlapping dates so the t-stat isn't inflated by reused returns.
    const stride = Math.max(1, Math.round(HORIZON_DAYS[h] / step))
    const independent = dates.filter((_, k) => k % stride === 0)
    const icFor = (pick: (o: Observation) => number) =>
      independent.map(d => spearman(d.obs[h].map(pick), d.obs[h].map(o => o.forward)))

    const factors = {} as Record<FactorName, RankSignal | null>
    for (const f of FACTORS) {
      const signal = rankSignal(icFor(o => o.analysis.breakdown[f].score))
      factors[f] = signal.periods > 0 ? signal : null
    }

    // Quintile and verdict statistics use every date (averages aren't biased by overlap).
    const tops: number[] = [], bottoms: number[] = [], universe: number[] = []
    const verdictExcess = new Map<Verdict, Array<{ fwd: number; excess: number }>>(VERDICTS.map(v => [v, []]))
    let inside = 0, below = 0, above = 0, ranged = 0
    for (const d of dates) {
      const obs = d.obs[h]
      const avg = mean(obs.map(o => o.forward))
      universe.push(avg)
      const sorted = [...obs].sort((a, b) => b.analysis.score - a.analysis.score)
      const q = Math.max(1, Math.floor(sorted.length / 5))
      tops.push(mean(sorted.slice(0, q).map(o => o.forward)))
      bottoms.push(mean(sorted.slice(-q).map(o => o.forward)))
      for (const o of obs) {
        verdictExcess.get(o.analysis.verdict)!.push({ fwd: o.forward, excess: o.forward - avg })
        const r = o.analysis.range
        if (r) {
          ranged++
          if (o.exit < r.low) below++
          else if (o.exit > r.high) above++
          else inside++
        }
      }
    }

    const verdicts = {} as Record<Verdict, VerdictStats>
    for (const v of VERDICTS) {
      const rows = verdictExcess.get(v)!
      verdicts[v] = {
        observations: rows.length,
        avgForwardPct: rows.length ? mean(rows.map(r => r.fwd)) * 100 : null,
        avgExcessPct: rows.length ? mean(rows.map(r => r.excess)) * 100 : null,
        beatUniverseRate: rows.length ? rows.filter(r => r.excess > 0).length / rows.length : null,
      }
    }

    const top = avgOrNull(tops), bottom = avgOrNull(bottoms)
    report.horizons[h] = {
      horizonDays: HORIZON_DAYS[h],
      observations: dates.reduce((n, d) => n + d.obs[h].length, 0),
      composite: rankSignal(icFor(o => o.analysis.score)),
      factors,
      quintiles: {
        topAvgPct: top === null ? null : top * 100,
        bottomAvgPct: bottom === null ? null : bottom * 100,
        spreadPct: top === null || bottom === null ? null : (top - bottom) * 100,
        universeAvgPct: universe.length ? mean(universe) * 100 : null,
      },
      verdicts,
      range: {
        coverage: 0.8,
        insideShare: ranged ? inside / ranged : null,
        belowShare: ranged ? below / ranged : null,
        aboveShare: ranged ? above / ranged : null,
      },
    }
  }

  report.caveats = [
    `Survivorship bias: the universe is today's ${report.universe} members, so stocks that were dropped or delisted are missing. This flatters results.`,
    'Price-only test: there is no point-in-time history of P/E or news here, so sentiment is held neutral and valuation only reflects the 52-week-range adjustment. Their real value can only be judged from the live track record.',
    'No costs or slippage: this measures ranking skill, not a tradable strategy.',
    'Prices are split-adjusted closes; dividends are ignored.',
  ]
  return report
}

// ---------- Plain-language report ----------

const fmt = (n: number | null, d = 2) => (n === null ? 'n/a' : n.toFixed(d))
const fmtPct = (n: number | null) => (n === null ? 'n/a' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`)
const fmtShare = (n: number | null) => (n === null ? 'n/a' : `${Math.round(n * 100)}%`)

export function judgeSignal(s: RankSignal | null): string {
  if (!s || s.meanIC === null || s.tStat === null) return 'not enough data'
  if (s.tStat >= 2) return s.meanIC >= 0.05 ? 'useful positive signal' : 'weak but real positive signal'
  if (s.tStat <= -2) return 'signal points the WRONG way'
  return 'no reliable signal (could be luck)'
}

export function formatBacktestMarkdown(r: BacktestReport): string {
  const lines: string[] = [
    `# Backtest — ${r.universe}, model ${r.modelVersion}`,
    '',
    `${r.symbols} stocks, evaluated ${r.from ?? '?'} → ${r.to ?? '?'}.`,
    '',
    'IC = rank correlation between the score and the next N sessions\' return (0 = no skill, 0.05+ is good for stock ranking). t ≥ 2 means unlikely to be luck.',
    '',
  ]
  for (const h of HORIZONS) {
    const hr = r.horizons[h]
    if (!hr) continue
    lines.push(`## ${h} (${hr.horizonDays} sessions)`, '')
    lines.push(`**Overall score: ${judgeSignal(hr.composite)}** — IC ${fmt(hr.composite.meanIC, 3)}, t ${fmt(hr.composite.tStat)}, positive on ${fmtShare(hr.composite.positiveShare)} of ${hr.composite.periods} periods.`, '')
    lines.push(`Top 20% by score averaged ${fmtPct(hr.quintiles.topAvgPct)} vs bottom 20% ${fmtPct(hr.quintiles.bottomAvgPct)} (spread ${fmtPct(hr.quintiles.spreadPct)}; universe ${fmtPct(hr.quintiles.universeAvgPct)}).`, '')
    lines.push('| Factor | IC | t | Verdict |', '|---|---|---|---|')
    for (const f of FACTORS) {
      const s = hr.factors[f]
      lines.push(`| ${f} | ${fmt(s?.meanIC ?? null, 3)} | ${fmt(s?.tStat ?? null)} | ${s ? judgeSignal(s) : 'not testable on prices alone'} |`)
    }
    lines.push('', '| Verdict | Calls | Avg return | vs universe | Beat universe |', '|---|---|---|---|---|')
    for (const v of VERDICTS) {
      const s = hr.verdicts[v]
      lines.push(`| ${v} | ${s.observations} | ${fmtPct(s.avgForwardPct)} | ${fmtPct(s.avgExcessPct)} | ${fmtShare(s.beatUniverseRate)} |`)
    }
    lines.push('', `80% price range: actual price landed inside ${fmtShare(hr.range.insideShare)} of the time (below ${fmtShare(hr.range.belowShare)}, above ${fmtShare(hr.range.aboveShare)}).`, '')
  }
  lines.push('## Caveats', '', ...r.caveats.map(c => `- ${c}`), '')
  return lines.join('\n')
}

import { getDb } from '../db'
import { getInstrument } from './instruments'
import { addDays, expectedLastSession, istDate, isSessionComplete, sessionFinalAt } from './time'
import { HISTORY_SOURCES, type DailyBar, type HistorySource } from './types'
import { fetchUpstoxDaily, upstoxInstrumentKey } from './upstox'
import { fetchYahooDaily } from './yahoo'

// Daily history, database first. Each source keeps its own stored series; the
// first source with fresh, clean data wins, and anything odd is reported as a
// warning instead of being silently papered over.

export interface HistoryResult {
  symbol: string
  bars: DailyBar[]
  source: HistorySource
  fetchedAt: string
  /** True when every refresh failed and this is the last stored copy. */
  stale: boolean
  warnings: string[]
}

const SOURCE_LABEL: Record<HistorySource, string> = { upstox: 'Upstox', yahoo: 'Yahoo Finance' }

const HISTORY_YEARS = Number(process.env.TROTTER_HISTORY_YEARS) || 10
/** After a refresh that found no new session (e.g. a holiday), wait this long before retrying. */
const RETRY_AFTER_MS = 60 * 60_000
/** Incremental refreshes re-download this many days to detect re-adjusted history. */
const OVERLAP_DAYS = 14
/** Overlapping closes differing by more than this mean the provider re-adjusted history. */
const READJUST_TOLERANCE = 0.005
/** NSE stocks are capped at a 20% daily band; moves beyond these smell like an unadjusted split/bonus. */
const JUMP_DOWN = -0.3
const JUMP_UP = 0.4

export function configuredSources(): HistorySource[] {
  const env = process.env.TROTTER_HISTORY_SOURCES
  if (!env) return HISTORY_SOURCES
  const picked = env.split(',').map(s => s.trim()).filter((s): s is HistorySource => HISTORY_SOURCES.includes(s as HistorySource))
  return picked.length > 0 ? picked : HISTORY_SOURCES
}

// ---------- Pure helpers (unit-tested) ----------

/** Sort, dedupe, drop unfinished sessions and malformed rows, repair inconsistent high/low. */
export function sanitizeBars(bars: DailyBar[], now: Date = new Date()): DailyBar[] {
  const byDate = new Map<string, DailyBar>()
  for (const b of bars) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !isSessionComplete(b.date, now)) continue
    if (![b.open, b.high, b.low, b.close].every(v => Number.isFinite(v) && v > 0)) continue
    byDate.set(b.date, {
      ...b,
      high: Math.max(b.high, b.open, b.close),
      low: Math.min(b.low, b.open, b.close),
      volume: Number.isFinite(b.volume) && b.volume > 0 ? b.volume : 0,
    })
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function findSuspiciousJumps(bars: DailyBar[]): Array<{ date: string; change: number }> {
  const jumps: Array<{ date: string; change: number }> = []
  for (let i = 1; i < bars.length; i++) {
    const change = bars[i].close / bars[i - 1].close - 1
    if (change < JUMP_DOWN || change > JUMP_UP) jumps.push({ date: bars[i].date, change })
  }
  return jumps
}

/** True if any date present in both series has a materially different close. */
export function wasReadjusted(stored: DailyBar[], recent: DailyBar[]): boolean {
  const storedClose = new Map(stored.map(b => [b.date, b.close]))
  return recent.some(b => {
    const old = storedClose.get(b.date)
    return old !== undefined && Math.abs(b.close / old - 1) > READJUST_TOLERANCE
  })
}

export function needsRefresh(lastDate: string | null, fetchedAt: string | null, now: Date): boolean {
  if (!lastDate || !fetchedAt) return true
  const expected = expectedLastSession(now)
  if (lastDate >= expected) return false
  const fetched = Date.parse(fetchedAt)
  // Not tried since the expected session closed → try. Tried and still missing → holiday or
  // provider lag; back off instead of hammering it on every request.
  return fetched < sessionFinalAt(expected).getTime() || now.getTime() - fetched > RETRY_AFTER_MS
}

// ---------- Storage ----------

export function loadBars(symbol: string, source: HistorySource): DailyBar[] {
  return getDb()
    .prepare('SELECT date, open, high, low, close, volume FROM daily_bars WHERE symbol = ? AND source = ? ORDER BY date')
    .all(symbol, source) as DailyBar[]
}

function saveBars(symbol: string, source: HistorySource, bars: DailyBar[], replace: boolean, fetchedAt: string): void {
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO daily_bars (symbol, source, date, open, high, low, close, volume)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (symbol, source, date) DO UPDATE SET
       open = excluded.open, high = excluded.high, low = excluded.low,
       close = excluded.close, volume = excluded.volume`
  )
  db.transaction(() => {
    if (replace) db.prepare('DELETE FROM daily_bars WHERE symbol = ? AND source = ?').run(symbol, source)
    for (const b of bars) insert.run(symbol, source, b.date, b.open, b.high, b.low, b.close, b.volume)
    db.prepare(
      `INSERT INTO series_meta (symbol, source, fetched_at) VALUES (?, ?, ?)
       ON CONFLICT (symbol, source) DO UPDATE SET fetched_at = excluded.fetched_at`
    ).run(symbol, source, fetchedAt)
  })()
}

function loadFetchedAt(symbol: string, source: HistorySource): string | null {
  const row = getDb()
    .prepare('SELECT fetched_at FROM series_meta WHERE symbol = ? AND source = ?')
    .get(symbol, source) as { fetched_at: string } | undefined
  return row?.fetched_at ?? null
}

// ---------- Fetching ----------

function fetchFromSource(source: HistorySource, symbol: string, isin: string | null, from: string, to: string): Promise<DailyBar[]> {
  if (source === 'upstox') {
    const key = upstoxInstrumentKey(symbol, isin)
    if (!key) throw new Error('no ISIN on file, which Upstox needs')
    return fetchUpstoxDaily(key, from, to)
  }
  return fetchYahooDaily(symbol, from, to)
}

async function refreshSource(source: HistorySource, symbol: string, isin: string | null, stored: DailyBar[], now: Date): Promise<DailyBar[]> {
  const to = istDate(now)
  const fetchedAt = now.toISOString()

  if (stored.length > 0) {
    const from = addDays(stored[stored.length - 1].date, -OVERLAP_DAYS)
    const recent = sanitizeBars(await fetchFromSource(source, symbol, isin, from, to), now)
    if (!wasReadjusted(stored, recent)) {
      saveBars(symbol, source, recent, false, fetchedAt)
      return sanitizeBars([...stored, ...recent], now)
    }
    // A split or bonus changed past prices: fall through and replace the whole series.
  }

  const from = addDays(to, -Math.round(HISTORY_YEARS * 365.25))
  const full = sanitizeBars(await fetchFromSource(source, symbol, isin, from, to), now)
  if (full.length > 0) saveBars(symbol, source, full, true, fetchedAt)
  return full
}

const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`

export async function getDailyHistory(symbol: string, opts: { now?: Date } = {}): Promise<HistoryResult> {
  const now = opts.now ?? new Date()
  const isin = getInstrument(symbol)?.isin ?? null
  const warnings: string[] = []
  let fallback: HistoryResult | null = null

  for (const source of configuredSources()) {
    const label = SOURCE_LABEL[source]
    if (source === 'upstox' && !upstoxInstrumentKey(symbol, isin)) continue

    let bars = loadBars(symbol, source)
    let fetchedAt = loadFetchedAt(symbol, source)
    let stale = false

    if (needsRefresh(bars.at(-1)?.date ?? null, fetchedAt, now)) {
      try {
        bars = await refreshSource(source, symbol, isin, bars, now)
        fetchedAt = now.toISOString()
      } catch (err) {
        warnings.push(`${label} refresh failed (${(err as Error).message}).`)
        stale = bars.length > 0
      }
    }
    if (bars.length === 0 || !fetchedAt) {
      if (!stale) warnings.push(`${label} has no data for ${symbol}.`)
      continue
    }

    const candidate: HistoryResult = { symbol, bars, source, fetchedAt, stale, warnings: [] }
    const jumps = findSuspiciousJumps(bars)
    if (jumps.length > 0) {
      const last = jumps[jumps.length - 1]
      warnings.push(`${label} shows ${jumps.length} unexplained price jump(s), latest ${last.date} (${pct(last.change)}) — possible unadjusted split/bonus.`)
      fallback ??= candidate
      continue
    }
    if (stale) {
      fallback ??= candidate
      continue
    }
    return { ...candidate, warnings }
  }

  if (fallback) {
    if (fallback.stale) {
      warnings.push(`Using ${SOURCE_LABEL[fallback.source]} data last updated ${fallback.fetchedAt.slice(0, 16).replace('T', ' ')} UTC.`)
    }
    return { ...fallback, warnings }
  }
  throw new Error(`No price history available for ${symbol}. ${warnings.join(' ')}`.trim())
}

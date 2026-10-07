import { getDb } from '../db'
import { fetchFullBhavcopy } from './nse'
import { BENCHMARK, type DailyBar, type OfficialBar } from './types'

// Cross-check the latest close from our history source against NSE's own
// end-of-day file. One download per session covers every listed stock.

export interface Verification {
  status: 'verified' | 'mismatch' | 'unavailable'
  date: string | null
  officialClose: number | null
  diffPct: number | null
  detail: string
}

/** Closes within 1% agree: providers sometimes report last traded price instead of NSE's official close. */
const MATCH_TOLERANCE = 0.01
/** A session with no file yet is re-checked at most this often. */
const MISSING_RETRY_MS = 60 * 60_000

export function storeBhavcopy(date: string, rows: OfficialBar[]): void {
  const db = getDb()
  const insert = db.prepare(
    `INSERT OR REPLACE INTO nse_bhavcopy
       (date, symbol, series, prev_close, open, high, low, close, volume, delivery_pct)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  db.transaction(() => {
    for (const r of rows) {
      insert.run(r.date, r.symbol, r.series, r.prevClose, r.open, r.high, r.low, r.close, r.volume, r.deliveryPct)
    }
    markFile(date, 'ok')
  })()
}

function markFile(date: string, status: 'ok' | 'missing'): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO nse_bhavcopy_files (date, status, fetched_at) VALUES (?, ?, ?)')
    .run(date, status, new Date().toISOString())
}

/** Make sure NSE's file for `date` is stored. Returns false if it isn't (yet) available. */
export async function ensureBhavcopy(date: string): Promise<boolean> {
  const file = getDb()
    .prepare('SELECT status, fetched_at FROM nse_bhavcopy_files WHERE date = ?')
    .get(date) as { status: string; fetched_at: string } | undefined
  if (file?.status === 'ok') return true
  if (file && Date.now() - Date.parse(file.fetched_at) < MISSING_RETRY_MS) return false

  try {
    const rows = await fetchFullBhavcopy(date)
    if (!rows) {
      markFile(date, 'missing')
      return false
    }
    storeBhavcopy(date, rows)
    return true
  } catch (err) {
    console.warn(`NSE bhavcopy for ${date} unavailable:`, err)
    return false
  }
}

export function getOfficialClose(symbol: string, date: string): OfficialBar | null {
  // Prefer the regular equity series; fall back to trade-for-trade (BE/BZ) if that's all there is.
  const row = getDb()
    .prepare(
      `SELECT date, symbol, series, prev_close AS prevClose, open, high, low, close, volume, delivery_pct AS deliveryPct
       FROM nse_bhavcopy WHERE symbol = ? AND date = ?
       ORDER BY CASE series WHEN 'EQ' THEN 0 WHEN 'BE' THEN 1 WHEN 'BZ' THEN 2 ELSE 3 END
       LIMIT 1`
    )
    .get(symbol, date) as OfficialBar | undefined
  return row ?? null
}

export function compareClose(ours: number, official: number): Pick<Verification, 'status' | 'diffPct'> {
  const diff = ours / official - 1
  return { status: Math.abs(diff) <= MATCH_TOLERANCE ? 'verified' : 'mismatch', diffPct: diff * 100 }
}

export async function verifyLatestClose(symbol: string, bars: DailyBar[]): Promise<Verification> {
  const last = bars.at(-1)
  const none = (detail: string): Verification => ({ status: 'unavailable', date: last?.date ?? null, officialClose: null, diffPct: null, detail })
  if (!last) return none('No price history to verify.')
  if (symbol === BENCHMARK) return none('Index levels are not cross-checked.')

  await ensureBhavcopy(last.date)
  const official = getOfficialClose(symbol, last.date)
  if (!official) return none(`NSE's official file for ${last.date} isn't available yet.`)

  const { status, diffPct } = compareClose(last.close, official.close)
  return {
    status,
    date: last.date,
    officialClose: official.close,
    diffPct,
    detail:
      status === 'verified'
        ? `Close on ${last.date} matches NSE's official close.`
        : `Close on ${last.date} differs from NSE's official ₹${official.close.toFixed(2)} by ${diffPct!.toFixed(2)}%.`,
  }
}

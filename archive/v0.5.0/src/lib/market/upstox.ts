import { fetchJson } from './http'
import { addDays } from './time'
import { BENCHMARK, type DailyBar } from './types'

// Upstox v3 historical candles. This endpoint is public (the official SDK
// sends no auth for it); if UPSTOX_ACCESS_TOKEN is set it is sent anyway,
// which raises rate limits for account holders.

const BASE = 'https://api.upstox.com/v3/historical-candle'

// Requests are split into ~1-year windows to stay inside per-call range limits.
const CHUNK_DAYS = 365

interface CandleResponse {
  status?: string
  data?: { candles?: Array<[string, number, number, number, number, number, number?]> }
}

/** Upstox instrument key: NSE_EQ|<ISIN> for equities, NSE_INDEX|Nifty 50 for the benchmark. */
export function upstoxInstrumentKey(symbol: string, isin: string | null): string | null {
  if (symbol === BENCHMARK) return 'NSE_INDEX|Nifty 50'
  return isin ? `NSE_EQ|${isin}` : null
}

/** Candles arrive newest-first as [timestamp, open, high, low, close, volume, oi]. */
export function parseUpstoxCandles(json: CandleResponse): DailyBar[] {
  if (json.status && json.status !== 'success') throw new Error(`Upstox returned status "${json.status}"`)
  const candles = json.data?.candles ?? []
  return candles
    .map(([ts, open, high, low, close, volume]) => ({
      date: ts.slice(0, 10), // timestamps are IST, e.g. 2025-01-01T00:00:00+05:30
      open, high, low, close,
      volume: volume ?? 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchUpstoxDaily(instrumentKey: string, from: string, to: string): Promise<DailyBar[]> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (process.env.UPSTOX_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.UPSTOX_ACCESS_TOKEN}`

  const byDate = new Map<string, DailyBar>()
  for (let end = to; end >= from; end = addDays(end, -CHUNK_DAYS - 1)) {
    const start = addDays(end, -CHUNK_DAYS) < from ? from : addDays(end, -CHUNK_DAYS)
    const url = `${BASE}/${encodeURIComponent(instrumentKey)}/days/1/${end}/${start}`
    const bars = parseUpstoxCandles(await fetchJson<CandleResponse>(url, { headers }))
    for (const bar of bars) byDate.set(bar.date, bar)
    // An empty window before the listing date means there's nothing older to fetch.
    if (bars.length === 0 && byDate.size > 0) break
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

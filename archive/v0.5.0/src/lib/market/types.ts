/** One completed trading session. Dates are IST session dates (YYYY-MM-DD). */
export interface DailyBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

/** Providers of split-adjusted daily history, in default priority order. */
export type HistorySource = 'upstox' | 'yahoo'
export const HISTORY_SOURCES: HistorySource[] = ['upstox', 'yahoo']

export interface Instrument {
  symbol: string
  name: string
  isin: string | null
  series: string | null
  industry: string | null
}

/** A row of NSE's official end-of-day file (prices are NOT adjusted for splits). */
export interface OfficialBar {
  date: string
  symbol: string
  series: string
  prevClose: number | null
  open: number | null
  high: number | null
  low: number | null
  close: number
  volume: number | null
  deliveryPct: number | null
}

/** Internal symbol for the Nifty 50 index, used as the benchmark. */
export const BENCHMARK = 'NIFTY50'

export const INDEX_NAMES = ['NIFTY 50', 'NIFTY 100', 'NIFTY 200', 'NIFTY 500'] as const
export type IndexName = (typeof INDEX_NAMES)[number]

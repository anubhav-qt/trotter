import { getDb } from '../db'
import { median } from '../stats'
import type { ValuationInputs } from '../scoring'
import { getIndustryPeers, getInstrument } from './instruments'
import { istDate } from './time'
import { fetchYahooQuotes, type YahooQuote } from './yahoo'

// Trailing P/E, EPS and market cap come from Yahoo (no free official source
// has them). Sector P/E is computed by us: the median P/E of the stock's
// industry peers in the Nifty 500, from those same snapshots.

/** Peer snapshots older than this are not used for the sector median. */
const PEER_MAX_AGE_DAYS = 7
/** P/Es above this are distorted by near-zero earnings and are excluded from the median. */
const MAX_SANE_PE = 500

export interface Fundamentals extends ValuationInputs {
  marketCap: number | null
  industry: string | null
  /** Live (delayed) quote for display; scoring uses completed sessions only. */
  quote: Pick<YahooQuote, 'price' | 'change' | 'changePercent'> | null
  warnings: string[]
}

interface Row {
  symbol: string
  pe: number | null
  eps: number | null
  market_cap: number | null
}

function storeSnapshots(quotes: Map<string, YahooQuote>, date: string): void {
  const db = getDb()
  const upsert = db.prepare(
    `INSERT INTO fundamentals (symbol, date, pe, eps, market_cap, source, fetched_at)
     VALUES (?, ?, ?, ?, ?, 'yahoo', ?)
     ON CONFLICT (symbol, date) DO UPDATE SET
       pe = excluded.pe, eps = excluded.eps, market_cap = excluded.market_cap, fetched_at = excluded.fetched_at`
  )
  const now = new Date().toISOString()
  db.transaction(() => {
    for (const q of quotes.values()) upsert.run(q.symbol, date, q.pe, q.eps, q.marketCap, now)
  })()
}

function latestSnapshots(symbols: string[], sinceDate: string): Map<string, Row> {
  if (symbols.length === 0) return new Map()
  const rows = getDb()
    .prepare(
      `SELECT f.symbol, f.pe, f.eps, f.market_cap FROM fundamentals f
       JOIN (SELECT symbol, MAX(date) AS date FROM fundamentals
             WHERE date >= ? AND symbol IN (${symbols.map(() => '?').join(',')}) GROUP BY symbol) latest
         ON latest.symbol = f.symbol AND latest.date = f.date`
    )
    .all(sinceDate, ...symbols) as Row[]
  return new Map(rows.map(r => [r.symbol, r]))
}

/** Median P/E of peers; null unless at least 3 peers have a usable P/E. */
export function sectorMedianPe(peerPes: Array<number | null>): { sectorPe: number | null; peerCount: number } {
  const usable = peerPes.filter((pe): pe is number => pe !== null && pe > 0 && pe <= MAX_SANE_PE)
  return usable.length >= 3 ? { sectorPe: median(usable), peerCount: usable.length } : { sectorPe: null, peerCount: usable.length }
}

export async function getFundamentals(symbol: string, now: Date = new Date()): Promise<Fundamentals> {
  const today = istDate(now)
  const peers = getIndustryPeers(symbol)
  const warnings: string[] = []

  // Always re-quote the stock itself (for the live price); peers only once a day.
  const fresh = latestSnapshots(peers, today)
  const toFetch = [symbol, ...peers.filter(p => !fresh.has(p))]
  let quote: Fundamentals['quote'] = null
  try {
    const quotes = await fetchYahooQuotes(toFetch)
    storeSnapshots(quotes, today)
    const own = quotes.get(symbol)
    if (own) quote = { price: own.price, change: own.change, changePercent: own.changePercent }
  } catch (err) {
    warnings.push(`Fundamentals refresh failed (${(err as Error).message}); using the last stored values.`)
  }

  const since = istDate(new Date(now.getTime() - PEER_MAX_AGE_DAYS * 86_400_000))
  const snapshots = latestSnapshots([symbol, ...peers], since)
  const own = snapshots.get(symbol)
  const { sectorPe, peerCount } = sectorMedianPe(peers.map(p => snapshots.get(p)?.pe ?? null))
  if (!own) warnings.push('No P/E or EPS data available.')

  return {
    pe: own?.pe ?? null,
    eps: own?.eps ?? null,
    marketCap: own?.market_cap ?? null,
    sectorPe,
    peerCount,
    industry: getInstrument(symbol)?.industry ?? null,
    quote,
    warnings,
  }
}

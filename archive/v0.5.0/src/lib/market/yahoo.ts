import YahooFinance from 'yahoo-finance2'
import { istDate } from './time'
import { BENCHMARK, type DailyBar } from './types'

// Yahoo Finance is unofficial and rate-limited, so it is the fallback for
// history and the source only for things nobody else gives us for free:
// trailing P/E, EPS, market cap, and intraday candles for the chart.

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

export function yahooTicker(symbol: string): string {
  return symbol === BENCHMARK ? '^NSEI' : `${symbol}.NS`
}

interface RawQuote {
  date: Date
  open: number | null
  high: number | null
  low: number | null
  close: number | null
  volume: number | null
}

/** Normalize Yahoo chart rows into DailyBars keyed by IST session date. */
export function toDailyBars(quotes: RawQuote[]): DailyBar[] {
  const byDate = new Map<string, DailyBar>()
  for (const q of quotes) {
    if (q.close == null) continue
    const date = istDate(new Date(q.date))
    byDate.set(date, {
      date,
      open: q.open ?? q.close,
      high: q.high ?? q.close,
      low: q.low ?? q.close,
      close: q.close,
      volume: q.volume ?? 0,
    })
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchYahooDaily(symbol: string, from: string, to: string): Promise<DailyBar[]> {
  const chart = await yahooFinance.chart(yahooTicker(symbol), {
    period1: new Date(`${from}T00:00:00Z`),
    period2: new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000),
    interval: '1d',
  })
  return toDailyBars(chart.quotes)
}

export interface IntradayCandle {
  date: string
  open: number | null
  high: number | null
  low: number | null
  close: number
  volume: number | null
}

/** Intraday candles for display only — never used for scoring. */
export async function fetchYahooIntraday(symbol: string, days: number, interval: '5m' | '15m'): Promise<IntradayCandle[]> {
  const chart = await yahooFinance.chart(yahooTicker(symbol), {
    period1: new Date(Date.now() - days * 86_400_000),
    period2: new Date(),
    interval,
  })
  return chart.quotes
    .filter(q => q.close != null)
    .map(q => ({
      date: new Date(q.date).toISOString(),
      open: q.open ?? null,
      high: q.high ?? null,
      low: q.low ?? null,
      close: q.close as number,
      volume: q.volume ?? null,
    }))
}

export interface YahooQuote {
  symbol: string
  name: string | null
  price: number | null
  change: number | null
  changePercent: number | null
  pe: number | null
  eps: number | null
  marketCap: number | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Batch quotes keyed by NSE symbol. Missing symbols are simply absent. */
export async function fetchYahooQuotes(symbols: string[]): Promise<Map<string, YahooQuote>> {
  const out = new Map<string, YahooQuote>()
  for (let i = 0; i < symbols.length; i += 50) {
    const batch = symbols.slice(i, i + 50)
    const tickers = batch.map(yahooTicker)
    const quotes = await yahooFinance.quote(tickers, { return: 'array' })
    for (const q of quotes) {
      const symbol = batch[tickers.indexOf(q.symbol)]
      if (!symbol) continue
      out.set(symbol, {
        symbol,
        name: q.longName ?? q.shortName ?? null,
        price: num(q.regularMarketPrice),
        change: num(q.regularMarketChange),
        changePercent: num(q.regularMarketChangePercent),
        pe: num(q.trailingPE),
        eps: num(q.epsTrailingTwelveMonths),
        marketCap: num(q.marketCap),
      })
    }
  }
  return out
}

/** Fallback symbol search when the local NSE instrument list is unavailable. */
export async function searchYahooNse(query: string): Promise<Array<{ symbol: string; name: string }>> {
  const res = await yahooFinance.search(query, { quotesCount: 10, newsCount: 0 })
  return (res.quotes ?? [])
    .map(q => q as Record<string, unknown>)
    .filter(q => typeof q.symbol === 'string' && q.symbol.endsWith('.NS'))
    .map(q => ({
      symbol: (q.symbol as string).slice(0, -3),
      name: String(q.longname ?? q.shortname ?? q.symbol),
    }))
}

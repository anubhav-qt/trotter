import { type NextRequest } from 'next/server'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] })
export const dynamic = 'force-dynamic'

const SYMBOL_RE = /^[A-Z0-9.\-^=&]{1,20}$/i

type Interval = '5m' | '15m' | '1d' | '1wk' | '1mo'

const PERIOD_CONFIG: Record<string, { days: number | null; interval: Interval }> = {
  '1d': { days: 1, interval: '5m' },
  '1w': { days: 7, interval: '15m' },
  '1m': { days: 30, interval: '1d' },
  '6m': { days: 180, interval: '1d' },
  '1y': { days: 365, interval: '1wk' },
  'all': { days: null, interval: '1mo' },
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  const period = request.nextUrl.searchParams.get('period') || '1m'

  if (!symbol || !SYMBOL_RE.test(symbol)) {
    return Response.json({ error: 'A valid ticker symbol is required.' }, { status: 400 })
  }

  const config = PERIOD_CONFIG[period] ?? PERIOD_CONFIG['1m']

  try {
    const chart = await yahooFinance.chart(symbol, {
      period1: config.days ? new Date(Date.now() - config.days * 86400000) : new Date('2000-01-01'),
      period2: new Date(),
      interval: config.interval,
    })

    const candles = (chart?.quotes ?? [])
      .filter(q => q.close != null)
      .map(q => ({
        date: new Date(q.date).toISOString(),
        open: q.open ?? null,
        high: q.high ?? null,
        low: q.low ?? null,
        close: q.close as number,
        volume: q.volume ?? null,
      }))

    return Response.json({ candles })
  } catch (error) {
    console.error('Chart data error:', error)
    return Response.json({ candles: [], error: 'Failed to fetch chart data' }, { status: 502 })
  }
}

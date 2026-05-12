import { type NextRequest } from 'next/server'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] })
export const dynamic = 'force-dynamic'

type Period = '1d' | '1w' | '1m' | '6m' | '1y' | 'all'

function getPeriodConfig(period: Period): { period1: Date; interval: string } {
  const now = Date.now()
  switch (period) {
    case '1d':
      return { period1: new Date(now - 1 * 86400000), interval: '5m' }
    case '1w':
      return { period1: new Date(now - 7 * 86400000), interval: '15m' }
    case '1m':
      return { period1: new Date(now - 30 * 86400000), interval: '1d' }
    case '6m':
      return { period1: new Date(now - 180 * 86400000), interval: '1d' }
    case '1y':
      return { period1: new Date(now - 365 * 86400000), interval: '1wk' }
    case 'all':
      return { period1: new Date('2000-01-01'), interval: '1mo' }
    default:
      return { period1: new Date(now - 30 * 86400000), interval: '1d' }
  }
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')
  const period = (request.nextUrl.searchParams.get('period') || '1m') as Period

  if (!symbol) return Response.json({ error: 'Symbol required' }, { status: 400 })

  try {
    const config = getPeriodConfig(period)
    const chart = await yahooFinance.chart(symbol, {
      period1: config.period1,
      period2: new Date(),
      interval: config.interval,
    } as Record<string, unknown>)

    if (!chart?.quotes) {
      return Response.json({ candles: [] })
    }

    const candles = chart.quotes
      .filter((q: Record<string, unknown>) => q.close != null)
      .map((q: Record<string, unknown>) => ({
        date: new Date(q.date as string).toISOString(),
        open: q.open as number | null,
        high: q.high as number | null,
        low: q.low as number | null,
        close: q.close as number,
        volume: q.volume as number | null,
      }))

    return Response.json({ candles })
  } catch (error) {
    console.error('Chart data error:', error)
    return Response.json({ candles: [], error: 'Failed to fetch chart data' }, { status: 500 })
  }
}

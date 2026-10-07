import { type NextRequest } from 'next/server'
import { getDailyHistory } from '@/lib/market/history'
import { resample } from '@/lib/market/resample'
import { normalizeSymbol } from '@/lib/market/symbols'
import { addDays, istDate } from '@/lib/market/time'
import { fetchYahooIntraday } from '@/lib/market/yahoo'

export const dynamic = 'force-dynamic'

type Period = '1d' | '1w' | '1m' | '6m' | '1y' | 'all'

// Daily periods come from the same stored, verified history the score uses.
// Intraday periods are display-only and come from Yahoo (delayed).
const DAILY: Record<Exclude<Period, '1d' | '1w'>, { days: number | null; bucket: 'day' | 'week' | 'month' }> = {
  '1m': { days: 31, bucket: 'day' },
  '6m': { days: 183, bucket: 'day' },
  '1y': { days: 366, bucket: 'week' },
  all: { days: null, bucket: 'month' },
}

export async function GET(request: NextRequest) {
  const symbol = normalizeSymbol(request.nextUrl.searchParams.get('symbol'))
  const period = (request.nextUrl.searchParams.get('period') || '1m') as Period

  if (!symbol) {
    return Response.json({ error: 'A valid NSE symbol is required.' }, { status: 400 })
  }

  try {
    if (period === '1d' || period === '1w') {
      const candles = await fetchYahooIntraday(symbol, period === '1d' ? 1 : 7, period === '1d' ? '5m' : '15m')
      return Response.json({ candles, source: 'Yahoo Finance (intraday, delayed)' })
    }

    const config = DAILY[period] ?? DAILY['1m']
    const history = await getDailyHistory(symbol)
    const from = config.days ? addDays(istDate(), -config.days) : ''
    const daily = history.bars.filter(b => b.date >= from)
    const bars = config.bucket === 'day' ? daily : resample(daily, config.bucket)
    const candles = bars.map(b => ({
      // Noon IST keeps the calendar date stable in any browser timezone.
      date: `${b.date}T12:00:00+05:30`,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }))
    return Response.json({ candles, source: `${history.source === 'upstox' ? 'Upstox' : 'Yahoo Finance'} (end of day)` })
  } catch (error) {
    console.error('Chart data error:', error)
    return Response.json({ candles: [], error: 'Failed to fetch chart data' }, { status: 502 })
  }
}

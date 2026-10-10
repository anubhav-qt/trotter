import { type NextRequest } from 'next/server'
import { searchWithFallback } from '@/lib/market/instruments'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (query.length < 1 || query.length > 60) {
    return Response.json({ results: [] })
  }

  try {
    const results = (await searchWithFallback(query)).map(r => ({
      symbol: r.symbol,
      name: r.name,
      exchange: 'NSE',
      type: r.industry ?? (r.inNifty500 ? 'Nifty 500' : 'Equity'),
    }))
    return Response.json({ results })
  } catch (error) {
    console.error('Symbol search error:', error)
    return Response.json({ results: [], error: 'Search failed' }, { status: 500 })
  }
}

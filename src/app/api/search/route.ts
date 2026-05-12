import { type NextRequest } from 'next/server'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance()

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const query = searchParams.get('q')

  if (!query || query.trim().length < 1) {
    return Response.json({ results: [] })
  }

  try {
    const searchResults = await yahooFinance.search(query, {
      quotesCount: 10,
      newsCount: 0,
    })

    const results = (searchResults.quotes || [])
      .filter((q: Record<string, unknown>) => q.symbol && q.shortname)
      .map((q: Record<string, unknown>) => ({
        symbol: q.symbol as string,
        name: (q.shortname || q.longname || '') as string,
        exchange: (q.exchange || q.exchDisp || 'N/A') as string,
        type: (q.quoteType || q.typeDisp || 'Equity') as string,
      }))

    return Response.json({ results })
  } catch (error) {
    console.error('Yahoo Finance search error:', error)
    return Response.json({ results: [], error: 'Search failed' }, { status: 500 })
  }
}

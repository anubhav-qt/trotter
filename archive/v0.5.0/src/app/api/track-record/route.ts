import { type NextRequest } from 'next/server'
import { normalizeSymbol } from '@/lib/market/symbols'
import { summarizeTrackRecord } from '@/lib/track-record'

export const dynamic = 'force-dynamic'

/** Graded record of past calls: whole model, or one symbol with ?symbol=. */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('symbol')
  const symbol = raw ? normalizeSymbol(raw) : null
  if (raw && !symbol) {
    return Response.json({ error: 'Invalid symbol.' }, { status: 400 })
  }
  return Response.json(summarizeTrackRecord(symbol ? { symbol } : {}))
}

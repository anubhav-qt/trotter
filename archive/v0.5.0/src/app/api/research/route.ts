import { type NextRequest } from 'next/server'
import { normalizeSymbol } from '@/lib/market/symbols'
import { runResearch, RESEARCH_STEPS } from '@/lib/research'
import type { ResearchResult } from '@/lib/research-types'

export const dynamic = 'force-dynamic'

// Cache completed research per symbol so repeat searches are instant and
// identical. Scores only change after a new session closes, but news does
// move intraday, so keep the TTL short.
const CACHE_TTL_MS = 10 * 60 * 1000
const cache = new Map<string, { result: ResearchResult; expires: number }>()

function cacheGet(key: string): ResearchResult | null {
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.result
  if (hit) cache.delete(key)
  return null
}

function cacheSet(key: string, result: ResearchResult): void {
  // Opportunistically evict expired entries to bound memory.
  const now = Date.now()
  for (const [k, v] of cache) if (v.expires <= now) cache.delete(k)
  cache.set(key, { result, expires: now + CACHE_TTL_MS })
}

function sse(type: string, data: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ type, ...data })}\n\n`
}

export async function GET(request: NextRequest) {
  const symbol = normalizeSymbol(request.nextUrl.searchParams.get('symbol'))
  if (!symbol) {
    return Response.json({ error: 'A valid NSE symbol is required.' }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(sse(type, data)))
        } catch {
          // Client disconnected — nothing to do.
        }
      }
      const status = (message: string, step: number) => send('status', { message, step, total: RESEARCH_STEPS })

      try {
        const cached = cacheGet(symbol)
        if (cached) {
          status(`Serving cached analysis for ${symbol} (refreshes every 10 minutes)...`, RESEARCH_STEPS)
          send('complete', { result: cached })
          return
        }
        const result = await runResearch(symbol, { onStatus: status })
        status('Research complete.', RESEARCH_STEPS)
        cacheSet(symbol, result)
        send('complete', { result })
      } catch (error) {
        console.error('Research failed:', error)
        send('error', { message: `Research failed: ${(error as Error).message}` })
      } finally {
        try { controller.close() } catch { /* already closed */ }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  })
}

import { type NextRequest } from 'next/server'
import YahooFinance from 'yahoo-finance2'
import { classifyNews } from '@/lib/finbert'
import { fetchTickerNews } from '@/lib/news'
import { createLLM, NarrativeSchema, buildNarrativePrompt, type Narrative } from '@/lib/llm'
import { computeAnalyses, type Horizon, type HorizonAnalysis, type QuoteData } from '@/lib/scoring'
import { tavily } from '@tavily/core'

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] })
export const dynamic = 'force-dynamic'

const TOTAL_STEPS = 7
const SYMBOL_RE = /^[A-Z0-9.\-^=&]{1,20}$/i

interface ResearchResult {
  symbol: string
  name: string
  analyses: Record<Horizon, HorizonAnalysis>
  quote: QuoteData
  industryPE: number | null
  news: {
    good: NewsSummary[]
    bad: NewsSummary[]
    neutral: NewsSummary[]
  }
  historicalPrices: Array<{ close: number; date: string }>
}

interface NewsSummary {
  title: string
  link: string
  publisher: string
  publishedAt: string
  reason: string
}

// Cache completed research per symbol so repeat searches are instant and
// return identical results. Market data changes intraday, so keep the TTL short.
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

// Human-readable summary of a trailing window of historical prices (for the LLM prompt).
function calcStats(hist: Array<{ close: number; date: string }>, days: number): string {
  const cutoff = Date.now() - days * 86400000
  const slice = hist.filter(h => new Date(h.date).getTime() >= cutoff)
  if (slice.length < 2) return `${days}d: N/A`

  const first = slice[0], last = slice[slice.length - 1]
  const chg = ((last.close - first.close) / first.close * 100).toFixed(2)
  const closes = slice.map(h => h.close)
  const high = Math.max(...closes), low = Math.min(...closes)

  const rets = []
  for (let i = 1; i < closes.length; i++) rets.push((closes[i] - closes[i - 1]) / closes[i - 1])
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length
  const vol = (Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) * 100).toFixed(2)

  return `${days}d: ${chg}% (H:${high.toFixed(2)} L:${low.toFixed(2)} Vol:${vol}%)`
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')?.trim().toUpperCase()
  if (!symbol || !SYMBOL_RE.test(symbol)) {
    return Response.json({ error: 'A valid ticker symbol is required.' }, { status: 400 })
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
      const status = (message: string, step: number) => send('status', { message, step, total: TOTAL_STEPS })

      try {
        // 0. Cache hit → replay instantly with identical results
        const cached = cacheGet(symbol)
        if (cached) {
          status(`Serving cached analysis for ${symbol} (refreshes every 10 minutes)...`, TOTAL_STEPS)
          send('complete', { result: cached })
          return
        }

        // 1-3. Quote, 1y history, and 30d news in parallel
        status(`Fetching market data, price history, and news for ${symbol}...`, 1)

        const [quoteRes, chartRes, newsItems] = await Promise.all([
          yahooFinance.quote(symbol).catch(() => null),
          yahooFinance
            .chart(symbol, { period1: new Date(Date.now() - 365 * 86400000), period2: new Date() })
            .catch(() => null),
          fetchTickerNews(symbol, 30).catch(() => []),
        ])

        const hist: Array<{ close: number; date: string }> = (chartRes?.quotes ?? [])
          .filter(q => q.close != null)
          .map(q => ({ close: q.close as number, date: new Date(q.date).toISOString().split('T')[0] }))

        if (!quoteRes && hist.length === 0) {
          send('error', { message: `No market data found for "${symbol}". Check the ticker symbol and try again.` })
          return
        }

        const quote = (quoteRes ?? {}) as Record<string, unknown>
        const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
        const quoteData: QuoteData = {
          price: num(quote.regularMarketPrice),
          change: num(quote.regularMarketChange),
          changePercent: num(quote.regularMarketChangePercent),
          currency: typeof quote.currency === 'string' ? quote.currency : 'USD',
          marketCap: num(quote.marketCap),
          volume: num(quote.regularMarketVolume),
          avgVolume: num(quote.averageDailyVolume3Month),
          dayHigh: num(quote.regularMarketDayHigh),
          dayLow: num(quote.regularMarketDayLow),
          fiftyTwoWeekHigh: num(quote.fiftyTwoWeekHigh),
          fiftyTwoWeekLow: num(quote.fiftyTwoWeekLow),
          pe: num(quote.trailingPE),
          eps: num(quote.epsTrailingTwelveMonths),
        }
        const name = (typeof quote.shortName === 'string' && quote.shortName) ||
          (typeof quote.longName === 'string' && quote.longName) || symbol

        status(`Found ${newsItems.length} recent articles about ${symbol}`, 2)

        // 4. FinBERT sentiment
        status(`Running FinBERT sentiment analysis on ${newsItems.length} articles...`, 3)
        const classified = await classifyNews(newsItems, (done, total) => {
          status(`FinBERT: classified ${done}/${total} articles...`, 3)
        })
        const sentimentCounts = {
          positive: classified.positive.length,
          negative: classified.negative.length,
          neutral: classified.neutral.length,
        }

        // 5. Deterministic scoring — same inputs always produce the same scores.
        status(`Computing quantitative scores across 3 horizons...`, 4)
        const analyses = computeAnalyses(quoteData, hist, sentimentCounts)

        // 6. Web search for industry P/E context (optional)
        let searchContext = ''
        if (process.env.TAVILY_API_KEY) {
          status(`Searching the web for industry P/E context...`, 5)
          try {
            const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY })
            const searchRes = await tvly.search(
              `${symbol} stock industry sector average P/E ratio valuation`,
              { searchDepth: 'basic', maxResults: 5 }
            )
            searchContext = searchRes.results.map(r => `${r.title}: ${r.content}`).join('\n')
          } catch (err) {
            console.warn('Tavily search failed:', err)
            status('Web search unavailable — continuing without live industry data.', 5)
          }
        } else {
          status('TAVILY_API_KEY not set — skipping live industry search.', 5)
        }

        // 7. LLM narrative (reasoning + target prices + industry P/E). Scores are
        // already final; if this fails we still return the full quantitative analysis.
        let industryPE: number | null = null
        if (process.env.GOOGLE_API_KEY) {
          status(`Generating analyst commentary and price targets...`, 6)
          try {
            const histSummary = [7, 30, 90, 180, 365].map(d => calcStats(hist, d)).join('\n')
            const llm = createLLM()
            const narrator = llm.withStructuredOutput<Narrative>(NarrativeSchema)
            const prompt = buildNarrativePrompt(symbol, name, quoteData, histSummary, sentimentCounts, analyses, searchContext)
            const narrative = await narrator.invoke(prompt)

            industryPE = narrative.industryPE ?? null
            for (const horizon of ['weekly', 'monthly', 'longterm'] as Horizon[]) {
              const n = narrative[horizon]
              if (n?.reasoning) analyses[horizon].reasoning = n.reasoning
              if (typeof n?.targetPrice === 'number' && n.targetPrice > 0) {
                analyses[horizon].targetPrice = n.targetPrice
              }
            }
          } catch (e) {
            console.error('LLM narrative failed:', e)
            status(`AI commentary unavailable (${(e as Error).message}) — quantitative scores are unaffected.`, 6)
          }
        } else {
          status('GOOGLE_API_KEY not set — skipping AI commentary.', 6)
        }

        // 8. Compile
        status(`Research complete.`, 7)

        const fmt = (items: typeof classified.positive): NewsSummary[] =>
          items.map(i => ({
            title: i.title,
            link: i.link,
            publisher: i.publisher,
            publishedAt: i.publishedAt,
            reason: `${(i.confidence * 100).toFixed(0)}% confidence`,
          }))

        const result: ResearchResult = {
          symbol,
          name,
          analyses,
          quote: quoteData,
          industryPE,
          news: {
            good: fmt(classified.positive).slice(0, 6),
            bad: fmt(classified.negative).slice(0, 6),
            neutral: fmt(classified.neutral).slice(0, 4),
          },
          historicalPrices: hist.slice(-60),
        }

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

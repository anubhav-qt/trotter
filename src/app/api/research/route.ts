import { type NextRequest } from 'next/server'
import YahooFinance from 'yahoo-finance2'
import { classifyNews } from '@/lib/finbert'
import { fetchTickerNews } from '@/lib/news'
import { createLLM, InvestmentAnalysisSchema, buildScoringPrompt } from '@/lib/llm'
import { tavily } from '@tavily/core'

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] })
export const dynamic = 'force-dynamic'

function sse(type: string, data: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ type, ...data })}\n\n`
}

// Calculate summary stats for a specific slice of historical data
function calcStats(hist: Array<{ close: number; date: string }>, days: number): string {
  const cutoff = Date.now() - days * 86400000
  const slice = hist.filter(h => new Date(h.date).getTime() >= cutoff)
  if (slice.length < 2) return 'N/A'

  const first = slice[0], last = slice[slice.length - 1]
  const chg = ((last.close - first.close) / first.close * 100).toFixed(2)
  const closes = slice.map(h => h.close)
  const high = Math.max(...closes), low = Math.min(...closes)

  const rets = []
  for (let i = 1; i < closes.length; i++) rets.push((closes[i] - closes[i-1]) / closes[i-1])
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length
  const vol = (Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) * 100).toFixed(2)

  return `${days}d: ${chg}% (H:${high.toFixed(2)} L:${low.toFixed(2)} Vol:${vol}%)`
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol')
  if (!symbol) return Response.json({ error: 'Symbol required' }, { status: 400 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sse(type, data)))
      }
      try {
        // 1. Init
        send('status', { message: `Initializing complete analysis for ${symbol}...`, step: 1, total: 8 })
        await new Promise(r => setTimeout(r, 200))

        // 2. Quote
        send('status', { message: `Fetching real-time market data...`, step: 2, total: 8 })
        let quote: Record<string, unknown> = {}
        try { quote = await yahooFinance.quote(symbol) as unknown as Record<string, unknown> } catch {}

        // 3. Historical (Always 1 Year)
        send('status', { message: `Loading 1-year historical price data...`, step: 3, total: 8 })
        let hist: Array<{ close: number; date: string }> = []
        try {
          const chart = await yahooFinance.chart(symbol, { period1: new Date(Date.now() - 365 * 86400000), period2: new Date() })
          if (chart?.quotes) hist = chart.quotes
            .filter((q: Record<string, unknown>) => q.close != null)
            .map((q: Record<string, unknown>) => ({ close: q.close as number, date: new Date(q.date as string).toISOString().split('T')[0] }))
        } catch {}

        const histSummary = `
          ${calcStats(hist, 7)}
          ${calcStats(hist, 30)}
          ${calcStats(hist, 180)}
          ${calcStats(hist, 365)}
        `.trim()

        // 4. News (Always 30 days)
        send('status', { message: `Fetching 30 days of recent news...`, step: 4, total: 8 })
        const newsItems = await fetchTickerNews(symbol, 30)
        send('status', { message: `Found ${newsItems.length} recent articles about ${symbol}`, step: 4, total: 8 })

        // 5. FinBERT classification
        send('status', { message: `Running FinBERT sentiment analysis on ${newsItems.length} articles...`, step: 5, total: 8 })
        const classified = await classifyNews(newsItems, (done, total) => {
          if (done % 5 === 0 || done === total) {
            send('status', { message: `FinBERT: classified ${done}/${total} articles...`, step: 5, total: 8 })
          }
        })

        // 6. Gemini scoring (Triple Goal) with Web Search
        send('status', { message: `Performing live web search for industry P/E context...`, step: 6, total: 9 })

        let searchContext = ''
        try {
          const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY })
          const searchRes = await tvly.search(`${symbol} stock industry sector average P/E ratio valuation`, { searchDepth: 'basic', maxResults: 5 })
          searchContext = searchRes.results.map(r => r.title + ': ' + r.content).join('\n')
        } catch (err) {
          console.warn('Web search failed:', err)
        }

        send('status', { message: `Scoring...`, step: 7, total: 9 })
        const quoteData = {
          price: quote.regularMarketPrice ?? null,
          change: quote.regularMarketChange ?? null,
          changePercent: quote.regularMarketChangePercent ?? null,
          currency: (quote.currency || 'USD') as string,
          marketCap: quote.marketCap ?? null,
          volume: quote.regularMarketVolume ?? null,
          avgVolume: quote.averageDailyVolume3Month ?? null,
          dayHigh: quote.regularMarketDayHigh ?? null,
          dayLow: quote.regularMarketDayLow ?? null,
          fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh ?? null,
          fiftyTwoWeekLow: quote.fiftyTwoWeekLow ?? null,
          pe: quote.trailingPE ?? null,
          eps: quote.epsTrailingTwelveMonths ?? null,
        }

        const fallbackBase = {
          score: 50, verdict: 'HOLD', reasoning: 'Scoring unavailable.',
          breakdown: {
            momentum: { score: 12, detail: 'N/A' },
            valuation: { score: 10, detail: 'N/A' },
            volume: { score: 7, detail: 'N/A' },
            sentiment: { score: 12, detail: 'N/A' },
            volatility: { score: 7, detail: 'N/A' },
          }
        }

        let analyses: any = {
          weekly: fallbackBase,
          monthly: fallbackBase,
          longterm: fallbackBase
        }
        let industryPE: number | null = null;

        try {
          const llm = createLLM()
          const scorer = llm.withStructuredOutput(InvestmentAnalysisSchema)
          const prompt = buildScoringPrompt(
            symbol, (quote.shortName || quote.longName || symbol) as string,
            quoteData, histSummary,
            { positive: classified.positive.length, negative: classified.negative.length, neutral: classified.neutral.length },
            searchContext
          )
          const result = await scorer.invoke(prompt)

          // Map schema keys (maxes added client-side or just map data)
          const mapBreakdown = (b: any) => ({
            momentum: { score: b.momentum.score, max: 25, detail: b.momentum.detail },
            valuation: { score: b.valuation.score, max: 20, detail: b.valuation.detail },
            volume: { score: b.volume.score, max: 15, detail: b.volume.detail },
            sentiment: { score: b.sentiment.score, max: 25, detail: b.sentiment.detail },
            volatility: { score: b.volatility.score, max: 15, detail: b.volatility.detail },
          })

          analyses = {
            weekly: { score: result.weekly.score, verdict: result.weekly.verdict, reasoning: result.weekly.reasoning, targetPrice: result.weekly.targetPrice, breakdown: mapBreakdown(result.weekly.breakdown) },
            monthly: { score: result.monthly.score, verdict: result.monthly.verdict, reasoning: result.monthly.reasoning, targetPrice: result.monthly.targetPrice, breakdown: mapBreakdown(result.monthly.breakdown) },
            longterm: { score: result.longterm.score, verdict: result.longterm.verdict, reasoning: result.longterm.reasoning, targetPrice: result.longterm.targetPrice, breakdown: mapBreakdown(result.longterm.breakdown) },
          }
          industryPE = result.industryPE ?? null;
        } catch (e) {
          send('status', { message: `Gemini error: ${(e as Error).message}`, step: 6, total: 8 })
        }

        // 7. Compile
        send('status', { message: `Compiling comprehensive report...`, step: 7, total: 8 })
        await new Promise(r => setTimeout(r, 200))

        // 8. Done
        send('status', { message: `Research complete.`, step: 8, total: 8 })

        const fmt = (items: typeof classified.positive) => items.map(i => ({
          title: i.title, link: i.link, publisher: i.publisher,
          publishedAt: i.publishedAt,
          reason: `${(i.confidence * 100).toFixed(0)}% confidence`,
        }))

        send('complete', {
          result: {
            symbol, name: (quote.shortName || quote.longName || symbol) as string,
            analyses,
            quote: quoteData,
            industryPE,
            news: {
              good: fmt(classified.positive).slice(0, 6),
              bad: fmt(classified.negative).slice(0, 6),
              neutral: fmt(classified.neutral).slice(0, 4),
            },
            historicalPrices: hist.slice(-60), // Send last 60 days for mini-chart fallback if used
          }
        })
      } catch (error) {
        send('error', { message: `Research failed: ${(error as Error).message}` })
      } finally { controller.close() }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive' },
  })
}

import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { z } from 'zod'
import type { Horizon, HorizonAnalysis, QuoteData, SentimentCounts } from './scoring'

// The LLM does NOT produce scores — those are computed deterministically in
// src/lib/scoring.ts. It only writes narrative reasoning, estimates target
// prices, and extracts the industry P/E from the web search context.

const HorizonNarrativeSchema = z.object({
  reasoning: z.string().describe('2-3 sentence analysis consistent with the provided factor scores'),
  targetPrice: z
    .number()
    .nullable()
    .describe('Estimated target price for this timeframe, or null if it cannot be reasonably estimated'),
})

export const NarrativeSchema = z.object({
  industryPE: z
    .number()
    .nullable()
    .describe('Average P/E ratio for this industry/sector based on the search context, or null if unavailable'),
  weekly: HorizonNarrativeSchema.describe('Narrative for weekly swing trading (1-5 days)'),
  monthly: HorizonNarrativeSchema.describe('Narrative for monthly position (2-8 weeks)'),
  longterm: HorizonNarrativeSchema.describe('Narrative for long-term hold (6 months+)'),
})

export type Narrative = z.infer<typeof NarrativeSchema>

export function createLLM(temperature = 0) {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not set. Add it to .env.local')
  }
  return new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    apiKey,
    temperature,
  })
}

export function buildNarrativePrompt(
  symbol: string,
  name: string,
  quoteData: QuoteData,
  histSummary: string,
  sentimentSummary: SentimentCounts,
  analyses: Record<Horizon, HorizonAnalysis>,
  searchContext: string
): string {
  const scoreLines = (Object.entries(analyses) as Array<[Horizon, HorizonAnalysis]>)
    .map(([h, a]) => {
      const b = a.breakdown
      return `${h}: total ${a.score}/100 (${a.verdict}) — momentum ${b.momentum.score}/25, valuation ${b.valuation.score}/20, volume ${b.volume.score}/15, sentiment ${b.sentiment.score}/25, volatility ${b.volatility.score}/15`
    })
    .join('\n')

  return `You are a financial analyst writing commentary for ${symbol} (${name}).

A quantitative model has ALREADY scored the stock for 3 horizons. Do not contradict or restate raw scores — explain the "why" behind them and give a realistic target price per horizon.

COMPUTED SCORES (fixed, do not change):
${scoreLines}

MARKET DATA:
Price=${quoteData.price} ${quoteData.currency}, Chg=${quoteData.change} (${quoteData.changePercent}%)
MCap=${quoteData.marketCap}, PE=${quoteData.pe}, EPS=${quoteData.eps}
Vol=${quoteData.volume}, AvgVol=${quoteData.avgVolume}
Day=${quoteData.dayLow}-${quoteData.dayHigh}, 52w=${quoteData.fiftyTwoWeekLow}-${quoteData.fiftyTwoWeekHigh}

PRICE HISTORY:
${histSummary}

NEWS SENTIMENT (30d, FinBERT): +${sentimentSummary.positive} -${sentimentSummary.negative} ~${sentimentSummary.neutral}

WEB SEARCH CONTEXT (for industry P/E):
${searchContext || '(no results)'}

Tasks:
1. industryPE: extract the industry/sector average P/E from the search context; if absent, estimate from your knowledge; null only if truly unknown.
2. For each horizon (weekly = 1-5 days, monthly = 2-8 weeks, longterm = 6+ months): write 2-3 sentences of reasoning consistent with the computed scores, and a target price in ${quoteData.currency}. Target prices must be plausible relative to the current price of ${quoteData.price} (weekly within a few percent, longterm can be wider).`
}

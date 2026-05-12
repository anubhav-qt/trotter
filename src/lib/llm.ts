import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { z } from 'zod'

// --- Zod schema for Gemini structured output ---

const BaseAnalysisSchema = z.object({
  score: z.number().min(0).max(100).describe('Investment score 0-100'),
  verdict: z.enum(['STRONG BUY', 'BUY', 'HOLD', 'CAUTIOUS', 'AVOID']),
  reasoning: z.string().describe('2-3 sentence analysis'),
  breakdown: z.object({
    momentum: z.object({ score: z.number(), detail: z.string() }),
    valuation: z.object({ score: z.number(), detail: z.string() }),
    volume: z.object({ score: z.number(), detail: z.string() }),
    sentiment: z.object({ score: z.number(), detail: z.string() }),
    volatility: z.object({ score: z.number(), detail: z.string() }),
  }),
})

export const InvestmentAnalysisSchema = z.object({
  weekly: BaseAnalysisSchema.describe('Score for weekly swing trading (1-5 days)'),
  monthly: BaseAnalysisSchema.describe('Score for monthly position (2-8 weeks)'),
  longterm: BaseAnalysisSchema.describe('Score for long-term hold (6 months+)'),
})

export function createLLM() {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not set. Add it to .env.local')
  }
  return new ChatGoogleGenerativeAI({
    model: 'gemini-2.5-flash',
    apiKey,
    temperature: 0.2,
  })
}

export function buildScoringPrompt(
  symbol: string,
  name: string,
  quoteData: Record<string, unknown>,
  histSummary: string,
  sentimentSummary: { positive: number; negative: number; neutral: number }
): string {
  return `Score ${symbol} (${name}) for 3 different trading horizons: Weekly (1-5d), Monthly (2-8w), and Long-term (6mo+). 0-100 scale for each.

DATA:
Price=${quoteData.price} ${quoteData.currency}, Chg=${quoteData.change} (${quoteData.changePercent}%)
MCap=${quoteData.marketCap}, PE=${quoteData.pe}, EPS=${quoteData.eps}
Vol=${quoteData.volume}, AvgVol=${quoteData.avgVolume}
Day=${quoteData.dayLow}-${quoteData.dayHigh}, 52w=${quoteData.fiftyTwoWeekLow}-${quoteData.fiftyTwoWeekHigh}

HISTORY PERFORMANCES:
${histSummary}

NEWS SENTIMENT (30d): +${sentimentSummary.positive} -${sentimentSummary.negative} ~${sentimentSummary.neutral}

FACTORS: momentum(0-25) valuation(0-20) volume(0-15) sentiment(0-25) volatility(0-15)
75+:STRONG BUY 60-74:BUY 45-59:HOLD 30-44:CAUTIOUS <30:AVOID`
}

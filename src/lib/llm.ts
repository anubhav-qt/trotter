import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { z } from 'zod'
import type { Fundamentals } from './market/fundamentals'
import type { Horizon, HorizonAnalysis, SentimentCounts } from './scoring'

// The LLM produces no numbers. Scores come from src/lib/scoring.ts and price
// ranges from src/lib/ranges.ts; the model only explains them in plain words.

const HorizonNarrativeSchema = z.object({
  reasoning: z.string().describe('2-3 sentence analysis consistent with the provided factor scores'),
})

export const NarrativeSchema = z.object({
  weekly: HorizonNarrativeSchema.describe('Narrative for weekly swing trading (1 week)'),
  monthly: HorizonNarrativeSchema.describe('Narrative for a monthly position (1 month)'),
  longterm: HorizonNarrativeSchema.describe('Narrative for a long-term hold (6 months)'),
})

export type Narrative = z.infer<typeof NarrativeSchema>

/** Gemini model id; override with GEMINI_MODEL when Google retires this one. */
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

export function createLLM(temperature = 0) {
  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY not set. Add it to .env.local')
  }
  return new ChatGoogleGenerativeAI({ model: GEMINI_MODEL, apiKey, temperature })
}

const inr = (n: number | null | undefined) => (n == null ? 'n/a' : `₹${n.toFixed(2)}`)

export function buildNarrativePrompt(
  symbol: string,
  name: string,
  lastClose: number,
  asOf: string,
  histSummary: string,
  fundamentals: Fundamentals | null,
  sentiment: SentimentCounts | null,
  analyses: Record<Horizon, HorizonAnalysis>
): string {
  const scoreLines = (Object.entries(analyses) as Array<[Horizon, HorizonAnalysis]>)
    .map(([h, a]) => {
      const b = a.breakdown
      const range = a.range ? `, 80% range after ${a.range.horizonDays} sessions ${inr(a.range.low)}–${inr(a.range.high)}` : ''
      return `${h}: total ${a.score}/100 (${a.verdict}) — momentum ${b.momentum.score}/25, valuation ${b.valuation.score}/20, volume ${b.volume.score}/15, sentiment ${b.sentiment.score}/25, volatility ${b.volatility.score}/15${range}`
    })
    .join('\n')
  const details = Object.values(analyses.monthly.breakdown).map(f => `- ${f.detail}`).join('\n')

  return `You are a financial analyst writing commentary on ${symbol} (${name}), listed on the NSE.

A quantitative model has ALREADY scored the stock for 3 horizons and computed volatility-based price ranges. Do not change, restate or invent numbers — explain the "why" behind the scores in plain language. Do not give price targets.

COMPUTED SCORES (fixed):
${scoreLines}

FACTOR DETAILS:
${details}

MARKET DATA (as of the ${asOf} close):
Last close ${inr(lastClose)}; trailing P/E ${fundamentals?.pe ?? 'n/a'}, sector median P/E ${fundamentals?.sectorPe ?? 'n/a'}, EPS ${fundamentals?.eps ?? 'n/a'}, industry ${fundamentals?.industry ?? 'n/a'}

PRICE HISTORY:
${histSummary}

NEWS SENTIMENT (30d, FinBERT): ${sentiment ? `+${sentiment.positive} -${sentiment.negative} ~${sentiment.neutral}` : 'not available'}

For each horizon (weekly = 1 week, monthly = 1 month, longterm = 6 months), write 2-3 sentences of reasoning consistent with the computed scores.`
}

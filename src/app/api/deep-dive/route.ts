import { type NextRequest } from 'next/server'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

// ~6MB of base64 ≈ 4.5MB image — plenty for a chart screenshot.
const MAX_IMAGE_B64_LENGTH = 6 * 1024 * 1024
const SYMBOL_RE = /^[A-Z0-9.\-^=&]{1,20}$/i

const UpdatedHorizonSchema = z.object({
  score: z.number().min(0).max(100),
  verdict: z.enum(['STRONG BUY', 'BUY', 'HOLD', 'CAUTIOUS', 'AVOID']),
  reasoning: z.string(),
  targetPrice: z.number().nullable(),
})

const DeepDiveSchema = z.object({
  patternName: z.string().describe('The name of the most prominent candlestick pattern found.'),
  explanation: z.string().describe('Detailed explanation of what the pattern means in this context and why it is significant.'),
  boundingBox: z.object({
    ymin: z.number().min(0).max(1000).describe('Top edge of the bounding box (0-1000 scale). 0 is top.'),
    xmin: z.number().min(0).max(1000).describe('Left edge of the bounding box (0-1000 scale). 0 is left.'),
    ymax: z.number().min(0).max(1000).describe('Bottom edge of the bounding box (0-1000 scale). 1000 is bottom.'),
    xmax: z.number().min(0).max(1000).describe('Right edge of the bounding box (0-1000 scale). 1000 is right.'),
  }).describe('The exact spatial coordinates bounding the identified pattern on the provided chart.'),
  updatedAnalysis: z.object({
    weekly: UpdatedHorizonSchema,
    monthly: UpdatedHorizonSchema,
    longterm: UpdatedHorizonSchema,
  }).optional().describe('If the visual pattern provides new insight, return updated scores, verdicts, and estimated target prices for the 3 time horizons.'),
})

export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    const { image, symbol, quote, analyses, period } = body as {
      image?: string
      symbol?: string
      quote?: Record<string, unknown>
      analyses?: Record<string, unknown>
      period?: string
    }

    if (typeof image !== 'string' || typeof symbol !== 'string' || !SYMBOL_RE.test(symbol)) {
      return Response.json({ error: 'A chart image and a valid symbol are required.' }, { status: 400 })
    }
    if (image.length > MAX_IMAGE_B64_LENGTH) {
      return Response.json({ error: 'Chart image is too large.' }, { status: 413 })
    }

    const apiKey = process.env.GOOGLE_API_KEY
    if (!apiKey) {
      return Response.json({ error: 'GOOGLE_API_KEY is not configured on the server.' }, { status: 503 })
    }

    const llm = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey,
      temperature: 0, // deterministic pattern detection and scoring
    })

    const structuredLlm = llm.withStructuredOutput(DeepDiveSchema)

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '')

    const message = new HumanMessage({
      content: [
        {
          type: 'text',
          text: `You are an expert technical analyst. I have provided an image of a candlestick chart with Bollinger Bands and Volume bars for ${symbol}.

Here is the current fundamental and AI analysis context for the stock:
- Price: ${quote?.price} (Change: ${quote?.changePercent}%)
- P/E Ratio: ${quote?.pe}
- Volume: ${quote?.volume} (Avg: ${quote?.avgVolume})
- Current Score: ${analyses?.score}/100 (${analyses?.verdict})
- Current Reasoning: ${analyses?.reasoning}

Identify the single most prominent and actionable candlestick pattern (e.g., Bullish Engulfing, Doji, Hammer, Head and Shoulders) taking into account the Bollinger Bands and Volume.
Provide the pattern name, an insightful explanation of its significance right now incorporating the provided numerical context, and the exact spatial bounding box coordinates [ymin, xmin, ymax, xmax] strictly in the 0-1000 scale over the provided image identifying exactly where this pattern occurs.

The chart covers the period: ${period || 'unknown'}. If (and only if) the visual pattern materially changes the outlook, provide an \`updatedAnalysis\` for all 3 horizons (weekly, monthly, longterm) with adjusted scores, verdicts, reasoning, and target prices. Keep adjustments proportionate — a single chart pattern should shift a score by at most 10-15 points from the current score.`,
        },
        {
          type: 'image_url',
          image_url: `data:image/png;base64,${base64Data}`,
        },
      ],
    })

    const result = await structuredLlm.invoke([message])

    return Response.json(result)
  } catch (error) {
    console.error('Deep Dive API Error:', error)
    return Response.json({ error: 'Failed to analyze chart. Please try again shortly.' }, { status: 502 })
  }
}

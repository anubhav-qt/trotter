import { type NextRequest } from 'next/server'
import { HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { createLLM } from '@/lib/llm'
import { normalizeSymbol } from '@/lib/market/symbols'

export const dynamic = 'force-dynamic'

// ~6MB of base64 ≈ 4.5MB image — plenty for a chart screenshot.
const MAX_IMAGE_B64_LENGTH = 6 * 1024 * 1024

// Deep Dive is commentary only: it explains the chart and never changes
// scores, verdicts or ranges, which come from the deterministic model.
const DeepDiveSchema = z.object({
  patternName: z.string().describe('The name of the most prominent candlestick pattern found.'),
  explanation: z.string().describe('Detailed explanation of what the pattern means in this context and why it is significant.'),
  boundingBox: z.object({
    ymin: z.number().min(0).max(1000).describe('Top edge of the bounding box (0-1000 scale). 0 is top.'),
    xmin: z.number().min(0).max(1000).describe('Left edge of the bounding box (0-1000 scale). 0 is left.'),
    ymax: z.number().min(0).max(1000).describe('Bottom edge of the bounding box (0-1000 scale). 1000 is bottom.'),
    xmax: z.number().min(0).max(1000).describe('Right edge of the bounding box (0-1000 scale). 1000 is right.'),
  }).describe('The exact spatial coordinates bounding the identified pattern on the provided chart.'),
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

    if (typeof image !== 'string' || !normalizeSymbol(symbol)) {
      return Response.json({ error: 'A chart image and a valid symbol are required.' }, { status: 400 })
    }
    if (image.length > MAX_IMAGE_B64_LENGTH) {
      return Response.json({ error: 'Chart image is too large.' }, { status: 413 })
    }

    if (!process.env.GOOGLE_API_KEY) {
      return Response.json({ error: 'GOOGLE_API_KEY is not configured on the server.' }, { status: 503 })
    }

    // temperature 0 for repeatable pattern detection
    const structuredLlm = createLLM(0).withStructuredOutput(DeepDiveSchema)

    const base64Data = image.replace(/^data:image\/\w+;base64,/, '')

    const message = new HumanMessage({
      content: [
        {
          type: 'text',
          text: `You are an expert technical analyst. I have provided an image of a candlestick chart with Bollinger Bands and Volume bars for ${symbol}.

Here is the current quantitative context for the stock (fixed — do not re-score it):
- Price: ₹${quote?.price} (Change: ${quote?.changePercent}%)
- P/E Ratio: ${quote?.pe}
- Volume: ${quote?.volume} (3-month avg: ${quote?.avgVolume})
- Model score: ${analyses?.score}/100 (${analyses?.verdict})
- Model reasoning: ${analyses?.reasoning}

Identify the single most prominent and actionable candlestick pattern (e.g., Bullish Engulfing, Doji, Hammer, Head and Shoulders) taking into account the Bollinger Bands and Volume.
Provide the pattern name, an insightful explanation of its significance right now incorporating the provided numerical context, and the exact spatial bounding box coordinates [ymin, xmin, ymax, xmax] strictly in the 0-1000 scale over the provided image identifying exactly where this pattern occurs.

The chart covers the period: ${period || 'unknown'}. Describe what the pattern suggests and how it relates to the model's score, but do not propose new scores, verdicts or price targets.`,
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

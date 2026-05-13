import { type NextRequest } from 'next/server'
import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const DeepDiveSchema = z.object({
  patternName: z.string().describe('The name of the most prominent candlestick pattern found.'),
  explanation: z.string().describe('Detailed explanation of what the pattern means in this context and why it is significant.'),
  boundingBox: z.object({
    ymin: z.number().describe('Top edge of the bounding box (0-1000 scale). 0 is top.'),
    xmin: z.number().describe('Left edge of the bounding box (0-1000 scale). 0 is left.'),
    ymax: z.number().describe('Bottom edge of the bounding box (0-1000 scale). 1000 is bottom.'),
    xmax: z.number().describe('Right edge of the bounding box (0-1000 scale). 1000 is right.'),
  }).describe('The exact spatial coordinates bounding the identified pattern on the provided chart.'),
  updatedAnalysis: z.object({
    weekly: z.object({ score: z.number(), verdict: z.string(), targetPrice: z.number().nullable() }),
    monthly: z.object({ score: z.number(), verdict: z.string(), targetPrice: z.number().nullable() }),
    longterm: z.object({ score: z.number(), verdict: z.string(), targetPrice: z.number().nullable() }),
  }).optional().describe('If the visual pattern provides new insight, return updated scores, verdicts, and estimated target prices for the 3 time horizons.')
})

export async function POST(request: NextRequest) {
  try {
    const { image, symbol, quote, analyses, period } = await request.json()

    if (!image || !symbol) {
      return Response.json({ error: 'Image and symbol are required.' }, { status: 400 })
    }

    const apiKey = process.env.GOOGLE_API_KEY
    if (!apiKey) {
      return Response.json({ error: 'Google API Key not configured.' }, { status: 500 })
    }

    // Initialize Gemini 2.5 Flash for advanced computer vision and spatial understanding (using flash to avoid Pro rate limits)
    const llm = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey,
      temperature: 0.1, // Low temp for precise coordinate detection
    })

    const structuredLlm = llm.withStructuredOutput(DeepDiveSchema)

    // Remove the data URL prefix if present (e.g. data:image/png;base64,)
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
                 - AI Score: ${analyses?.score}/100 (${analyses?.verdict})
                 - AI Reasoning: ${analyses?.reasoning}
                 
                 Identify the single most prominent and actionable candlestick pattern (e.g., Bullish Engulfing, Doji, Hammer, Head and Shoulders, MACD crossover if visible, etc.) taking into account the Bollinger Bands and Volume.
                 Provide the pattern name, an insightful explanation of its significance right now incorporating the provided numerical and AI context, and the exact spatial bounding box coordinates [ymin, xmin, ymax, xmax] strictly in the 0-1000 scale over the provided image identifying exactly where this pattern occurs.
                 
                 IMPORTANT: The user provided a chart for period: ${period || 'unknown'}. Based on the strength of this pattern and the current price, provide an \`updatedAnalysis\` containing the estimated target price, score, and verdict for ALL 3 horizons (weekly, monthly, longterm).`,
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
    return Response.json({ error: 'Failed to analyze chart.' }, { status: 500 })
  }
}

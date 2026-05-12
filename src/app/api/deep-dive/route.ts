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
})

export async function POST(request: NextRequest) {
  try {
    const { image, symbol } = await request.json()

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
          text: `You are an expert technical analyst. I have provided an image of a candlestick chart for ${symbol}.
                 Identify the single most prominent and actionable candlestick pattern (e.g., Engulfing, Doji, Hammer, Head and Shoulders, MACD crossover if visible, etc.).
                 Provide the pattern name, an insightful explanation of its significance right now, and the exact spatial bounding box coordinates [ymin, xmin, ymax, xmax] strictly in the 0-1000 scale over the provided image identifying exactly where this pattern occurs.`,
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

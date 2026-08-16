import { pipeline, type TextClassificationPipeline } from '@huggingface/transformers'

// Lazy singleton with in-flight dedup so concurrent requests don't load the model twice.
let classifierPromise: Promise<TextClassificationPipeline> | null = null

function getClassifier(): Promise<TextClassificationPipeline> {
  if (!classifierPromise) {
    classifierPromise = pipeline('text-classification', 'Xenova/finbert').then(
      p => p as TextClassificationPipeline,
      err => {
        classifierPromise = null // allow retry on next request
        throw err
      }
    )
  }
  return classifierPromise
}

export type Sentiment = 'positive' | 'negative' | 'neutral'

export interface ClassifiedNewsItem {
  title: string
  link: string
  publisher: string
  publishedAt: string
  sentiment: Sentiment
  confidence: number
}

interface Prediction {
  label: string
  score: number
}

const BATCH_SIZE = 8

/**
 * Classify news headlines with FinBERT, batched for throughput.
 * Items that fail classification default to neutral with 0 confidence.
 */
export async function classifyNews(
  items: Array<{ title: string; link: string; publisher: string; publishedAt: string }>,
  onProgress?: (done: number, total: number) => void
): Promise<{
  positive: ClassifiedNewsItem[]
  negative: ClassifiedNewsItem[]
  neutral: ClassifiedNewsItem[]
}> {
  const result = { positive: [] as ClassifiedNewsItem[], negative: [] as ClassifiedNewsItem[], neutral: [] as ClassifiedNewsItem[] }
  if (items.length === 0) return result

  const model = await getClassifier()

  for (let start = 0; start < items.length; start += BATCH_SIZE) {
    const batch = items.slice(start, start + BATCH_SIZE)
    let predictions: Prediction[]
    try {
      const output = await model(batch.map(i => i.title))
      // Output per input is either a Prediction or a Prediction[] depending on top_k.
      predictions = (output as Array<Prediction | Prediction[]>).map(o => (Array.isArray(o) ? o[0] : o))
    } catch {
      predictions = batch.map(() => ({ label: 'neutral', score: 0 }))
    }

    batch.forEach((item, i) => {
      const pred = predictions[i]
      const label = pred?.label?.toLowerCase()
      const sentiment: Sentiment = label === 'positive' || label === 'negative' ? label : 'neutral'
      result[sentiment].push({
        ...item,
        sentiment,
        confidence: pred?.score ?? 0,
      })
    })

    onProgress?.(Math.min(start + BATCH_SIZE, items.length), items.length)
  }

  return result
}

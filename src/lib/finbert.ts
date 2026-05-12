import { pipeline, type TextClassificationPipeline } from '@huggingface/transformers'

let classifier: TextClassificationPipeline | null = null

/**
 * Lazy-loads the FinBERT model (ProsusAI/finbert via Xenova ONNX export).
 * Cached after first load — subsequent calls reuse the same pipeline.
 */
async function getClassifier(): Promise<TextClassificationPipeline> {
  if (!classifier) {
    classifier = await pipeline('text-classification', 'Xenova/finbert') as TextClassificationPipeline
  }
  return classifier
}

export interface ClassifiedNewsItem {
  title: string
  link: string
  publisher: string
  publishedAt: string
  sentiment: 'positive' | 'negative' | 'neutral'
  confidence: number
}

/**
 * Classify an array of news headlines using FinBERT.
 * Returns items grouped by sentiment.
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

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    try {
      const output = await model(item.title, { topk: 1 })
      // output is [{ label: 'positive'|'negative'|'neutral', score: 0.99 }]
      const prediction = Array.isArray(output) ? output[0] : output
      const label = (prediction as { label: string }).label.toLowerCase() as 'positive' | 'negative' | 'neutral'
      const confidence = (prediction as { score: number }).score

      const classified: ClassifiedNewsItem = {
        title: item.title,
        link: item.link,
        publisher: item.publisher,
        publishedAt: item.publishedAt,
        sentiment: label,
        confidence,
      }

      result[label].push(classified)
    } catch {
      // If classification fails for one item, default to neutral
      result.neutral.push({
        title: item.title, link: item.link, publisher: item.publisher,
        publishedAt: item.publishedAt, sentiment: 'neutral', confidence: 0,
      })
    }

    if (onProgress) onProgress(i + 1, items.length)
  }

  return result
}

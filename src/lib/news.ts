export interface NewsArticle {
  title: string
  link: string
  publisher: string
  publishedAt: string // ISO date string
}

/**
 * Fetches recent, ticker-specific news from Yahoo Finance RSS feed.
 * This returns news that is directly about the stock, not generic search results.
 */
export async function fetchTickerNews(symbol: string, maxAgeDays: number = 30): Promise<NewsArticle[]> {
  const articles: NewsArticle[] = []
  const cutoff = Date.now() - maxAgeDays * 86400000

  // Strategy 1: Yahoo Finance RSS feed (ticker-specific)
  try {
    const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`
    const res = await fetch(rssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const xml = await res.text()
      const items = parseRSSItems(xml)
      for (const item of items) {
        const pubDate = new Date(item.pubDate).getTime()
        if (pubDate >= cutoff) {
          articles.push({
            title: item.title,
            link: item.link,
            publisher: extractPublisher(item.source || item.link),
            publishedAt: new Date(item.pubDate).toISOString(),
          })
        }
      }
    }
  } catch {
    // RSS failed, continue to fallback
  }

  // Strategy 2: Google News RSS (broader coverage, still ticker-specific)
  try {
    const googleUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(symbol + ' stock')}&hl=en-US&gl=US&ceid=US:en`
    const res = await fetch(googleUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const xml = await res.text()
      const items = parseRSSItems(xml)
      const existingTitles = new Set(articles.map(a => normalizeTitle(a.title)))
      for (const item of items) {
        const pubDate = new Date(item.pubDate).getTime()
        if (pubDate >= cutoff && !existingTitles.has(normalizeTitle(item.title))) {
          existingTitles.add(normalizeTitle(item.title))
          articles.push({
            title: item.title,
            link: item.link,
            publisher: item.source || extractPublisher(item.link),
            publishedAt: new Date(item.pubDate).toISOString(),
          })
        }
        if (articles.length >= 40) break // Increased cap since we combine both
      }
    }
  } catch {
    // Google News failed
  }

  // Sort by most recent first
  articles.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())

  return articles.slice(0, 40)
}

function parseRSSItems(xml: string): Array<{ title: string; link: string; pubDate: string; source: string }> {
  const items: Array<{ title: string; link: string; pubDate: string; source: string }> = []
  // Simple XML parser for RSS — no dependency needed
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let match
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1]
    const title = extractTag(block, 'title')
    const link = extractTag(block, 'link')
    const pubDate = extractTag(block, 'pubDate')
    const source = extractTag(block, 'source')
    if (title && link && pubDate) {
      items.push({
        title: cleanHtml(title),
        link: link.trim(),
        pubDate,
        source: source ? cleanHtml(source) : '',
      })
    }
  }
  return items
}

function extractTag(xml: string, tag: string): string {
  // Handle CDATA
  const cdataRegex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i')
  const cdataMatch = xml.match(cdataRegex)
  if (cdataMatch) return cdataMatch[1].trim()

  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = xml.match(regex)
  return m ? m[1].trim() : ''
}

function cleanHtml(text: string): string {
  return text.replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').trim()
}

// Google News titles end with " - Publisher"; strip that for dedup comparison.
function normalizeTitle(title: string): string {
  return title.replace(/\s+-\s+[^-]+$/, '').toLowerCase().trim()
}

function extractPublisher(urlOrSource: string): string {
  if (!urlOrSource.startsWith('http')) return urlOrSource || 'Unknown'
  try {
    const hostname = new URL(urlOrSource).hostname.replace('www.', '')
    // Clean up common domains
    const map: Record<string, string> = {
      'finance.yahoo.com': 'Yahoo Finance',
      'reuters.com': 'Reuters',
      'cnbc.com': 'CNBC',
      'bloomberg.com': 'Bloomberg',
      'marketwatch.com': 'MarketWatch',
      'seekingalpha.com': 'Seeking Alpha',
      'fool.com': 'Motley Fool',
      'investopedia.com': 'Investopedia',
      'barrons.com': "Barron's",
      'wsj.com': 'WSJ',
    }
    return map[hostname] || hostname
  } catch {
    return 'Unknown'
  }
}

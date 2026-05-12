'use client'

import { useEffect, useRef } from 'react'
import { TrendingUp, TrendingDown, Minus, ExternalLink, ChevronRight } from 'lucide-react'
import { StockChart } from './StockChart'

interface NewsItem {
  title: string
  link?: string
  publisher?: string
  publishedAt?: string
  reason?: string
}

export interface ResearchResult {
  symbol: string
  name: string
  analyses: Record<string, {
    score: number
    verdict: string
    reasoning: string
    breakdown: Record<string, { score: number; max: number; detail: string }>
  }>
  quote: {
    price: number | null; change: number | null; changePercent: number | null
    currency: string; marketCap: number | null; volume: number | null
    avgVolume: number | null; dayHigh: number | null; dayLow: number | null
    fiftyTwoWeekHigh: number | null; fiftyTwoWeekLow: number | null
    pe: number | null; eps: number | null
  }
  news: {
    good: NewsItem[]
    bad: NewsItem[]
    neutral: NewsItem[]
  }
  historicalPrices: Array<{ close: number; date: string }>
}

interface ResearchPanelProps {
  logs: Array<{ message: string; step: number; total: number; timestamp: number }>
  result: ResearchResult | null
  isLoading: boolean
  error: string | null
  goal: 'weekly' | 'monthly' | 'longterm'
}

function formatNum(n: number | null, decimals = 2): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function formatBigNum(n: number | null): string {
  if (n === null) return '—'
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  return n.toLocaleString()
}

function ScoreGauge({ score, verdict, reasoning }: { score: number; verdict?: string; reasoning?: string }) {
  const barWidth = `${score}%`
  const label = verdict || (score >= 75 ? 'STRONG BUY' : score >= 60 ? 'BUY' : score >= 45 ? 'HOLD' : score >= 30 ? 'CAUTIOUS' : 'AVOID')
  return (
    <div className="border border-border rounded-lg p-6 bg-surface">
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <span className="text-5xl font-mono font-bold text-foreground">{score}</span>
          <span className="text-sm font-mono text-muted">/100</span>
        </div>
        <span className="text-sm font-mono font-bold tracking-wider uppercase text-foreground">{label}</span>
      </div>
      <div className="w-full h-2 bg-background rounded-full overflow-hidden border border-border mb-4">
        <div className="h-full bg-foreground rounded-full transition-all duration-1000 ease-out" style={{ width: barWidth }} />
      </div>
      {reasoning && (
        <p className="text-xs font-mono text-muted leading-relaxed border-t border-border pt-4">
          {reasoning}
        </p>
      )}
    </div>
  )
}

function formatTimeAgo(dateStr?: string): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <div className="px-4 py-3">
      {item.link ? (
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-mono text-foreground leading-relaxed hover:underline underline-offset-2
                     flex items-start gap-2 group"
        >
          <span className="flex-1">{item.title}</span>
          <ExternalLink className="w-3 h-3 text-muted group-hover:text-foreground shrink-0 mt-0.5" />
        </a>
      ) : (
        <p className="text-xs font-mono text-foreground leading-relaxed">{item.title}</p>
      )}
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {item.publishedAt && (
          <span className="text-xs font-mono text-muted">{formatTimeAgo(item.publishedAt)}</span>
        )}
        {item.publishedAt && item.publisher && <span className="text-xs text-muted">·</span>}
        {item.publisher && <span className="text-xs font-mono text-muted">{item.publisher}</span>}
        {item.reason && (
          <>
            <span className="text-xs text-muted">·</span>
            <span className="text-xs font-mono text-muted italic">{item.reason}</span>
          </>
        )}
      </div>
    </div>
  )
}

export function ResearchPanel({ logs, result, isLoading, error, goal }: ResearchPanelProps) {
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="w-full max-w-3xl mx-auto mt-10 animate-slide-down">
      {/* Terminal Log */}
      <div className="border border-border rounded-lg overflow-hidden mb-6">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface">
          <span className="w-2 h-2 rounded-full bg-foreground pulse-subtle" />
          <span className="text-xs font-mono text-muted uppercase tracking-wider">Research Log</span>
          {isLoading && <span className="text-xs font-mono text-muted ml-auto">Running...</span>}
          {!isLoading && result && <span className="text-xs font-mono text-muted ml-auto">Complete</span>}
          {!isLoading && error && <span className="text-xs font-mono text-muted ml-auto">Error</span>}
        </div>
        <div className="bg-background p-4 max-h-48 overflow-y-auto font-mono text-xs leading-relaxed">
          {logs.map((log, i) => (
            <div key={i} className="flex items-start gap-2 mb-1">
              <span className="text-muted shrink-0">[{log.step}/{log.total}]</span>
              <ChevronRight className="w-3 h-3 text-muted shrink-0 mt-0.5" />
              <span className="text-foreground">{log.message}</span>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-muted">...</span>
              <span className="cursor-blink text-foreground">▌</span>
            </div>
          )}
          {error && <div className="text-foreground mt-1">✗ {error}</div>}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between border border-border rounded-lg p-4 bg-surface">
            <div>
              <h3 className="text-lg font-mono font-bold text-foreground">{result.symbol}</h3>
              <p className="text-sm font-mono text-muted">{result.name}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-mono font-bold text-foreground">
                {result.quote.currency === 'USD' ? '$' : result.quote.currency} {formatNum(result.quote.price)}
              </p>
              {result.quote.change !== null && (
                <div className="flex items-center justify-end gap-1">
                  {result.quote.change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  <span className="text-xs font-mono">
                    {result.quote.change >= 0 ? '+' : ''}{formatNum(result.quote.change)} ({formatNum(result.quote.changePercent)}%)
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Score */}
          <ScoreGauge 
            score={result.analyses[goal].score} 
            verdict={result.analyses[goal].verdict} 
            reasoning={result.analyses[goal].reasoning} 
          />

          {/* Breakdown */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-surface">
              <span className="text-xs font-mono text-muted uppercase tracking-wider">
                AI Score Breakdown — {goal} trading
              </span>
            </div>
            <div className="divide-y divide-border">
              {Object.entries(result.analyses[goal].breakdown).map(([key, val]) => (
                <div key={key} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-mono font-bold text-foreground capitalize">{key}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-background rounded-full overflow-hidden border border-border">
                        <div className="h-full bg-foreground rounded-full" style={{ width: `${(val.score / val.max) * 100}%` }} />
                      </div>
                      <span className="text-xs font-mono text-foreground w-12 text-right">{val.score}/{val.max}</span>
                    </div>
                  </div>
                  <p className="text-xs font-mono text-muted leading-relaxed">{val.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Chart */}
          <StockChart symbol={result.symbol} />

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px border border-border rounded-lg overflow-hidden">
            {[
              ['Mkt Cap', formatBigNum(result.quote.marketCap)],
              ['P/E', result.quote.pe ? formatNum(result.quote.pe, 1) : '—'],
              ['EPS', result.quote.eps ? formatNum(result.quote.eps) : '—'],
              ['Volume', formatBigNum(result.quote.volume)],
              ['Day High', formatNum(result.quote.dayHigh)],
              ['Day Low', formatNum(result.quote.dayLow)],
              ['52w High', formatNum(result.quote.fiftyTwoWeekHigh)],
              ['52w Low', formatNum(result.quote.fiftyTwoWeekLow)],
            ].map(([label, val]) => (
              <div key={label} className="bg-surface px-4 py-3 text-center">
                <p className="text-sm font-mono font-bold text-foreground">{val}</p>
                <p className="text-xs font-mono text-muted mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* News */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Positive News */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface">
                <TrendingUp className="w-3.5 h-3.5 text-foreground" />
                <span className="text-xs font-mono uppercase tracking-wider text-foreground">
                  Positive ({result.news.good.length})
                </span>
              </div>
              <div className="divide-y divide-border">
                {result.news.good.length === 0 && (
                  <p className="px-4 py-3 text-xs font-mono text-muted">No positive news found</p>
                )}
                {result.news.good.map((n, i) => <NewsCard key={i} item={n} />)}
              </div>
            </div>
            {/* Negative News */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface">
                <TrendingDown className="w-3.5 h-3.5 text-muted" />
                <span className="text-xs font-mono uppercase tracking-wider text-muted">
                  Negative ({result.news.bad.length})
                </span>
              </div>
              <div className="divide-y divide-border">
                {result.news.bad.length === 0 && (
                  <p className="px-4 py-3 text-xs font-mono text-muted">No negative news found</p>
                )}
                {result.news.bad.map((n, i) => <NewsCard key={i} item={n} />)}
              </div>
            </div>
          </div>

          {/* Neutral */}
          {result.news.neutral.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-surface">
                <Minus className="w-3.5 h-3.5 text-muted" />
                <span className="text-xs font-mono uppercase tracking-wider text-muted">
                  Neutral ({result.news.neutral.length})
                </span>
              </div>
              <div className="divide-y divide-border">
                {result.news.neutral.map((n, i) => <NewsCard key={i} item={n} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

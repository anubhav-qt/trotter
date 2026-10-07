'use client'

import { useEffect, useRef, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, ExternalLink, ChevronRight, ShieldCheck, ShieldAlert, Shield } from 'lucide-react'
import { StockChart } from './StockChart'
import type { DataQuality, Horizon, HorizonAnalysis, ResearchResult, TrackRecordSummary } from '@/lib/research-types'

interface NewsItem {
  title: string
  link?: string
  publisher?: string
  publishedAt?: string
  reason?: string
}

interface ResearchPanelProps {
  logs: Array<{ message: string; step: number; total: number; timestamp: number }>
  result: ResearchResult | null
  isLoading: boolean
  error: string | null
  goal: Horizon
}

const HORIZON_LABEL: Record<Horizon, string> = { weekly: '1 week', monthly: '1 month', longterm: '6 months' }

function formatNum(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** Indian notation: lakh (1e5) and crore (1e7). */
function formatIndian(n: number | null): string {
  if (n === null) return '—'
  if (n >= 1e7) return `${(n / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`
  if (n >= 1e5) return `${(n / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 2 })} L`
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

const pct = (n: number | null, decimals = 1) => (n === null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(decimals)}%`)
const share = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`)

function ScoreGauge({ analysis }: { analysis: HorizonAnalysis }) {
  const { score, verdict, reasoning, range } = analysis
  return (
    <div className="border border-border rounded-lg p-6 bg-surface">
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <span className="text-5xl font-mono font-bold text-foreground">{score}</span>
          <span className="text-sm font-mono text-muted">/100</span>
        </div>
        <span className="text-sm font-mono font-bold tracking-wider uppercase text-foreground">{verdict}</span>
      </div>
      {range && (
        <div className="mb-4">
          <span className="text-xs font-mono text-muted uppercase tracking-wider">
            {Math.round(range.coverage * 100)}% likely range after {range.horizonDays} sessions:{' '}
          </span>
          <span className="text-sm font-mono font-bold text-foreground">
            ₹{formatNum(range.low)} – ₹{formatNum(range.high)}
          </span>
          <p className="text-xs font-mono text-muted mt-1">
            From recent volatility only — not a prediction of direction.
          </p>
        </div>
      )}
      <div className="w-full h-2 bg-background rounded-full overflow-hidden border border-border mb-4">
        <div className="h-full bg-foreground rounded-full transition-all duration-1000 ease-out" style={{ width: `${score}%` }} />
      </div>
      {reasoning && (
        <p className="text-xs font-mono text-muted leading-relaxed border-t border-border pt-4">
          {reasoning}
        </p>
      )}
    </div>
  )
}

function DataQualityBar({ data, asOf }: { data: DataQuality; asOf: string }) {
  const { verification } = data
  const Icon = verification.status === 'verified' ? ShieldCheck : verification.status === 'mismatch' ? ShieldAlert : Shield
  const source = data.historySource === 'upstox' ? 'Upstox' : 'Yahoo Finance'
  return (
    <div className="border border-border rounded-lg px-4 py-3 bg-surface">
      <div className="flex items-start gap-2">
        <Icon className="w-3.5 h-3.5 text-foreground shrink-0 mt-0.5" />
        <p className="text-xs font-mono text-muted leading-relaxed">
          Scored on the {asOf} close · {data.sessions} sessions from {source} since {data.firstDate}
          {data.stale ? ' (stale copy)' : ''} · {verification.detail}
        </p>
      </div>
      {data.warnings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {data.warnings.map((w, i) => (
            <li key={i} className="text-xs font-mono text-muted leading-relaxed">⚠ {w}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RecordRow({ label, record }: { label: string; record: TrackRecordSummary['horizons'][Horizon] | undefined }) {
  if (!record) return null
  const { bullish, bearish } = record
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-mono font-bold text-foreground">{label}</span>
        <span className="text-xs font-mono text-muted">{record.graded} graded · {record.pending} pending</span>
      </div>
      {record.graded === 0 ? (
        <p className="text-xs font-mono text-muted">No calls old enough to grade yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-2 text-xs font-mono text-muted">
          <span>BUY calls: {bullish.calls} · beat Nifty {share(bullish.hitRate)} · avg {pct(bullish.avgExcessPct)}</span>
          <span>AVOID calls: {bearish.calls} · lagged Nifty {share(bearish.hitRate)} · avg {pct(bearish.avgExcessPct)}</span>
          <span>Inside 80% range: {share(record.rangeCoverage)}</span>
        </div>
      )}
    </div>
  )
}

function TrackRecord({ symbol, own, goal }: { symbol: string; own: TrackRecordSummary; goal: Horizon }) {
  const [model, setModel] = useState<TrackRecordSummary | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/track-record')
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!cancelled) setModel(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [symbol])

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-surface">
        <span className="text-xs font-mono text-muted uppercase tracking-wider">
          Track Record — {HORIZON_LABEL[goal]} calls graded vs Nifty 50 ({own.modelVersion})
        </span>
      </div>
      <div className="divide-y divide-border">
        <RecordRow label={symbol} record={own.horizons[goal]} />
        <RecordRow label="All stocks" record={model?.horizons[goal]} />
      </div>
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

  const analysis = result?.analyses[goal]
  const price = result ? result.quote?.price ?? result.lastClose : null
  const change = result?.quote?.change ?? null

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
      {result && analysis && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between border border-border rounded-lg p-4 bg-surface">
            <div>
              <h3 className="text-lg font-mono font-bold text-foreground">{result.symbol}</h3>
              <p className="text-sm font-mono text-muted">{result.name}</p>
              {result.industry && <p className="text-xs font-mono text-muted mt-0.5">{result.industry}</p>}
            </div>
            <div className="text-right">
              <p className="text-lg font-mono font-bold text-foreground">₹ {formatNum(price)}</p>
              {change !== null && (
                <div className="flex items-center justify-end gap-1">
                  {change >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  <span className="text-xs font-mono">
                    {change >= 0 ? '+' : ''}{formatNum(change)} ({formatNum(result.quote?.changePercent)}%)
                  </span>
                </div>
              )}
              <p className="text-xs font-mono text-muted mt-0.5">
                {result.quote?.price != null ? 'live (delayed)' : `close ${result.asOf}`}
              </p>
            </div>
          </div>

          <DataQualityBar data={result.data} asOf={result.asOf} />

          {/* Score */}
          <ScoreGauge analysis={analysis} />

          {/* Breakdown */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-surface">
              <span className="text-xs font-mono text-muted uppercase tracking-wider">
                Score Breakdown — {HORIZON_LABEL[goal]} horizon
              </span>
            </div>
            <div className="divide-y divide-border">
              {Object.entries(analysis.breakdown).map(([key, val]) => (
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

          <TrackRecord symbol={result.symbol} own={result.trackRecord} goal={goal} />

          {/* Interactive Chart */}
          <StockChart
            symbol={result.symbol}
            quote={{
              price,
              changePercent: result.quote?.changePercent ?? null,
              pe: result.stats.pe,
              volume: result.stats.lastVolume,
              avgVolume: result.stats.avgVolume,
            }}
            analyses={analysis}
          />

          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px border border-border rounded-lg overflow-hidden">
            {[
              ['Mkt Cap', result.stats.marketCap ? `₹${formatIndian(result.stats.marketCap)}` : '—'],
              ['P/E', result.stats.pe ? formatNum(result.stats.pe, 1) : '—'],
              ['Sector P/E', result.stats.sectorPe ? `${formatNum(result.stats.sectorPe, 1)} (${result.stats.peerCount})` : '—'],
              ['EPS', result.stats.eps ? formatNum(result.stats.eps) : '—'],
              ['Last Volume', formatIndian(result.stats.lastVolume)],
              ['Avg Vol (3m)', formatIndian(result.stats.avgVolume)],
              ['52w High', formatNum(result.stats.high52)],
              ['52w Low', formatNum(result.stats.low52)],
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

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { toPng } from 'html-to-image'

interface Candle {
  date: string
  open: number | null
  high: number | null
  low: number | null
  close: number
  volume: number | null
}

type ChartType = 'line' | 'candlestick'
type Period = '1d' | '1w' | '1m' | '6m' | '1y' | 'all'

const PERIODS: { key: Period; label: string }[] = [
  { key: '1d', label: '1D' },
  { key: '1w', label: '1W' },
  { key: '1m', label: '1M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: 'all', label: 'ALL' },
]

interface StockChartProps {
  symbol: string
  initialPrices?: Array<{ close: number; date: string }>
}

export function StockChart({ symbol }: StockChartProps) {
  const [chartType, setChartType] = useState<ChartType>('line')
  const [period, setPeriod] = useState<Period>('1m')
  const [candles, setCandles] = useState<Candle[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  
  // Deep Dive State
  const chartRef = useRef<HTMLDivElement>(null)
  const [isDeepDiving, setIsDeepDiving] = useState(false)
  const [deepDiveResult, setDeepDiveResult] = useState<{
    patternName: string
    explanation: string
    boundingBox: { ymin: number; xmin: number; ymax: number; xmax: number }
  } | null>(null)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&period=${period}`)
      const data = await res.json()
      setCandles(data.candles || [])
      setDeepDiveResult(null) // Reset deep dive when data changes
    } catch {
      setCandles([])
    } finally {
      setIsLoading(false)
    }
  }, [symbol, period])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const hovered = hoveredIndex !== null && hoveredIndex < candles.length ? candles[hoveredIndex] : null
  const latest = candles.length > 0 ? candles[candles.length - 1] : null
  const display = hovered || latest

  const handleDeepDive = async () => {
    if (!chartRef.current) return
    setIsDeepDiving(true)
    setDeepDiveResult(null)
    try {
      // Capture the chart area (avoid capturing the deep dive box itself if it was already open, but it's cleared above)
      const dataUrl = await toPng(chartRef.current, { cacheBust: true, backgroundColor: '#000000' })
      const res = await fetch('/api/deep-dive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, image: dataUrl })
      })
      if (res.ok) {
        const data = await res.json()
        setDeepDiveResult(data)
      } else {
        const err = await res.json()
        setDeepDiveResult({
          patternName: 'Analysis Failed',
          explanation: err.error || 'The AI service encountered an error (likely rate limit). Please try again in a minute.',
          boundingBox: { ymin: 0, xmin: 0, ymax: 0, xmax: 0 }
        })
      }
    } catch (e) {
      console.error('Deep dive failed', e)
    } finally {
      setIsDeepDiving(false)
    }
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-surface">
      {/* Header: chart type + period toggles */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setChartType('line')}
            className={`px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer
              ${chartType === 'line' ? 'bg-foreground text-background font-bold' : 'text-muted hover:text-foreground'}`}
          >
            Line
          </button>
          <button
            onClick={() => setChartType('candlestick')}
            className={`px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer
              ${chartType === 'candlestick' ? 'bg-foreground text-background font-bold' : 'text-muted hover:text-foreground'}`}
          >
            Candle
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={handleDeepDive}
            disabled={isDeepDiving || candles.length < 5}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded transition-colors cursor-pointer text-muted hover:text-foreground disabled:opacity-50"
          >
            {isDeepDiving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Deep Dive
          </button>
        </div>
        <div className="flex items-center gap-0.5">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-2 py-1 text-xs font-mono rounded transition-colors cursor-pointer
                ${period === p.key ? 'bg-foreground text-background font-bold' : 'text-muted hover:text-foreground'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Price display */}
      {display && (
        <div className="px-4 pt-3 pb-1 flex items-baseline gap-3">
          <span className="text-lg font-mono font-bold text-foreground">
            {display.close.toFixed(2)}
          </span>
          {display.open !== null && (
            <span className="text-xs font-mono text-muted">
              O:{display.open.toFixed(2)} H:{display.high?.toFixed(2)} L:{display.low?.toFixed(2)}
            </span>
          )}
          {hovered && (
            <span className="text-xs font-mono text-muted ml-auto">
              {formatChartDate(hovered.date, period)}
            </span>
          )}
        </div>
      )}

      {/* Chart area */}
      <div className="px-4 pb-4 pt-1 h-52 relative" ref={chartRef}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 text-muted animate-spin" />
          </div>
        ) : candles.length < 2 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs font-mono text-muted">No chart data available</span>
          </div>
        ) : chartType === 'line' ? (
          <LineChart candles={candles} period={period} onHover={setHoveredIndex} />
        ) : (
          <CandlestickChart candles={candles} period={period} onHover={setHoveredIndex} />
        )}
        
        {/* Deep Dive Highlight Overlay */}
        {deepDiveResult && deepDiveResult.boundingBox && (
          <div 
            className="absolute border-2 border-foreground bg-foreground/10 pointer-events-none transition-all duration-500 shadow-[0_0_15px_rgba(255,255,255,0.2)]"
            style={{
              top: `calc(${deepDiveResult.boundingBox.ymin / 10}% + 0px)`, // Add slight offset mapping if needed
              left: `${deepDiveResult.boundingBox.xmin / 10}%`,
              height: `${(deepDiveResult.boundingBox.ymax - deepDiveResult.boundingBox.ymin) / 10}%`,
              width: `${(deepDiveResult.boundingBox.xmax - deepDiveResult.boundingBox.xmin) / 10}%`,
            }}
          >
            <div className="absolute -top-6 left-0 whitespace-nowrap bg-foreground text-background px-2 py-0.5 text-[10px] font-bold uppercase rounded-sm">
              {deepDiveResult.patternName}
            </div>
          </div>
        )}
      </div>

      {/* Date range footer */}
      {candles.length >= 2 && !isLoading && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-border">
          <span className="text-xs font-mono text-muted">{formatChartDate(candles[0].date, period)}</span>
          <span className="text-xs font-mono text-muted">{formatChartDate(candles[candles.length - 1].date, period)}</span>
        </div>
      )}

      {/* Deep Dive Explanation Panel */}
      {deepDiveResult && (
        <div className="border-t border-border bg-surface px-4 py-3 animate-slide-down">
          <div className="flex items-start gap-3">
            <Sparkles className="w-4 h-4 text-foreground shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-mono font-bold text-foreground mb-1">
                AI Vision Analysis: {deepDiveResult.patternName}
              </h4>
              <p className="text-xs font-mono text-muted leading-relaxed">
                {deepDiveResult.explanation}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatChartDate(dateStr: string, period: Period): string {
  const d = new Date(dateStr)
  if (period === '1d') return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (period === '1w') return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  if (period === 'all' || period === '1y') return d.toLocaleDateString([], { month: 'short', year: 'numeric' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ---- LINE CHART ----
function LineChart({ candles, period, onHover }: { candles: Candle[]; period: Period; onHover: (i: number | null) => void }) {
  const closes = candles.map(c => c.close)
  const min = Math.min(...closes), max = Math.max(...closes)
  const range = max - min || 1
  const w = 600, h = 180, px = 0, py = 8

  const points = closes.map((c, i) => {
    const x = px + (i / (closes.length - 1)) * (w - 2 * px)
    const y = py + (1 - (c - min) / range) * (h - 2 * py)
    return { x, y }
  })

  const polyline = points.map(p => `${p.x},${p.y}`).join(' ')
  const trending = closes[closes.length - 1] >= closes[0]

  // Gradient fill area
  const areaPath = `M ${points[0].x},${h} ` +
    points.map(p => `L ${p.x},${p.y}`).join(' ') +
    ` L ${points[points.length - 1].x},${h} Z`

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-full"
      preserveAspectRatio="none"
      onMouseLeave={() => onHover(null)}
    >
      <defs>
        <linearGradient id={`grad-${period}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={trending ? 0.15 : 0.08} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#grad-${period})`} />
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" strokeOpacity={trending ? 1 : 0.6} points={polyline} />
      {/* Hover zones */}
      {points.map((p, i) => (
        <rect
          key={i}
          x={p.x - (w / closes.length) / 2}
          y={0}
          width={w / closes.length}
          height={h}
          fill="transparent"
          onMouseEnter={() => onHover(i)}
        />
      ))}
      {/* Hover crosshair */}
      {onHover && points.map((p, i) => (
        <circle key={`dot-${i}`} cx={p.x} cy={p.y} r="0" fill="currentColor" className="pointer-events-none" />
      )).filter(() => false)}
    </svg>
  )
}

// ---- CANDLESTICK CHART ----
function CandlestickChart({ candles, period, onHover }: { candles: Candle[]; period: Period; onHover: (i: number | null) => void }) {
  const allPrices = candles.flatMap(c => [c.open ?? c.close, c.high ?? c.close, c.low ?? c.close, c.close])
  const min = Math.min(...allPrices), max = Math.max(...allPrices)
  const range = max - min || 1
  const w = 600, h = 180, py = 8
  const candleW = Math.max(1, (w / candles.length) * 0.6)
  const gap = w / candles.length

  const toY = (price: number) => py + (1 - (price - min) / range) * (h - 2 * py)

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-full"
      preserveAspectRatio="none"
      onMouseLeave={() => onHover(null)}
    >
      {candles.map((c, i) => {
        const open = c.open ?? c.close
        const high = c.high ?? c.close
        const low = c.low ?? c.close
        const bullish = c.close >= open
        const x = i * gap + gap / 2
        const bodyTop = toY(Math.max(open, c.close))
        const bodyBottom = toY(Math.min(open, c.close))
        const bodyH = Math.max(0.5, bodyBottom - bodyTop)

        return (
          <g key={i} onMouseEnter={() => onHover(i)}>
            {/* Hover zone */}
            <rect x={x - gap / 2} y={0} width={gap} height={h} fill="transparent" />
            {/* Wick */}
            <line
              x1={x} y1={toY(high)} x2={x} y2={toY(low)}
              stroke="currentColor"
              strokeWidth="0.8"
              strokeOpacity={0.5}
            />
            {/* Body */}
            <rect
              x={x - candleW / 2}
              y={bodyTop}
              width={candleW}
              height={bodyH}
              fill={bullish ? 'currentColor' : 'transparent'}
              stroke="currentColor"
              strokeWidth="0.8"
              opacity={bullish ? 0.9 : 0.5}
            />
          </g>
        )
      })}
      {/* Suppress unused var warning */}
      {period && null}
    </svg>
  )
}

'use client'

import { useState, useCallback, useRef } from 'react'
import { SearchBar, type SelectedStock } from '@/components/SearchBar'
import { ResearchPanel, type ResearchResult } from '@/components/ResearchPanel'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Terminal } from 'lucide-react'

type Goal = 'weekly' | 'monthly' | 'longterm'

interface LogEntry {
  message: string
  step: number
  total: number
  timestamp: number
}

export default function Home() {
  const [selectedStock, setSelectedStock] = useState<SelectedStock | null>(null)
  const [goal, setGoal] = useState<Goal>('monthly')
  const [isResearching, setIsResearching] = useState(false)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [result, setResult] = useState<ResearchResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showResults, setShowResults] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const startResearch = useCallback(async () => {
    if (!selectedStock) return

    // Abort any previous research
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsResearching(true)
    setLogs([])
    setResult(null)
    setError(null)
    setShowResults(true)

    try {
      const res = await fetch(
        `/api/research?symbol=${encodeURIComponent(selectedStock.symbol)}`,
        { signal: controller.signal }
      )

      if (!res.ok || !res.body) {
        throw new Error('Failed to start research')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'status') {
              setLogs(prev => [...prev, {
                message: event.message,
                step: event.step,
                total: event.total,
                timestamp: Date.now()
              }])
            } else if (event.type === 'complete') {
              setResult(event.result as ResearchResult)
            } else if (event.type === 'error') {
              setError(event.message)
            }
          } catch {}
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(`Research failed: ${(err as Error).message}`)
      }
    } finally {
      setIsResearching(false)
    }
  }, [selectedStock])

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Terminal className="w-5 h-5 text-foreground" />
          <h1 className="text-sm font-mono font-bold tracking-widest uppercase text-foreground">
            Trotter
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline text-xs font-mono text-muted">
            v0.4.0
          </span>
          <ThemeToggle />
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center px-6 py-12">
        {/* Hero section - compact when results showing */}
        <div className={`text-center mb-8 max-w-xl transition-all duration-300 ${showResults ? 'mb-6' : 'mt-20 mb-12'}`}>
          {!showResults && (
            <>
              <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 border border-border rounded-full">
                <span className="w-1.5 h-1.5 bg-foreground rounded-full pulse-subtle" />
                <span className="text-xs font-mono text-muted uppercase tracking-wider">
                  Market Intelligence Active
                </span>
              </div>

              <h2 className="text-3xl sm:text-4xl font-mono font-bold tracking-tight text-foreground mb-4">
                Analyze. Score. Trade.
              </h2>

              <p className="text-sm font-mono text-muted leading-relaxed max-w-md mx-auto">
                AI-powered stock analysis engine. Search any stock to get real-time stats,
                sentiment scoring, and investment recommendations.
              </p>
            </>
          )}
        </div>

        {/* Search bar */}
        <SearchBar
          onStockSelected={setSelectedStock}
          onResearch={startResearch}
          selectedStock={selectedStock}
          isResearching={isResearching}
        />

        {/* Goal selector - shown when stock is selected */}
        {selectedStock && !isResearching && (
          <div className="mt-4 flex items-center gap-1 p-1 border border-border rounded-lg bg-surface animate-slide-down">
            {(['weekly', 'monthly', 'longterm'] as Goal[]).map((g) => (
              <button
                key={g}
                id={`goal-${g}`}
                onClick={() => setGoal(g)}
                className={`px-4 py-2 text-xs font-mono uppercase tracking-wider rounded-md
                           transition-colors duration-150 cursor-pointer
                           ${goal === g
                             ? 'bg-foreground text-background font-bold'
                             : 'text-muted hover:text-foreground hover:bg-surface-hover'
                           }`}
              >
                {g === 'longterm' ? 'Long Term' : g}
              </button>
            ))}
          </div>
        )}

        {/* Keyboard hints */}
        {!showResults && !selectedStock && (
          <div className="mt-6 flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-mono text-muted">
              <kbd className="px-1.5 py-0.5 border border-border rounded text-xs">↑</kbd>
              <kbd className="px-1.5 py-0.5 border border-border rounded text-xs">↓</kbd>
              <span>navigate</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-muted">
              <kbd className="px-1.5 py-0.5 border border-border rounded text-xs">↵</kbd>
              <span>select</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-muted">
              <kbd className="px-1.5 py-0.5 border border-border rounded text-xs">esc</kbd>
              <span>close</span>
            </div>
          </div>
        )}

        {/* Stats grid - only show before research */}
        {!showResults && (
          <div className="mt-20 grid grid-cols-3 gap-px border border-border rounded-lg overflow-hidden max-w-lg w-full">
            <div className="bg-surface px-6 py-5 text-center">
              <p className="text-xl font-mono font-bold text-foreground">0–100</p>
              <p className="text-xs font-mono text-muted mt-1">Score Range</p>
            </div>
            <div className="bg-surface px-6 py-5 text-center border-x border-border">
              <p className="text-xl font-mono font-bold text-foreground">3</p>
              <p className="text-xs font-mono text-muted mt-1">Trade Modes</p>
            </div>
            <div className="bg-surface px-6 py-5 text-center">
              <p className="text-xl font-mono font-bold text-foreground">Live</p>
              <p className="text-xs font-mono text-muted mt-1">Market Data</p>
            </div>
          </div>
        )}

        {/* Research Panel */}
        {showResults && (
          <ResearchPanel
            logs={logs}
            result={result}
            isLoading={isResearching}
            error={error}
            goal={goal}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-border">
        <div className="flex items-center justify-between text-xs font-mono text-muted">
          <span>© 2026 Trotter</span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-foreground rounded-full" />
            System Online
          </span>
        </div>
      </footer>
    </div>
  )
}

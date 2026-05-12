'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Loader2, X, Zap } from 'lucide-react'

interface StockResult {
  symbol: string
  name: string
  exchange: string
  type: string
}

export interface SelectedStock {
  symbol: string
  name: string
}

interface SearchBarProps {
  onStockSelected: (stock: SelectedStock | null) => void
  onResearch: () => void
  selectedStock: SelectedStock | null
  isResearching: boolean
}

export function SearchBar({ onStockSelected, onResearch, selectedStock, isResearching }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StockResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchResults = useCallback(async (searchQuery: string) => {
    if (searchQuery.trim().length < 1) {
      setResults([])
      setIsOpen(false)
      return
    }

    setIsLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setResults(data.results || [])
      setIsOpen(true)
      setSelectedIndex(-1)
    } catch {
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleInputChange = (value: string) => {
    setQuery(value)
    // Clear selection when user types
    if (selectedStock) {
      onStockSelected(null)
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchResults(value)
    }, 300)
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
    setIsOpen(false)
    onStockSelected(null)
    inputRef.current?.focus()
  }

  const handleSelect = (stock: StockResult) => {
    setQuery(stock.symbol)
    setIsOpen(false)
    onStockSelected({ symbol: stock.symbol, name: stock.name })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // If stock is selected and dropdown is closed, Enter triggers research
    if (e.key === 'Enter' && selectedStock && !isOpen) {
      e.preventDefault()
      if (!isResearching) onResearch()
      return
    }

    if (!isOpen || results.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1))
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleSelect(results[selectedIndex])
        }
        break
      case 'Escape':
        setIsOpen(false)
        break
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current) }
  }, [])

  return (
    <div className="relative w-full max-w-2xl mx-auto">
      {/* Input container */}
      <div className={`relative focus-ring rounded-lg border transition-colors duration-150
        ${selectedStock ? 'border-foreground bg-surface' : 'border-border bg-surface'}`}>
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
        <input
          ref={inputRef}
          id="stock-search-input"
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && !selectedStock && setIsOpen(true)}
          placeholder="Search stocks... (e.g. AAPL, Tesla, MSFT)"
          className="w-full bg-transparent py-4 pl-12 pr-32 text-foreground font-mono text-sm
                     placeholder:text-muted outline-none"
          autoComplete="off"
          spellCheck={false}
          disabled={isResearching}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {isLoading && (
            <Loader2 className="w-4 h-4 text-muted animate-spin" />
          )}
          {query && !isLoading && !isResearching && (
            <button
              id="search-clear-btn"
              onClick={handleClear}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-surface-hover
                         transition-colors duration-100 cursor-pointer"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5 text-muted" />
            </button>
          )}
          {selectedStock && !isResearching && (
            <button
              id="research-btn"
              onClick={onResearch}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-foreground text-background
                         font-mono text-xs font-bold rounded hover:opacity-90 transition-opacity
                         cursor-pointer uppercase tracking-wider"
            >
              <Zap className="w-3 h-3" />
              Research
            </button>
          )}
          {isResearching && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 border border-border font-mono text-xs text-muted rounded">
              <Loader2 className="w-3 h-3 animate-spin" />
              Analyzing...
            </div>
          )}
          {!selectedStock && !isResearching && !query && (
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs font-mono
                            text-muted border border-border rounded">
              /
            </kbd>
          )}
        </div>
      </div>

      {/* Selected stock indicator */}
      {selectedStock && !isOpen && !isResearching && (
        <div className="mt-2 flex items-center gap-2 text-xs font-mono text-muted">
          <span className="w-1.5 h-1.5 bg-foreground rounded-full" />
          <span>{selectedStock.name} selected — press</span>
          <kbd className="px-1.5 py-0.5 border border-border rounded text-xs">↵</kbd>
          <span>or click Research</span>
        </div>
      )}

      {/* Dropdown results */}
      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          id="search-results-dropdown"
          className="absolute z-40 w-full mt-2 border border-border rounded-lg bg-surface
                     shadow-lg overflow-hidden animate-slide-down"
        >
          <div className="px-3 py-2 border-b border-border">
            <span className="text-xs font-mono text-muted uppercase tracking-wider">
              {results.length} result{results.length !== 1 ? 's' : ''} found
            </span>
          </div>
          <ul className="max-h-80 overflow-y-auto" role="listbox" id="search-results-list">
            {results.map((stock, index) => (
              <li
                key={`${stock.symbol}-${stock.exchange}`}
                id={`search-result-${index}`}
                role="option"
                aria-selected={index === selectedIndex}
                onClick={() => handleSelect(stock)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`flex items-center justify-between px-4 py-3 cursor-pointer
                           transition-colors duration-75 border-b border-border last:border-b-0
                           ${index === selectedIndex ? 'bg-surface-hover' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <span className="font-mono font-bold text-sm text-foreground tracking-wide">
                    {stock.symbol}
                  </span>
                  <span className="text-sm text-muted truncate max-w-xs">
                    {stock.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-mono text-muted px-2 py-0.5 border border-border rounded">
                    {stock.exchange}
                  </span>
                  <span className="text-xs font-mono text-muted">
                    {stock.type}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* No results state */}
      {isOpen && results.length === 0 && !isLoading && query.trim().length > 0 && (
        <div className="absolute z-40 w-full mt-2 border border-border rounded-lg bg-surface
                     shadow-lg overflow-hidden animate-slide-down">
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-mono text-muted">No stocks found for &quot;{query}&quot;</p>
          </div>
        </div>
      )}
    </div>
  )
}

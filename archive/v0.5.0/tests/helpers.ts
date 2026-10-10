import fs from 'node:fs'
import path from 'node:path'
import { openDb, setDb } from '@/lib/db'
import { addDays, isWeekday } from '@/lib/market/time'
import type { DailyBar } from '@/lib/market/types'

export function fixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8')
}

/** Point the app at a brand-new in-memory database. */
export function freshDb() {
  const db = openDb(':memory:')
  setDb(db)
  return db
}

/** Deterministic PRNG so synthetic markets are identical on every run. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standard normal via Box–Muller. */
export function gaussian(rand: () => number): () => number {
  return () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())
}

export interface SyntheticOptions {
  start?: string
  price?: number
  /** Daily log-return drift. */
  drift?: number
  /** Daily log-return volatility. */
  vol?: number
  seed?: number
  volume?: number
}

/** Weekday-only geometric random walk, OHLC built around each close. */
export function makeBars(n: number, opts: SyntheticOptions = {}): DailyBar[] {
  const { start = '2020-01-01', price = 100, drift = 0, vol = 0.015, seed = 1, volume = 1_000_000 } = opts
  const rand = rng(seed)
  const z = gaussian(rand)
  const bars: DailyBar[] = []
  let date = start
  let close = price
  while (bars.length < n) {
    if (isWeekday(date)) {
      const open = close
      close = close * Math.exp(drift + vol * z())
      const high = Math.max(open, close) * (1 + 0.004 * rand())
      const low = Math.min(open, close) * (1 - 0.004 * rand())
      bars.push({ date, open, high, low, close, volume: Math.round(volume * (0.7 + 0.6 * rand())) })
    }
    date = addDays(date, 1)
  }
  return bars
}

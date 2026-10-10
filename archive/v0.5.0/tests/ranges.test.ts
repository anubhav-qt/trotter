import { describe, expect, it } from 'vitest'
import { ewmaVariance, horizonVariance, priceRange } from '@/lib/ranges'
import { makeBars } from './helpers'

describe('volatility maths', () => {
  it('adds up daily variance over the horizon when vol is at its norm', () => {
    expect(horizonVariance(0.0004, 0.0004, 21)).toBeCloseTo(21 * 0.0004, 12)
  })

  it('lets elevated current vol fade toward the long-run level', () => {
    const now = 0.0009, longRun = 0.0001
    const perDay = (h: number) => horizonVariance(now, longRun, h) / h
    expect(perDay(1)).toBeLessThan(now)
    expect(perDay(5)).toBeGreaterThan(perDay(126))
    expect(perDay(126)).toBeGreaterThan(longRun)
  })

  it('recovers the true volatility of a random walk', () => {
    const rets = makeBars(2000, { vol: 0.02, seed: 9 }).map((b, i, a) => (i ? Math.log(b.close / a[i - 1].close) : 0)).slice(1)
    expect(Math.sqrt(ewmaVariance(rets))).toBeGreaterThan(0.012)
    expect(Math.sqrt(ewmaVariance(rets))).toBeLessThan(0.028)
  })
})

describe('priceRange', () => {
  it('needs enough history', () => {
    expect(priceRange(makeBars(30), 5)).toBeNull()
  })

  it('is symmetric in log space around the last close', () => {
    const bars = makeBars(300, { seed: 4 })
    const r = priceRange(bars, 21)!
    const last = bars[bars.length - 1].close
    expect(Math.log(r.high / last)).toBeCloseTo(-Math.log(r.low / last), 10)
    expect(r.coverage).toBe(0.8)
  })

  it('contains roughly 80% of outcomes when volatility is stable (calibration)', () => {
    let inside = 0
    const trials = 400
    for (let seed = 1; seed <= trials; seed++) {
      const path = makeBars(300 + 21, { vol: 0.015, seed })
      const r = priceRange(path.slice(0, 300), 21)!
      const exit = path[path.length - 1].close
      if (exit >= r.low && exit <= r.high) inside++
    }
    expect(inside / trials).toBeGreaterThan(0.74)
    expect(inside / trials).toBeLessThan(0.86)
  })
})

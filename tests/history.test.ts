import { beforeEach, describe, expect, it, vi } from 'vitest'
import { findSuspiciousJumps, getDailyHistory, loadBars, needsRefresh, sanitizeBars, wasReadjusted } from '@/lib/market/history'
import { fetchUpstoxDaily } from '@/lib/market/upstox'
import { fetchYahooDaily } from '@/lib/market/yahoo'
import { getDb } from '@/lib/db'
import type { DailyBar } from '@/lib/market/types'
import { freshDb, makeBars } from './helpers'

vi.mock('@/lib/market/upstox', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/market/upstox')>()),
  fetchUpstoxDaily: vi.fn(),
}))
vi.mock('@/lib/market/yahoo', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/market/yahoo')>()),
  fetchYahooDaily: vi.fn(),
}))

const upstox = vi.mocked(fetchUpstoxDaily)
const yahoo = vi.mocked(fetchYahooDaily)

// Wednesday 7 Oct 2026, 18:00 IST — the 7 Oct session is complete.
const NOW = new Date('2026-10-07T12:30:00Z')

function seedInstrument(symbol = 'RELIANCE', isin: string | null = 'INE002A01018') {
  getDb()
    .prepare('INSERT INTO instruments (symbol, name, isin, series, industry, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(symbol, 'Reliance Industries Ltd.', isin, 'EQ', 'Oil Gas & Consumable Fuels', NOW.toISOString())
}

/** Synthetic bars ending exactly on the 7 Oct session. */
function barsEndingOct7(n: number, seed = 1): DailyBar[] {
  const bars = makeBars(1300, { start: '2022-01-03', seed })
  const end = bars.findIndex(b => b.date === '2026-10-07')
  return bars.slice(end - n + 1, end + 1)
}

beforeEach(() => {
  freshDb()
  upstox.mockReset()
  yahoo.mockReset()
})

describe('sanitizeBars', () => {
  it('drops the unfinished session, bad rows and duplicates, and repairs high/low', () => {
    const duringSession = new Date('2026-10-07T06:00:00Z') // 11:30 IST
    const out = sanitizeBars(
      [
        { date: '2026-10-07', open: 10, high: 11, low: 9, close: 10.5, volume: 5 }, // still trading
        { date: '2026-10-06', open: 10, high: 9.5, low: 10.2, close: 10, volume: -1 }, // inconsistent
        { date: '2026-10-05', open: 10, high: 10, low: 10, close: 0, volume: 1 }, // invalid close
        { date: '2026-10-02', open: 9, high: 9, low: 9, close: 9, volume: 1 },
        { date: '2026-10-02', open: 9, high: 9.1, low: 8.9, close: 9.05, volume: 2 }, // later duplicate wins
      ],
      duringSession
    )
    expect(out).toEqual([
      { date: '2026-10-02', open: 9, high: 9.1, low: 8.9, close: 9.05, volume: 2 },
      { date: '2026-10-06', open: 10, high: 10, low: 10, close: 10, volume: 0 },
    ])
  })
})

describe('series checks', () => {
  it('flags moves no NSE price band allows', () => {
    // 1:1 bonus left unadjusted: every price from the ex-date on is halved.
    const bars = makeBars(6).map((b, i) => (i < 3 ? b : { ...b, close: b.close / 2 }))
    expect(findSuspiciousJumps(bars).map(j => j.date)).toEqual([bars[3].date])
  })

  it('detects re-adjusted history on overlapping dates', () => {
    const stored = makeBars(10)
    const same = stored.slice(-3).map(b => ({ ...b, close: b.close * 1.001 }))
    const halved = stored.slice(-3).map(b => ({ ...b, close: b.close / 2 }))
    expect(wasReadjusted(stored, same)).toBe(false)
    expect(wasReadjusted(stored, halved)).toBe(true)
  })

  it('refreshes when the expected session is missing, but backs off on holidays', () => {
    expect(needsRefresh('2026-10-07', '2026-10-07T11:00:00Z', NOW)).toBe(false)
    expect(needsRefresh('2026-10-06', '2026-10-07T09:00:00Z', NOW)).toBe(true) // fetched before the close
    expect(needsRefresh('2026-10-06', '2026-10-07T12:00:00Z', NOW)).toBe(false) // tried 30 min ago
    expect(needsRefresh('2026-10-06', '2026-10-07T11:00:00Z', NOW)).toBe(true) // tried 90 min ago
    expect(needsRefresh(null, null, NOW)).toBe(true)
  })
})

describe('getDailyHistory', () => {
  it('fetches from Upstox first and serves later calls from the database', async () => {
    seedInstrument()
    upstox.mockResolvedValue(barsEndingOct7(300))

    const first = await getDailyHistory('RELIANCE', { now: NOW })
    expect(first.source).toBe('upstox')
    expect(first.bars).toHaveLength(300)
    expect(first.warnings).toEqual([])
    expect(upstox).toHaveBeenCalledWith('NSE_EQ|INE002A01018', expect.any(String), '2026-10-07')

    const second = await getDailyHistory('RELIANCE', { now: NOW })
    expect(second.bars).toEqual(first.bars)
    expect(upstox).toHaveBeenCalledTimes(1)
    expect(yahoo).not.toHaveBeenCalled()
  })

  it('falls back to Yahoo when Upstox fails', async () => {
    seedInstrument()
    upstox.mockRejectedValue(new Error('HTTP 503 from api.upstox.com'))
    yahoo.mockResolvedValue(barsEndingOct7(300))

    const res = await getDailyHistory('RELIANCE', { now: NOW })
    expect(res.source).toBe('yahoo')
    expect(res.warnings[0]).toMatch(/Upstox refresh failed/)
  })

  it('skips Upstox when the ISIN is unknown', async () => {
    seedInstrument('NEWCO', null)
    yahoo.mockResolvedValue(barsEndingOct7(300))
    const res = await getDailyHistory('NEWCO', { now: NOW })
    expect(res.source).toBe('yahoo')
    expect(upstox).not.toHaveBeenCalled()
  })

  it('prefers a clean source over one with an unadjusted split', async () => {
    seedInstrument()
    const clean = barsEndingOct7(300)
    const split = clean.map((b, i) => (i < 200 ? b : { ...b, open: b.open / 2, high: b.high / 2, low: b.low / 2, close: b.close / 2 }))
    upstox.mockResolvedValue(split)
    yahoo.mockResolvedValue(clean)

    const res = await getDailyHistory('RELIANCE', { now: NOW })
    expect(res.source).toBe('yahoo')
    expect(res.warnings.join(' ')).toMatch(/Upstox shows 1 unexplained price jump/)
  })

  it('serves stale stored data with a warning when every source is down', async () => {
    seedInstrument()
    upstox.mockResolvedValue(barsEndingOct7(300).slice(0, -1)) // ends on 6 Oct
    await getDailyHistory('RELIANCE', { now: new Date('2026-10-06T12:30:00Z') })

    upstox.mockRejectedValue(new Error('timeout'))
    yahoo.mockRejectedValue(new Error('HTTP 429'))
    const res = await getDailyHistory('RELIANCE', { now: NOW })
    expect(res.stale).toBe(true)
    expect(res.bars.at(-1)!.date).toBe('2026-10-06')
    expect(res.warnings.at(-1)).toMatch(/Using Upstox data last updated/)
  })

  it('refreshes incrementally, and replaces history when the provider re-adjusts it', async () => {
    seedInstrument()
    const all = barsEndingOct7(300)
    upstox.mockResolvedValueOnce(all.slice(0, -1))
    await getDailyHistory('RELIANCE', { now: new Date('2026-10-06T12:30:00Z') })

    // Normal day: only the recent window is requested and merged.
    upstox.mockResolvedValueOnce(all.slice(-10))
    const res = await getDailyHistory('RELIANCE', { now: NOW })
    expect(res.bars).toHaveLength(300)
    expect(upstox.mock.calls[1][1] > '2026-09-01').toBe(true)

    // A split re-adjusts everything: overlap mismatch triggers a full reload.
    const adjusted = all.map(b => ({ ...b, open: b.open / 2, high: b.high / 2, low: b.low / 2, close: b.close / 2 }))
    upstox.mockResolvedValueOnce(adjusted.slice(-10)).mockResolvedValueOnce(adjusted)
    const later = new Date('2026-10-08T12:30:00Z')
    const after = await getDailyHistory('RELIANCE', { now: later })
    expect(after.bars).toHaveLength(300)
    expect(after.bars[0].close).toBeCloseTo(all[0].close / 2)
    expect(loadBars('RELIANCE', 'upstox')).toHaveLength(300)
  })

  it('throws a clear error when nothing is available', async () => {
    seedInstrument()
    upstox.mockRejectedValue(new Error('down'))
    yahoo.mockResolvedValue([])
    await expect(getDailyHistory('RELIANCE', { now: NOW })).rejects.toThrow(/No price history available for RELIANCE/)
  })
})

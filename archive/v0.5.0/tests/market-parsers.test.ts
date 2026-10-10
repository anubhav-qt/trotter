import { describe, expect, it } from 'vitest'
import { csvNumber, parseCsv } from '@/lib/market/csv'
import { parseEquityList, parseFullBhavcopy, parseIndexList } from '@/lib/market/nse'
import { parseUpstoxCandles, upstoxInstrumentKey } from '@/lib/market/upstox'
import { toDailyBars, yahooTicker } from '@/lib/market/yahoo'
import { BENCHMARK } from '@/lib/market/types'
import { fixture } from './helpers'

describe('parseCsv', () => {
  it('handles quotes, escaped quotes, CRLF and blank lines', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n\n1,2')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['1', '2'],
    ])
  })

  it('parses numbers defensively', () => {
    expect(csvNumber(' 1,234.50 ')).toBe(1234.5)
    expect(csvNumber('-')).toBeNull()
    expect(csvNumber('')).toBeNull()
    expect(csvNumber(undefined)).toBeNull()
  })
})

describe('NSE parsers', () => {
  it('reads index constituents with industry and ISIN', () => {
    const list = parseIndexList(fixture('ind_nifty50list.csv'))
    expect(list).toHaveLength(4)
    expect(list.find(i => i.symbol === 'M&M')).toEqual({
      symbol: 'M&M',
      name: 'Mahindra & Mahindra Ltd.',
      isin: 'INE101A01026',
      series: 'EQ',
      industry: 'Automobile and Auto Components',
    })
  })

  it('reads the equity list despite space-padded headers', () => {
    const list = parseEquityList(fixture('EQUITY_L.csv'))
    expect(list).toHaveLength(5)
    expect(list.find(i => i.symbol === 'RELIANCE')).toMatchObject({ isin: 'INE002A01018', series: 'EQ' })
  })

  it('reads the full bhavcopy, keeping non-numeric delivery as null', () => {
    const rows = parseFullBhavcopy(fixture('sec_bhavdata_full_06102026.csv'))
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({
      date: '2026-10-06', symbol: 'RELIANCE', series: 'EQ',
      prevClose: 1380.1, open: 1382, high: 1395.5, low: 1376.2, close: 1390.65,
      volume: 8123456, deliveryPct: 49.39,
    })
    expect(rows[2].deliveryPct).toBeNull()
  })
})

describe('Upstox', () => {
  it('builds instrument keys', () => {
    expect(upstoxInstrumentKey('RELIANCE', 'INE002A01018')).toBe('NSE_EQ|INE002A01018')
    expect(upstoxInstrumentKey(BENCHMARK, null)).toBe('NSE_INDEX|Nifty 50')
    expect(upstoxInstrumentKey('RELIANCE', null)).toBeNull()
  })

  it('parses newest-first candles into ascending bars', () => {
    const bars = parseUpstoxCandles({
      status: 'success',
      data: {
        candles: [
          ['2026-10-06T00:00:00+05:30', 1382, 1395.5, 1376.2, 1390.65, 8123456, 0],
          ['2026-10-05T00:00:00+05:30', 1371, 1384, 1366, 1380.1, 7000000, 0],
        ],
      },
    })
    expect(bars.map(b => b.date)).toEqual(['2026-10-05', '2026-10-06'])
    expect(bars[1]).toEqual({ date: '2026-10-06', open: 1382, high: 1395.5, low: 1376.2, close: 1390.65, volume: 8123456 })
  })

  it('rejects error responses', () => {
    expect(() => parseUpstoxCandles({ status: 'error' })).toThrow(/error/)
  })
})

describe('Yahoo', () => {
  it('maps tickers', () => {
    expect(yahooTicker('M&M')).toBe('M&M.NS')
    expect(yahooTicker(BENCHMARK)).toBe('^NSEI')
  })

  it('dates bars by IST session, whichever UTC timestamp Yahoo uses', () => {
    const bars = toDailyBars([
      // 09:15 IST open timestamp
      { date: new Date('2026-10-06T03:45:00Z'), open: 1, high: 2, low: 1, close: 2, volume: 10 },
      // IST-midnight timestamp, which is the previous day in UTC
      { date: new Date('2026-10-06T18:30:00Z'), open: 2, high: 3, low: 2, close: 3, volume: null },
      { date: new Date('2026-10-08T03:45:00Z'), open: 3, high: 3, low: 3, close: null, volume: 0 },
    ])
    expect(bars.map(b => [b.date, b.close, b.volume])).toEqual([
      ['2026-10-06', 2, 10],
      ['2026-10-07', 3, 0],
    ])
  })
})

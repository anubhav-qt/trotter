import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getIndexMembers, getIndustryPeers, getInstrument, searchInstruments, syncInstruments } from '@/lib/market/instruments'
import { fetchEquityList, fetchFullBhavcopy, fetchIndexConstituents, parseEquityList, parseFullBhavcopy, parseIndexList } from '@/lib/market/nse'
import { compareClose, verifyLatestClose } from '@/lib/market/verify'
import type { IndexName } from '@/lib/market/types'
import { fixture, freshDb } from './helpers'

vi.mock('@/lib/market/nse', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/market/nse')>()),
  fetchEquityList: vi.fn(),
  fetchIndexConstituents: vi.fn(),
  fetchFullBhavcopy: vi.fn(),
}))

beforeEach(async () => {
  freshDb()
  vi.mocked(fetchEquityList).mockResolvedValue(parseEquityList(fixture('EQUITY_L.csv')))
  const nifty50 = parseIndexList(fixture('ind_nifty50list.csv'))
  vi.mocked(fetchIndexConstituents).mockImplementation(async (index: IndexName) =>
    index === 'NIFTY 500' || index === 'NIFTY 50' ? nifty50 : []
  )
  vi.mocked(fetchFullBhavcopy).mockReset()
  await syncInstruments()
})

describe('instrument master', () => {
  it('merges ISINs from the equity list with industry from index lists', () => {
    expect(getInstrument('HDFCBANK')).toEqual({
      symbol: 'HDFCBANK', name: 'HDFC Bank Limited', isin: 'INE040A01034', series: 'EQ', industry: 'Financial Services',
    })
    expect(getInstrument('20MICRONS')?.industry).toBeNull()
    expect(getIndexMembers('NIFTY 50')).toEqual(['HDFCBANK', 'ICICIBANK', 'M&M', 'RELIANCE'])
  })

  it('finds industry peers within the Nifty 500', () => {
    expect(getIndustryPeers('HDFCBANK')).toEqual(['ICICIBANK'])
  })

  it('ranks exact symbol, then prefix, then name matches', () => {
    expect(searchInstruments('hdfc').map(r => r.symbol)).toEqual(['HDFCBANK'])
    expect(searchInstruments('bank').map(r => r.symbol)).toEqual(['HDFCBANK', 'ICICIBANK'])
    expect(searchInstruments('m&m')[0]).toMatchObject({ symbol: 'M&M', inNifty500: true })
    expect(searchInstruments('micro')[0]).toMatchObject({ symbol: '20MICRONS', inNifty500: false })
    expect(searchInstruments('100%')).toEqual([])
  })
})

describe('NSE cross-check', () => {
  const bar = (close: number) => ({ date: '2026-10-06', open: close, high: close, low: close, close, volume: 1 })

  it('compares within a 1% tolerance', () => {
    expect(compareClose(100.9, 100).status).toBe('verified')
    expect(compareClose(102, 100)).toEqual({ status: 'mismatch', diffPct: expect.closeTo(2, 6) })
  })

  it('verifies against the official file and caches it', async () => {
    vi.mocked(fetchFullBhavcopy).mockResolvedValue(parseFullBhavcopy(fixture('sec_bhavdata_full_06102026.csv')))
    const ok = await verifyLatestClose('RELIANCE', [bar(1390.65)])
    expect(ok).toMatchObject({ status: 'verified', officialClose: 1390.65 })

    const off = await verifyLatestClose('HDFCBANK', [bar(1750)])
    expect(off.status).toBe('mismatch')
    expect(fetchFullBhavcopy).toHaveBeenCalledTimes(1) // one file serves every symbol
  })

  it('reports unavailable when NSE has not published the file', async () => {
    vi.mocked(fetchFullBhavcopy).mockResolvedValue(null)
    const res = await verifyLatestClose('RELIANCE', [bar(1390.65)])
    expect(res.status).toBe('unavailable')
    await verifyLatestClose('RELIANCE', [bar(1390.65)])
    expect(fetchFullBhavcopy).toHaveBeenCalledTimes(1) // backs off instead of re-downloading
  })
})

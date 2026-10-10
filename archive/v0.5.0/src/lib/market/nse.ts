import { csvNumber, parseCsvRecords } from './csv'
import { fetchWithRetry, HttpError } from './http'
import { ddmmyyyy } from './time'
import type { IndexName, Instrument, OfficialBar } from './types'

// NSE's public archive files: no account or API key needed. NSE sits behind
// Akamai and rejects non-browser clients, so requests carry browser headers
// and, if refused, retry once with cookies from the homepage.

const ARCHIVES = 'https://nsearchives.nseindia.com'

const HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'text/csv,text/plain,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.nseindia.com/',
}

const INDEX_FILES: Record<IndexName, string> = {
  'NIFTY 50': 'ind_nifty50list.csv',
  'NIFTY 100': 'ind_nifty100list.csv',
  'NIFTY 200': 'ind_nifty200list.csv',
  'NIFTY 500': 'ind_nifty500list.csv',
}

let cookieHeader: string | null = null

async function warmCookies(): Promise<void> {
  const res = await fetch('https://www.nseindia.com/', { headers: HEADERS, signal: AbortSignal.timeout(10_000) })
  cookieHeader = res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') || null
}

/** GET an NSE URL as text. Returns null on 404 (file not published). */
async function nseGet(url: string): Promise<string | null> {
  const attempt = () =>
    fetchWithRetry(url, { headers: cookieHeader ? { ...HEADERS, Cookie: cookieHeader } : HEADERS })
  try {
    return await (await attempt()).text()
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null
    if (err instanceof HttpError && (err.status === 401 || err.status === 403)) {
      await warmCookies()
      try {
        return await (await attempt()).text()
      } catch (retryErr) {
        if (retryErr instanceof HttpError && retryErr.status === 404) return null
        throw retryErr
      }
    }
    throw err
  }
}

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
}

/** "17-Mar-2022" → "2022-03-17" */
function parseNseDate(value: string): string | null {
  const m = value.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (!m) return null
  const month = MONTHS[m[2].toUpperCase()]
  return month ? `${m[3]}-${month}-${m[1].padStart(2, '0')}` : null
}

// ---------- Parsers (pure, unit-tested against sample files) ----------

/** Nifty index constituent list: Company Name, Industry, Symbol, Series, ISIN Code. */
export function parseIndexList(text: string): Instrument[] {
  return parseCsvRecords(text)
    .filter(r => r['Symbol'])
    .map(r => ({
      symbol: r['Symbol'].toUpperCase(),
      name: r['Company Name'],
      isin: r['ISIN Code'] || null,
      series: r['Series'] || null,
      industry: r['Industry'] || null,
    }))
}

/** EQUITY_L.csv: every listed NSE equity with its ISIN. */
export function parseEquityList(text: string): Instrument[] {
  return parseCsvRecords(text)
    .filter(r => r['SYMBOL'])
    .map(r => ({
      symbol: r['SYMBOL'].toUpperCase(),
      name: r['NAME OF COMPANY'],
      isin: r['ISIN NUMBER'] || null,
      series: r['SERIES'] || null,
      industry: null,
    }))
}

/** sec_bhavdata_full_DDMMYYYY.csv: official OHLC, volume and delivery % per security. */
export function parseFullBhavcopy(text: string): OfficialBar[] {
  const out: OfficialBar[] = []
  for (const r of parseCsvRecords(text)) {
    const date = parseNseDate(r['DATE1'] ?? '')
    const close = csvNumber(r['CLOSE_PRICE'])
    if (!r['SYMBOL'] || !date || close === null) continue
    out.push({
      date,
      symbol: r['SYMBOL'].toUpperCase(),
      series: r['SERIES'],
      prevClose: csvNumber(r['PREV_CLOSE']),
      open: csvNumber(r['OPEN_PRICE']),
      high: csvNumber(r['HIGH_PRICE']),
      low: csvNumber(r['LOW_PRICE']),
      close,
      volume: csvNumber(r['TTL_TRD_QNTY']),
      deliveryPct: csvNumber(r['DELIV_PER']),
    })
  }
  return out
}

// ---------- Fetchers ----------

export async function fetchIndexConstituents(index: IndexName): Promise<Instrument[]> {
  const text = await nseGet(`${ARCHIVES}/content/indices/${INDEX_FILES[index]}`)
  if (!text) throw new Error(`NSE constituent list for ${index} not found`)
  return parseIndexList(text)
}

export async function fetchEquityList(): Promise<Instrument[]> {
  const text = await nseGet(`${ARCHIVES}/content/equities/EQUITY_L.csv`)
  if (!text) throw new Error('NSE equity list not found')
  return parseEquityList(text)
}

/** Official bhavcopy for one session, or null if NSE hasn't published one (holiday / not yet out). */
export async function fetchFullBhavcopy(date: string): Promise<OfficialBar[] | null> {
  const text = await nseGet(`${ARCHIVES}/products/content/sec_bhavdata_full_${ddmmyyyy(date)}.csv`)
  return text ? parseFullBhavcopy(text) : null
}

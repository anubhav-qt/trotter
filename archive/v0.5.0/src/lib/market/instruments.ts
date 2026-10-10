import { getDb, getSyncState, setSyncState } from '../db'
import { fetchEquityList, fetchIndexConstituents } from './nse'
import { searchYahooNse } from './yahoo'
import { BENCHMARK, INDEX_NAMES, type IndexName, type Instrument } from './types'

const SYNC_KEY = 'instruments_synced_at'
const SYNC_FAILED_KEY = 'instruments_sync_failed_at'
const SYNC_MAX_AGE_MS = 7 * 86_400_000
/** After a failed sync, keep using the existing list this long before trying NSE again. */
const SYNC_RETRY_MS = 6 * 3_600_000

/**
 * Refresh the instrument master from NSE: every listed equity (symbol, name,
 * ISIN) plus Nifty 50/100/200/500 membership and industry classification.
 */
export async function syncInstruments(): Promise<{ instruments: number; indexMembers: number }> {
  const [equities, ...indexLists] = await Promise.all([
    fetchEquityList(),
    ...INDEX_NAMES.map(index => fetchIndexConstituents(index)),
  ])
  const db = getDb()
  const now = new Date().toISOString()

  // Industry comes from the index lists; EQUITY_L doesn't carry it.
  const industry = new Map<string, string>()
  for (const list of indexLists) for (const i of list) if (i.industry) industry.set(i.symbol, i.industry)

  const upsert = db.prepare(
    `INSERT INTO instruments (symbol, name, isin, series, industry, updated_at)
     VALUES (@symbol, @name, @isin, @series, @industry, @updated_at)
     ON CONFLICT (symbol) DO UPDATE SET
       name = excluded.name, isin = COALESCE(excluded.isin, instruments.isin),
       series = excluded.series, industry = COALESCE(excluded.industry, instruments.industry),
       updated_at = excluded.updated_at`
  )
  const insertMember = db.prepare('INSERT INTO index_members (index_name, symbol, updated_at) VALUES (?, ?, ?)')

  let members = 0
  db.transaction(() => {
    const all = new Map<string, Instrument>()
    for (const i of equities) all.set(i.symbol, i)
    for (const list of indexLists) for (const i of list) if (!all.has(i.symbol)) all.set(i.symbol, i)
    for (const i of all.values()) {
      upsert.run({ ...i, industry: industry.get(i.symbol) ?? null, updated_at: now })
    }
    INDEX_NAMES.forEach((index, n) => {
      db.prepare('DELETE FROM index_members WHERE index_name = ?').run(index)
      for (const i of indexLists[n]) { insertMember.run(index, i.symbol, now); members++ }
    })
  })()

  setSyncState(SYNC_KEY, now)
  return { instruments: equities.length, indexMembers: members }
}

/** Sync if the list is missing or older than a week. Never throws if a usable list exists. */
export async function ensureInstruments(): Promise<void> {
  const state = getSyncState(SYNC_KEY)
  if (state && Date.now() - Date.parse(state.updatedAt) < SYNC_MAX_AGE_MS) return
  const count = () => (getDb().prepare('SELECT COUNT(*) AS n FROM instruments').get() as { n: number }).n
  const failed = getSyncState(SYNC_FAILED_KEY)
  if (failed && Date.now() - Date.parse(failed.updatedAt) < SYNC_RETRY_MS && count() > 0) return
  try {
    await syncInstruments()
  } catch (err) {
    setSyncState(SYNC_FAILED_KEY, (err as Error).message)
    if (count() === 0) throw new Error(`Could not load the NSE instrument list: ${(err as Error).message}`)
    console.warn(`Instrument sync failed; using the existing list: ${(err as Error).message}`)
  }
}

interface InstrumentRow {
  symbol: string
  name: string
  isin: string | null
  series: string | null
  industry: string | null
}

export function getInstrument(symbol: string): Instrument | null {
  if (symbol === BENCHMARK) return { symbol, name: 'Nifty 50', isin: null, series: null, industry: null }
  const row = getDb()
    .prepare('SELECT symbol, name, isin, series, industry FROM instruments WHERE symbol = ?')
    .get(symbol) as InstrumentRow | undefined
  return row ?? null
}

export function getIndexMembers(index: IndexName): string[] {
  const rows = getDb()
    .prepare('SELECT symbol FROM index_members WHERE index_name = ? ORDER BY symbol')
    .all(index) as Array<{ symbol: string }>
  return rows.map(r => r.symbol)
}

/** Nifty 500 members in the same industry (excluding the stock itself). */
export function getIndustryPeers(symbol: string): string[] {
  const rows = getDb()
    .prepare(
      `SELECT i.symbol FROM instruments i
       JOIN index_members m ON m.symbol = i.symbol AND m.index_name = 'NIFTY 500'
       WHERE i.industry = (SELECT industry FROM instruments WHERE symbol = ?) AND i.symbol != ?`
    )
    .all(symbol, symbol) as Array<{ symbol: string }>
  return rows.map(r => r.symbol)
}

export interface SearchResult {
  symbol: string
  name: string
  industry: string | null
  inNifty500: boolean
}

/** Rank: exact symbol, symbol prefix, name prefix, name contains; Nifty 500 first within each. */
export function searchInstruments(query: string, limit = 10): SearchResult[] {
  const q = query.trim().toUpperCase()
  if (!q) return []
  const escaped = q.replace(/[\\%_]/g, c => `\\${c}`)
  const rows = getDb()
    .prepare(
      `SELECT i.symbol, i.name, i.industry,
              EXISTS (SELECT 1 FROM index_members m WHERE m.symbol = i.symbol AND m.index_name = 'NIFTY 500') AS in500,
              CASE
                WHEN i.symbol = @q THEN 0
                WHEN i.symbol LIKE @prefix ESCAPE '\\' THEN 1
                WHEN UPPER(i.name) LIKE @prefix ESCAPE '\\' THEN 2
                ELSE 3
              END AS rank
       FROM instruments i
       WHERE i.symbol LIKE @contains ESCAPE '\\' OR UPPER(i.name) LIKE @contains ESCAPE '\\'
       ORDER BY rank, in500 DESC, i.symbol
       LIMIT @limit`
    )
    .all({ q, prefix: `${escaped}%`, contains: `%${escaped}%`, limit }) as Array<{
      symbol: string
      name: string
      industry: string | null
      in500: number
    }>
  return rows.map(r => ({ symbol: r.symbol, name: r.name, industry: r.industry, inNifty500: r.in500 === 1 }))
}

/**
 * Search the local NSE list, falling back to Yahoo if NSE was unreachable.
 * Yahoo hits are saved (without ISIN) so research can still resolve them.
 */
export async function searchWithFallback(query: string, limit = 10): Promise<SearchResult[]> {
  try {
    await ensureInstruments()
    return searchInstruments(query, limit)
  } catch (err) {
    console.warn('Local instrument search unavailable, falling back to Yahoo:', err)
    const hits = await searchYahooNse(query)
    const db = getDb()
    const insert = db.prepare(
      `INSERT OR IGNORE INTO instruments (symbol, name, isin, series, industry, updated_at)
       VALUES (?, ?, NULL, NULL, NULL, ?)`
    )
    const now = new Date().toISOString()
    for (const h of hits) insert.run(h.symbol, h.name, now)
    return hits.slice(0, limit).map(h => ({ symbol: h.symbol, name: h.name, industry: null, inNifty500: false }))
  }
}

import { setSyncState } from '@/lib/db'
import { ensureInstruments, getIndexMembers } from '@/lib/market/instruments'
import type { IndexName } from '@/lib/market/types'
import { runResearch } from '@/lib/research'
import { gradePending } from '@/lib/track-record'
import { log } from './cli'

/** Score the universe (no LLM — saves tokens; scores don't depend on it), then grade due calls. */
export async function runSnapshot(universe: IndexName, opts: { news: boolean }): Promise<void> {
  await ensureInstruments()
  const symbols = getIndexMembers(universe)
  log(`Snapshot of ${symbols.length} ${universe} stocks${opts.news ? '' : ' (without news)'}...`)
  let ok = 0
  for (const symbol of symbols) {
    try {
      const r = await runResearch(symbol, { origin: 'snapshot', narrative: false, news: opts.news })
      ok++
      log(`  ${symbol.padEnd(12)} ${r.asOf}  W ${r.analyses.weekly.score}  M ${r.analyses.monthly.score}  L ${r.analyses.longterm.score}  ${r.data.verification.status}`)
    } catch (err) {
      log(`  ${symbol}: failed — ${(err as Error).message}`)
    }
  }
  setSyncState('snapshot_completed_at', `${universe}: ${ok}/${symbols.length}`)

  const { graded, pending, errors } = await gradePending()
  for (const e of errors) log(`  ${e}`)
  log(`Recorded ${ok}/${symbols.length}. Graded ${graded} past calls; ${pending} pending.`)
}

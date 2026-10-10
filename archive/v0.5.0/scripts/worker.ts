// Long-running scheduler for the worker container: after every NSE session it
// snapshots the universe, grades due calls and backs up the database; weekly
// it refreshes the instrument list. Usage: npm run worker [-- --now]
import { syncInstruments } from '@/lib/market/instruments'
import { istDate, isWeekday } from '@/lib/market/time'
import { log, parseUniverse } from './cli'
import { runBackup, runSnapshot } from './jobs'

// 19:00 IST: well after the 15:30 close, once NSE has published its official files.
const RUN_AT_IST_MINUTES = 19 * 60
const IST_OFFSET_MS = 330 * 60_000

function nextRun(now: Date): Date {
  const istMidnight = Date.parse(`${istDate(now)}T00:00:00Z`) - IST_OFFSET_MS
  let at = istMidnight + RUN_AT_IST_MINUTES * 60_000
  while (at <= now.getTime() || !isWeekday(istDate(new Date(at)))) at += 86_400_000
  return new Date(at)
}

async function tick(): Promise<void> {
  const universe = parseUniverse(process.env.TROTTER_UNIVERSE)
  try {
    // Mondays: refresh symbols, ISINs and index membership first.
    if (new Date(`${istDate()}T00:00:00Z`).getUTCDay() === 1) await syncInstruments()
    await runSnapshot(universe, { news: process.env.TROTTER_SNAPSHOT_NEWS !== 'false' })
    await runBackup()
  } catch (err) {
    log(`Run failed: ${(err as Error).message}`)
  }
}

function schedule(): void {
  const at = nextRun(new Date())
  log(`Next run at ${at.toISOString()} (19:00 IST)`)
  setTimeout(() => void tick().finally(schedule), at.getTime() - Date.now())
}

log('Trotter worker started.')
if (process.argv.includes('--now')) void tick().finally(schedule)
else schedule()

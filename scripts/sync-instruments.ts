// Refresh the NSE instrument master and Nifty index membership.
// Usage: npm run sync
import { syncInstruments } from '@/lib/market/instruments'
import { log, run } from './cli'

run(async () => {
  const { instruments, indexMembers } = await syncInstruments()
  log(`Synced ${instruments} NSE equities and ${indexMembers} index memberships.`)
})

// Grade every recorded call whose horizon has elapsed.
// Usage: npm run grade
import { gradePending } from '@/lib/track-record'
import { log, run } from './cli'

run(async () => {
  const { graded, pending, errors } = await gradePending()
  for (const e of errors) log(`  ${e}`)
  log(`Graded ${graded} calls; ${pending} still waiting for their horizon.`)
})

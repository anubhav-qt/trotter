// Score every stock in the universe on the latest close and record the calls,
// so the track record covers a fixed universe, not just what someone searched.
// Usage: npm run snapshot -- [--universe "NIFTY 50"] [--no-news]
import { parseArgs } from 'node:util'
import { runSnapshot } from './jobs'
import { parseUniverse, run } from './cli'

run(async () => {
  const { values } = parseArgs({ options: { universe: { type: 'string' }, 'no-news': { type: 'boolean' } } })
  await runSnapshot(parseUniverse(values.universe ?? process.env.TROTTER_UNIVERSE), { news: !values['no-news'] })
})

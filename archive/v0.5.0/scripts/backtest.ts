// Walk-forward backtest of the scoring model on an NSE index.
// Usage: npm run backtest -- --universe "NIFTY 100"
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { formatBacktestMarkdown, runBacktest } from '@/lib/backtest'
import { dbPath, getDb } from '@/lib/db'
import { getDailyHistory } from '@/lib/market/history'
import { ensureInstruments, getIndexMembers } from '@/lib/market/instruments'
import { istDate } from '@/lib/market/time'
import type { DailyBar } from '@/lib/market/types'
import { MODEL_VERSION } from '@/lib/scoring'
import { log, parseUniverse, run } from './cli'

run(async () => {
  const { values } = parseArgs({ options: { universe: { type: 'string' } } })
  const universe = parseUniverse(values.universe)

  await ensureInstruments()
  const symbols = getIndexMembers(universe)
  if (symbols.length === 0) throw new Error(`No members on file for ${universe}; run npm run sync first.`)

  log(`Loading history for ${symbols.length} ${universe} stocks (cached after the first run)...`)
  const series = new Map<string, DailyBar[]>()
  for (const [n, symbol] of symbols.entries()) {
    try {
      const h = await getDailyHistory(symbol)
      series.set(symbol, h.bars)
      for (const w of h.warnings) log(`  ${symbol}: ${w}`)
    } catch (err) {
      log(`  ${symbol}: skipped — ${(err as Error).message}`)
    }
    if ((n + 1) % 10 === 0) log(`  ${n + 1}/${symbols.length}`)
  }

  log(`Backtesting ${series.size} stocks...`)
  const report = runBacktest(series, { universe })
  const markdown = formatBacktestMarkdown(report)

  getDb()
    .prepare('INSERT INTO backtest_runs (created_at, model_version, universe, report) VALUES (?, ?, ?, ?)')
    .run(new Date().toISOString(), MODEL_VERSION, universe, JSON.stringify(report))
  const dir = path.join(path.dirname(dbPath()), 'reports')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `backtest-${istDate()}-${universe.replace(/\s+/g, '').toLowerCase()}-${MODEL_VERSION}.md`)
  fs.writeFileSync(file, markdown)

  console.log(`\n${markdown}`)
  log(`Report saved to ${file}`)
})

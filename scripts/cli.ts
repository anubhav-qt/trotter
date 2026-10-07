import { INDEX_NAMES, type IndexName } from '@/lib/market/types'

/** Accepts "NIFTY 50", "nifty50", "50", etc. */
export function parseUniverse(input: string | undefined, fallback: IndexName = 'NIFTY 50'): IndexName {
  if (!input) return fallback
  const digits = input.replace(/\D/g, '')
  const match = INDEX_NAMES.find(name => name.endsWith(` ${digits}`))
  if (!match) throw new Error(`Unknown universe "${input}". Use one of: ${INDEX_NAMES.join(', ')}`)
  return match
}

export const log = (msg: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`)

/** Run an async main, exiting non-zero on failure so cron/compose notice. */
export function run(main: () => Promise<void>): void {
  main().then(
    () => process.exit(0),
    err => {
      console.error(err)
      process.exit(1)
    }
  )
}

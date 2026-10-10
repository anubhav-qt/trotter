// Write a consistent copy of the database to data/backups (keeps the last 7).
// Usage: npm run backup
import { run } from './cli'
import { runBackup } from './jobs'

run(async () => {
  await runBackup()
})

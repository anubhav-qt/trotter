import { getDb, getSyncState } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Liveness for the container healthcheck, plus a glance at data freshness. */
export async function GET() {
  try {
    const db = getDb()
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n
    return Response.json({
      ok: true,
      instruments: count('SELECT COUNT(*) AS n FROM instruments'),
      instrumentsSyncedAt: getSyncState('instruments_synced_at')?.updatedAt ?? null,
      lastSnapshotAt: getSyncState('snapshot_completed_at')?.updatedAt ?? null,
      predictions: count('SELECT COUNT(*) AS n FROM predictions'),
      gradedPredictions: count('SELECT COUNT(*) AS n FROM predictions WHERE evaluated_at IS NOT NULL'),
    })
  } catch (error) {
    return Response.json({ ok: false, error: (error as Error).message }, { status: 503 })
  }
}

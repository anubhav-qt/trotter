import { addDays } from './time'
import type { DailyBar } from './types'

/** Monday of the week containing `date` (YYYY-MM-DD). */
function weekStart(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay() // 0 = Sunday
  return addDays(date, -((dow + 6) % 7))
}

/** Aggregate daily bars into weekly or monthly candles, dated by their first session. */
export function resample(bars: DailyBar[], period: 'week' | 'month'): DailyBar[] {
  const out: DailyBar[] = []
  let key: string | null = null
  for (const b of bars) {
    const k = period === 'week' ? weekStart(b.date) : b.date.slice(0, 7)
    const cur = out[out.length - 1]
    if (k !== key || !cur) {
      out.push({ ...b })
      key = k
    } else {
      cur.high = Math.max(cur.high, b.high)
      cur.low = Math.min(cur.low, b.low)
      cur.close = b.close
      cur.volume += b.volume
    }
  }
  return out
}

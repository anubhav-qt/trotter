// NSE calendar helpers. All session logic runs on India Standard Time
// (UTC+5:30, no DST) regardless of the server's own timezone.

const IST_OFFSET_MS = 330 * 60_000
const DAY_MS = 86_400_000

/** NSE cash market closes at 15:30 IST; treat daily bars as final from 16:00. */
export const SESSION_FINAL_MINUTES = 16 * 60

/** IST calendar date (YYYY-MM-DD) of an instant. */
export function istDate(at: Date = new Date()): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** Minutes since IST midnight. */
export function istMinutes(at: Date = new Date()): number {
  const ms = (at.getTime() + IST_OFFSET_MS) % DAY_MS
  return Math.floor(ms / 60_000)
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

export function isWeekday(date: string): boolean {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay()
  return dow !== 0 && dow !== 6
}

/** Whether a session dated `date` has finished trading as of `now`. */
export function isSessionComplete(date: string, now: Date = new Date()): boolean {
  const today = istDate(now)
  return date < today || (date === today && istMinutes(now) >= SESSION_FINAL_MINUTES)
}

/**
 * The most recent weekday whose session is complete. Exchange holidays are not
 * modelled, so on a holiday this names a session that never happened — callers
 * treat it as "the newest bar we could possibly expect", not a guarantee.
 */
export function expectedLastSession(now: Date = new Date()): string {
  let d = istDate(now)
  if (!isSessionComplete(d, now)) d = addDays(d, -1)
  while (!isWeekday(d)) d = addDays(d, -1)
  return d
}

/** The instant (UTC) at which the session on `date` becomes final. */
export function sessionFinalAt(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) - IST_OFFSET_MS + SESSION_FINAL_MINUTES * 60_000)
}

/** DDMMYYYY, as used in NSE archive file names. */
export function ddmmyyyy(date: string): string {
  const [y, m, d] = date.split('-')
  return `${d}${m}${y}`
}

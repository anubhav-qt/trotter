import { describe, expect, it } from 'vitest'
import { ddmmyyyy, expectedLastSession, istDate, isSessionComplete, sessionFinalAt } from '@/lib/market/time'

describe('IST session calendar', () => {
  it('uses the IST calendar date, not UTC', () => {
    expect(istDate(new Date('2026-10-06T19:00:00Z'))).toBe('2026-10-07') // 00:30 IST
  })

  it('treats today as complete only after 16:00 IST', () => {
    expect(isSessionComplete('2026-10-07', new Date('2026-10-07T10:00:00Z'))).toBe(false) // 15:30 IST
    expect(isSessionComplete('2026-10-07', new Date('2026-10-07T10:30:00Z'))).toBe(true) // 16:00 IST
    expect(isSessionComplete('2026-10-06', new Date('2026-10-07T04:00:00Z'))).toBe(true)
  })

  it('expects the previous weekday before the close and skips weekends', () => {
    expect(expectedLastSession(new Date('2026-10-07T05:00:00Z'))).toBe('2026-10-06') // Wed morning → Tue
    expect(expectedLastSession(new Date('2026-10-07T12:00:00Z'))).toBe('2026-10-07') // Wed evening
    expect(expectedLastSession(new Date('2026-10-12T05:00:00Z'))).toBe('2026-10-09') // Mon morning → Fri
    expect(expectedLastSession(new Date('2026-10-10T12:00:00Z'))).toBe('2026-10-09') // Saturday
  })

  it('converts the 16:00 IST cut-off to UTC', () => {
    expect(sessionFinalAt('2026-10-07').toISOString()).toBe('2026-10-07T10:30:00.000Z')
  })

  it('formats NSE archive dates', () => {
    expect(ddmmyyyy('2026-03-05')).toBe('05032026')
  })
})

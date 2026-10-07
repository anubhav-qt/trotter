import { describe, expect, it } from 'vitest'
import { parseUniverse } from '../scripts/cli'

describe('parseUniverse', () => {
  it('accepts loose spellings of Nifty indices', () => {
    expect(parseUniverse(undefined)).toBe('NIFTY 50')
    expect(parseUniverse('nifty100')).toBe('NIFTY 100')
    expect(parseUniverse('NIFTY 500')).toBe('NIFTY 500')
    expect(parseUniverse('200')).toBe('NIFTY 200')
    expect(() => parseUniverse('NIFTY 75')).toThrow(/Unknown universe/)
  })
})

// NSE symbols: letters, digits, '&' and '-' (e.g. M&M, BAJAJ-AUTO).
const NSE_SYMBOL_RE = /^[A-Z0-9&-]{1,20}$/

/** Normalize user input to an NSE symbol: trims, uppercases, drops a Yahoo-style ".NS" suffix. */
export function normalizeSymbol(input: string | null | undefined): string | null {
  const s = input?.trim().toUpperCase().replace(/\.NS$/, '')
  return s && NSE_SYMBOL_RE.test(s) ? s : null
}

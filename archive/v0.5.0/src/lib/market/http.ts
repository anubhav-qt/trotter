// Outbound HTTP with timeouts and retries. Every market data call goes through
// here so a slow or flaky provider fails fast and predictably.

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly url: string) {
    super(`HTTP ${status} from ${new URL(url).host}`)
    this.name = 'HttpError'
  }
}

export interface FetchOptions {
  headers?: Record<string, string>
  timeoutMs?: number
  /** Extra attempts after the first, for network errors, 429 and 5xx. */
  retries?: number
  backoffMs?: number
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const { headers, timeoutMs = 15_000, retries = 2, backoffMs = 750 } = opts
  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(backoffMs * 2 ** (attempt - 1))
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
      if (res.ok) return res
      if (!isRetryable(res.status) || attempt === retries) throw new HttpError(res.status, url)
      // Honour a short Retry-After; never sleep longer than 10s inside a request.
      const retryAfter = Number(res.headers.get('retry-after'))
      if (Number.isFinite(retryAfter) && retryAfter > 0) await sleep(Math.min(retryAfter, 10) * 1000)
      lastError = new HttpError(res.status, url)
    } catch (err) {
      if (err instanceof HttpError) throw err
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Request to ${url} failed`)
}

export async function fetchText(url: string, opts?: FetchOptions): Promise<string> {
  return (await fetchWithRetry(url, opts)).text()
}

export async function fetchJson<T>(url: string, opts?: FetchOptions): Promise<T> {
  return (await fetchWithRetry(url, opts)).json() as Promise<T>
}

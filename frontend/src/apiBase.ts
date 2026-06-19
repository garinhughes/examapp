/**
 * Backend API base URL.
 *
 * ▸ **Local dev** - leave VITE_API_URL unset.  The Vite dev-server proxy
 *   forwards /exams, /attempts, /username, /auth, etc. to localhost:3000.
 *
 * ▸ **Production / staging** - set VITE_API_URL to the backend origin,
 *   e.g.  VITE_API_URL=https://api.certshack.com
 */
export const API_BASE: string =
  (import.meta as any).env?.VITE_API_URL ?? ''

/**
 * Prefix a relative path with the API base when it is set.
 *
 *   apiUrl('/exams')          →  '/exams'                           (dev, proxy)
 *   apiUrl('/exams')          →  'https://api.certshack.com/exams'  (prod)
 */
export function apiUrl(path: string): string {
  if (API_BASE && path.startsWith('/')) return `${API_BASE}${path}`
  return path
}

/**
 * fetch() with bounded retry-with-backoff for transient failures.
 *
 * Retries on network errors and on transient HTTP statuses (403/429/5xx). The
 * 403 case specifically covers the CloudFront origin-verify guard: when the API
 * is reached without a valid X-Origin-Verify header (propagation gap after a
 * deploy, or a momentary edge hiccup), a retry a moment later succeeds rather
 * than surfacing a hard error to the user.
 *
 * Resolves with the final Response (caller still checks `.ok`). Only throws if
 * every attempt threw a network-level error.
 */
const RETRYABLE_STATUSES = new Set([403, 429, 500, 502, 503, 504])

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts: { retries?: number; baseDelayMs?: number } = {},
): Promise<Response> {
  const retries = opts.retries ?? 2
  const baseDelay = opts.baseDelayMs ?? 400
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, init)
      if (res.ok || !RETRYABLE_STATUSES.has(res.status) || attempt === retries) {
        return res
      }
    } catch (err) {
      lastErr = err
      if (attempt === retries) throw err
    }
    // Exponential backoff with a little jitter: ~400ms, ~800ms, …
    const delay = baseDelay * 2 ** attempt + Math.floor(Math.random() * 150)
    await new Promise((r) => setTimeout(r, delay))
  }
  // Unreachable: the loop returns or throws. Satisfy the type checker.
  throw lastErr ?? new Error('fetchWithRetry: exhausted retries')
}

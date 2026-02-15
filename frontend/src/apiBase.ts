/**
 * Backend API base URL.
 *
 * ▸ **Local dev** — leave VITE_API_URL unset.  The Vite dev-server proxy
 *   forwards /exams, /attempts, /username, /auth, etc. to localhost:3000.
 *
 * ▸ **Production / staging** — set VITE_API_URL to the backend origin,
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

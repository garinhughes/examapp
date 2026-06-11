import { apiUrl } from '../apiBase'

export type TrackEventType =
  | 'page_view'
  | 'exam_start'
  | 'lab_start'
  | 'exam_abandon'
  | 'signup_start'
  | 'pricing_view'
  | 'upgrade_click'

export interface TrackPayload {
  examCode?: string
  labId?: string
  labType?: string
  mode?: string
  surface?: 'exams' | 'labs' | 'pricing'
  referrerHost?: string
  isNew?: boolean
  lastQuestionIndex?: number
  totalQuestions?: number
  cta?: string
}

const VISITED_KEY = 'cs_visited'

function getReferrerHost(): string | undefined {
  try {
    if (!document.referrer) return undefined
    const u = new URL(document.referrer)
    if (u.host === location.host) return undefined
    return u.host.replace(/^www\./, '').toLowerCase()
  } catch {
    return undefined
  }
}

function consumeNewVisitor(): { isNew: boolean; referrerHost?: string } {
  try {
    if (localStorage.getItem(VISITED_KEY)) return { isNew: false }
    localStorage.setItem(VISITED_KEY, String(Date.now()))
    return { isNew: true, referrerHost: getReferrerHost() }
  } catch {
    return { isNew: false }
  }
}

function getIdToken(): string | null {
  try {
    return localStorage.getItem('examapp_impersonation_token') ?? localStorage.getItem('examapp_id_token')
  } catch {
    return null
  }
}

function send(type: TrackEventType, payload: TrackPayload, useBeacon: boolean): void {
  const body = JSON.stringify({ type, payload })
  const url = apiUrl('/events/track')
  const token = getIdToken()
  try {
    // sendBeacon can't set custom headers, so when we need to forward the JWT
    // (to let the backend skip admin events) we fall back to keepalive fetch.
    if (useBeacon && !token && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }))
      return
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    fetch(url, {
      method: 'POST',
      headers,
      body,
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* silently ignore — metrics best-effort */
  }
}

export function trackEvent(type: TrackEventType, payload: TrackPayload = {}, opts: { beacon?: boolean } = {}): void {
  send(type, payload, opts.beacon === true)
}

/**
 * Fire a page_view at most once per session for a given surface.
 * Adds first-visit + referrerHost on the very first hit.
 */
export function trackPageView(surface: 'exams' | 'labs' | 'pricing'): void {
  const key = `cs_pv_${surface}`
  try {
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, '1')
  } catch { /* sessionStorage may be unavailable */ }
  const visitor = consumeNewVisitor()
  trackEvent('page_view', { surface, ...visitor })
}

declare global {
  interface Window {
    clarity: (...args: unknown[]) => void
  }
}

/** Call after cookie consent is granted to begin session recording. */
export function initClarity(): void {
  if (typeof window.clarity === 'function') {
    window.clarity('consent')
  }
}

/**
 * Set a custom tag on the current session.
 * Tags appear in the Clarity dashboard and can be used to filter sessions.
 */
export function clarityTag(key: string, value: string): void {
  if (typeof window.clarity !== 'function') return
  window.clarity('set', key, value)
}

/**
 * Identify the logged-in user so sessions can be tied to a specific user
 * across visits. userId should be a stable, non-PII identifier (e.g. Cognito sub).
 */
export function clarityIdentify(userId: string): void {
  if (typeof window.clarity !== 'function') return
  window.clarity('identify', userId)
}

/**
 * Fire a named custom event. Appears in Clarity under "Custom events"
 * and can be used to build conversion funnels.
 */
export function clarityEvent(name: string): void {
  if (typeof window.clarity !== 'function') return
  window.clarity('event', name)
}

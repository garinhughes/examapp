declare global {
  interface Window {
    dataLayer: unknown[]
    gtag: (...args: unknown[]) => void
  }
}

const GA_ID = 'G-V7NP7F67TN'

export function isConsentGiven(): boolean {
  return localStorage.getItem('cookie_consent') === 'accepted'
}

export function trackPageView(path: string, title?: string): void {
  if (!isConsentGiven()) return
  if (typeof window.gtag !== 'function') return
  window.gtag('config', GA_ID, {
    page_path: path,
    page_title: title,
  })
}

export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (!isConsentGiven()) return
  if (typeof window.gtag !== 'function') return
  window.gtag('event', name, params)
}

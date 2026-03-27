import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { trackPageView, isConsentGiven } from '@/analytics'
import { clarityTag, initClarity } from '@/clarity'

/**
 * Fires a GA4 page view on every pathname change (only when consent given).
 * Also listens for the custom 'cookieConsent' event to fire the first page
 * view immediately when the user accepts cookies.
 */
export function usePageTracking(): void {
  const location = useLocation()

  useEffect(() => {
    trackPageView(location.pathname, document.title)
    clarityTag('page', location.pathname)
  }, [location.pathname])

  useEffect(() => {
    // Fire page view + init Clarity when user grants consent mid-session
    if (isConsentGiven()) {
      initClarity()
      clarityTag('page', location.pathname)
    }
    function onConsent() {
      if (isConsentGiven()) {
        trackPageView(location.pathname, document.title)
        clarityTag('page', location.pathname)
      }
    }
    window.addEventListener('cookieConsent', onConsent)
    return () => window.removeEventListener('cookieConsent', onConsent)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

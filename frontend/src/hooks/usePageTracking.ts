import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { trackPageView, isConsentGiven } from '@/analytics'

/**
 * Fires a GA4 page view on every pathname change (only when consent given).
 * Also listens for the custom 'cookieConsent' event to fire the first page
 * view immediately when the user accepts cookies.
 */
export function usePageTracking(): void {
  const location = useLocation()

  useEffect(() => {
    trackPageView(location.pathname, document.title)
  }, [location.pathname])

  useEffect(() => {
    function onConsent() {
      if (isConsentGiven()) {
        trackPageView(location.pathname, document.title)
      }
    }
    window.addEventListener('cookieConsent', onConsent)
    return () => window.removeEventListener('cookieConsent', onConsent)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

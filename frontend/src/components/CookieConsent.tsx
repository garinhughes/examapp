import { useState } from 'react'

type ConsentState = 'accepted' | 'declined' | null

function getStored(): ConsentState {
  const v = localStorage.getItem('cookie_consent')
  if (v === 'accepted' || v === 'declined') return v
  return null
}

export function CookieConsent() {
  const [consent, setConsent] = useState<ConsentState>(getStored)

  if (consent !== null) return null

  function handleAccept() {
    localStorage.setItem('cookie_consent', 'accepted')
    setConsent('accepted')
    window.dispatchEvent(new Event('cookieConsent'))
  }

  function handleDecline() {
    localStorage.setItem('cookie_consent', 'declined')
    setConsent('declined')
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-white px-4 py-3 shadow-lg">
      <div className="container mx-auto max-w-6xl flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <p className="flex-1 text-sm text-muted-foreground">
          We use cookies to improve your experience and for analytics.{' '}
          <a href="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">
            Privacy Policy
          </a>
          .
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleDecline}
            className="px-3 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground border border-border hover:bg-muted transition-colors"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="px-3 py-1.5 rounded-md text-sm bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}

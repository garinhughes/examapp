import * as Sentry from '@sentry/react'
import React from 'react'
import { createRoot } from 'react-dom/client'

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    // Capture 100% of errors, 0% of performance traces (free tier)
    tracesSampleRate: 0,
    sendDefaultPii: false,
    ignoreErrors: [
      // Browser noise unrelated to app code
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Non-Error promise rejection captured',
      // Network aborts / cancelled navigations
      'AbortError',
      'The user aborted a request',
      'Failed to fetch',
      'NetworkError when attempting to fetch resource',
      'Load failed',
    ],
    beforeSend(event, hint) {
      // Drop silent token-refresh 401s (the auth flow handles them)
      if (event.tags?.['auth.refresh'] === 'silent') return null
      const err: any = hint?.originalException
      if (err) {
        if (err.name === 'AbortError') return null
        // Cancelled-navigation / route-change fetches
        if (typeof err.message === 'string' && /aborted|cancell?ed/i.test(err.message)) {
          return null
        }
      }
      return event
    },
  })
}
import { HelmetProvider } from 'react-helmet-async'
import { AuthProvider } from './auth/AuthContext'
import { GamificationProvider } from './gamification/GamificationContext'
import { BasketProvider } from './basket/BasketContext'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

function AppCrashFallback() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
      <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Something went wrong</h1>
      <p style={{ marginBottom: '1rem', color: '#666' }}>
        The app hit an unexpected error. We&apos;ve been notified.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
      >
        Reload
      </button>
    </div>
  )
}

const el = document.getElementById('root')!
createRoot(el).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<AppCrashFallback />} showDialog={false}>
      <HelmetProvider>
        <BrowserRouter>
          <AuthProvider>
            <GamificationProvider>
              <BasketProvider>
                <App />
              </BasketProvider>
            </GamificationProvider>
          </AuthProvider>
        </BrowserRouter>
      </HelmetProvider>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
)

import { useAuth } from './AuthContext'
import { useCallback, useRef } from 'react'
import { apiUrl } from '../apiBase'

/**
 * Returns a fetch wrapper that automatically injects the Authorization header.
 * Handles expired tokens by:
 *   1. Checking token expiry before each request and refreshing proactively
 *   2. Intercepting 401 responses and retrying once after a token refresh
 *
 * Usage:
 *   const authFetch = useAuthFetch()
 *   const res = await authFetch('/attempts', { method: 'POST', body: ... })
 */
export function useAuthFetch() {
  const { getToken, refreshToken, logout } = useAuth()
  const isRefreshing = useRef(false)

  return useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      let token = getToken()

      // Pre-flight: if the token looks expired, try refreshing before the request
      if (token && isTokenExpiredQuick(token)) {
        if (!isRefreshing.current) {
          isRefreshing.current = true
          const newToken = await refreshToken()
          isRefreshing.current = false
          if (newToken) {
            token = newToken
          } else {
            // Refresh failed — token is dead, force re-login
            logout()
            return new Response(JSON.stringify({ message: 'Session expired' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            })
          }
        }
      }

      const headers = new Headers(init?.headers)
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }

      // Prefix relative paths with the API base when set (production)
      const url = typeof input === 'string' ? apiUrl(input) : input
      const response = await fetch(url, { ...init, headers })

      // If we get a 401, attempt one refresh + retry
      if (response.status === 401 && token && !isRefreshing.current) {
        isRefreshing.current = true
        const newToken = await refreshToken()
        isRefreshing.current = false

        if (newToken) {
          const retryHeaders = new Headers(init?.headers)
          retryHeaders.set('Authorization', `Bearer ${newToken}`)
          return fetch(url, { ...init, headers: retryHeaders })
        }

        // Refresh failed — force re-login
        logout()
      }

      return response
    },
    [getToken, refreshToken, logout],
  )
}

/** Quick client-side check — does the JWT exp claim say it's expired? */
function isTokenExpiredQuick(token: string): boolean {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(base64))
    if (!payload?.exp) return true
    // Consider expired if within 30 seconds of expiry
    return payload.exp - Math.floor(Date.now() / 1000) <= 30
  } catch {
    return true
  }
}

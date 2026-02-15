import { useAuth } from './AuthContext'
import { useCallback } from 'react'
import { apiUrl } from '../apiBase'

/**
 * Returns a fetch wrapper that automatically injects the Authorization header.
 *
 * Usage:
 *   const authFetch = useAuthFetch()
 *   const res = await authFetch('/attempts', { method: 'POST', body: ... })
 */
export function useAuthFetch() {
  const { getToken } = useAuth()

  return useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const token = getToken()
      const headers = new Headers(init?.headers)
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }

      // Prefix relative paths with the API base when set (production)
      const url = typeof input === 'string' ? apiUrl(input) : input

      return fetch(url, { ...init, headers })
    },
    [getToken],
  )
}

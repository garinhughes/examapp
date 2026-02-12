import { useAuth } from './AuthContext'
import { useCallback } from 'react'

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
      return fetch(input, { ...init, headers })
    },
    [getToken],
  )
}

import { useCallback } from 'react'
import { useAuth } from './AuthContext'

function parseJwtPayload(token: string | null) {
  if (!token) return null
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}

export function useIsAdmin() {
  const { getToken } = useAuth()
  return useCallback(() => {
    const token = getToken()
    const p = parseJwtPayload(token)
    if (!p) return false
    const groups = p['cognito:groups'] || p.groups || []
    return Array.isArray(groups) && groups.includes('admins')
  }, [getToken])
}

export default useIsAdmin

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { apiUrl } from '../apiBase'
import { clarityIdentify, clarityTag } from '../clarity'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export interface AuthUser {
  sub: string
  email: string
  name: string
  picture?: string
}

export type AuthProvider = 'Google' | 'Facebook' | 'Apple'

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: () => void
  loginWithProvider: (provider: AuthProvider) => void
  loginWithEmail: (email: string, password: string) => Promise<void>
  registerWithEmail: (email: string, password: string, firstName?: string, lastName?: string) => Promise<void>
  confirmEmail: (email: string, code: string) => Promise<void>
  resendConfirmation: (email: string) => Promise<void>
  forgotPassword: (email: string) => Promise<void>
  resetPassword: (email: string, code: string, newPassword: string) => Promise<void>
  logout: () => void
  getToken: () => string | null
  /** Attempt to refresh the token. Returns the new token or null on failure. */
  refreshToken: () => Promise<string | null>
  /** Immediately update the user's display name in React state (for post-save UI). */
  updateUserName: (name: string) => void
  /** Non-null while an admin is impersonating another user. */
  impersonating: AuthUser | null
  /** Start an impersonation session using a backend-issued token. */
  startImpersonation: (token: string, targetUser: AuthUser) => void
  /** End the impersonation session and restore the admin's own identity. */
  stopImpersonation: () => void
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: () => {},
  loginWithProvider: () => {},
  loginWithEmail: async () => {},
  registerWithEmail: async () => {},
  confirmEmail: async () => {},
  resendConfirmation: async () => {},
  forgotPassword: async () => {},
  resetPassword: async () => {},
  logout: () => {},
  getToken: () => null,
  refreshToken: async () => null,
  updateUserName: () => {},
  impersonating: null,
  startImpersonation: () => {},
  stopImpersonation: () => {},
})

export const useAuth = () => useContext(AuthContext)

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const TOKEN_KEY = 'examapp_id_token'
const REFRESH_TOKEN_KEY = 'examapp_refresh_token'
const IMPERSONATION_TOKEN_KEY = 'examapp_impersonation_token'
const MODE = import.meta.env.VITE_AUTH_MODE || 'dev'

/** Seconds before expiry at which we proactively refresh (5 minutes) */
const REFRESH_BUFFER_SECS = 300

/** Generate a random string for PKCE code_verifier */
function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** SHA-256 hash → base64url for PKCE code_challenge */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function parseJwtPayload(token: string): any {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}

/** Returns true if the JWT's exp claim is within `bufferSecs` of now or already past */
function isTokenExpired(token: string, bufferSecs = 0): boolean {
  const payload = parseJwtPayload(token)
  if (!payload?.exp) return true // treat missing exp as expired
  const nowSecs = Math.floor(Date.now() / 1000)
  return payload.exp - nowSecs <= bufferSecs
}

/** Returns seconds until the JWT expires (negative if already expired) */
function tokenExpiresIn(token: string): number {
  const payload = parseJwtPayload(token)
  if (!payload?.exp) return -1
  return payload.exp - Math.floor(Date.now() / 1000)
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [impersonating, setImpersonating] = useState<AuthUser | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Guard against concurrent refresh calls */
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null)

  /* ---- token helpers ---- */
  // Returns the impersonation token when active, otherwise the regular session token.
  const getToken = useCallback((): string | null => {
    const impToken = localStorage.getItem(IMPERSONATION_TOKEN_KEY)
    if (impToken) return impToken
    return localStorage.getItem(TOKEN_KEY)
  }, [])

  const setToken = useCallback((token: string) => {
    localStorage.setItem(TOKEN_KEY, token)
  }, [])

  const clearToken = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  }, [])

  const getRefreshToken = useCallback((): string | null => {
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  }, [])

  const setRefreshToken = useCallback((token: string) => {
    localStorage.setItem(REFRESH_TOKEN_KEY, token)
  }, [])

  /* ---- derive user from token ---- */
  const userFromToken = useCallback((token: string): AuthUser | null => {
    const payload = parseJwtPayload(token)
    if (!payload) return null
    const derivedName = payload.name ??
      ((payload.given_name || payload.family_name)
        ? [payload.given_name, payload.family_name].filter(Boolean).join(' ')
        : null) ??
      payload['cognito:username'] ??
      payload.email ??
      'User'
    return {
      sub: payload.sub ?? payload.username ?? 'unknown',
      email: payload.email ?? '',
      name: derivedName,
      picture: payload.picture,
    }
  }, [])

  /* ---- schedule proactive refresh ---- */
  const scheduleRefresh = useCallback((token: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    const expiresIn = tokenExpiresIn(token)
    // Refresh REFRESH_BUFFER_SECS before expiry, minimum 10s from now
    const refreshInMs = Math.max((expiresIn - REFRESH_BUFFER_SECS) * 1000, 10_000)
    refreshTimerRef.current = setTimeout(() => {
      doRefresh()
    }, refreshInMs)
  }, []) // doRefresh defined below, assigned via ref

  /* ---- refresh token exchange ---- */
  const doRefresh = useCallback(async (): Promise<string | null> => {
    // Coalesce concurrent calls
    if (refreshPromiseRef.current) return refreshPromiseRef.current

    const refreshTk = getRefreshToken()
    if (!refreshTk) {
      console.warn('[auth] No refresh token available - cannot refresh')
      return null
    }

    const promise = (async () => {
      try {
        const res = await fetch(apiUrl('/auth/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshTk }),
        })
        if (!res.ok) {
          console.warn('[auth] Token refresh failed', res.status)
          return null
        }
        const data = await res.json()
        if (data.id_token) {
          setToken(data.id_token)
          const u = userFromToken(data.id_token)
          setUser(u)
          scheduleRefresh(data.id_token)
          return data.id_token as string
        }
        return null
      } catch (err) {
        console.error('[auth] Token refresh error', err)
        return null
      } finally {
        refreshPromiseRef.current = null
      }
    })()

    refreshPromiseRef.current = promise
    return promise
  }, [getRefreshToken, setToken, userFromToken, scheduleRefresh])

  /* ---- restore impersonation state on page reload ---- */
  useEffect(() => {
    const impToken = localStorage.getItem(IMPERSONATION_TOKEN_KEY)
    if (!impToken) return
    const payload = parseJwtPayload(impToken)
    if (!payload || payload.type !== 'impersonation') {
      localStorage.removeItem(IMPERSONATION_TOKEN_KEY)
      return
    }
    // Clear if expired
    const nowSecs = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp <= nowSecs) {
      localStorage.removeItem(IMPERSONATION_TOKEN_KEY)
      return
    }
    const targetUser: AuthUser = {
      sub: payload.sub as string,
      email: (payload.email as string) || '',
      name: (payload.name as string) || '',
    }
    setImpersonating(targetUser)
    setUser(targetUser)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- dev mode: auto-login with mock user ---- */
  useEffect(() => {
    if (MODE === 'dev') {
      // Fetch dev user info from backend config endpoint
      fetch(apiUrl('/auth/config'))
        .then((r) => r.json())
        .then((data) => {
          if (data.devUser) {
            const u: AuthUser = {
              sub: data.devUser.sub,
              email: data.devUser.email,
              name: data.devUser.name,
            }
            setUser(u)
            // Create a fake token so API calls work (backend dev mode skips verification)
            setToken('dev-token')
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false))
      return
    }

    // Cognito mode: check for stored token
    const token = getToken()
    if (token) {
      // If token is fully expired (not just within buffer), try refreshing
      if (isTokenExpired(token, 0)) {
        doRefresh().then((newToken) => {
          if (newToken) {
            const u = userFromToken(newToken)
            setUser(u)
          }
          // If refresh fails the user stays logged out - they'll need to login
          setLoading(false)
        })
        return
      }
      const u = userFromToken(token)
      if (u) {
        setUser(u)
        scheduleRefresh(token)
        setLoading(false)
        return
      }
    }
    setLoading(false)

    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [getToken, setToken, userFromToken, doRefresh, scheduleRefresh])

  /* ---- handle /callback (Cognito redirect with ?code=...) ---- */
  useEffect(() => {
    if (MODE === 'dev') return
    // First: check for server flow that returned id_token in hash (backend redirect)
    try {
      if (window.location.hash && window.location.hash.includes('id_token=')) {
        const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        const idToken = h.get('id_token')
        const refreshTk = h.get('refresh_token')
        if (idToken) {
          setToken(idToken)
          if (refreshTk) setRefreshToken(refreshTk)
          const u = userFromToken(idToken)
          setUser(u)
          scheduleRefresh(idToken)
          // clean URL
          window.history.replaceState({}, '', '/')
          setLoading(false)
          return
        }
      }
    } catch (e) {
      // ignore
    }

    // PKCE flow: handle `?code=...` on frontend callback
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (!code) return

    const verifier = sessionStorage.getItem('pkce_code_verifier')
    if (!verifier) return

    // Exchange auth code for tokens via our backend
    setLoading(true)
    fetch(apiUrl('/auth/token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        codeVerifier: verifier,
        redirectUri: window.location.origin + '/callback',
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.id_token) {
          setToken(data.id_token)
          if (data.refresh_token) setRefreshToken(data.refresh_token)
          const u = userFromToken(data.id_token)
          setUser(u)
          scheduleRefresh(data.id_token)
        }
        sessionStorage.removeItem('pkce_code_verifier')
        // Clean URL
        window.history.replaceState({}, '', '/')
      })
      .catch((err) => console.error('Token exchange failed', err))
      .finally(() => setLoading(false))
  }, [setToken, setRefreshToken, userFromToken, scheduleRefresh])

  /* ---- loginWithProvider: redirect to Cognito Hosted UI for a specific IdP ---- */
  const loginWithProvider = useCallback(async (provider: AuthProvider) => {
    // In dev mode, attempt a simple dev-user login when not already signed-in.
    if (MODE === 'dev') {
      if (user) return
      try {
        const res = await fetch(apiUrl('/auth/config'))
        if (!res.ok) return
        const data = await res.json()
        if (data.devUser) {
          const u: AuthUser = {
            sub: data.devUser.sub,
            email: data.devUser.email,
            name: data.devUser.name,
          }
          setUser(u)
          setToken('dev-token')
        }
      } catch (err) {
        console.error('[auth] dev login failed', err)
      }
      return
    }

    let domain = import.meta.env.VITE_COGNITO_DOMAIN || ''
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID
    const flow = import.meta.env.VITE_AUTH_FLOW || 'server'

    if (!domain) {
      console.error('VITE_COGNITO_DOMAIN is not set')
      return
    }
    if (!/^https?:\/\//i.test(domain)) domain = `https://${domain}`

    if (flow === 'pkce') {
      const redirectUri = encodeURIComponent(window.location.origin + '/callback')
      const verifier = generateCodeVerifier()
      const challenge = await generateCodeChallenge(verifier)
      sessionStorage.setItem('pkce_code_verifier', verifier)
      const url =
        `${domain}/oauth2/authorize?response_type=code&client_id=${clientId}` +
        `&redirect_uri=${redirectUri}&scope=openid+email+profile` +
        `&code_challenge=${challenge}&code_challenge_method=S256&identity_provider=${provider}`
      window.location.href = url
      return
    }

    const backendCallback = import.meta.env.VITE_BACKEND_TOKEN_CALLBACK || 'http://localhost:3000/auth/token'
    const url =
      `${domain}/oauth2/authorize?response_type=code&client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(backendCallback)}` +
      `&scope=openid+email+profile&identity_provider=${provider}`
    window.location.href = url
  }, [user, setUser, setToken])

  /** Convenience alias - keeps backward compat for any code calling login() */
  const login = useCallback(() => loginWithProvider('Google'), [loginWithProvider])

  /* ---- email/password auth methods ---- */
  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const res = await fetch(apiUrl('/auth/email/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) throw Object.assign(new Error(data.message || 'Login failed'), { code: data.code })
    if (data.id_token) {
      setToken(data.id_token)
      if (data.refresh_token) setRefreshToken(data.refresh_token)
      const u = userFromToken(data.id_token)
      setUser(u)
      scheduleRefresh(data.id_token)
    }
  }, [setToken, setRefreshToken, userFromToken, setUser, scheduleRefresh])

  const registerWithEmail = useCallback(async (email: string, password: string, firstName?: string, lastName?: string) => {
    const res = await fetch(apiUrl('/auth/email/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, firstName, lastName }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Registration failed')
  }, [])

  const confirmEmail = useCallback(async (email: string, code: string) => {
    const res = await fetch(apiUrl('/auth/email/confirm'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Confirmation failed')
  }, [])

  const resendConfirmation = useCallback(async (email: string) => {
    const res = await fetch(apiUrl('/auth/email/resend'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Resend failed')
  }, [])

  const forgotPassword = useCallback(async (email: string) => {
    await fetch(apiUrl('/auth/email/forgot'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
  }, [])

  const resetPassword = useCallback(async (email: string, code: string, newPassword: string) => {
    const res = await fetch(apiUrl('/auth/email/reset'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, newPassword }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.message || 'Reset failed')
  }, [])

  /* ---- impersonation ---- */
  const startImpersonation = useCallback((token: string, targetUser: AuthUser) => {
    localStorage.setItem(IMPERSONATION_TOKEN_KEY, token)
    setImpersonating(targetUser)
    // Switch the visible user identity so the whole UI reflects the impersonated user.
    setUser(targetUser)
  }, [])

  const stopImpersonation = useCallback(() => {
    localStorage.removeItem(IMPERSONATION_TOKEN_KEY)
    setImpersonating(null)
    // Restore the admin's identity from their original session token.
    const adminToken = localStorage.getItem(TOKEN_KEY)
    if (adminToken) {
      const adminUser = userFromToken(adminToken)
      setUser(adminUser)
    }
  }, [userFromToken])

  /* ---- logout ---- */
  const logout = useCallback(() => {
    const hadToken = !!localStorage.getItem(TOKEN_KEY)
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    // Also clear any active impersonation session
    localStorage.removeItem(IMPERSONATION_TOKEN_KEY)
    setImpersonating(null)
    clearToken()
    setUser(null)

    if (MODE !== 'dev' && hadToken) {
      let domain = import.meta.env.VITE_COGNITO_DOMAIN || ''
      const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID
      const logoutUri = encodeURIComponent(window.location.origin)
      if (!domain) {
        console.error('VITE_COGNITO_DOMAIN is not set')
        return
      }
      if (!/^https?:\/\//i.test(domain)) domain = `https://${domain}`
      window.location.href = `${domain}/logout?client_id=${clientId}&logout_uri=${logoutUri}`
    }
  }, [clearToken])

  const updateUserName = useCallback((name: string) => {
    setUser((prev) => prev ? { ...prev, name } : prev)
  }, [])

  /* ---- Clarity: tag auth state whenever user changes ---- */
  useEffect(() => {
    if (user) {
      clarityIdentify(user.sub)
      clarityTag('auth_state', 'logged_in')
    } else if (!loading) {
      clarityTag('auth_state', 'anonymous')
    }
  }, [user, loading])

  return (
    <AuthContext.Provider value={{
      user, loading,
      login, loginWithProvider,
      loginWithEmail, registerWithEmail, confirmEmail, resendConfirmation,
      forgotPassword, resetPassword,
      logout, getToken, refreshToken: doRefresh,
      updateUserName,
      impersonating, startImpersonation, stopImpersonation,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

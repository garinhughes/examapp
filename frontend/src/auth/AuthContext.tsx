import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { apiUrl } from '../apiBase'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export interface AuthUser {
  sub: string
  email: string
  name: string
  picture?: string
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: () => void
  logout: () => void
  getToken: () => string | null
  /** Attempt to refresh the token. Returns the new token or null on failure. */
  refreshToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: () => {},
  logout: () => {},
  getToken: () => null,
  refreshToken: async () => null,
})

export const useAuth = () => useContext(AuthContext)

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const TOKEN_KEY = 'examapp_id_token'
const REFRESH_TOKEN_KEY = 'examapp_refresh_token'
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
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Guard against concurrent refresh calls */
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null)

  /* ---- token helpers ---- */
  const getToken = useCallback((): string | null => {
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
    return {
      sub: payload.sub ?? payload.username ?? 'unknown',
      email: payload.email ?? '',
      name: payload.name ?? payload['cognito:username'] ?? payload.email ?? 'User',
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
      console.warn('[auth] No refresh token available — cannot refresh')
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
          // If refresh fails the user stays logged out — they'll need to login
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

  /* ---- login: redirect to Cognito Hosted UI ---- */
  const login = useCallback(async () => {
    if (MODE === 'dev') return // already logged in
    let domain = import.meta.env.VITE_COGNITO_DOMAIN || ''
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID

    // Choose flow: 'server' -> confidential client redirects to backend callback
    // 'pkce' -> SPA does PKCE exchange. Default to 'server' for this app.
    const flow = import.meta.env.VITE_AUTH_FLOW || 'server'

    if (!domain) {
      console.error('VITE_COGNITO_DOMAIN is not set')
      return
    }

    // Ensure domain includes protocol so it's treated as absolute URL by the browser
    if (!/^https?:\/\//i.test(domain)) domain = `https://${domain}`

    if (flow === 'pkce') {
      const redirectUri = encodeURIComponent(window.location.origin + '/callback')
      const verifier = generateCodeVerifier()
      const challenge = await generateCodeChallenge(verifier)
      sessionStorage.setItem('pkce_code_verifier', verifier)

      const url =
        `${domain}/oauth2/authorize?response_type=code&client_id=${clientId}` +
        `&redirect_uri=${redirectUri}&scope=openid+email+profile` +
        `&code_challenge=${challenge}&code_challenge_method=S256&identity_provider=Google`
      window.location.href = url
      return
    }

    // server flow: redirect to Cognito and let Cognito redirect to backend /auth/token
    const backendCallback = import.meta.env.VITE_BACKEND_TOKEN_CALLBACK || 'http://localhost:3000/auth/token'
    const url = `${domain}/oauth2/authorize?response_type=code&client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(backendCallback)}` +
      `&scope=openid+email+profile&identity_provider=Google`
    window.location.href = url
  }, [])

  /* ---- logout ---- */
  const logout = useCallback(() => {
    const hadToken = !!localStorage.getItem(TOKEN_KEY)
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
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

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, getToken, refreshToken: doRefresh }}>
      {children}
    </AuthContext.Provider>
  )
}

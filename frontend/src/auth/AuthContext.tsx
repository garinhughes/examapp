import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

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
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: () => {},
  logout: () => {},
  getToken: () => null,
})

export const useAuth = () => useContext(AuthContext)

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const TOKEN_KEY = 'examapp_id_token'
const MODE = import.meta.env.VITE_AUTH_MODE || 'dev'

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

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  /* ---- token helpers ---- */
  const getToken = useCallback((): string | null => {
    return localStorage.getItem(TOKEN_KEY)
  }, [])

  const setToken = useCallback((token: string) => {
    localStorage.setItem(TOKEN_KEY, token)
  }, [])

  const clearToken = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
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

  /* ---- dev mode: auto-login with mock user ---- */
  useEffect(() => {
    if (MODE === 'dev') {
      // Fetch dev user info from backend config endpoint
      fetch('/auth/config')
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
      const u = userFromToken(token)
      if (u) {
        setUser(u)
        setLoading(false)
        return
      }
    }
    setLoading(false)
  }, [getToken, setToken, userFromToken])

  /* ---- handle /callback (Cognito redirect with ?code=...) ---- */
  useEffect(() => {
    if (MODE === 'dev') return

    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    if (!code) return

    const verifier = sessionStorage.getItem('pkce_code_verifier')
    if (!verifier) return

    // Exchange auth code for tokens via our backend
    setLoading(true)
    fetch('/auth/token', {
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
          const u = userFromToken(data.id_token)
          setUser(u)
        }
        sessionStorage.removeItem('pkce_code_verifier')
        // Clean URL
        window.history.replaceState({}, '', '/')
      })
      .catch((err) => console.error('Token exchange failed', err))
      .finally(() => setLoading(false))
  }, [setToken, userFromToken])

  /* ---- login: redirect to Cognito Hosted UI ---- */
  const login = useCallback(async () => {
    if (MODE === 'dev') return // already logged in

    const domain = import.meta.env.VITE_COGNITO_DOMAIN
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID
    const redirectUri = encodeURIComponent(window.location.origin + '/callback')

    const verifier = generateCodeVerifier()
    const challenge = await generateCodeChallenge(verifier)
    sessionStorage.setItem('pkce_code_verifier', verifier)

    const url =
      `${domain}/oauth2/authorize?response_type=code&client_id=${clientId}` +
      `&redirect_uri=${redirectUri}&scope=openid+email+profile` +
      `&code_challenge=${challenge}&code_challenge_method=S256`

    window.location.href = url
  }, [])

  /* ---- logout ---- */
  const logout = useCallback(() => {
    clearToken()
    setUser(null)

    if (MODE !== 'dev') {
      const domain = import.meta.env.VITE_COGNITO_DOMAIN
      const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID
      const logoutUri = encodeURIComponent(window.location.origin)
      window.location.href = `${domain}/logout?client_id=${clientId}&logout_uri=${logoutUri}`
    }
  }, [clearToken])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  )
}

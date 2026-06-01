import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import axios from 'axios'
import client from '../api/client'

const ACCESS_KEY = 'auth.access_token'
const REFRESH_KEY = 'auth.refresh_token'

export interface AuthUser {
  id: number
  tenant_id: number
  email: string
  display_name: string | null
  role: string
  is_active: boolean
  is_superadmin: boolean
  mfa_required: boolean
  mfa_enrolled: boolean
}

export interface AuthTenant {
  id: number
  name: string
  slug: string
}

interface AuthState {
  user: AuthUser | null
  tenant: AuthTenant | null
  loading: boolean
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string, mfaCode?: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<boolean>
  refetchMe: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Read the access token from localStorage. Bare module-level helper so the
 *  axios interceptor can read it without going through React state. */
export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY)
}
export function setTokens(access: string | null, refresh: string | null) {
  if (access) localStorage.setItem(ACCESS_KEY, access)
  else localStorage.removeItem(ACCESS_KEY)
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  else localStorage.removeItem(REFRESH_KEY)
}
function getRefreshToken() { return localStorage.getItem(REFRESH_KEY) }

/** Standalone refresh fn used by both the AuthProvider and the axios
 *  interceptor. Returns the new access token, or null on failure. */
export async function refreshAccessToken(): Promise<string | null> {
  const refresh_token = getRefreshToken()
  if (!refresh_token) return null
  try {
    // Use bare axios so we don't recurse into the interceptor.
    const resp = await axios.post('/api/auth/refresh', { refresh_token }, { timeout: 10000 })
    const { access_token, refresh_token: new_refresh } = resp.data
    setTokens(access_token, new_refresh)
    return access_token
  } catch {
    setTokens(null, null)
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, tenant: null, loading: true })
  const bootstrapped = useRef(false)

  const loadMe = useCallback(async () => {
    try {
      const resp = await client.get('/auth/me')
      setState({ user: resp.data.user, tenant: resp.data.tenant, loading: false })
    } catch {
      setState({ user: null, tenant: null, loading: false })
    }
  }, [])

  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true
    if (getAccessToken()) {
      loadMe()
    } else {
      setState((s) => ({ ...s, loading: false }))
    }
    // Safety net: if loading is still true after 12 s (server unreachable,
    // request hung despite axios timeout), force it to false so the app
    // never stays on a blank loading screen indefinitely.
    const safetyTimer = setTimeout(() => {
      setState((s) => s.loading ? { user: null, tenant: null, loading: false } : s)
    }, 12000)
    return () => clearTimeout(safetyTimer)
  }, [loadMe])

  const login = useCallback(async (email: string, password: string, mfaCode?: string) => {
    const resp = await axios.post('/api/auth/login', { email, password, mfa_code: mfaCode || null })
    setTokens(resp.data.access_token, resp.data.refresh_token)
    await loadMe()
  }, [loadMe])

  const logout = useCallback(async () => {
    const refresh_token = getRefreshToken()
    setTokens(null, null)
    setState({ user: null, tenant: null, loading: false })
    if (refresh_token) {
      try { await axios.post('/api/auth/logout', { refresh_token }) } catch { /* best-effort */ }
    }
  }, [])

  const refresh = useCallback(async () => {
    const tok = await refreshAccessToken()
    return tok !== null
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, refresh, refetchMe: loadMe }),
    [state, login, logout, refresh, loadMe],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

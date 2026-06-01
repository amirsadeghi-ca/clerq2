import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { getAccessToken, refreshAccessToken, setTokens } from '../context/auth'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((cfg) => {
  const token = getAccessToken()
  if (token) {
    cfg.headers = cfg.headers ?? {}
    cfg.headers.Authorization = `Bearer ${token}`
  }
  return cfg
})

// Coalesce concurrent refreshes so we only call /auth/refresh once on a burst.
let inflightRefresh: Promise<string | null> | null = null

client.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined
    const status = error.response?.status
    const url = (original?.url || '')
    const isAuthRoute = url.startsWith('/auth/login') || url.startsWith('/auth/refresh')

    if (status === 401 && original && !original._retried && !isAuthRoute) {
      original._retried = true
      try {
        if (!inflightRefresh) inflightRefresh = refreshAccessToken()
        const newToken = await inflightRefresh
        inflightRefresh = null
        if (newToken) {
          original.headers = original.headers ?? {}
          original.headers.Authorization = `Bearer ${newToken}`
          return client.request(original)
        }
      } catch {
        inflightRefresh = null
      }
      // Hard logout — refresh failed.
      setTokens(null, null)
      if (window.location.pathname !== '/login') {
        window.location.assign('/login')
      }
    }
    return Promise.reject(error)
  },
)

export default client

import { useState } from 'react'
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom'
import { AxiosError } from 'axios'
import { useAuth } from '../context/auth'
import { useI18n } from '../context/i18n'

export function LoginPage() {
  const { t } = useI18n()
  const { login, user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: { pathname: string } } }

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [showMfa, setShowMfa] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) return null
  if (user) {
    const from = location.state?.from?.pathname || '/'
    return <Navigate to={from} replace />
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email.trim().toLowerCase(), password, showMfa ? mfaCode : undefined)
      navigate(location.state?.from?.pathname || '/', { replace: true })
    } catch (err) {
      const detail = err instanceof AxiosError ? (err.response?.data as { detail?: string } | undefined)?.detail : undefined
      if (detail === 'MFA code required') {
        setShowMfa(true)
        setError(t('auth.signin.needMfa'))
      } else {
        setError(detail || t('auth.signin.error'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--c-bg)] text-[var(--c-text-1)]">
      <form
        onSubmit={onSubmit}
        className="w-[400px] rounded-lg border border-[var(--c-border-2)] bg-[var(--c-surface)] p-8 shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
      >
        <h1 className="mb-1 text-[20px] font-semibold">{t('auth.signin.title')}</h1>
        <p className="mb-6 text-[13px] text-[var(--c-text-3)]">{t('auth.signin.subtitle')}</p>

        <label className="mb-1 block text-[12px] font-medium text-[var(--c-text-2)]">{t('auth.email')}</label>
        <input
          type="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[13px] outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
        />

        <div className="mb-1 flex items-center justify-between">
          <label className="text-[12px] font-medium text-[var(--c-text-2)]">{t('auth.password')}</label>
          <Link to="/forgot-password" className="text-[11px] text-indigo-400 hover:underline">
            {t('auth.forgotPassword')}
          </Link>
        </div>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[13px] outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
        />

        {showMfa && (
          <>
            <label className="mb-1 block text-[12px] font-medium text-[var(--c-text-2)]">{t('auth.mfaCode')}</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
              className="mb-4 w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 font-mono text-[14px] tracking-widest outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
            />
          </>
        )}

        {error && (
          <div className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-indigo-600 px-3 py-2 text-[13px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {submitting ? t('auth.signin.loading') : t('auth.signin.button')}
        </button>

        <p className="mt-6 text-[11px] text-[var(--c-text-4)]">{t('auth.adminProvisioned')}</p>
      </form>
    </div>
  )
}

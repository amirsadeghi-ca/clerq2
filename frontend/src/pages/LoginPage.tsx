import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom'
import { AxiosError } from 'axios'
import { Loader2, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/auth'
import { useI18n } from '../context/i18n'

const INPUT =
  'w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[13px] outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20'

export function LoginPage() {
  const { t } = useI18n()
  const { login, user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation() as { state?: { from?: { pathname: string } } }

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials')
  const [mfaCode, setMfaCode] = useState('')
  const [useRecovery, setUseRecovery] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const mfaRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === 'mfa') setTimeout(() => mfaRef.current?.focus(), 60)
  }, [step])

  if (loading) return null
  if (user) {
    return <Navigate to={location.state?.from?.pathname || '/'} replace />
  }

  // ── Step 1: credentials ───────────────────────────────────────────────────

  async function onCredentials(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email.trim().toLowerCase(), password)
      navigate(location.state?.from?.pathname || '/', { replace: true })
    } catch (err) {
      const detail = err instanceof AxiosError
        ? (err.response?.data as { detail?: string } | undefined)?.detail
        : undefined
      if (detail === 'MFA code required') {
        setStep('mfa')
        setError(null)
      } else {
        setError(detail || t('auth.signin.error'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  // ── Step 2: MFA ───────────────────────────────────────────────────────────

  async function onMfa(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const code = useRecovery
      ? mfaCode.trim().toUpperCase()
      : mfaCode.replace(/\D/g, '')
    try {
      await login(email.trim().toLowerCase(), password, code)
      navigate(location.state?.from?.pathname || '/', { replace: true })
    } catch (err) {
      const detail = err instanceof AxiosError
        ? (err.response?.data as { detail?: string } | undefined)?.detail
        : undefined
      setError(detail || t('auth.signin.error'))
    } finally {
      setSubmitting(false)
    }
  }

  function handleMfaInput(val: string) {
    if (useRecovery) {
      // Allow XXXXX-XXXXX format
      setMfaCode(val.toUpperCase().slice(0, 11))
    } else {
      setMfaCode(val.replace(/\D/g, '').slice(0, 6))
    }
  }

  function switchMode(toRecovery: boolean) {
    setUseRecovery(toRecovery)
    setMfaCode('')
    setError(null)
    setTimeout(() => mfaRef.current?.focus(), 30)
  }

  function goBack() {
    setStep('credentials')
    setMfaCode('')
    setUseRecovery(false)
    setError(null)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--c-bg)] text-[var(--c-text-1)]">
      <div className="w-[400px] rounded-lg border border-[var(--c-border-2)] bg-[var(--c-surface)] p-8 shadow-[0_2px_8px_rgba(0,0,0,0.5)]">

        {step === 'credentials' && (
          <form onSubmit={onCredentials}>
            <div className="mb-5 flex flex-col items-center gap-2">
              <svg width="48" height="48" viewBox="0 0 1024 1024" fill="none">
                <path d="M384 212H586L708 334V740C708 781 675 814 634 814H390C349 814 316 781 316 740V280C316 242 346 212 384 212Z" fill="#6366f1"/>
                <path d="M586 212V334H708L586 212Z" fill="#4f46e5"/>
                <rect x="426" y="418" width="172" height="56" rx="28" fill="white"/>
                <rect x="486" y="418" width="52" height="278" rx="26" fill="white"/>
                <rect x="426" y="640" width="172" height="56" rx="28" fill="white"/>
              </svg>
              <span className="text-[15px] font-semibold tracking-tight text-[var(--c-text-1)]">Interpret</span>
            </div>
            <h1 className="mb-1 text-[20px] font-semibold">{t('auth.signin.title')}</h1>
            <p className="mb-6 text-[13px] text-[var(--c-text-3)]">{t('auth.signin.subtitle')}</p>

            <label className="mb-1 block text-[12px] font-medium text-[var(--c-text-2)]">{t('auth.email')}</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT + ' mb-4'}
              autoComplete="email"
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
              className={INPUT + ' mb-5'}
              autoComplete="current-password"
            />

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
              {submitting
                ? <span className="flex items-center justify-center gap-2"><Loader2 size={13} className="animate-spin" />{t('auth.signin.loading')}</span>
                : t('auth.signin.button')}
            </button>

            <p className="mt-6 text-[11px] text-[var(--c-text-4)]">{t('auth.adminProvisioned')}</p>
          </form>
        )}

        {step === 'mfa' && (
          <form onSubmit={onMfa}>
            {/* Icon + heading */}
            <div className="mb-5 flex flex-col items-center text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/10">
                <ShieldCheck size={22} className="text-indigo-400" />
              </div>
              <h1 className="text-[18px] font-semibold">{t('auth.mfa.title')}</h1>
              <p className="mt-1 text-[12px] text-[var(--c-text-4)]">
                {useRecovery ? t('auth.mfa.recovery.hint') : t('auth.mfa.hint')}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--c-text-5)]">{email}</p>
            </div>

            {/* Code input */}
            {!useRecovery ? (
              <input
                ref={mfaRef}
                type="text"
                inputMode="numeric"
                placeholder="000000"
                value={mfaCode}
                onChange={(e) => handleMfaInput(e.target.value)}
                autoComplete="one-time-code"
                className="mb-5 w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-3 py-3 text-center font-mono text-[22px] tracking-[0.45em] outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
              />
            ) : (
              <input
                ref={mfaRef}
                type="text"
                placeholder="XXXXX-XXXXX"
                value={mfaCode}
                onChange={(e) => handleMfaInput(e.target.value)}
                className="mb-5 w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-3 py-2.5 text-center font-mono text-[15px] tracking-widest outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
              />
            )}

            {error && (
              <div className="mb-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || (!useRecovery && mfaCode.length !== 6)}
              className="mb-4 w-full rounded bg-indigo-600 px-3 py-2 text-[13px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {submitting
                ? <span className="flex items-center justify-center gap-2"><Loader2 size={13} className="animate-spin" />{t('auth.signin.loading')}</span>
                : t('auth.mfa.verify')}
            </button>

            {/* Mode toggle */}
            <div className="mb-4 text-center text-[12px]">
              {!useRecovery ? (
                <button type="button" onClick={() => switchMode(true)} className="text-[var(--c-text-4)] hover:text-[var(--c-text-2)]">
                  {t('auth.mfa.useRecovery')}
                </button>
              ) : (
                <button type="button" onClick={() => switchMode(false)} className="text-[var(--c-text-4)] hover:text-[var(--c-text-2)]">
                  {t('auth.mfa.useTotp')}
                </button>
              )}
            </div>

            {/* Back link */}
            <div className="text-center">
              <button type="button" onClick={goBack} className="text-[11px] text-[var(--c-text-5)] hover:text-[var(--c-text-3)]">
                ← {t('auth.mfa.back')}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  )
}

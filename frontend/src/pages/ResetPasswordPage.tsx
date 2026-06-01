import { useEffect, useState, type FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { AxiosError } from 'axios'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { useI18n } from '../context/i18n'
import client from '../api/client'

const INPUT_CLASS =
  'w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[13px] outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20'

type Phase = 'loading' | 'invalid' | 'ready' | 'done'

export function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>()
  const { t } = useI18n()

  const [phase, setPhase] = useState<Phase>('loading')
  const [email, setEmail] = useState('')
  const [invalidMsg, setInvalidMsg] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!token) { setPhase('invalid'); setInvalidMsg(t('auth.resetPassword.invalid.body')); return }
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await client.post('/auth/reset-password/validate', { token })
        if (cancelled) return
        if (data.valid) {
          setEmail(data.email ?? '')
          setPhase('ready')
        } else {
          setInvalidMsg(data.error ?? t('auth.resetPassword.invalid.body'))
          setPhase('invalid')
        }
      } catch {
        if (!cancelled) {
          setInvalidMsg(t('auth.resetPassword.invalid.body'))
          setPhase('invalid')
        }
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) { setError(t('auth.resetPassword.error.short')); return }
    if (password !== confirm) { setError(t('auth.resetPassword.error.mismatch')); return }
    setSubmitting(true)
    try {
      await client.post('/auth/reset-password', { token, new_password: password })
      setPhase('done')
    } catch (err) {
      const detail = err instanceof AxiosError
        ? (err.response?.data as { detail?: string } | undefined)?.detail
        : undefined
      setError(detail ?? t('auth.resetPassword.invalid.body'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--c-bg)] px-4 text-[var(--c-text-1)]">
      <div className="w-full max-w-[400px] rounded-lg border border-[var(--c-border-2)] bg-[var(--c-surface)] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.5)] sm:p-8">

        {phase === 'loading' && (
          <div className="flex items-center justify-center gap-2 text-[13px] text-[var(--c-text-4)]">
            <Loader2 size={16} className="animate-spin" />
            {t('auth.resetPassword.loading')}
          </div>
        )}

        {phase === 'invalid' && (
          <div className="text-center">
            <h1 className="mb-2 text-[18px] font-semibold">{t('auth.resetPassword.invalid.title')}</h1>
            <p className="mb-6 text-[13px] text-[var(--c-text-3)]">{invalidMsg}</p>
            <Link
              to="/forgot-password"
              className="text-[13px] font-medium text-indigo-400 hover:underline"
            >
              {t('auth.resetPassword.invalid.request')}
            </Link>
          </div>
        )}

        {phase === 'ready' && (
          <form onSubmit={onSubmit}>
            <h1 className="mb-1 text-[20px] font-semibold">{t('auth.resetPassword.title')}</h1>
            <p className="mb-6 text-[13px] text-[var(--c-text-3)]">
              {t('auth.resetPassword.subtitle', { email })}
            </p>

            <label className="mb-1 block text-[12px] font-medium text-[var(--c-text-2)]">
              {t('auth.resetPassword.new')}
            </label>
            <input
              type="password"
              required
              minLength={8}
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT_CLASS + ' mb-4'}
              autoComplete="new-password"
            />

            <label className="mb-1 block text-[12px] font-medium text-[var(--c-text-2)]">
              {t('auth.resetPassword.confirm')}
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={INPUT_CLASS + ' mb-5'}
              autoComplete="new-password"
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
                ? <span className="flex items-center justify-center gap-2"><Loader2 size={13} className="animate-spin" /> {t('auth.resetPassword.saving')}</span>
                : t('auth.resetPassword.submit')}
            </button>
          </form>
        )}

        {phase === 'done' && (
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
                <CheckCircle2 size={24} className="text-emerald-400" />
              </div>
            </div>
            <h1 className="mb-2 text-[18px] font-semibold">{t('auth.resetPassword.success.title')}</h1>
            <p className="mb-6 text-[13px] text-[var(--c-text-3)]">{t('auth.resetPassword.success.body')}</p>
            <Link
              to="/login"
              className="inline-block rounded bg-indigo-600 px-5 py-2 text-[13px] font-medium text-white hover:bg-indigo-500"
            >
              {t('auth.resetPassword.success.login')}
            </Link>
          </div>
        )}

      </div>
    </div>
  )
}

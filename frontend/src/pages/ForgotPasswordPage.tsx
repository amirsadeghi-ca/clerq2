import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { useI18n } from '../context/i18n'
import client from '../api/client'

const INPUT_CLASS =
  'w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[13px] outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20'

export function ForgotPasswordPage() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await client.post('/auth/forgot-password', { email: email.trim().toLowerCase() })
    } catch {
      // Always show success — don't leak whether the email exists.
    } finally {
      setSubmitting(false)
      setSent(true)
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--c-bg)] px-4 text-[var(--c-text-1)]">
      <div className="w-full max-w-[400px] rounded-lg border border-[var(--c-border-2)] bg-[var(--c-surface)] p-6 shadow-[0_2px_8px_rgba(0,0,0,0.5)] sm:p-8">
        {!sent ? (
          <form onSubmit={onSubmit}>
            <h1 className="mb-1 text-[20px] font-semibold">{t('auth.forgotPassword.title')}</h1>
            <p className="mb-6 text-[13px] text-[var(--c-text-3)]">{t('auth.forgotPassword.subtitle')}</p>

            <label className="mb-1 block text-[12px] font-medium text-[var(--c-text-2)]">
              {t('auth.forgotPassword.email')}
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLASS + ' mb-5'}
              autoComplete="email"
            />

            <button
              type="submit"
              disabled={submitting}
              className="mb-5 w-full rounded bg-indigo-600 px-3 py-2 text-[13px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {submitting
                ? <span className="flex items-center justify-center gap-2"><Loader2 size={13} className="animate-spin" /> {t('auth.forgotPassword.sending')}</span>
                : t('auth.forgotPassword.submit')}
            </button>

            <div className="text-center">
              <Link to="/login" className="text-[12px] text-indigo-400 hover:underline">
                {t('auth.forgotPassword.backToLogin')}
              </Link>
            </div>
          </form>
        ) : (
          <div className="text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15">
                <CheckCircle2 size={24} className="text-emerald-400" />
              </div>
            </div>
            <h1 className="mb-2 text-[18px] font-semibold">{t('auth.forgotPassword.sent.title')}</h1>
            <p className="mb-6 text-[13px] text-[var(--c-text-3)]">
              {t('auth.forgotPassword.sent.body', { email })}
            </p>
            <Link to="/login" className="text-[12px] text-indigo-400 hover:underline">
              {t('auth.forgotPassword.backToLogin')}
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

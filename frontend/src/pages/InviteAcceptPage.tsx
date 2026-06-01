import { useEffect, useState, type FormEvent } from 'react'
import { useParams, Link } from 'react-router-dom'
import { AxiosError } from 'axios'
import { acceptInvite, lookupInvite } from '../api/tenant'
import { setTokens } from '../context/auth'
import { useI18n } from '../context/i18n'

type LookupState =
  | { phase: 'loading' }
  | { phase: 'invalid'; error: string }
  | { phase: 'ready'; email: string; tenant_name: string; role: string }
  | { phase: 'done' }

export function InviteAcceptPage() {
  const { token } = useParams<{ token: string }>()
  const { t } = useI18n()

  const [state, setState] = useState<LookupState>({ phase: 'loading' })
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setState({ phase: 'invalid', error: 'No invitation token provided.' })
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const data = await lookupInvite(token)
        if (cancelled) return
        if (!data.valid) {
          setState({ phase: 'invalid', error: data.error || 'Invitation invalid.' })
        } else {
          setState({ phase: 'ready', email: data.email!, tenant_name: data.tenant_name!, role: data.role! })
          setDisplayName(data.email!.split('@')[0])
        }
      } catch {
        if (!cancelled) setState({ phase: 'invalid', error: 'Could not load invitation.' })
      }
    })()
    return () => { cancelled = true }
  }, [token])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError(t('invite.error.passwordShort'))
      return
    }
    if (password !== confirm) {
      setError(t('invite.error.passwordMismatch'))
      return
    }
    setSubmitting(true)
    try {
      const tokens = await acceptInvite(token!, password, displayName.trim() || undefined)
      setTokens(tokens.access_token, tokens.refresh_token)
      setState({ phase: 'done' })
      // Force a full reload so AuthProvider re-bootstraps from the new tokens.
      // (SPA navigate() keeps the existing AuthProvider, whose `user` state is
      //  still null because we never hit /auth/me on this mount.)
      window.location.replace('/')
    } catch (err) {
      const detail = err instanceof AxiosError ? (err.response?.data as { detail?: string } | undefined)?.detail : undefined
      setError(detail || t('invite.error.generic'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--c-bg)] text-[var(--c-text-1)]">
      <div className="w-[420px] rounded-lg border border-[var(--c-border-2)] bg-[var(--c-surface)] p-8 shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
        {state.phase === 'loading' && (
          <div className="text-[12px] text-[var(--c-text-3)]">{t('invite.loading')}</div>
        )}

        {state.phase === 'invalid' && (
          <>
            <h1 className="mb-1 text-[18px] font-semibold">{t('invite.invalid.title')}</h1>
            <p className="mb-4 text-[12px] text-[var(--c-text-3)]">{state.error}</p>
            <Link to="/login" className="text-[12px] text-indigo-400 hover:underline">{t('invite.invalid.back')}</Link>
          </>
        )}

        {state.phase === 'ready' && (
          <form onSubmit={onSubmit}>
            <h1 className="mb-1 text-[18px] font-semibold">{t('invite.welcome', { tenant: state.tenant_name })}</h1>
            <p className="mb-5 text-[12px] text-[var(--c-text-3)]">
              {t('invite.subtitle.email', { email: state.email })}
            </p>

            <label className="mb-1 block text-[12px] font-medium text-[var(--c-text-2)]">{t('invite.displayName')}</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mb-4 w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[13px] outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
            />

            <label className="mb-1 block text-[12px] font-medium text-[var(--c-text-2)]">{t('invite.password')}</label>
            <input
              type="password"
              required
              minLength={8}
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mb-4 w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[13px] outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
            />

            <label className="mb-1 block text-[12px] font-medium text-[var(--c-text-2)]">{t('invite.confirm')}</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mb-4 w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[13px] outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
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
              {submitting ? t('invite.submitting') : t('invite.submit')}
            </button>

            <p className="mt-4 text-[11px] text-[var(--c-text-4)]">
              {t('invite.role.note', { role: state.role })}
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

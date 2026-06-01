import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AxiosError } from 'axios'
import {
  CheckCircle2, Copy, KeyRound, Loader2, QrCode, ShieldAlert, ShieldCheck, UserRound,
} from 'lucide-react'
import QRCode from 'react-qr-code'
import { useAuth } from '../../context/auth'
import { useI18n } from '../../context/i18n'
import { useUpdateMe, useChangePassword, useLogoutAll } from '../../api/account'
import {
  useMfaMethods, useEnrollTotp, useConfirmTotp, useRemoveMfa, useRegenerateRecoveryCodes,
} from '../../api/mfa'

// ─── Shared bits ────────────────────────────────────────────────────────────

const INPUT_CLASS =
  'w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-3 py-2 text-[13px] text-[var(--c-text-1)] outline-none placeholder-[var(--c-text-5)] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 disabled:opacity-60'

const PRIMARY_BTN =
  'flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-4 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40'

const DANGER_BTN =
  'flex h-7 items-center gap-1.5 rounded border border-red-500/30 px-3 text-[12px] text-red-400 transition-colors hover:border-red-500/50 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40'

const SECONDARY_BTN =
  'flex h-7 items-center gap-1.5 rounded border border-[var(--c-border-2)] px-3 text-[12px] text-[var(--c-text-3)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-2)] disabled:cursor-not-allowed disabled:opacity-40'

function SectionCard({
  title, subtitle, icon: Icon, children,
}: {
  title: string; subtitle?: string; icon: React.ElementType; children: React.ReactNode
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={14} className="text-[var(--c-text-4)]" />
        <h2 className="text-[13px] font-semibold text-[var(--c-text-1)]">{title}</h2>
      </div>
      {subtitle && <p className="mb-3 text-[12px] text-[var(--c-text-4)]">{subtitle}</p>}
      <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
        {children}
      </div>
    </section>
  )
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
      <ShieldAlert size={12} className="mt-0.5 shrink-0" /> {msg}
    </div>
  )
}

// ─── Profile ────────────────────────────────────────────────────────────────

function ProfileCard() {
  const { t } = useI18n()
  const { user, tenant, refetchMe } = useAuth()
  const update = useUpdateMe()
  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const [saved, setSaved] = useState(false)

  useEffect(() => { setDisplayName(user?.display_name ?? '') }, [user?.display_name])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    await update.mutateAsync({ display_name: displayName })
    await refetchMe()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (!user) return null
  const dirty = (user.display_name ?? '') !== displayName

  return (
    <SectionCard title={t('account.profile')} subtitle={t('account.profile.subtitle')} icon={UserRound}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-[12px] font-medium text-[var(--c-text-3)]">{t('account.email')}</label>
          <input className={INPUT_CLASS} value={user.email} disabled />
          <p className="mt-1 text-[11px] text-[var(--c-text-5)]">{t('account.email.help')}</p>
        </div>

        <div>
          <label className="mb-1 block text-[12px] font-medium text-[var(--c-text-3)]">{t('account.displayName')}</label>
          <input
            className={INPUT_CLASS}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={user.email}
          />
        </div>

        <div>
          <label className="mb-1 block text-[12px] font-medium text-[var(--c-text-3)]">
            {t('account.role', { tenant: tenant?.name ?? '' })}
          </label>
          <input className={INPUT_CLASS} value={user.role + (user.is_superadmin ? ' · super-admin' : '')} disabled />
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={!dirty || update.isPending} className={PRIMARY_BTN}>
            {update.isPending ? t('btn.saving') : t('account.profile.save')}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-[12px] text-emerald-400">
              <CheckCircle2 size={13} /> {t('account.profile.saved')}
            </span>
          )}
        </div>
      </form>
    </SectionCard>
  )
}

// ─── Change password ────────────────────────────────────────────────────────

function ChangePasswordCard() {
  const { t } = useI18n()
  const change = useChangePassword()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null); setSuccess(false)
    if (next.length < 8) { setError(t('account.changePassword.short')); return }
    if (next !== confirm) { setError(t('account.changePassword.mismatch')); return }
    try {
      await change.mutateAsync({ current_password: current, new_password: next })
      setCurrent(''); setNext(''); setConfirm('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 6000)
    } catch (err) {
      const status = err instanceof AxiosError ? err.response?.status : undefined
      const detail = err instanceof AxiosError ? (err.response?.data as { detail?: string } | undefined)?.detail : undefined
      if (status === 400 && detail?.toLowerCase().includes('current')) {
        setError(t('account.changePassword.wrongCurrent'))
      } else {
        setError(detail ?? t('settings.saveFailed', { error: '' }))
      }
    }
  }

  return (
    <SectionCard title={t('account.changePassword')} icon={KeyRound}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-[12px] font-medium text-[var(--c-text-3)]">{t('account.currentPassword')}</label>
          <input className={INPUT_CLASS} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-[var(--c-text-3)]">{t('account.newPassword')}</label>
          <input className={INPUT_CLASS} type="password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password" />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-[var(--c-text-3)]">{t('account.confirmPassword')}</label>
          <input className={INPUT_CLASS} type="password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
        </div>

        {error && <ErrorBanner msg={error} />}
        {success && (
          <div className="flex items-start gap-2 rounded border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-400">
            <CheckCircle2 size={12} className="mt-0.5 shrink-0" /> {t('account.changePassword.success')}
          </div>
        )}

        <button type="submit" disabled={change.isPending} className={PRIMARY_BTN}>
          {change.isPending
            ? <><Loader2 size={12} className="animate-spin" /> {t('account.changePassword.saving')}</>
            : t('account.changePassword.submit')}
        </button>
      </form>
    </SectionCard>
  )
}

// ─── MFA — recovery codes display ────────────────────────────────────────────

function RecoveryCodesList({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  function copyAll() {
    navigator.clipboard.writeText(codes.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="space-y-4">
      <p className="text-[12px] text-[var(--c-text-3)]">{t('account.mfa.setup.step3.body')}</p>

      <div className="rounded-lg border border-[var(--c-border-2)] bg-[var(--c-surface-2)] p-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          {codes.map((c) => (
            <span key={c} className="font-mono text-[13px] tracking-wider text-[var(--c-text-1)]">{c}</span>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={copyAll} className={SECONDARY_BTN}>
          {copied
            ? <><CheckCircle2 size={12} className="text-emerald-400" /> {t('account.mfa.setup.step3.copied')}</>
            : <><Copy size={12} /> {t('account.mfa.setup.step3.copy')}</>}
        </button>
        <button onClick={onDone} className={PRIMARY_BTN}>
          {t('account.mfa.setup.step3.done')}
        </button>
      </div>
    </div>
  )
}

// ─── MFA — setup modal ───────────────────────────────────────────────────────

type SetupStep = 'qr' | 'verify' | 'codes'

function MfaSetupModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const { refetchMe } = useAuth()
  const enroll = useEnrollTotp()
  const confirm = useConfirmTotp()

  const [step, setStep] = useState<SetupStep>('qr')
  const [credId, setCredId] = useState<number | null>(null)
  const [uri, setUri] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  // Start enrollment on mount.
  useEffect(() => {
    enroll.mutateAsync({ label: t('account.mfa.label.default') }).then((r) => {
      setCredId(r.credential_id)
      setUri(r.provisioning_uri)
      setSecret(r.secret)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (step === 'verify') setTimeout(() => codeRef.current?.focus(), 50)
  }, [step])

  async function onVerify(e: FormEvent) {
    e.preventDefault()
    if (!credId) return
    setError(null)
    try {
      const res = await confirm.mutateAsync({ credential_id: credId, code })
      setRecoveryCodes(res.recovery_codes)
      await refetchMe()
      setStep('codes')
    } catch (err) {
      const detail = err instanceof AxiosError ? (err.response?.data as { detail?: string } | undefined)?.detail : undefined
      setError(detail ?? t('account.mfa.setup.step2.error'))
    }
  }

  function handleCodeInput(val: string) {
    // Accept digits only, auto-strip spaces.
    const clean = val.replace(/\D/g, '').slice(0, 6)
    setCode(clean)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-[var(--c-border-2)] bg-[var(--c-surface)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-5 py-4">
          <QrCode size={16} className="text-indigo-400" />
          <h3 className="text-[14px] font-semibold text-[var(--c-text-1)]">
            {step === 'qr' && t('account.mfa.setup.step1.title')}
            {step === 'verify' && t('account.mfa.setup.step2.title')}
            {step === 'codes' && t('account.mfa.setup.step3.title')}
          </h3>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1 px-5 pt-4">
          {(['qr', 'verify', 'codes'] as SetupStep[]).map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                step === s ? 'bg-indigo-500' :
                (['qr', 'verify', 'codes'] as SetupStep[]).indexOf(step) > i ? 'bg-indigo-500/40' : 'bg-[var(--c-border-2)]'
              }`}
            />
          ))}
        </div>

        <div className="p-5">
          {/* Step 1 — QR code */}
          {step === 'qr' && (
            <div className="space-y-4">
              <p className="text-[12px] text-[var(--c-text-3)]">{t('account.mfa.setup.step1.body')}</p>

              {enroll.isPending || !uri ? (
                <div className="flex h-48 items-center justify-center">
                  <Loader2 size={24} className="animate-spin text-[var(--c-text-5)]" />
                </div>
              ) : (
                <div className="flex justify-center rounded-lg border border-[var(--c-border-2)] bg-white p-4">
                  <QRCode value={uri} size={180} />
                </div>
              )}

              {secret && (
                <div>
                  <p className="mb-1 text-[11px] text-[var(--c-text-5)]">{t('account.mfa.setup.step1.manual')}</p>
                  <div className="flex items-center gap-2 rounded border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-3 py-2">
                    <span className="flex-1 break-all font-mono text-[12px] tracking-widest text-[var(--c-text-2)]">
                      {secret.match(/.{1,4}/g)?.join(' ')}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(secret)}
                      className="shrink-0 text-[var(--c-text-4)] hover:text-[var(--c-text-2)]"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => setStep('verify')}
                  disabled={!uri}
                  className={PRIMARY_BTN}
                >
                  {t('account.mfa.setup.step1.next')}
                </button>
              </div>
            </div>
          )}

          {/* Step 2 — Verify code */}
          {step === 'verify' && (
            <form onSubmit={onVerify} className="space-y-4">
              <p className="text-[12px] text-[var(--c-text-3)]">{t('account.mfa.setup.step2.body')}</p>

              <div>
                <label className="mb-1 block text-[12px] font-medium text-[var(--c-text-3)]">
                  {t('account.mfa.setup.step2.label')}
                </label>
                <input
                  ref={codeRef}
                  className={INPUT_CLASS + ' text-center text-[18px] tracking-[0.4em] font-mono'}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => handleCodeInput(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
              </div>

              {error && <ErrorBanner msg={error} />}

              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setStep('qr')} className={SECONDARY_BTN}>
                  ← Back
                </button>
                <button type="submit" disabled={code.length !== 6 || confirm.isPending} className={PRIMARY_BTN}>
                  {confirm.isPending
                    ? <><Loader2 size={12} className="animate-spin" /> {t('account.mfa.setup.step2.verifying')}</>
                    : t('account.mfa.setup.step2.submit')}
                </button>
              </div>
            </form>
          )}

          {/* Step 3 — Recovery codes */}
          {step === 'codes' && (
            <RecoveryCodesList codes={recoveryCodes} onDone={onClose} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── MFA — remove confirmation modal ─────────────────────────────────────────

function MfaRemoveModal({ credentialId, onClose }: { credentialId: number; onClose: () => void }) {
  const { t } = useI18n()
  const { refetchMe } = useAuth()
  const remove = useRemoveMfa()
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const payload: { credential_id: number; current_password?: string; totp_code?: string } = {
      credential_id: credentialId,
    }
    if (password) payload.current_password = password
    if (totpCode) payload.totp_code = totpCode.replace(/\D/g, '').slice(0, 6)
    if (!payload.current_password && !payload.totp_code) {
      setError(t('account.mfa.remove.confirm.body'))
      return
    }
    try {
      await remove.mutateAsync(payload)
      await refetchMe()
      onClose()
    } catch (err) {
      const detail = err instanceof AxiosError ? (err.response?.data as { detail?: string } | undefined)?.detail : undefined
      setError(detail ?? t('settings.saveFailed', { error: '' }))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-[var(--c-border-2)] bg-[var(--c-surface)] shadow-2xl">
        <div className="border-b border-[var(--c-border)] px-5 py-4">
          <h3 className="text-[14px] font-semibold text-[var(--c-text-1)]">{t('account.mfa.remove.confirm.title')}</h3>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-5">
          <p className="text-[12px] text-[var(--c-text-3)]">{t('account.mfa.remove.confirm.body')}</p>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-[var(--c-text-3)]">{t('account.mfa.remove.password')}</label>
            <input
              className={INPUT_CLASS}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[var(--c-text-5)]">
            <div className="h-px flex-1 bg-[var(--c-border)]" />
            <span>{t('account.mfa.remove.code').split('—')[1]?.trim() ?? 'or'}</span>
            <div className="h-px flex-1 bg-[var(--c-border)]" />
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-[var(--c-text-3)]">
              {t('account.mfa.remove.code').replace(/^.*—.*—\s*/, '')}
            </label>
            <input
              className={INPUT_CLASS + ' text-center font-mono tracking-[0.35em]'}
              placeholder="000000"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
            />
          </div>

          {error && <ErrorBanner msg={error} />}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={SECONDARY_BTN}>{t('btn.cancel')}</button>
            <button type="submit" disabled={remove.isPending || (!password && !totpCode)} className={DANGER_BTN}>
              {remove.isPending
                ? <><Loader2 size={12} className="animate-spin" /> {t('btn.saving')}</>
                : t('account.mfa.remove.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── MFA — regenerate recovery codes modal ────────────────────────────────────

function RegenCodesModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const regen = useRegenerateRecoveryCodes()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const res = await regen.mutateAsync({ totp_code: code.replace(/\D/g, '') })
      setCodes(res.recovery_codes)
    } catch (err) {
      const detail = err instanceof AxiosError ? (err.response?.data as { detail?: string } | undefined)?.detail : undefined
      setError(detail ?? t('account.mfa.setup.step2.error'))
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-[var(--c-border-2)] bg-[var(--c-surface)] shadow-2xl">
        <div className="border-b border-[var(--c-border)] px-5 py-4">
          <h3 className="text-[14px] font-semibold text-[var(--c-text-1)]">{t('account.mfa.recovery.regen')}</h3>
        </div>
        <div className="p-5">
          {!codes ? (
            <form onSubmit={onSubmit} className="space-y-4">
              <p className="text-[12px] text-[var(--c-text-3)]">{t('account.mfa.recovery.regen.body')}</p>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-[var(--c-text-3)]">{t('account.mfa.setup.step2.label')}</label>
                <input
                  className={INPUT_CLASS + ' text-center font-mono tracking-[0.35em] text-[16px]'}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoFocus
                />
              </div>
              {error && <ErrorBanner msg={error} />}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className={SECONDARY_BTN}>{t('btn.cancel')}</button>
                <button type="submit" disabled={code.length !== 6 || regen.isPending} className={PRIMARY_BTN}>
                  {regen.isPending
                    ? <><Loader2 size={12} className="animate-spin" /> {t('btn.saving')}</>
                    : t('account.mfa.recovery.regen.submit')}
                </button>
              </div>
            </form>
          ) : (
            <RecoveryCodesList codes={codes} onDone={onClose} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── MFA card ────────────────────────────────────────────────────────────────

function MfaCard() {
  const { t } = useI18n()
  const { data: methods = [] } = useMfaMethods()
  const [showSetup, setShowSetup] = useState(false)
  const [removeId, setRemoveId] = useState<number | null>(null)
  const [showRegen, setShowRegen] = useState(false)

  const totpMethod = methods.find((m) => m.type === 'totp' && m.is_confirmed)

  return (
    <SectionCard title={t('account.mfa')} subtitle={t('account.mfa.subtitle')} icon={QrCode}>
      {totpMethod ? (
        <div className="space-y-4">
          {/* Status row */}
          <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-400" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[var(--c-text-1)]">{t('account.mfa.enabled')}</p>
              <p className="text-[11px] text-[var(--c-text-4)]">
                {totpMethod.label ?? t('account.mfa.label.default')}
                {totpMethod.last_used_at && (
                  <> · Last used {new Date(totpMethod.last_used_at).toLocaleDateString()}</>
                )}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button onClick={() => setShowRegen(true)} className={SECONDARY_BTN}>
              {t('account.mfa.recovery.regen')}
            </button>
            <button onClick={() => setRemoveId(totpMethod.id)} className={DANGER_BTN}>
              {t('account.mfa.remove')}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[12px] text-[var(--c-text-4)]">{t('account.mfa.disabled')}</p>
          <button onClick={() => setShowSetup(true)} className={PRIMARY_BTN}>
            <QrCode size={12} /> {t('account.mfa.add')}
          </button>
        </div>
      )}

      {showSetup && <MfaSetupModal onClose={() => setShowSetup(false)} />}
      {removeId !== null && <MfaRemoveModal credentialId={removeId} onClose={() => setRemoveId(null)} />}
      {showRegen && <RegenCodesModal onClose={() => setShowRegen(false)} />}
    </SectionCard>
  )
}

// ─── Sessions ───────────────────────────────────────────────────────────────

function SessionsCard() {
  const { t } = useI18n()
  const { logout } = useAuth()
  const logoutAll = useLogoutAll()

  async function onClick() {
    if (!confirm(t('account.signOutAll.confirm'))) return
    try { await logoutAll.mutateAsync() } catch { /* best-effort */ }
    await logout()  // also clears local tokens + redirects via ProtectedRoute
  }

  return (
    <SectionCard title={t('account.sessions')} subtitle={t('account.sessions.subtitle')} icon={ShieldAlert}>
      <button onClick={onClick} disabled={logoutAll.isPending} className={DANGER_BTN}>
        {t('account.signOutAll')}
      </button>
    </SectionCard>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function AccountSection() {
  const { t } = useI18n()
  return (
    <>
      <header className="mb-6">
        <h2 className="text-[16px] font-semibold text-[var(--c-text-1)]">{t('settings.section.account')}</h2>
        <p className="text-[12px] text-[var(--c-text-4)]">{t('account.security.subtitle')}</p>
      </header>
      <ProfileCard />
      <ChangePasswordCard />
      <MfaCard />
      <SessionsCard />
    </>
  )
}

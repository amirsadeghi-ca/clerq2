import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Building2, ShieldAlert, Users, Plus, X, KeyRound, Pencil, Mail, Copy, RotateCw, Trash2, AlertTriangle, Menu, ArrowLeft } from 'lucide-react'
import { LeftSidebar } from '../components/LeftSidebar'
import { useMobileSidebar } from '../hooks/useMobileSidebar'
import { useI18n } from '../context/i18n'
import { useAuth } from '../context/auth'
import {
  useAdminTenants, useAdminTenantUsers, useCreateTenant, useUpdateTenant,
  useCreateUser, useUpdateUser, useSetUserPassword, useDeleteUser,
  type AdminTenant, type AdminUser,
} from '../api/admin'
import { useInvites, useCreateInvite, useRevokeInvite, useResendInvite, type Invite } from '../api/tenant'
import { IntegrationsPanel } from '../components/IntegrationsPanel'

const ROLES = ['owner', 'admin', 'member'] as const

function formatDate(iso: string | null, lang: string): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleString(lang === 'fr' ? 'fr-CA' : undefined) } catch { return iso }
}

// ── Modals ────────────────────────────────────────────────────────────────

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[420px] rounded-xl border border-[var(--c-border-2)] bg-[var(--c-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--c-border)] px-5 py-3">
          <h3 className="text-[14px] font-medium text-[var(--c-text-1)]">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-[var(--c-text-4)] hover:text-[var(--c-text-2)] hover:bg-[var(--c-hover-3)]">
            <X size={14} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-[12px] font-medium text-[var(--c-text-2)]">{label}</span>
      {children}
      {help && <span className="mt-1 block text-[10px] text-[var(--c-text-5)]">{help}</span>}
    </label>
  )
}

const INPUT_CLASS =
  'w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[13px] text-[var(--c-text-1)] outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20'

const PRIMARY_BTN =
  'rounded bg-indigo-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-indigo-500 disabled:opacity-50'

const SECONDARY_BTN =
  'rounded border border-[var(--c-border-2)] px-3 py-1.5 text-[12px] text-[var(--c-text-3)] hover:border-[var(--c-border-3)] hover:text-[var(--c-text-2)]'

function TenantFormModal({ existing, onClose }: { existing: AdminTenant | null; onClose: () => void }) {
  const { t } = useI18n()
  const create = useCreateTenant()
  const update = useUpdateTenant()
  const [name, setName] = useState(existing?.name ?? '')
  const [slug, setSlug] = useState(existing?.slug ?? '')
  const [active, setActive] = useState(existing?.is_active ?? true)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (existing) {
        await update.mutateAsync({ id: existing.id, body: { name, slug: slug || undefined, is_active: active } })
      } else {
        await create.mutateAsync({ name, slug: slug || undefined })
      }
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setError(e.response?.data?.detail || 'Failed')
    }
  }

  return (
    <ModalShell title={existing ? t('admin.editTenant') : t('admin.newTenant')} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <Field label={t('admin.tenant.name')}>
          <input className={INPUT_CLASS} value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label={t('admin.tenant.slug')} help={t('admin.tenant.slug.help')}>
          <input className={INPUT_CLASS} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder={existing?.slug ?? 'acme'} />
        </Field>
        {existing && (
          <label className="mb-3 flex items-center gap-2 text-[12px] text-[var(--c-text-2)]">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            {t('admin.tenant.active')}
          </label>
        )}
        {error && <div className="mb-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">{error}</div>}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={SECONDARY_BTN}>{t('btn.cancel')}</button>
          <button type="submit" disabled={create.isPending || update.isPending} className={PRIMARY_BTN}>
            {existing ? t('btn.save') : t('btn.create')}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function UserFormModal({ tenant, existing, onClose }: { tenant: AdminTenant; existing: AdminUser | null; onClose: () => void }) {
  const { t } = useI18n()
  const createUser = useCreateUser(tenant.id)
  const updateUser = useUpdateUser(tenant.id)

  const [email, setEmail] = useState(existing?.email ?? '')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState(existing?.display_name ?? '')
  const [role, setRole] = useState(existing?.role ?? 'member')
  const [superadmin, setSuperadmin] = useState(existing?.is_superadmin ?? false)
  const [active, setActive] = useState(existing?.is_active ?? true)
  const [mfaRequired, setMfaRequired] = useState(existing?.mfa_required ?? false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      if (existing) {
        await updateUser.mutateAsync({
          id: existing.id,
          body: { display_name: displayName, role, is_active: active, is_superadmin: superadmin, mfa_required: mfaRequired },
        })
      } else {
        await createUser.mutateAsync({
          email, password, display_name: displayName || undefined, role, is_superadmin: superadmin,
        })
      }
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setError(e.response?.data?.detail || 'Failed')
    }
  }

  return (
    <ModalShell title={existing ? t('admin.editUser') : t('admin.newUser')} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <Field label={t('admin.user.email')}>
          <input
            className={INPUT_CLASS}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!!existing}
            required
            autoFocus={!existing}
          />
        </Field>
        {!existing && (
          <Field label={t('admin.user.password')}>
            <input className={INPUT_CLASS} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </Field>
        )}
        <Field label={t('admin.user.displayName')}>
          <input className={INPUT_CLASS} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label={t('admin.user.role')}>
          <select className={INPUT_CLASS} value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{t(`admin.user.role.${r}`)}</option>)}
          </select>
        </Field>
        <label className="mb-2 flex items-center gap-2 text-[12px] text-[var(--c-text-2)]">
          <input type="checkbox" checked={superadmin} onChange={(e) => setSuperadmin(e.target.checked)} />
          {t('admin.user.superadmin')}
        </label>
        {existing && (
          <>
            <label className="mb-2 flex items-center gap-2 text-[12px] text-[var(--c-text-2)]">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              {t('admin.user.active')}
            </label>
            <label className="mb-2 flex items-center gap-2 text-[12px] text-[var(--c-text-2)]">
              <input type="checkbox" checked={mfaRequired} onChange={(e) => setMfaRequired(e.target.checked)} />
              {t('admin.user.mfaRequired')}
            </label>
          </>
        )}
        {error && <div className="mb-3 mt-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">{error}</div>}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={SECONDARY_BTN}>{t('btn.cancel')}</button>
          <button type="submit" disabled={createUser.isPending || updateUser.isPending} className={PRIMARY_BTN}>
            {existing ? t('btn.save') : t('btn.create')}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function SetPasswordModal({ user, tenantId, onClose }: { user: AdminUser; tenantId: number; onClose: () => void }) {
  const { t } = useI18n()
  const setPw = useSetUserPassword(tenantId)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await setPw.mutateAsync({ id: user.id, password })
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setError(e.response?.data?.detail || 'Failed')
    }
  }

  return (
    <ModalShell title={`${t('admin.setPassword')} — ${user.email}`} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <Field label={t('admin.user.newPassword')}>
          <input className={INPUT_CLASS} type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        </Field>
        {error && <div className="mb-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">{error}</div>}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={SECONDARY_BTN}>{t('btn.cancel')}</button>
          <button type="submit" disabled={setPw.isPending} className={PRIMARY_BTN}>{t('btn.save')}</button>
        </div>
      </form>
    </ModalShell>
  )
}

function DeleteUserModal({ user, tenantId, onClose }: { user: AdminUser; tenantId: number; onClose: () => void }) {
  const { t } = useI18n()
  const del = useDeleteUser(tenantId)
  const [error, setError] = useState<string | null>(null)

  async function onConfirm() {
    setError(null)
    try {
      await del.mutateAsync(user.id)
      onClose()
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } }
      setError(e.response?.data?.detail || 'Failed')
    }
  }

  return (
    <ModalShell title={t('admin.deleteUser.confirm.title', { email: user.email })} onClose={onClose}>
      <div className="mb-4 flex gap-3 rounded-lg border border-red-500/25 bg-red-500/8 px-4 py-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
        <p className="text-[12px] text-[var(--c-text-2)]">{t('admin.deleteUser.confirm.body')}</p>
      </div>
      {error && <div className="mb-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">{error}</div>}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onClose} className={SECONDARY_BTN}>{t('btn.cancel')}</button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={del.isPending}
          className="flex h-7 items-center gap-1.5 rounded bg-red-600 px-4 text-[12px] font-medium text-white hover:bg-red-500 disabled:opacity-40"
        >
          {t('admin.deleteUser.confirm.submit')}
        </button>
      </div>
    </ModalShell>
  )
}

function InviteFormModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const create = useCreateInvite()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ email: string; link: string | null } | null>(null)
  const [copied, setCopied] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const inv = await create.mutateAsync({ email, role })
      setSent({ email: inv.email, link: inv.invite_url ?? null })
    } catch (err: unknown) {
      const ex = err as { response?: { data?: { detail?: string } } }
      setError(ex.response?.data?.detail || 'Failed')
    }
  }

  async function copyLink() {
    if (!sent?.link) return
    await navigator.clipboard.writeText(sent.link)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (sent) {
    return (
      <ModalShell title={t('admin.invite')} onClose={onClose}>
        <div className="mb-3 rounded border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-400">
          {t('admin.invite.sent', { email: sent.email })}
        </div>
        {sent.link && (
          <div className="mb-3">
            <div className="mb-1 text-[11px] uppercase tracking-widest text-[var(--c-text-5)]">{t('admin.invite.copyLink')}</div>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={sent.link}
                onClick={(e) => e.currentTarget.select()}
                className={`${INPUT_CLASS} font-mono text-[11px]`}
              />
              <button onClick={copyLink} className={SECONDARY_BTN}>
                <Copy size={11} className="-mt-0.5 mr-1 inline" />
                {copied ? t('admin.invite.linkCopied') : t('admin.invite.copyLink')}
              </button>
            </div>
            <p className="mt-2 text-[10px] text-[var(--c-text-4)]">
              Email delivery was attempted via Resend. If the recipient doesn’t receive it (e.g. free tier limits without a verified domain), share this link directly.
            </p>
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={PRIMARY_BTN}>{t('btn.close')}</button>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell title={t('admin.invite')} onClose={onClose}>
      <form onSubmit={onSubmit}>
        <Field label={t('admin.user.email')}>
          <input
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={INPUT_CLASS}
          />
        </Field>
        <Field label={t('admin.invite.role')}>
          <select className={INPUT_CLASS} value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r} value={r}>{t(`admin.user.role.${r}`)}</option>)}
          </select>
        </Field>
        {error && <div className="mb-3 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">{error}</div>}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className={SECONDARY_BTN}>{t('btn.cancel')}</button>
          <button type="submit" disabled={create.isPending} className={PRIMARY_BTN}>
            {t('admin.invite.submit')}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

function PendingInvitesPanel({ ownTenantId, selectedTenantId }: { ownTenantId: number; selectedTenantId: number }) {
  const { t, lang } = useI18n()
  const { data: invites } = useInvites()
  const revoke = useRevokeInvite()
  const resend = useResendInvite()
  const [toast, setToast] = useState<string | null>(null)

  // Invites are this-tenant scoped; only meaningful when viewing your own tenant.
  if (selectedTenantId !== ownTenantId) return null
  const pending = invites?.filter((i) => !i.accepted_at && !i.revoked_at) ?? []
  if (pending.length === 0) return null

  async function onCopy(inv: Invite) {
    if (!inv.invite_url) {
      // Re-issue to get a fresh URL — the original token is hashed and gone.
      const fresh = await resend.mutateAsync(inv.id)
      if (fresh.invite_url) await navigator.clipboard.writeText(fresh.invite_url)
    } else {
      await navigator.clipboard.writeText(inv.invite_url)
    }
    setToast(t('admin.invite.linkCopied'))
    setTimeout(() => setToast(null), 1500)
  }

  return (
    <div className="border-b border-[var(--c-border)] px-6 py-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-[var(--c-text-5)]">
        <Mail size={11} />
        {t('admin.pendingInvites')}
        <span className="rounded bg-[var(--c-surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--c-text-3)]">{pending.length}</span>
      </div>
      <div className="flex flex-col gap-1">
        {pending.map((inv) => (
          <div key={inv.id} className="flex items-center gap-2 rounded border border-[var(--c-border)] bg-[var(--c-surface-2)] px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-[var(--c-text-1)]">{inv.email}</div>
              <div className="truncate text-[10px] text-[var(--c-text-4)]">
                {t(`admin.user.role.${inv.role}`)} ·{' '}
                {t('admin.invite.expires', { when: formatDate(inv.expires_at, lang) })}
              </div>
            </div>
            <button
              onClick={() => onCopy(inv)}
              title={t('admin.invite.copyLink')}
              className="rounded p-1 text-[var(--c-text-4)] hover:text-[var(--c-text-2)] hover:bg-[var(--c-hover-3)]"
            >
              <Copy size={12} />
            </button>
            <button
              onClick={() => resend.mutate(inv.id)}
              title={t('admin.invite.resend')}
              className="rounded p-1 text-[var(--c-text-4)] hover:text-[var(--c-text-2)] hover:bg-[var(--c-hover-3)]"
            >
              <RotateCw size={12} />
            </button>
            <button
              onClick={() => revoke.mutate(inv.id)}
              title={t('admin.invite.revoke')}
              className="rounded p-1 text-[var(--c-text-4)] hover:text-red-400 hover:bg-red-500/10"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
      {toast && (
        <div className="mt-2 text-[11px] text-emerald-400">{toast}</div>
      )}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────

export function AdminPage() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const { sidebarOpen, openSidebar, closeSidebar } = useMobileSidebar()
  const { data: tenants } = useAdminTenants()
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null)
  const { data: users } = useAdminTenantUsers(selectedTenantId)

  const [showTenantModal, setShowTenantModal] = useState<{ existing: AdminTenant | null } | null>(null)
  const [showUserModal, setShowUserModal] = useState<{ existing: AdminUser | null } | null>(null)
  const [passwordModal, setPasswordModal] = useState<AdminUser | null>(null)
  const [deleteModal, setDeleteModal] = useState<AdminUser | null>(null)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [view, setView] = useState<'tenants' | 'integrations'>('tenants')

  const selectedTenant = useMemo(
    () => tenants?.find((t) => t.id === selectedTenantId) ?? null,
    [tenants, selectedTenantId],
  )

  // Auto-select the first tenant once data loads.
  useEffect(() => {
    if (selectedTenantId === null && tenants && tenants.length) setSelectedTenantId(tenants[0].id)
  }, [tenants, selectedTenantId])

  const sidebarEl = (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={closeSidebar} />
      )}
      <div className={['fixed inset-y-0 left-0 z-50 md:relative md:z-auto md:flex md:shrink-0', sidebarOpen ? 'flex' : 'hidden'].join(' ')}>
        <LeftSidebar />
      </div>
    </>
  )

  if (!user?.is_superadmin) {
    return (
      <div className="flex h-full w-full overflow-hidden">
        {sidebarEl}
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 text-[13px] text-[var(--c-text-3)]">
            <ShieldAlert size={14} className="text-amber-400" />
            {t('admin.access.denied')}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      {sidebarEl}

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--c-border)] px-4 md:px-6">
          <div className="flex items-center gap-3">
            <button
              className="rounded-md p-1.5 text-[var(--c-text-4)] hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-2)] md:hidden"
              onClick={openSidebar}
            >
              <Menu size={16} />
            </button>
            <div>
              <div className="text-[15px] font-medium text-[var(--c-text-1)]">{t('admin.title')}</div>
              <div className="hidden text-[11px] text-[var(--c-text-4)] sm:block">{t('admin.subtitle')}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--c-border-2)] p-0.5">
            <button
              onClick={() => setView('tenants')}
              className={['rounded px-2 py-1 text-[11px] transition-colors sm:px-3 sm:text-[12px]', view === 'tenants' ? 'bg-[var(--c-active)] text-[var(--c-text-1)]' : 'text-[var(--c-text-4)] hover:text-[var(--c-text-2)]'].join(' ')}
            >
              <span className="sm:hidden">{t('admin.tabShort.tenants')}</span>
              <span className="hidden sm:inline">{t('integrations.tab.tenants')}</span>
            </button>
            <button
              onClick={() => setView('integrations')}
              className={['rounded px-2 py-1 text-[11px] transition-colors sm:px-3 sm:text-[12px]', view === 'integrations' ? 'bg-[var(--c-active)] text-[var(--c-text-1)]' : 'text-[var(--c-text-4)] hover:text-[var(--c-text-2)]'].join(' ')}
            >
              {t('integrations.tab')}
            </button>
          </div>
        </div>

        {view === 'integrations' ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <IntegrationsPanel />
          </div>
        ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Tenant list — full width on mobile (hidden when tenant selected), fixed on desktop */}
          <div className={[
            'shrink-0 flex-col border-r border-[var(--c-border)]',
            'w-full md:flex md:w-[280px]',
            selectedTenantId !== null ? 'hidden md:flex' : 'flex',
          ].join(' ')}>
            <div className="flex items-center justify-between border-b border-[var(--c-border)] px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-[var(--c-text-5)]">
                <Building2 size={11} />
                {t('admin.tenants')}
              </div>
              <button
                onClick={() => setShowTenantModal({ existing: null })}
                className="flex items-center gap-1 rounded p-1 text-[var(--c-text-4)] hover:text-[var(--c-text-1)] hover:bg-[var(--c-hover-3)]"
                title={t('admin.newTenant')}
              >
                <Plus size={13} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {tenants?.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTenantId(t.id)}
                  className={[
                    'flex w-full items-start justify-between gap-2 border-b border-[var(--c-divider)] px-3 py-2.5 text-left transition-colors',
                    selectedTenantId === t.id
                      ? 'bg-[var(--c-active)]'
                      : 'hover:bg-[var(--c-hover-1)]',
                  ].join(' ')}
                  aria-label={t.name}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] text-[var(--c-text-1)]">{t.name}</div>
                    <div className="truncate text-[10px] text-[var(--c-text-4)]">/{t.slug}{!t.is_active && ' • inactive'}</div>
                  </div>
                  <div className="shrink-0 rounded bg-[var(--c-surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--c-text-3)]">
                    {t.user_count}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* User list — hidden on mobile unless tenant selected */}
          <div className={[
            'flex-1 flex-col overflow-hidden',
            selectedTenantId !== null ? 'flex' : 'hidden md:flex',
          ].join(' ')}>
            {!selectedTenant ? (
              <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--c-text-4)]">
                {t('admin.selectTenant')}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-[var(--c-border)] px-3 py-3 md:px-6">
                  <div className="flex items-center gap-2">
                    {/* Mobile back button */}
                    <button
                      className="rounded p-1 text-[var(--c-text-4)] hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-2)] md:hidden"
                      onClick={() => setSelectedTenantId(null)}
                    >
                      <ArrowLeft size={15} />
                    </button>
                    <Users size={13} className="text-[var(--c-text-4)]" />
                    <div className="text-[13px] text-[var(--c-text-2)]">
                      {selectedTenant.name}
                      <span className="ml-2 text-[var(--c-text-5)]">·</span>
                      <span className="ml-2 text-[var(--c-text-4)]">{selectedTenant.user_count} {selectedTenant.user_count === 1 ? 'user' : 'users'}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => setShowTenantModal({ existing: selectedTenant })}
                      className={SECONDARY_BTN}
                      title={t('admin.editTenant')}
                    >
                      <Pencil size={11} className="-mt-0.5 mr-1 inline" />
                      <span className="hidden sm:inline">{t('admin.editTenant')}</span>
                    </button>
                    {selectedTenant.id === user.tenant_id && (
                      <button onClick={() => setShowInviteModal(true)} className={SECONDARY_BTN} title={t('admin.invite')}>
                        <Mail size={11} className="-mt-0.5 mr-1 inline" />
                        <span className="hidden sm:inline">{t('admin.invite')}</span>
                      </button>
                    )}
                    <button onClick={() => setShowUserModal({ existing: null })} className={PRIMARY_BTN} title={t('admin.newUser')}>
                      <Plus size={12} className="-mt-0.5 mr-1 inline" />
                      <span className="hidden sm:inline">{t('admin.newUser')}</span>
                    </button>
                  </div>
                </div>

                <PendingInvitesPanel ownTenantId={user.tenant_id} selectedTenantId={selectedTenant.id} />

                <div className="flex-1 overflow-auto">
                  {(!users || users.length === 0) ? (
                    <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                      <div className="text-[13px] text-[var(--c-text-2)]">{t('admin.emptyTenant.title')}</div>
                      <div className="text-[11px] text-[var(--c-text-4)]">{t('admin.emptyTenant.body')}</div>
                    </div>
                  ) : (
                    <table className="w-full min-w-[560px]">
                      <thead>
                        <tr className="border-b border-[var(--c-border)] text-left text-[11px] font-medium text-[var(--c-text-5)]">
                          <th className="px-6 py-2 font-medium">{t('admin.user.email')}</th>
                          <th className="px-3 py-2 font-medium">{t('admin.user.role')}</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Sign-in</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--c-divider)]">
                        {users.map((u) => (
                          <tr key={u.id} className="hover:bg-[var(--c-hover-1)]">
                            <td className="px-6 py-2.5">
                              <div className="text-[13px] text-[var(--c-text-1)]">{u.display_name || u.email}</div>
                              <div className="text-[10px] text-[var(--c-text-4)]">{u.email}</div>
                            </td>
                            <td className="px-3 py-2.5 text-[12px] text-[var(--c-text-3)]">
                              {t(`admin.user.role.${u.role}`)}
                              {u.is_superadmin && (
                                <span className="ml-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-400">
                                  super
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-[11px]">
                              {u.is_active
                                ? <span className="text-emerald-400">Active</span>
                                : <span className="text-[var(--c-text-5)]">Inactive</span>}
                              {!u.has_password && (
                                <div className="text-[10px] text-amber-400">{t('admin.user.noPassword')}</div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-[11px] text-[var(--c-text-4)]">
                              {u.last_login_at
                                ? t('admin.user.lastLogin', { when: formatDate(u.last_login_at, lang) })
                                : t('admin.user.lastLogin.never')}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => setPasswordModal(u)}
                                  title={t('admin.setPassword')}
                                  className="rounded p-1 text-[var(--c-text-4)] hover:text-[var(--c-text-2)] hover:bg-[var(--c-hover-3)]"
                                >
                                  <KeyRound size={12} />
                                </button>
                                <button
                                  onClick={() => setShowUserModal({ existing: u })}
                                  title={t('btn.edit')}
                                  className="rounded p-1 text-[var(--c-text-4)] hover:text-[var(--c-text-2)] hover:bg-[var(--c-hover-3)]"
                                >
                                  <Pencil size={12} />
                                </button>
                                <button
                                  onClick={() => setDeleteModal(u)}
                                  title={t('admin.deleteUser')}
                                  className="rounded p-1 text-[var(--c-text-4)] hover:text-red-400 hover:bg-red-500/10"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        )}
      </div>

      {showTenantModal && (
        <TenantFormModal existing={showTenantModal.existing} onClose={() => setShowTenantModal(null)} />
      )}
      {showUserModal && selectedTenant && (
        <UserFormModal tenant={selectedTenant} existing={showUserModal.existing} onClose={() => setShowUserModal(null)} />
      )}
      {passwordModal && selectedTenant && (
        <SetPasswordModal user={passwordModal} tenantId={selectedTenant.id} onClose={() => setPasswordModal(null)} />
      )}
      {deleteModal && selectedTenant && (
        <DeleteUserModal user={deleteModal} tenantId={selectedTenant.id} onClose={() => setDeleteModal(null)} />
      )}
      {showInviteModal && (
        <InviteFormModal onClose={() => setShowInviteModal(false)} />
      )}
    </div>
  )
}

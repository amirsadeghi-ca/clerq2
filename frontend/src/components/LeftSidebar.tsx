import { Link, useLocation } from 'react-router-dom'
import { FolderOpen, GitBranch, BookOpen, Settings, HelpCircle, ClipboardCheck, BarChart3, LogOut, ShieldCheck, type LucideIcon } from 'lucide-react'
import { useI18n } from '../context/i18n'
import { useAuth } from '../context/auth'
import { APP_VERSION } from '../version'

function NavItem({ to, icon: Icon, label, active }: {
  to: string; icon: LucideIcon; label: string; active: boolean
}) {
  return (
    <Link
      to={to}
      className={[
        'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors',
        active
          ? 'bg-[var(--c-active)] text-[var(--c-text-1)] font-medium'
          : 'text-[var(--c-text-4)] hover:text-[var(--c-text-2)] hover:bg-[var(--c-hover-2)]',
      ].join(' ')}
    >
      <Icon size={14} strokeWidth={active ? 2 : 1.75} />
      {label}
    </Link>
  )
}

export function LeftSidebar() {
  const { pathname } = useLocation()
  const { t } = useI18n()
  const { user } = useAuth()
  const isCases = pathname === '/' || pathname === '/cases' || pathname.startsWith('/cases/')
  const isPolicies = pathname === '/validate' || pathname.startsWith('/policies')
  const isWorkflows = pathname === '/workflows' || pathname.startsWith('/workflows/')
  const isLibrary = pathname.startsWith('/library')
  const isInsights = pathname === '/insights'

  // Flag non-production environments at a glance (local dev, staging, preview).
  // Production is served from the public hostname; anything else shows a "dev" tag.
  const host = typeof window !== 'undefined' ? window.location.hostname : ''
  const isProd = host === 'interpret.genitechs.ca' || host === 'clerq2.genitechs.ca'

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-[var(--c-border)] bg-[var(--c-bg)]">
      {/* Brand */}
      <div className="flex h-[52px] items-center gap-2.5 border-b border-[var(--c-border)] px-4">
        <svg width="26" height="26" viewBox="0 0 1024 1024" fill="none" className="shrink-0">
          <path d="M384 212H586L708 334V740C708 781 675 814 634 814H390C349 814 316 781 316 740V280C316 242 346 212 384 212Z" fill="#6366f1"/>
          <path d="M586 212V334H708L586 212Z" fill="#4f46e5"/>
          <rect x="426" y="418" width="172" height="56" rx="28" fill="white"/>
          <rect x="486" y="418" width="52" height="278" rx="26" fill="white"/>
          <rect x="426" y="640" width="172" height="56" rx="28" fill="white"/>
        </svg>
        <span className="text-[13px] font-semibold tracking-tight text-[var(--c-text-1)]">Interpret</span>
        {!isProd && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400">
            dev
          </span>
        )}
        <span className="ml-auto rounded border border-[var(--c-border-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--c-text-4)]">
          v{APP_VERSION}
        </span>
      </div>

      {/* Nav */}
      <div className="flex flex-1 flex-col gap-px p-2">
        {/* Work section */}
        <p className="mb-1 px-2.5 pt-2 text-[11px] font-medium uppercase tracking-widest text-[var(--c-text-5)]">
          {t('nav.workspace')}
        </p>
        <NavItem to="/cases" icon={FolderOpen} label={t('nav.cases')} active={isCases} />
        <NavItem to="/insights" icon={BarChart3} label={t('nav.insights')} active={isInsights} />

        {/* Configure section */}
        <p className="mb-1 mt-3 px-2.5 text-[11px] font-medium uppercase tracking-widest text-[var(--c-text-5)]">
          {t('nav.configure')}
        </p>
        <NavItem to="/validate" icon={ClipboardCheck} label={t('nav.checks')} active={isPolicies} />
        <NavItem to="/workflows" icon={GitBranch} label={t('nav.workflows')} active={isWorkflows} />
        <NavItem to="/library" icon={BookOpen} label={t('nav.library')} active={isLibrary} />
        {user?.is_superadmin && (
          <NavItem to="/admin" icon={ShieldCheck} label={t('admin.menu')} active={pathname.startsWith('/admin')} />
        )}
      </div>

      {/* Bottom */}
      <div className="flex flex-col gap-px border-t border-[var(--c-border)] p-2">
        <NavItem to="/settings" icon={Settings} label={t('nav.settings')} active={pathname.startsWith('/settings')} />
        <NavItem to="/help" icon={HelpCircle} label={t('nav.help')} active={pathname === '/help'} />
        <AccountBlock />
      </div>
    </aside>
  )
}

function AccountBlock() {
  const { t } = useI18n()
  const { user, tenant, logout } = useAuth()
  if (!user) return null
  return (
    <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-[var(--c-border)] bg-[var(--c-surface-2)] px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] text-[var(--c-text-1)]">{user.display_name || user.email}</div>
        <div className="truncate text-[10px] text-[var(--c-text-4)]">{tenant?.name}</div>
      </div>
      <button
        onClick={() => { void logout() }}
        title={t('auth.signout')}
        className="rounded p-1 text-[var(--c-text-4)] transition-colors hover:bg-[var(--c-hover-3)] hover:text-[var(--c-text-2)]"
      >
        <LogOut size={13} />
      </button>
    </div>
  )
}

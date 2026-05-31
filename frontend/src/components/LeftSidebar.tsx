import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, GitBranch, BookOpen, Settings, HelpCircle, Mail, ClipboardCheck, BarChart3, type LucideIcon } from 'lucide-react'
import { useI18n } from '../context/i18n'

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
  const isDashboard = pathname === '/'
  const isPolicies = pathname === '/validate' || pathname.startsWith('/policies')
  const isWorkflows = pathname === '/workflows' || pathname.startsWith('/workflows/')
  const isLibrary = pathname.startsWith('/library')
  const isMail = pathname === '/mail'
  const isInsights = pathname === '/insights'

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-[var(--c-border)] bg-[var(--c-bg)]">
      {/* Brand */}
      <div className="flex h-[52px] items-center gap-2.5 border-b border-[var(--c-border)] px-4">
        <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[6px] bg-indigo-600">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 1L10.5 9H1.5L6 1Z" fill="white" />
          </svg>
        </div>
        <span className="text-[13px] font-semibold tracking-tight text-[var(--c-text-1)]">Clerq2</span>
        <span className="ml-auto rounded border border-[var(--c-border-2)] px-1.5 py-0.5 text-[10px] text-[var(--c-text-4)]">
          {t('brand.beta')}
        </span>
      </div>

      {/* Nav */}
      <div className="flex flex-1 flex-col gap-px p-2">
        <p className="mb-1 px-2.5 pt-2 text-[11px] font-medium uppercase tracking-widest text-[var(--c-text-5)]">
          {t('nav.workspace')}
        </p>
        <NavItem to="/" icon={LayoutDashboard} label={t('nav.dashboard')} active={isDashboard} />
        <NavItem to="/validate" icon={ClipboardCheck} label={t('nav.checks')} active={isPolicies} />
        <NavItem to="/workflows" icon={GitBranch} label={t('nav.workflows')} active={isWorkflows} />
        <NavItem to="/library" icon={BookOpen} label={t('nav.library')} active={isLibrary} />
        <NavItem to="/mail" icon={Mail} label={t('nav.mail')} active={isMail} />
        <NavItem to="/insights" icon={BarChart3} label={t('nav.insights')} active={isInsights} />
      </div>

      {/* Bottom */}
      <div className="flex flex-col gap-px border-t border-[var(--c-border)] p-2">
        <NavItem to="/settings" icon={Settings} label={t('nav.settings')} active={pathname === '/settings'} />
        <NavItem to="/help" icon={HelpCircle} label={t('nav.help')} active={pathname === '/help'} />
      </div>
    </aside>
  )
}

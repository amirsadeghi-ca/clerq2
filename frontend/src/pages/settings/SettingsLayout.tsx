import { NavLink, Outlet } from 'react-router-dom'
import { User as UserIcon, Sun, Languages, Sparkles, Menu, type LucideIcon } from 'lucide-react'
import { LeftSidebar } from '../../components/LeftSidebar'
import { useI18n } from '../../context/i18n'
import { useMobileSidebar } from '../../hooks/useMobileSidebar'

interface SectionEntry {
  to: string
  icon: LucideIcon
  labelKey: string
  descKey: string
}

const SECTIONS: SectionEntry[] = [
  { to: 'account',    icon: UserIcon,  labelKey: 'settings.section.account',    descKey: 'settings.section.account.desc'    },
  { to: 'appearance', icon: Sun,       labelKey: 'settings.section.appearance', descKey: 'settings.section.appearance.desc' },
  { to: 'language',   icon: Languages, labelKey: 'settings.section.language',   descKey: 'settings.section.language.desc'   },
  { to: 'ai',         icon: Sparkles,  labelKey: 'settings.section.ai',         descKey: 'settings.section.ai.desc'         },
]

export function SettingsLayout() {
  const { t } = useI18n()
  const { sidebarOpen, openSidebar, closeSidebar } = useMobileSidebar()

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={closeSidebar} />
      )}
      <div className={['fixed inset-y-0 left-0 z-50 md:relative md:z-auto md:flex md:shrink-0', sidebarOpen ? 'flex' : 'hidden'].join(' ')}>
        <LeftSidebar />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--c-border)] px-4 md:px-8">
          <button
            className="rounded-md p-1.5 text-[var(--c-text-4)] hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-2)] md:hidden"
            onClick={openSidebar}
          >
            <Menu size={16} />
          </button>
          <h1 className="text-[14px] font-semibold text-[var(--c-text-1)]">{t('settings.title')}</h1>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Section sub-nav — desktop sidebar */}
          <aside className="hidden w-[220px] shrink-0 flex-col border-r border-[var(--c-border)] bg-[var(--c-bg)] p-3 md:flex">
            {SECTIONS.map((s) => {
              const Icon = s.icon
              return (
                <NavLink
                  key={s.to}
                  to={s.to}
                  className={({ isActive }) =>
                    [
                      'flex items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors',
                      isActive
                        ? 'bg-[var(--c-active)] text-[var(--c-text-1)]'
                        : 'text-[var(--c-text-3)] hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-2)]',
                    ].join(' ')
                  }
                >
                  <Icon size={14} className="mt-0.5 shrink-0" strokeWidth={1.75} />
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium leading-tight">{t(s.labelKey)}</div>
                    <div className="text-[10px] leading-snug text-[var(--c-text-5)]">{t(s.descKey)}</div>
                  </div>
                </NavLink>
              )
            })}
          </aside>

          {/* Content area — includes mobile tab strip above */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Mobile tab strip */}
            <div className="flex shrink-0 overflow-x-auto border-b border-[var(--c-border)] md:hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {SECTIONS.map((s) => {
                const Icon = s.icon
                return (
                  <NavLink
                    key={s.to}
                    to={s.to}
                    className={({ isActive }) =>
                      [
                        'flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-[12px] font-medium transition-colors',
                        isActive
                          ? 'border-indigo-500 text-[var(--c-text-1)]'
                          : 'border-transparent text-[var(--c-text-4)] hover:text-[var(--c-text-2)]',
                      ].join(' ')
                    }
                  >
                    <Icon size={12} strokeWidth={1.75} />
                    {t(s.labelKey)}
                  </NavLink>
                )
              })}
            </div>

            {/* Single Outlet — shared by mobile and desktop */}
            <main className="min-w-0 flex-1 overflow-y-auto">
              <div className="px-4 py-6 md:mx-auto md:max-w-2xl md:px-8 md:py-8">
                <Outlet />
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  )
}

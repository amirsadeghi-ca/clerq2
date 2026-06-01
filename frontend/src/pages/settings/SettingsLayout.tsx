import { NavLink, Outlet } from 'react-router-dom'
import { User as UserIcon, Sun, Languages, Sparkles, type LucideIcon } from 'lucide-react'
import { LeftSidebar } from '../../components/LeftSidebar'
import { useI18n } from '../../context/i18n'

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
  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      <LeftSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-[52px] shrink-0 items-center border-b border-[var(--c-border)] px-8">
          <h1 className="text-[14px] font-semibold text-[var(--c-text-1)]">{t('settings.title')}</h1>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Section sub-nav */}
          <aside className="flex w-[240px] shrink-0 flex-col border-r border-[var(--c-border)] bg-[var(--c-bg)] p-3">
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

          {/* Section content */}
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-2xl px-8 py-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

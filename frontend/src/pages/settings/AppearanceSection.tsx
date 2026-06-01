import type React from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme, type ThemeMode } from '../../context/theme'
import { useI18n } from '../../context/i18n'

export function AppearanceSection() {
  const { mode, setMode } = useTheme()
  const { t } = useI18n()

  const OPTIONS: { value: ThemeMode; label: string; icon: React.ElementType; desc: string }[] = [
    { value: 'light',  label: t('settings.theme.light'),  icon: Sun,     desc: t('settings.theme.light.desc') },
    { value: 'dark',   label: t('settings.theme.dark'),   icon: Moon,    desc: t('settings.theme.dark.desc') },
    { value: 'system', label: t('settings.theme.system'), icon: Monitor, desc: t('settings.theme.system.desc') },
  ]

  return (
    <>
      <header className="mb-6">
        <h2 className="text-[16px] font-semibold text-[var(--c-text-1)]">{t('settings.section.appearance')}</h2>
        <p className="text-[12px] text-[var(--c-text-4)]">{t('settings.section.appearance.desc')}</p>
      </header>

      <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
        <label className="mb-3 block text-[12px] font-medium text-[var(--c-text-3)]">{t('settings.theme')}</label>
        <div className="grid grid-cols-3 gap-2">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon
            const active = mode === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                className={[
                  'flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors',
                  active
                    ? 'border-indigo-500/50 bg-indigo-600/10 text-[var(--c-text-2)]'
                    : 'border-[var(--c-border-2)] text-[var(--c-text-4)] hover:border-[var(--c-border-3)] hover:text-[var(--c-text-2)]',
                ].join(' ')}
              >
                <Icon size={18} strokeWidth={1.75} />
                <span className="text-[12px] font-medium">{opt.label}</span>
                <span className="text-[10px] leading-snug text-[var(--c-text-5)]">{opt.desc}</span>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

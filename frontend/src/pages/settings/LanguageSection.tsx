import { useI18n, type Lang } from '../../context/i18n'

export function LanguageSection() {
  const { lang, setLang, t } = useI18n()
  const OPTIONS: { value: Lang; label: string; desc: string }[] = [
    { value: 'en', label: t('settings.language.en'), desc: t('settings.language.en.desc') },
    { value: 'fr', label: t('settings.language.fr'), desc: t('settings.language.fr.desc') },
  ]

  return (
    <>
      <header className="mb-6">
        <h2 className="text-[16px] font-semibold text-[var(--c-text-1)]">{t('settings.section.language')}</h2>
        <p className="text-[12px] text-[var(--c-text-4)]">{t('settings.section.language.desc')}</p>
      </header>

      <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
        <label className="mb-3 block text-[12px] font-medium text-[var(--c-text-3)]">{t('settings.language.label')}</label>
        <div className="grid grid-cols-2 gap-2">
          {OPTIONS.map((opt) => {
            const active = lang === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setLang(opt.value)}
                className={[
                  'flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors',
                  active
                    ? 'border-indigo-500/50 bg-indigo-600/10 text-[var(--c-text-2)]'
                    : 'border-[var(--c-border-2)] text-[var(--c-text-4)] hover:border-[var(--c-border-3)] hover:text-[var(--c-text-2)]',
                ].join(' ')}
              >
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

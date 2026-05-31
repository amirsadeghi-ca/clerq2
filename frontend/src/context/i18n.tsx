import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { dictionary, type Lang } from '../lib/i18n/dictionary'

export type { Lang }

type Vars = Record<string, string | number>

interface I18nContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, vars?: Vars) => string
}

function detectInitial(): Lang {
  const stored = localStorage.getItem('lang')
  if (stored === 'en' || stored === 'fr') return stored
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  )
}

const I18nContext = createContext<I18nContextValue>({
  lang: 'en',
  setLang: () => {},
  t: (key) => key,
})

export function useI18n() {
  return useContext(I18nContext)
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitial)

  useEffect(() => {
    document.documentElement.setAttribute('lang', lang === 'fr' ? 'fr-CA' : 'en')
  }, [lang])

  function setLang(l: Lang) {
    localStorage.setItem('lang', l)
    setLangState(l)
  }

  function t(key: string, vars?: Vars): string {
    const table = dictionary[lang] || dictionary.en
    const raw = table[key] ?? dictionary.en[key] ?? key
    return interpolate(raw, vars)
  }

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  )
}

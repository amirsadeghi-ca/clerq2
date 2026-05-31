import React, { useState, useEffect } from 'react'
import { Settings2, Eye, EyeOff, CheckCircle2, XCircle, Loader2, Zap, Sun, Moon, Monitor, Languages } from 'lucide-react'
import { LeftSidebar } from '../components/LeftSidebar'
import { useSettings, useUpdateSettings, useOpenRouterModels, useTestConnection } from '../api/settings'
import { useTheme, type ThemeMode } from '../context/theme'
import { useI18n, type Lang } from '../context/i18n'

export function Settings() {
  const { mode, setMode } = useTheme()
  const { lang, setLang, t } = useI18n()

  const THEME_OPTIONS: { value: ThemeMode; label: string; icon: React.ElementType; desc: string }[] = [
    { value: 'light',  label: t('settings.theme.light'),  icon: Sun,     desc: t('settings.theme.light.desc') },
    { value: 'dark',   label: t('settings.theme.dark'),   icon: Moon,    desc: t('settings.theme.dark.desc') },
    { value: 'system', label: t('settings.theme.system'), icon: Monitor, desc: t('settings.theme.system.desc') },
  ]

  const LANG_OPTIONS: { value: Lang; label: string; desc: string }[] = [
    { value: 'en', label: t('settings.language.en'), desc: t('settings.language.en.desc') },
    { value: 'fr', label: t('settings.language.fr'), desc: t('settings.language.fr.desc') },
  ]

  const { data, isLoading } = useSettings()
  const update = useUpdateSettings()
  const testConn = useTestConnection()

  const keySet = data?.openrouter_api_key_set ?? false

  // Models are fetched only after a successful test — gate on testVerified state
  const [testVerified, setTestVerified] = useState(false)
  const { data: models, isLoading: modelsLoading } = useOpenRouterModels(testVerified && keySet)

  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (data && !dirty) {
      setApiKey(data.openrouter_api_key)
      setModel(data.openrouter_default_model)
    }
  }, [data, dirty])

  function markDirty() {
    setDirty(true)
    setSaved(false)
  }

  function markKeyDirty() {
    markDirty()
    setTestVerified(false)
    testConn.reset()
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    await update.mutateAsync({ openrouter_api_key: apiKey, openrouter_default_model: model })
    setSaved(true)
    setDirty(false)
  }

  async function handleTest() {
    const result = await testConn.mutateAsync()
    if (result.ok) setTestVerified(true)
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      <LeftSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-[52px] shrink-0 items-center border-b border-[var(--c-border)] px-8">
          <h1 className="text-[14px] font-semibold text-[var(--c-text-1)]">{t('settings.title')}</h1>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-8">
          {isLoading ? (
            <p className="text-[13px] text-[var(--c-text-4)]">{t('common.loading')}</p>
          ) : (
            <form onSubmit={handleSave} className="max-w-lg space-y-8">

              {/* Language */}
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Languages size={14} className="text-[var(--c-text-4)]" />
                  <h2 className="text-[13px] font-semibold text-[var(--c-text-2)]">{t('settings.language')}</h2>
                </div>
                <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
                  <label className="mb-3 block text-[12px] font-medium text-[var(--c-text-3)]">{t('settings.language.label')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {LANG_OPTIONS.map(opt => {
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
              </section>

              {/* Appearance */}
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Sun size={14} className="text-[var(--c-text-4)]" />
                  <h2 className="text-[13px] font-semibold text-[var(--c-text-2)]">{t('settings.appearance')}</h2>
                </div>
                <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
                  <label className="mb-3 block text-[12px] font-medium text-[var(--c-text-3)]">{t('settings.theme')}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {THEME_OPTIONS.map(opt => {
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
              </section>

              {/* OpenRouter section */}
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Settings2 size={14} className="text-[var(--c-text-4)]" />
                  <h2 className="text-[13px] font-semibold text-[var(--c-text-2)]">{t('settings.openrouter')}</h2>
                </div>

                <div className="space-y-5 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
                  {/* API Key */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-medium text-[var(--c-text-3)]">{t('settings.apiKey')}</label>
                    <div className="relative flex items-center">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={e => { setApiKey(e.target.value); markKeyDirty() }}
                        placeholder="sk-or-..."
                        className="w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-3 py-2 pr-9 text-[13px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(v => !v)}
                        className="absolute right-2.5 text-[var(--c-text-5)] transition-colors hover:text-[var(--c-text-3)]"
                        tabIndex={-1}
                      >
                        {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    {keySet && !dirty && (
                      <p className="flex items-center gap-1 text-[11px] text-emerald-500/80">
                        <CheckCircle2 size={11} /> {t('settings.apiKey.set')}
                      </p>
                    )}
                    <p className="text-[11px] text-[var(--c-text-5)]">
                      {t('settings.apiKey.help')}
                    </p>
                  </div>

                  {/* Default Model — only shown after test passes */}
                  {testVerified && (
                    <div className="space-y-1.5 border-t border-[var(--c-border)] pt-5">
                      <div className="flex items-center justify-between">
                        <label className="text-[12px] font-medium text-[var(--c-text-3)]">{t('settings.model')}</label>
                        {modelsLoading && (
                          <span className="flex items-center gap-1 text-[11px] text-[var(--c-text-5)]">
                            <Loader2 size={11} className="animate-spin" /> {t('settings.model.fetching')}
                          </span>
                        )}
                        {models && (
                          <span className="text-[11px] text-[var(--c-text-4)]">{t('settings.model.available', { count: models.length })}</span>
                        )}
                      </div>
                      <select
                        value={model}
                        onChange={e => { setModel(e.target.value); markDirty() }}
                        className="w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-3 py-2 text-[13px] text-[var(--c-text-1)] outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
                      >
                        {model && !models?.find(m => m.id === model) && (
                          <option value={model}>{model}</option>
                        )}
                        {models?.map(m => (
                          <option key={m.id} value={m.id}>{m.id}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </section>

              {/* Actions row */}
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={update.isPending || !dirty}
                  className="flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-4 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {update.isPending ? t('btn.saving') : t('settings.saveChanges')}
                </button>

                {keySet && !dirty && (
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testConn.isPending}
                    className="flex h-7 items-center gap-1.5 rounded border border-[var(--c-border-2)] px-3 text-[12px] text-[var(--c-text-3)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-2)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {testConn.isPending
                      ? <><Loader2 size={12} className="animate-spin" /> {t('settings.testing')}</>
                      : <><Zap size={12} /> {t('settings.test')}</>
                    }
                  </button>
                )}

                {saved && !dirty && (
                  <span className="flex items-center gap-1 text-[12px] text-emerald-500/80">
                    <CheckCircle2 size={13} /> {t('settings.saved')}
                  </span>
                )}
              </div>

              {/* Test result banner */}
              {testConn.data && (
                <div className={[
                  'flex items-start gap-2 rounded-lg border px-4 py-3 text-[13px]',
                  testConn.data.ok
                    ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
                    : 'border-red-500/20 bg-red-500/5 text-red-400',
                ].join(' ')}>
                  {testConn.data.ok
                    ? <CheckCircle2 size={14} className="mt-px shrink-0" />
                    : <XCircle size={14} className="mt-px shrink-0" />
                  }
                  <div>
                    {testConn.data.ok
                      ? t('settings.connected', { response: testConn.data.response ?? '' })
                      : testConn.data.error
                    }
                  </div>
                </div>
              )}

              {update.isError && (
                <p className="text-[12px] text-red-400">
                  {t('settings.saveFailed', { error: update.error?.message ?? '' })}
                </p>
              )}
            </form>
          )}
        </main>
      </div>
    </div>
  )
}

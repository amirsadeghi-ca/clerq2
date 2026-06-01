import React, { useEffect, useState } from 'react'
import { CheckCircle2, Eye, EyeOff, Loader2, Sparkles, XCircle, Zap } from 'lucide-react'
import { useSettings, useUpdateSettings, useOpenRouterModels, useTestConnection } from '../../api/settings'
import { useI18n } from '../../context/i18n'

export function AiSection() {
  const { t } = useI18n()
  const { data, isLoading } = useSettings()
  const update = useUpdateSettings()
  const testConn = useTestConnection()

  const keySet = data?.openrouter_api_key_set ?? false
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

  function markDirty() { setDirty(true); setSaved(false) }
  function markKeyDirty() { markDirty(); setTestVerified(false); testConn.reset() }

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
    <>
      <header className="mb-6">
        <h2 className="text-[16px] font-semibold text-[var(--c-text-1)]">{t('settings.section.ai')}</h2>
        <p className="text-[12px] text-[var(--c-text-4)]">{t('settings.section.ai.desc')}</p>
      </header>

      {isLoading ? (
        <p className="text-[13px] text-[var(--c-text-4)]">{t('common.loading')}</p>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          <section>
            <div className="mb-4 flex items-center gap-2">
              <Sparkles size={14} className="text-[var(--c-text-4)]" />
              <h3 className="text-[13px] font-semibold text-[var(--c-text-2)]">{t('settings.openrouter')}</h3>
            </div>

            <div className="space-y-5 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-[var(--c-text-3)]">{t('settings.apiKey')}</label>
                <div className="relative flex items-center">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); markKeyDirty() }}
                    placeholder="sk-or-..."
                    className="w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-3 py-2 pr-9 text-[13px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
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
                <p className="text-[11px] text-[var(--c-text-5)]">{t('settings.apiKey.help')}</p>
              </div>

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
                      <span className="text-[11px] text-[var(--c-text-4)]">
                        {t('settings.model.available', { count: models.length })}
                      </span>
                    )}
                  </div>
                  <select
                    value={model}
                    onChange={(e) => { setModel(e.target.value); markDirty() }}
                    className="w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-3 py-2 text-[13px] text-[var(--c-text-1)] outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
                  >
                    {model && !models?.find((m) => m.id === model) && (
                      <option value={model}>{model}</option>
                    )}
                    {models?.map((m) => (
                      <option key={m.id} value={m.id}>{m.id}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </section>

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
                  : <><Zap size={12} /> {t('settings.test')}</>}
              </button>
            )}

            {saved && !dirty && (
              <span className="flex items-center gap-1 text-[12px] text-emerald-500/80">
                <CheckCircle2 size={13} /> {t('settings.saved')}
              </span>
            )}
          </div>

          {testConn.data && (
            <div
              className={[
                'flex items-start gap-2 rounded-lg border px-4 py-3 text-[13px]',
                testConn.data.ok
                  ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
                  : 'border-red-500/20 bg-red-500/5 text-red-400',
              ].join(' ')}
            >
              {testConn.data.ok ? <CheckCircle2 size={14} className="mt-px shrink-0" /> : <XCircle size={14} className="mt-px shrink-0" />}
              <div>
                {testConn.data.ok
                  ? t('settings.connected', { response: testConn.data.response ?? '' })
                  : testConn.data.error}
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
    </>
  )
}

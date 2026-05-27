import React, { useState, useEffect } from 'react'
import { Settings2, Eye, EyeOff, CheckCircle2, XCircle, Loader2, Zap, Sun, Moon, Monitor } from 'lucide-react'
import { LeftSidebar } from '../components/LeftSidebar'
import { useSettings, useUpdateSettings, useOpenRouterModels, useTestConnection } from '../api/settings'
import { useTheme, type ThemeMode } from '../context/theme'

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: React.ElementType; desc: string }[] = [
  { value: 'light',  label: 'Light',  icon: Sun,     desc: 'Always use light mode' },
  { value: 'dark',   label: 'Dark',   icon: Moon,    desc: 'Always use dark mode' },
  { value: 'system', label: 'System', icon: Monitor, desc: 'Follow OS preference' },
]

export function Settings() {
  const { mode, setMode } = useTheme()
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
          <h1 className="text-[14px] font-semibold text-[var(--c-text-1)]">Settings</h1>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-8">
          {isLoading ? (
            <p className="text-[13px] text-[var(--c-text-4)]">Loading…</p>
          ) : (
            <form onSubmit={handleSave} className="max-w-lg space-y-8">

              {/* Appearance */}
              <section>
                <div className="mb-4 flex items-center gap-2">
                  <Sun size={14} className="text-[var(--c-text-4)]" />
                  <h2 className="text-[13px] font-semibold text-[var(--c-text-2)]">Appearance</h2>
                </div>
                <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
                  <label className="mb-3 block text-[12px] font-medium text-[var(--c-text-3)]">Theme</label>
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
                  <h2 className="text-[13px] font-semibold text-[var(--c-text-2)]">OpenRouter</h2>
                </div>

                <div className="space-y-5 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] p-5">
                  {/* API Key */}
                  <div className="space-y-1.5">
                    <label className="text-[12px] font-medium text-[var(--c-text-3)]">API Key</label>
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
                        <CheckCircle2 size={11} /> API key is set
                      </p>
                    )}
                    <p className="text-[11px] text-[var(--c-text-5)]">
                      Used for all AI vision calls. Get a key at openrouter.ai.
                    </p>
                  </div>

                  {/* Default Model — only shown after test passes */}
                  {testVerified && (
                    <div className="space-y-1.5 border-t border-[var(--c-border)] pt-5">
                      <div className="flex items-center justify-between">
                        <label className="text-[12px] font-medium text-[var(--c-text-3)]">Default model</label>
                        {modelsLoading && (
                          <span className="flex items-center gap-1 text-[11px] text-[var(--c-text-5)]">
                            <Loader2 size={11} className="animate-spin" /> Fetching models…
                          </span>
                        )}
                        {models && (
                          <span className="text-[11px] text-[var(--c-text-4)]">{models.length} models available</span>
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
                  {update.isPending ? 'Saving…' : 'Save changes'}
                </button>

                {keySet && !dirty && (
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={testConn.isPending}
                    className="flex h-7 items-center gap-1.5 rounded border border-[var(--c-border-2)] px-3 text-[12px] text-[var(--c-text-3)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-2)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {testConn.isPending
                      ? <><Loader2 size={12} className="animate-spin" /> Testing…</>
                      : <><Zap size={12} /> Test connection</>
                    }
                  </button>
                )}

                {saved && !dirty && (
                  <span className="flex items-center gap-1 text-[12px] text-emerald-500/80">
                    <CheckCircle2 size={13} /> Saved
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
                      ? <>Connected — model replied: <span className="font-medium">"{testConn.data.response}"</span></>
                      : testConn.data.error
                    }
                  </div>
                </div>
              )}

              {update.isError && (
                <p className="text-[12px] text-red-400">
                  Failed to save: {update.error?.message}
                </p>
              )}
            </form>
          )}
        </main>
      </div>
    </div>
  )
}

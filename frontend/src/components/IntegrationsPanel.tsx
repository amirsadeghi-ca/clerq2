import React, { useEffect, useState } from 'react'
import { CheckCircle2, Copy, Eye, EyeOff, Loader2, Mail, XCircle, Zap } from 'lucide-react'
import {
  useIntegrations, useUpdateIntegrations, useTestEmailIntegration,
  type IntegrationsUpdate,
} from '../api/integrations'
import { useI18n } from '../context/i18n'

const INPUT =
  'w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-3 py-2 text-[13px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20'

function SecretField({
  label, help, isSet, value, onChange, placeholder,
}: {
  label: string; help?: string; isSet: boolean
  value: string; onChange: (v: string) => void; placeholder: string
}) {
  const { t } = useI18n()
  const [show, setShow] = useState(false)
  return (
    <div className="space-y-1.5">
      <label className="text-[12px] font-medium text-[var(--c-text-3)]">{label}</label>
      <div className="relative flex items-center">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isSet ? '••••••••••••  ' + t('integrations.set') : placeholder}
          className={INPUT + ' pr-9'}
        />
        <button type="button" onClick={() => setShow((v) => !v)} tabIndex={-1}
          className="absolute right-2.5 text-[var(--c-text-5)] hover:text-[var(--c-text-3)]">
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      {isSet && !value && (
        <p className="flex items-center gap-1 text-[11px] text-emerald-500/80">
          <CheckCircle2 size={11} /> {t('integrations.configured')}
        </p>
      )}
      {help && <p className="text-[11px] text-[var(--c-text-5)]">{help}</p>}
    </div>
  )
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium text-[var(--c-text-4)]">{label}</div>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded border border-[var(--c-border)] bg-[var(--c-surface-2)] px-2.5 py-1.5 text-[12px] text-[var(--c-text-2)]">
          {value}
        </code>
        <button
          type="button"
          onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
          className="shrink-0 rounded border border-[var(--c-border-2)] p-1.5 text-[var(--c-text-4)] hover:border-[var(--c-border-3)] hover:text-[var(--c-text-2)]"
        >
          {copied ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  )
}

export function IntegrationsPanel() {
  const { t } = useI18n()
  const { data, isLoading } = useIntegrations()
  const update = useUpdateIntegrations()
  const test = useTestEmailIntegration()

  const [apiKey, setApiKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [domain, setDomain] = useState('')
  const [fromAddress, setFromAddress] = useState('')
  const [fromName, setFromName] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data && !dirty) {
      setDomain(data.mail_inbound_domain)
      setFromAddress(data.invite_from_address)
      setFromName(data.invite_from_name)
    }
  }, [data, dirty])

  function mark() { setDirty(true); setSaved(false) }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const body: IntegrationsUpdate = {
      mail_inbound_domain: domain,
      invite_from_address: fromAddress,
      invite_from_name: fromName,
    }
    if (apiKey) body.resend_api_key = apiKey
    if (webhookSecret) body.resend_inbound_webhook_secret = webhookSecret
    await update.mutateAsync(body)
    setApiKey(''); setWebhookSecret('')
    setDirty(false); setSaved(true)
  }

  if (isLoading || !data) {
    return <div className="p-6 text-[13px] text-[var(--c-text-4)]">{t('common.loading')}</div>
  }

  const exampleAddress = `policy-3@${domain || data.mail_inbound_domain}`

  return (
    <div className="mx-auto w-full max-w-[680px] p-6">
      <header className="mb-6">
        <h2 className="text-[16px] font-semibold text-[var(--c-text-1)]">{t('integrations.title')}</h2>
        <p className="text-[12px] text-[var(--c-text-4)]">{t('integrations.subtitle')}</p>
      </header>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Email (Resend) card */}
        <section className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)]">
          <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-5 py-3">
            <div className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px] bg-indigo-500/15 text-indigo-400">
              <Mail size={13} />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-[var(--c-text-1)]">{t('integrations.email.title')}</h3>
              <p className="text-[11px] text-[var(--c-text-4)]">{t('integrations.email.desc')}</p>
            </div>
          </div>

          <div className="space-y-5 p-5">
            <SecretField
              label={t('integrations.apiKey')}
              help={t('integrations.apiKey.help')}
              isSet={data.resend_api_key_set}
              value={apiKey}
              onChange={(v) => { setApiKey(v); mark() }}
              placeholder="re_..."
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-[var(--c-text-3)]">{t('integrations.fromAddress')}</label>
                <input value={fromAddress} onChange={(e) => { setFromAddress(e.target.value); mark() }}
                  placeholder="noreply@email.example.com" className={INPUT} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-[var(--c-text-3)]">{t('integrations.fromName')}</label>
                <input value={fromName} onChange={(e) => { setFromName(e.target.value); mark() }}
                  placeholder="Interpret" className={INPUT} />
              </div>
            </div>

            <div className="border-t border-[var(--c-border)] pt-5">
              <h4 className="mb-3 text-[12px] font-semibold text-[var(--c-text-2)]">{t('integrations.inbound')}</h4>
              <div className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-[var(--c-text-3)]">{t('integrations.inboundDomain')}</label>
                  <input value={domain} onChange={(e) => { setDomain(e.target.value); mark() }}
                    placeholder="email.example.com" className={INPUT} />
                  <p className="text-[11px] text-[var(--c-text-5)]">{t('integrations.inboundDomain.help', { address: exampleAddress })}</p>
                </div>

                <SecretField
                  label={t('integrations.webhookSecret')}
                  help={t('integrations.webhookSecret.help')}
                  isSet={data.resend_inbound_webhook_secret_set}
                  value={webhookSecret}
                  onChange={(v) => { setWebhookSecret(v); mark() }}
                  placeholder="whsec_..."
                />

                {/* Setup helpers */}
                <div className="space-y-3 rounded-md border border-[var(--c-border)] bg-[var(--c-surface-2)] p-4">
                  <p className="text-[11px] text-[var(--c-text-4)]">{t('integrations.setup.intro')}</p>
                  <CopyRow label={t('integrations.setup.webhookUrl')} value={data.webhook_url} />
                  <CopyRow label={t('integrations.setup.mx')} value={`${data.inbound_mx_value}  (priority ${data.inbound_mx_priority})`} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={update.isPending || !dirty}
            className="flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-4 text-[12px] font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40">
            {update.isPending ? t('btn.saving') : t('settings.saveChanges')}
          </button>

          <button type="button" onClick={() => test.mutate()} disabled={test.isPending || !data.resend_api_key_set}
            className="flex h-7 items-center gap-1.5 rounded border border-[var(--c-border-2)] px-3 text-[12px] text-[var(--c-text-3)] hover:border-[var(--c-border-3)] hover:text-[var(--c-text-2)] disabled:cursor-not-allowed disabled:opacity-40">
            {test.isPending
              ? <><Loader2 size={12} className="animate-spin" /> {t('integrations.testing')}</>
              : <><Zap size={12} /> {t('integrations.sendTest')}</>}
          </button>

          {saved && !dirty && (
            <span className="flex items-center gap-1 text-[12px] text-emerald-500/80">
              <CheckCircle2 size={13} /> {t('settings.saved')}
            </span>
          )}
        </div>

        {test.data && (
          <div className={[
            'flex items-start gap-2 rounded-lg border px-4 py-3 text-[13px]',
            test.data.ok ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
                         : 'border-red-500/20 bg-red-500/5 text-red-400',
          ].join(' ')}>
            {test.data.ok ? <CheckCircle2 size={14} className="mt-px shrink-0" /> : <XCircle size={14} className="mt-px shrink-0" />}
            <div>{test.data.ok ? (test.data.detail ?? t('integrations.testOk')) : test.data.error}</div>
          </div>
        )}

        {update.isError && (
          <p className="text-[12px] text-red-400">{t('settings.saveFailed', { error: (update.error as Error)?.message ?? '' })}</p>
        )}
      </form>
    </div>
  )
}

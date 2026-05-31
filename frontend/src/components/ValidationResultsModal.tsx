import { X, CheckCircle2, XCircle, AlertCircle, ShieldCheck } from 'lucide-react'
import type { ValidationRuleResult } from '../types/workflow'
import { useI18n } from '../context/i18n'

interface Props {
  policyName: string
  overall: 'pass' | 'fail' | 'needs_review'
  results: ValidationRuleResult[]
  onClose: () => void
}

const OVERALL_STYLES: Record<string, { badge: string; bg: string; labelKey: string }> = {
  pass:         { badge: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25', bg: 'bg-emerald-500/5',  labelKey: 'validate.overall.pass' },
  fail:         { badge: 'text-red-400 bg-red-500/10 border-red-500/25',             bg: 'bg-red-500/5',     labelKey: 'validate.overall.fail' },
  needs_review: { badge: 'text-amber-400 bg-amber-500/10 border-amber-500/25',       bg: 'bg-amber-500/5',   labelKey: 'validate.overall.needs_review' },
}

const STATUS_ORDER: Record<string, number> = { fail: 0, uncertain: 1, pass: 2, not_applicable: 3 }

const RULE_STYLES: Record<string, { icon: JSX.Element; labelKey: string; text: string; border: string; bg: string }> = {
  pass:      { icon: <CheckCircle2 size={18} className="text-emerald-400" />, labelKey: 'verdict.pass',      text: 'text-emerald-400', border: 'border-emerald-500/15', bg: '' },
  fail:      { icon: <XCircle size={18} className="text-red-400" />,          labelKey: 'verdict.fail',      text: 'text-red-400',     border: 'border-red-500/20',     bg: 'bg-red-500/[0.02]' },
  uncertain: { icon: <AlertCircle size={18} className="text-amber-400" />,    labelKey: 'verdict.uncertain', text: 'text-amber-400',   border: 'border-amber-500/15',   bg: 'bg-amber-500/[0.02]' },
}

const REQ_LABEL_KEYS: Record<string, string> = {
  required:    'validate.results.requirement.required',
  optional:    'validate.results.requirement.optional',
  conditional: 'validate.results.requirement.conditional',
}

const REQ_BADGE: Record<string, string> = {
  required:    'text-[var(--c-text-4)] bg-[var(--c-surface-3)]',
  optional:    'text-[var(--c-text-5)] bg-[var(--c-surface-3)]',
  conditional: 'text-amber-400/80 bg-amber-500/10',
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = pct >= 85 ? 'bg-emerald-400' : pct >= 60 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 rounded-full bg-[var(--c-border-2)]">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right font-mono text-[12px] text-[var(--c-text-4)]">{pct}%</span>
    </div>
  )
}

export function ValidationResultsModal({ policyName, overall, results, onClose }: Props) {
  const { t } = useI18n()
  const sorted = [...results].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)
  )

  const nFail = results.filter(r => r.status === 'fail').length
  const nUnc  = results.filter(r => r.status === 'uncertain').length
  const nPass = results.filter(r => r.status === 'pass').length

  const overall_s = OVERALL_STYLES[overall]

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--c-bg)] text-[var(--c-text-1)]">
      {/* Top bar */}
      <header className="flex h-[56px] shrink-0 items-center gap-4 border-b border-[var(--c-border)] bg-[var(--c-surface)] px-8">
        <div className="flex h-[28px] w-[28px] items-center justify-center rounded-[6px] bg-violet-500/15">
          <ShieldCheck size={14} className="text-violet-400" strokeWidth={2} />
        </div>
        <div className="flex flex-col">
          <span className="text-[13px] font-semibold text-[var(--c-text-1)]">{t('validate.results.title')}</span>
          <span className="text-[11px] text-[var(--c-text-4)]">{policyName}</span>
        </div>
        <span className={`ml-1 rounded border px-2.5 py-0.5 text-[11px] font-semibold ${overall_s?.badge ?? ''}`}>
          {overall_s ? t(overall_s.labelKey) : overall}
        </span>

        <div className="ml-auto flex items-center gap-6">
          {nFail > 0 && (
            <span className="flex items-center gap-1.5 text-[13px] text-red-400">
              <XCircle size={13} /> {t('validate.results.nFailed', { count: nFail })}
            </span>
          )}
          {nUnc > 0 && (
            <span className="flex items-center gap-1.5 text-[13px] text-amber-400">
              <AlertCircle size={13} /> {t('validate.results.nUncertain', { count: nUnc })}
            </span>
          )}
          {nPass > 0 && (
            <span className="flex items-center gap-1.5 text-[13px] text-emerald-400">
              <CheckCircle2 size={13} /> {t('validate.results.nPassed', { count: nPass })}
            </span>
          )}
          <button
            onClick={onClose}
            className="ml-4 rounded p-1.5 text-[var(--c-text-4)] transition-colors hover:bg-[var(--c-hover-3)] hover:text-[var(--c-text-2)]"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-3xl flex flex-col gap-4">
          {sorted.map((result, i) => {
            const s = RULE_STYLES[result.status]
            const hasExtracted = result.extracted && Object.keys(result.extracted).length > 0
            return (
              <div
                key={i}
                className={`rounded-xl border ${s?.border ?? 'border-[var(--c-border-2)]'} ${s?.bg ?? ''} bg-[var(--c-surface)] px-6 py-5`}
              >
                {/* Rule header */}
                <div className="flex items-start gap-4">
                  <div className="mt-0.5 shrink-0">{s?.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className={`text-[15px] font-semibold ${s?.text ?? 'text-[var(--c-text-1)]'}`}>
                        {result.rule_name}
                      </h3>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${REQ_BADGE[result.requirement] ?? ''}`}>
                        {REQ_LABEL_KEYS[result.requirement] ? t(REQ_LABEL_KEYS[result.requirement]) : result.requirement}
                      </span>
                      <span className={`ml-auto text-[12px] font-medium ${s?.text ?? ''}`}>
                        {s ? t(s.labelKey) : result.status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Evidence */}
                {result.evidence && (
                  <div className="mt-4 ml-[34px]">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">
                      {t('common.evidence')}
                    </p>
                    <p className="text-[13px] leading-relaxed text-[var(--c-text-2)]">
                      {result.evidence}
                    </p>
                  </div>
                )}

                {/* Confidence */}
                <div className="mt-4 ml-[34px]">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">
                    {t('common.confidence')}
                  </p>
                  <ConfidenceBar value={result.confidence} />
                </div>

                {/* Extracted */}
                {hasExtracted && (
                  <div className="mt-4 ml-[34px]">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">
                      {t('validate.extracted')}
                    </p>
                    <div className="rounded-lg border border-[var(--c-border)] bg-[var(--c-surface-2)] px-4 py-3 flex flex-col gap-1.5">
                      {Object.entries(result.extracted).map(([k, v]) => (
                        <div key={k} className="flex gap-3 text-[12px]">
                          <span className="shrink-0 text-[var(--c-text-4)]">{k}</span>
                          <span className="font-mono text-[var(--c-text-2)]">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}

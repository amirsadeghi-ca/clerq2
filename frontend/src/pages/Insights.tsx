import { useState } from 'react'
import {
  BarChart3, FileCheck2, Files, AlertTriangle, Timer, UserCheck, PencilLine,
  Download, Loader2, ChevronDown,
} from 'lucide-react'
import { LeftSidebar } from '../components/LeftSidebar'
import { useI18n } from '../context/i18n'
import { usePolicies } from '../api/policies'
import { useInsights, type Insights as InsightsData } from '../api/metrics'

// ── helpers ──────────────────────────────────────────────────────────────

function fmtDuration(secs: number | null, t: (k: string, v?: any) => string): string {
  if (secs === null || secs === undefined) return '—'
  if (secs < 60) return t('insights.seconds', { n: Math.round(secs) })
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}m ${s}s`
}

function fmtPct(rate: number | null): string {
  if (rate === null || rate === undefined) return '—'
  return `${Math.round(rate * 100)}%`
}

const VERDICT_COLORS: Record<string, string> = {
  pass: '#10b981',
  fail: '#ef4444',
  needs_review: '#f59e0b',
}

function exportCsv(data: InsightsData, t: (k: string) => string) {
  const header = [
    t('insights.col.dossier'), t('insights.col.policy'), t('insights.col.date'),
    t('insights.col.docs'), t('insights.col.verdict'), t('insights.col.nonconf'),
    t('insights.col.time'), t('insights.col.reviewed'),
  ]
  const verdictLabel = (v: string | null) =>
    v === 'pass' ? t('insights.verdict.pass')
      : v === 'fail' ? t('insights.verdict.fail')
        : v === 'needs_review' ? t('insights.verdict.needs_review') : ''
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = data.per_run.map(r => [
    r.name ?? `#${r.id}`,
    r.policy_name ?? '',
    r.created_at ? r.created_at.slice(0, 10) : '',
    r.documents,
    verdictLabel(r.overall_effective),
    r.nonconformities,
    r.duration_seconds ?? '',
    r.finalized ? t('insights.finalized') : r.reviewed ? t('insights.draft') : '',
  ])
  // Summary block on top, then per-run detail.
  const tot = data.totals
  const summary = [
    [t('insights.metric.processed'), tot.dossiers_processed],
    [t('insights.metric.documents'), tot.documents_processed],
    [t('insights.metric.nonconformities'), tot.nonconformities_detected],
    [t('insights.metric.avgTime'), tot.avg_rt_seconds ?? ''],
    [t('insights.metric.humanRate'), tot.human_validation_rate ?? ''],
    [t('insights.metric.corrections'), tot.corrections_after_generation],
  ]
  const lines = [
    ...summary.map(r => r.map(esc).join(',')),
    '',
    header.map(esc).join(','),
    ...rows.map(r => r.map(esc).join(',')),
  ]
  const csv = '﻿' + lines.join('\r\n') + '\r\n'
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `insights-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ── metric card ──────────────────────────────────────────────────────────

function MetricCard({ icon: Icon, label, value, hint, accent }: {
  icon: typeof BarChart3; label: string; value: string; hint: string; accent: string
}) {
  return (
    <div className="rounded-lg border border-[var(--c-border-2)] bg-[var(--c-surface)] p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px]" style={{ background: `${accent}26`, color: accent }}>
          <Icon size={13} />
        </div>
        <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--c-text-4)]">{label}</span>
      </div>
      <div className="mt-3 text-[28px] font-semibold leading-none text-[var(--c-text-1)] tabular-nums">{value}</div>
      <p className="mt-2 text-[11px] leading-snug text-[var(--c-text-5)]">{hint}</p>
    </div>
  )
}

// ── page ───────────────────────────────────────────────────────────────────

export function Insights() {
  const { t } = useI18n()
  const [policyId, setPolicyId] = useState<number | null>(null)
  const { data: policies } = usePolicies()
  const { data, isLoading } = useInsights(policyId, 'validate')

  const tot = data?.totals
  const verdicts = data?.verdict_breakdown ?? {}
  const verdictTotal = Object.values(verdicts).reduce((a, b) => a + b, 0) || 1
  const maxDay = Math.max(1, ...(data?.by_day ?? []).map(d => d.count))

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      <LeftSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--c-border)] px-8">
          <div className="flex items-center gap-3">
            <h1 className="text-[14px] font-semibold text-[var(--c-text-1)]">{t('insights.title')}</h1>
            <span className="hidden text-[12px] text-[var(--c-text-5)] sm:inline">{t('insights.subtitle')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={policyId ?? ''}
                onChange={e => setPolicyId(e.target.value ? Number(e.target.value) : null)}
                className="h-7 appearance-none rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface)] pl-3 pr-7 text-[12px] text-[var(--c-text-2)] outline-none focus:border-indigo-500/50"
              >
                <option value="">{t('insights.filter.allPolicies')}</option>
                {policies?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--c-text-5)]" />
            </div>
            <button
              onClick={() => data && exportCsv(data, t)}
              disabled={!data || data.per_run.length === 0}
              className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--c-border-2)] px-3 text-[12px] text-[var(--c-text-3)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-1)] disabled:opacity-40"
            >
              <Download size={12} /> {t('insights.exportCsv')}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-6">
          {isLoading ? (
            <div className="flex items-center gap-2 text-[13px] text-[var(--c-text-5)]"><Loader2 size={14} className="animate-spin" /> {t('insights.loading')}</div>
          ) : !data || data.per_run.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)]"><BarChart3 size={20} className="text-[var(--c-text-5)]" /></div>
              <p className="max-w-sm text-[13px] text-[var(--c-text-4)]">{t('insights.empty')}</p>
            </div>
          ) : (
            <div className="mx-auto max-w-[1100px]">
              {/* Metric cards */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <MetricCard icon={FileCheck2} accent="#6366f1" label={t('insights.metric.processed')} value={String(tot!.dossiers_processed)} hint={t('insights.metric.processedHint')} />
                <MetricCard icon={Files} accent="#06b6d4" label={t('insights.metric.documents')} value={String(tot!.documents_processed)} hint={t('insights.metric.documentsHint')} />
                <MetricCard icon={AlertTriangle} accent="#ef4444" label={t('insights.metric.nonconformities')} value={String(tot!.nonconformities_detected)} hint={t('insights.metric.nonconformitiesHint')} />
                <MetricCard icon={Timer} accent="#f59e0b" label={t('insights.metric.avgTime')} value={fmtDuration(tot!.avg_rt_seconds, t)} hint={t('insights.metric.avgTimeHint')} />
                <MetricCard icon={UserCheck} accent="#10b981" label={t('insights.metric.humanRate')} value={fmtPct(tot!.human_validation_rate)} hint={t('insights.metric.humanRateHint')} />
                <MetricCard icon={PencilLine} accent="#8b5cf6" label={t('insights.metric.corrections')} value={String(tot!.corrections_after_generation)} hint={t('insights.metric.correctionsHint')} />
              </div>

              {/* Verdict breakdown + load */}
              <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-[var(--c-border-2)] bg-[var(--c-surface)] p-4">
                  <h2 className="text-[12px] font-semibold text-[var(--c-text-2)]">{t('insights.verdicts.title')}</h2>
                  <div className="mt-3 flex flex-col gap-2.5">
                    {(['pass', 'fail', 'needs_review'] as const).map(v => {
                      const count = verdicts[v] ?? 0
                      const pct = Math.round((count / verdictTotal) * 100)
                      return (
                        <div key={v}>
                          <div className="mb-1 flex items-center justify-between text-[11px]">
                            <span className="text-[var(--c-text-3)]">{t(`insights.verdict.${v}`)}</span>
                            <span className="tabular-nums text-[var(--c-text-4)]">{count} · {pct}%</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-[var(--c-surface-3)]">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: VERDICT_COLORS[v] }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--c-border-2)] bg-[var(--c-surface)] p-4">
                  <h2 className="text-[12px] font-semibold text-[var(--c-text-2)]">{t('insights.load.title')}</h2>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--c-text-5)]">{t('insights.load.perDay')}</p>
                  <div className="mt-4 flex h-[120px] items-end gap-1.5">
                    {data.by_day.map(d => (
                      <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}: ${d.count}`}>
                        <span className="text-[10px] tabular-nums text-[var(--c-text-4)]">{d.count}</span>
                        <div className="w-full rounded-t bg-indigo-500/70" style={{ height: `${(d.count / maxDay) * 90}px` }} />
                        <span className="text-[9px] text-[var(--c-text-5)]">{d.date.slice(5)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Per-run table */}
              <div className="mt-6 overflow-hidden rounded-lg border border-[var(--c-border-2)] bg-[var(--c-surface)]">
                <div className="border-b border-[var(--c-border)] px-4 py-2.5">
                  <h2 className="text-[12px] font-semibold text-[var(--c-text-2)]">{t('insights.table.title')}</h2>
                </div>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-[var(--c-divider)] text-left text-[10px] uppercase tracking-wide text-[var(--c-text-5)]">
                      <th className="px-4 py-2 font-medium">{t('insights.col.dossier')}</th>
                      <th className="px-4 py-2 font-medium">{t('insights.col.date')}</th>
                      <th className="px-4 py-2 text-center font-medium">{t('insights.col.docs')}</th>
                      <th className="px-4 py-2 font-medium">{t('insights.col.verdict')}</th>
                      <th className="px-4 py-2 text-center font-medium">{t('insights.col.nonconf')}</th>
                      <th className="px-4 py-2 text-center font-medium">{t('insights.col.time')}</th>
                      <th className="px-4 py-2 text-center font-medium">{t('insights.col.reviewed')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--c-divider)]">
                    {data.per_run.map(r => {
                      const v = r.overall_effective
                      return (
                        <tr key={r.id} className="hover:bg-[var(--c-hover-1)]">
                          <td className="max-w-[260px] truncate px-4 py-2 text-[var(--c-text-2)]" title={r.name ?? ''}>{r.name ?? `#${r.id}`}</td>
                          <td className="px-4 py-2 text-[var(--c-text-4)] tabular-nums">{r.created_at?.slice(0, 10) ?? '—'}</td>
                          <td className="px-4 py-2 text-center tabular-nums text-[var(--c-text-3)]">{r.documents}</td>
                          <td className="px-4 py-2">
                            {v ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: VERDICT_COLORS[v] ?? '#888' }} />
                                <span className="text-[var(--c-text-2)]">{t(`insights.verdict.${v}`)}</span>
                              </span>
                            ) : <span className="text-[var(--c-text-5)]">—</span>}
                          </td>
                          <td className="px-4 py-2 text-center tabular-nums text-[var(--c-text-3)]">{r.nonconformities}</td>
                          <td className="px-4 py-2 text-center tabular-nums text-[var(--c-text-4)]">{fmtDuration(r.duration_seconds, t)}</td>
                          <td className="px-4 py-2 text-center">
                            {r.finalized ? (
                              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400">{t('insights.finalized')}</span>
                            ) : r.reviewed ? (
                              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">{t('insights.draft')}</span>
                            ) : <span className="text-[var(--c-text-5)]">{t('insights.notReviewed')}</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

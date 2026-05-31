import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ChevronLeft, Download, FileJson, FileSpreadsheet, Loader2, FileText,
  MessageSquarePlus, RotateCcw, CheckCircle2, Lock, Unlock,
} from 'lucide-react'
import { LeftSidebar } from '../components/LeftSidebar'
import { ReportView, REPORT_CSS, getValidationOutput } from '../components/ReportView'
import { useRun } from '../api/runs'
import { usePolicy } from '../api/policies'
import { useAnnotateFinding, useFinalizeReview, useReopenReview } from '../api/review'
import { exportReportJSON, exportReportCSV, printReportPDF } from '../lib/reportExport'
import { useI18n } from '../context/i18n'
import type { ValidationRuleResult, FindingAnnotation } from '../types/workflow'

// Verdict choices reuse the shared `verdict.*` keys for labels.
const VERDICT_OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'pass', labelKey: 'verdict.pass' },
  { value: 'fail', labelKey: 'verdict.fail' },
  { value: 'uncertain', labelKey: 'verdict.needs_review' },
  { value: 'not_applicable', labelKey: 'verdict.not_applicable' },
]

// Per-finding review controls (Add note / Change verdict). Lives in the report
// page; rendered via ReportView's renderFindingControls render-prop.
function FindingControls({ runId, result, annotation }: {
  runId: number
  result: ValidationRuleResult
  annotation: FindingAnnotation | undefined
}) {
  const { t } = useI18n()
  const annotate = useAnnotateFinding()
  const aiStatus = result.status
  const override = annotation?.override ?? null
  const effective = override?.status ?? aiStatus

  const [noteOpen, setNoteOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState(annotation?.note ?? '')
  const [pendingStatus, setPendingStatus] = useState<string | null>(null)
  const [reasonDraft, setReasonDraft] = useState('')

  const busy = annotate.isPending

  function pickVerdict(value: string) {
    if (value === aiStatus) {
      // Agreeing with the AI clears any override.
      if (override) annotate.mutate({ runId, ruleName: result.rule_name, clearOverride: true })
      setPendingStatus(null)
      return
    }
    setReasonDraft(override?.status === value ? (override.reason ?? '') : '')
    setPendingStatus(value)
  }

  function saveOverride() {
    if (!pendingStatus || !reasonDraft.trim()) return
    annotate.mutate(
      { runId, ruleName: result.rule_name, overrideStatus: pendingStatus, overrideReason: reasonDraft.trim() },
      { onSuccess: () => setPendingStatus(null) },
    )
  }

  function saveNote() {
    const t = noteDraft.trim()
    annotate.mutate(
      { runId, ruleName: result.rule_name, note: t, clearNote: t.length === 0 },
      { onSuccess: () => setNoteOpen(false) },
    )
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-[var(--c-border)] pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">{t('report.verdict')}</span>
        <div className="flex items-center gap-1">
          {VERDICT_OPTIONS.map(opt => {
            const active = effective === opt.value
            return (
              <button
                key={opt.value}
                disabled={busy}
                onClick={() => pickVerdict(opt.value)}
                className={[
                  'rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-50',
                  active
                    ? 'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/40'
                    : 'text-[var(--c-text-5)] hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-3)]',
                ].join(' ')}
                title={opt.value === aiStatus ? t('report.verdict.aiTitle') : t('report.verdict.overrideTitle')}
              >
                {t(opt.labelKey)}{opt.value === aiStatus ? ` ${t('report.verdict.aiSuffix')}` : ''}
              </button>
            )
          })}
        </div>
        {override && (
          <button
            disabled={busy}
            onClick={() => annotate.mutate({ runId, ruleName: result.rule_name, clearOverride: true })}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--c-text-5)] transition-colors hover:text-[var(--c-text-3)]"
          >
            <RotateCcw size={9} /> {t('report.resetToAi')}
          </button>
        )}
        <div className="flex-1" />
        <button
          disabled={busy}
          onClick={() => { setNoteDraft(annotation?.note ?? ''); setNoteOpen(v => !v) }}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-[var(--c-text-4)] transition-colors hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-2)]"
        >
          <MessageSquarePlus size={11} /> {annotation?.note ? t('report.editNote') : t('report.addNote')}
        </button>
      </div>

      {pendingStatus && (
        <div className="flex flex-col gap-1.5 rounded-md border border-indigo-500/30 bg-indigo-500/5 p-2.5">
          <span className="text-[10px] text-[var(--c-text-4)]">
            {t('report.reasonFor', { label: t(VERDICT_OPTIONS.find(o => o.value === pendingStatus)?.labelKey ?? '') })}
          </span>
          <textarea
            autoFocus
            value={reasonDraft}
            onChange={e => setReasonDraft(e.target.value)}
            placeholder={t('report.reasonPlaceholder')}
            rows={2}
            className="w-full resize-none rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-2.5 py-1.5 text-[12px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none focus:border-indigo-500/50"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={saveOverride}
              disabled={busy || !reasonDraft.trim()}
              className="flex h-6 items-center gap-1 rounded bg-indigo-600 px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
            >
              {busy && <Loader2 size={9} className="animate-spin" />} {t('report.saveOverride')}
            </button>
            <button
              onClick={() => setPendingStatus(null)}
              className="h-6 rounded px-2 text-[11px] text-[var(--c-text-5)] hover:text-[var(--c-text-3)]"
            >
              {t('btn.cancel')}
            </button>
          </div>
        </div>
      )}

      {noteOpen && (
        <div className="flex flex-col gap-1.5 rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface-2)] p-2.5">
          <textarea
            autoFocus
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            placeholder={t('report.notePlaceholder')}
            rows={2}
            className="w-full resize-none rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-2.5 py-1.5 text-[12px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none focus:border-indigo-500/50"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={saveNote}
              disabled={busy}
              className="flex h-6 items-center gap-1 rounded bg-indigo-600 px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
            >
              {busy && <Loader2 size={9} className="animate-spin" />} {t('report.saveNote')}
            </button>
            <button onClick={() => setNoteOpen(false)} className="h-6 rounded px-2 text-[11px] text-[var(--c-text-5)] hover:text-[var(--c-text-3)]">
              {t('btn.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ReportPage() {
  const { t, lang } = useI18n()
  const { runId } = useParams<{ runId: string }>()
  const id = runId ? Number(runId) : NaN
  const { data: run, isLoading, isError } = useRun(Number.isFinite(id) ? id : null)
  const { data: policy } = usePolicy(run?.policy_id ?? null)
  const output = getValidationOutput(run)
  const finalize = useFinalizeReview()
  const reopen = useReopenReview()

  const review = run?.review ?? null
  const finalized = review?.state === 'finalized'

  return (
    <div className="flex h-full min-w-0 flex-1 overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      <style>{REPORT_CSS}</style>
      <LeftSidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--c-border)] px-6">
          <Link to="/validate" className="flex items-center gap-1.5 text-[12px] text-[var(--c-text-5)] transition-colors hover:text-[var(--c-text-2)]">
            <ChevronLeft size={12} /> {t('report.cases')}
          </Link>
          <div className="h-3.5 w-px bg-[var(--c-border-2)]" />
          <FileText size={13} className="shrink-0 text-[var(--c-text-4)]" />
          <span className="max-w-[360px] truncate text-[13px] font-medium text-[var(--c-text-1)]">
            {run?.name ?? (isLoading ? t('common.loading') : t('report.runFallback', { id }))}
          </span>
          {finalized
            ? <span className="flex items-center gap-1 rounded bg-emerald-500/12 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 ring-1 ring-emerald-500/25"><Lock size={9} /> {t('report.finalized')}</span>
            : review && <span className="rounded bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 ring-1 ring-amber-500/25">{t('report.draft')}</span>}

          <div className="ml-auto flex items-center gap-2">
            {run && (
              <>
                <button onClick={() => exportReportCSV(run, output, t)} className="flex h-7 items-center gap-1.5 rounded border border-[var(--c-border-2)] px-3 text-[12px] text-[var(--c-text-3)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-1)]">
                  <FileSpreadsheet size={11} /> {t('report.export.csv')}
                </button>
                <button onClick={() => exportReportJSON(run, output)} className="flex h-7 items-center gap-1.5 rounded border border-[var(--c-border-2)] px-3 text-[12px] text-[var(--c-text-3)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-1)]">
                  <FileJson size={11} /> {t('report.export.json')}
                </button>
                <button onClick={() => printReportPDF(run, policy, output, t, lang)} className="flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-3 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500">
                  <Download size={11} /> {t('report.export.downloadPdf')}
                </button>
              </>
            )}
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-[var(--c-bg)] py-8">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-24 text-[12px] text-[var(--c-text-5)]">
              <Loader2 size={12} className="animate-spin" /> {t('report.loadingReport')}
            </div>
          )}
          {isError && (
            <div className="mx-auto max-w-[820px] px-6 py-12 text-center text-[13px] text-[var(--c-text-4)]">
              {t('report.couldNotLoad')}{' '}
              <Link to="/validate" className="text-indigo-400 hover:underline">{t('report.backToCases')}</Link>.
            </div>
          )}
          {!isLoading && !isError && run && (
            <ReportView
              run={run}
              policy={policy ?? undefined}
              output={output}
              review={review}
              renderFindingControls={finalized ? undefined : (result, annotation) => (
                <FindingControls runId={run.id} result={result} annotation={annotation} />
              )}
            />
          )}
        </div>

        {/* Sticky review action bar */}
        {run && output && (
          <div className="flex h-[56px] shrink-0 items-center gap-3 border-t border-[var(--c-border)] bg-[var(--c-surface)] px-6">
            {finalized ? (
              <>
                <CheckCircle2 size={15} className="text-emerald-400" />
                <span className="text-[13px] text-[var(--c-text-2)]">
                  {review?.finalized_at
                    ? t('report.reportFinalizedAt', { date: new Date(review.finalized_at).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en') })
                    : t('report.reportFinalized')}
                </span>
                <div className="ml-auto">
                  <button
                    onClick={() => reopen.mutate(run.id)}
                    disabled={reopen.isPending}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--c-border-2)] px-4 text-[12px] font-medium text-[var(--c-text-3)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-1)] disabled:opacity-40"
                  >
                    {reopen.isPending ? <Loader2 size={11} className="animate-spin" /> : <Unlock size={12} />}
                    {t('report.reopenToAmend')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="text-[12px] text-[var(--c-text-5)]">
                  {t('report.reviewPrompt')}
                </span>
                <div className="ml-auto">
                  <button
                    onClick={() => finalize.mutate(run.id)}
                    disabled={finalize.isPending}
                    className="flex h-8 items-center gap-2 rounded-lg bg-indigo-600 px-5 text-[13px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
                  >
                    {finalize.isPending ? <Loader2 size={12} className="animate-spin" /> : <Lock size={13} />}
                    {t('report.finalizeReport')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

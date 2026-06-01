import { useEffect, useRef, useState, useCallback } from 'react'
import { fileUrl } from '../lib/fileUrl'
import { useNavigate, Link } from 'react-router-dom'
import {
  ShieldCheck, Upload, X, CheckCircle2, XCircle, AlertCircle,
  Loader2, Circle, Search, FileText, ChevronLeft, ChevronRight, Mail, Plus, Trash2, Pencil,
  ExternalLink, Download, FileJson, FileSpreadsheet,
} from 'lucide-react'
import { LeftSidebar } from '../components/LeftSidebar'
import { useI18n } from '../context/i18n'
import { usePolicies, usePolicy, useCreatePolicy, useDeletePolicy } from '../api/policies'
import { useValidateRuns, useTriggerValidateRun } from '../api/validate'
import client from '../api/client'
import type {
  Policy, Run, RunStep, RunStatus, SSERunUpdate, ValidationOutput,
} from '../types/workflow'
import { exportReportJSON, exportReportCSV, printReportPDF } from '../lib/reportExport'

// ── Shared helpers ────────────────────────────────────────────────────────

const NODE_LABEL_KEYS: Record<string, string> = {
  input: 'validate.node.input',
  pdf_to_images: 'validate.node.pdf_to_images',
  validate_documents: 'validate.node.validate_documents',
  show_results: 'validate.node.show_results',
  output: 'validate.node.output',
}

const OVERALL_BADGE: Record<string, string> = {
  pass:         'text-emerald-400 bg-emerald-500/10 border border-emerald-500/25',
  fail:         'text-red-400 bg-red-500/10 border border-red-500/25',
  needs_review: 'text-amber-400 bg-amber-500/10 border border-amber-500/25',
}

const OVERALL_LABEL_KEYS: Record<string, string> = {
  pass: 'validate.overall.pass', fail: 'validate.overall.fail', needs_review: 'validate.overall.needs_review',
}

const RESULT_BADGE: Record<string, string> = {
  pass:           'text-emerald-400 bg-emerald-500/10 border border-emerald-500/25',
  fail:           'text-red-400 bg-red-500/10 border border-red-500/25',
  uncertain:      'text-amber-400 bg-amber-500/10 border border-amber-500/25',
  not_applicable: 'text-[var(--c-text-4)] bg-[var(--c-surface-3)] border border-[var(--c-border-2)]',
}

const RESULT_LABEL_KEYS: Record<string, string> = {
  pass: 'verdict.pass', fail: 'verdict.fail', uncertain: 'verdict.needs_review', not_applicable: 'verdict.not_applicable',
}

function timeAgo(iso: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (s < 5) return t('validate.time.justNow')
  if (s < 60) return t('validate.time.secondsAgo', { count: s })
  if (m < 60) return t('validate.time.minutesAgo', { count: m })
  if (h < 24) return t('validate.time.hoursAgo', { count: h })
  return t('validate.time.daysAgo', { count: d })
}

// ── Step chip ─────────────────────────────────────────────────────────────

function StepChip({ step }: { step: RunStep }) {
  const { t } = useI18n()
  const icon = step.status === 'completed' ? <CheckCircle2 size={10} className="text-emerald-400 shrink-0" />
    : step.status === 'running'   ? <Loader2 size={10} className="text-indigo-400 animate-spin shrink-0" />
    : step.status === 'failed'    ? <XCircle size={10} className="text-red-400 shrink-0" />
    : <Circle size={10} className="text-[var(--c-text-5)] shrink-0" />

  return (
    <div className={[
      'flex items-center gap-1.5 rounded px-2 py-1 border text-[10px] transition-colors',
      step.status === 'running'
        ? 'border-indigo-500/30 bg-indigo-500/8 text-indigo-400'
        : step.status === 'completed'
        ? 'border-[var(--c-border)] bg-[var(--c-surface-2)] text-[var(--c-text-4)]'
        : step.status === 'failed'
        ? 'border-red-500/20 bg-red-500/5 text-red-400'
        : 'border-[var(--c-border)] bg-[var(--c-surface-2)] text-[var(--c-text-5)]',
    ].join(' ')}>
      {icon}
      {NODE_LABEL_KEYS[step.node_type] ? t(NODE_LABEL_KEYS[step.node_type]) : step.node_type}
    </div>
  )
}

// ── Lightbox ──────────────────────────────────────────────────────────────

function ImageLightbox({ paths, index, onClose }: {
  paths: string[]; index: number; onClose: () => void
}) {
  const { t } = useI18n()
  const [i, setI] = useState(index)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setI(v => Math.min(v + 1, paths.length - 1))
      if (e.key === 'ArrowLeft')  setI(v => Math.max(v - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paths.length, onClose])

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90" onClick={onClose}>
      <button
        onClick={e => { e.stopPropagation(); setI(v => Math.max(v - 1, 0)) }}
        className="absolute left-4 rounded-full border border-[var(--c-border-3)] bg-[var(--c-surface)] p-2 text-[var(--c-text-3)] hover:text-[var(--c-text-1)] transition-colors"
      >
        <ChevronLeft size={14} />
      </button>
      <img
        src={fileUrl(`${paths[i]}`)}
        alt={t('validate.page', { n: i + 1 })}
        className="max-h-[90vh] max-w-[80vw] rounded object-contain shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
      <button
        onClick={e => { e.stopPropagation(); setI(v => Math.min(v + 1, paths.length - 1)) }}
        className="absolute right-4 rounded-full border border-[var(--c-border-3)] bg-[var(--c-surface)] p-2 text-[var(--c-text-3)] hover:text-[var(--c-text-1)] transition-colors"
      >
        <ChevronRight size={14} />
      </button>
      <div className="absolute bottom-4 text-[12px] text-[var(--c-text-4)]">{i + 1} / {paths.length}</div>
    </div>
  )
}

// ── Run detail modal ──────────────────────────────────────────────────────

type RuleStatus = 'pending' | 'running' | 'pass' | 'fail' | 'uncertain' | 'not_applicable'

function RunDetailModal({ run, onClose }: { run: Run; onClose: () => void }) {
  const { t, lang } = useI18n()
  const [liveSteps, setLiveSteps] = useState<RunStep[]>(run.steps)
  const [liveStatus, setLiveStatus] = useState<RunStatus>(run.status)
  const [selectedRuleIndex, setSelectedRuleIndex] = useState<number | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const esRef = useRef<EventSource | null>(null)

  const { data: policy } = usePolicy(run.policy_id)

  // SSE for active runs
  useEffect(() => {
    if (liveStatus === 'pending' || liveStatus === 'running') {
      const tok = localStorage.getItem('auth.access_token') || ''
      const es = new EventSource(`/api/runs/${run.id}/stream?access_token=${encodeURIComponent(tok)}`)
      esRef.current = es
      es.addEventListener('update', e => {
        const update = JSON.parse(e.data) as SSERunUpdate
        setLiveSteps(update.steps)
        setLiveStatus(update.status)
      })
      es.addEventListener('done', () => { es.close(); esRef.current = null })
      es.onerror = () => { es.close(); esRef.current = null }
    }
    return () => { esRef.current?.close() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (lightboxIndex !== null) return
      if (e.key === 'Escape') { onClose(); return }
      const ruleCount = policy?.rules.length ?? 0
      if (!ruleCount) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedRuleIndex(v => v === null ? 0 : Math.min(v + 1, ruleCount - 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedRuleIndex(v => v === null ? 0 : Math.max(v - 1, 0))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, policy?.rules.length, lightboxIndex])

  const validateStep = liveSteps.find(s => s.node_type === 'validate_documents')
  const isValidating = validateStep?.status === 'running'
  const validateDone = validateStep?.status === 'completed'
  const validationOutput = validateDone
    ? (validateStep?.output_data as unknown as ValidationOutput | null)
    : null

  const rules = policy?.rules ?? []
  const resultsByName = new Map((validationOutput?.results ?? []).map(r => [r.rule_name, r]))

  const imagePaths: string[] = (() => {
    for (const s of liveSteps) {
      const p = s.output_data?.image_paths
      if (Array.isArray(p) && p.length > 0) return p as string[]
    }
    return []
  })()

  const selectedRule = selectedRuleIndex !== null ? (rules[selectedRuleIndex] ?? null) : null
  const selectedResult = selectedRule ? (resultsByName.get(selectedRule.name) ?? null) : null

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="flex h-[80vh] w-[75vw] flex-col overflow-hidden rounded-xl border border-[var(--c-border-2)] bg-[var(--c-surface)] shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--c-border)] px-5">
            <div className={`h-2 w-2 shrink-0 rounded-full ${
              liveStatus === 'completed' ? 'bg-emerald-400'
              : liveStatus === 'failed'  ? 'bg-red-400'
              : liveStatus === 'running' ? 'bg-indigo-400 animate-pulse'
              : 'bg-[var(--c-text-5)]'
            }`} />
            <span className="max-w-[260px] truncate text-[14px] font-semibold text-[var(--c-text-1)]">
              {run.name ?? t('validate.run', { id: run.id })}
            </span>
            {validationOutput?.overall && (
              <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold ${OVERALL_BADGE[validationOutput.overall]}`}>
                {t(OVERALL_LABEL_KEYS[validationOutput.overall] ?? '')}
              </span>
            )}
            <div className="flex flex-1 items-center gap-0 overflow-hidden pl-1">
              {liveSteps.map((step, i) => (
                <div key={step.id} className="flex shrink-0 items-center gap-0">
                  <StepChip step={step} />
                  {i < liveSteps.length - 1 && (
                    <div className="mx-1 h-px w-3 bg-[var(--c-border-2)]" />
                  )}
                </div>
              ))}
              {liveSteps.length === 0 && (
                <span className="text-[11px] text-[var(--c-text-5)]">{t('validate.queued')}</span>
              )}
            </div>
            {validateDone && validationOutput && (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => exportReportCSV(run, validationOutput, t)}
                  title={t('validate.exportCsvTitle')}
                  className="flex h-7 items-center gap-1.5 rounded px-2 text-[11px] text-[var(--c-text-4)] transition-colors hover:bg-[var(--c-hover-3)] hover:text-[var(--c-text-1)]"
                >
                  <FileSpreadsheet size={11} /> CSV
                </button>
                <button
                  onClick={() => exportReportJSON(run, validationOutput)}
                  title={t('validate.exportJsonTitle')}
                  className="flex h-7 items-center gap-1.5 rounded px-2 text-[11px] text-[var(--c-text-4)] transition-colors hover:bg-[var(--c-hover-3)] hover:text-[var(--c-text-1)]"
                >
                  <FileJson size={11} /> JSON
                </button>
                <button
                  onClick={() => printReportPDF(run, policy ?? null, validationOutput, t, lang)}
                  title={t('validate.downloadPdfTitle')}
                  className="flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-2.5 text-[11px] font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  <Download size={11} /> PDF
                </button>
                <Link
                  to={`/reports/${run.id}`}
                  title={t('validate.openFullReport')}
                  className="flex h-7 items-center gap-1.5 rounded px-2 text-[11px] text-[var(--c-text-4)] transition-colors hover:bg-[var(--c-hover-3)] hover:text-[var(--c-text-1)]"
                >
                  <ExternalLink size={11} /> {t('btn.open')}
                </Link>
                <div className="mx-1 h-3.5 w-px bg-[var(--c-border-2)]" />
              </div>
            )}
            <button
              onClick={onClose}
              className="shrink-0 rounded p-1.5 text-[var(--c-text-4)] transition-colors hover:bg-[var(--c-hover-3)] hover:text-[var(--c-text-1)]"
            >
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* Left panel — rule list */}
            <div className="flex w-[260px] shrink-0 flex-col overflow-hidden border-r border-[var(--c-border)]">
              <div className="flex shrink-0 items-center justify-between border-b border-[var(--c-border)] px-4 py-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">{t('validate.rules')}</span>
                {isValidating && (
                  <div className="flex items-center gap-1.5">
                    <Loader2 size={10} className="animate-spin text-indigo-400" />
                    <span className="text-[10px] text-indigo-400">{t('validate.checking')}</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col divide-y divide-[var(--c-divider)] overflow-y-auto">
                {rules.length === 0 ? (
                  <div className="flex items-center gap-2 px-4 py-3 text-[12px] text-[var(--c-text-5)]">
                    <Loader2 size={10} className="animate-spin" /> {t('common.loading')}
                  </div>
                ) : rules.map((rule, i) => {
                  const result = resultsByName.get(rule.name)
                  const ruleStatus: RuleStatus = isValidating ? 'running'
                    : result ? result.status
                    : 'pending'
                  const isSelected = selectedRuleIndex === i

                  const icon = ruleStatus === 'pass'      ? <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />
                    : ruleStatus === 'fail'      ? <XCircle size={13} className="shrink-0 text-red-400" />
                    : ruleStatus === 'uncertain' ? <AlertCircle size={13} className="shrink-0 text-amber-400" />
                    : ruleStatus === 'running'   ? <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-400 animate-pulse" />
                    : <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--c-text-5)]" />

                  const nameColor = ruleStatus === 'fail'      ? 'text-red-300'
                    : ruleStatus === 'uncertain' ? 'text-amber-300'
                    : ruleStatus === 'pass'      ? 'text-[var(--c-text-1)]'
                    : ruleStatus === 'running'   ? 'text-indigo-300'
                    : 'text-[var(--c-text-4)]'

                  return (
                    <button
                      key={rule.id}
                      onClick={() => setSelectedRuleIndex(i)}
                      className={[
                        'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                        isSelected ? 'bg-[var(--c-active)]' : 'hover:bg-[var(--c-hover-2)]',
                      ].join(' ')}
                    >
                      {icon}
                      <span className={`flex-1 truncate text-[13px] leading-snug ${nameColor}`}>
                        {rule.name}
                      </span>
                      {rule.scope === 'cross_set' && (
                        <span className="shrink-0 rounded bg-violet-500/12 px-1.5 py-0.5 text-[9px] font-medium text-violet-400 ring-1 ring-violet-500/20" title={t('validate.badge.setTitle')}>
                          {t('validate.badge.set')}
                        </span>
                      )}
                      {rule.scope === 'any_document' && (
                        <span className="shrink-0 rounded bg-sky-500/12 px-1.5 py-0.5 text-[9px] font-medium text-sky-400 ring-1 ring-sky-500/20" title={t('validate.badge.anyTitle')}>
                          {t('validate.badge.any')}
                        </span>
                      )}
                      {result && (
                        <span className={`shrink-0 font-mono text-[11px] font-medium ${
                          result.status === 'pass' ? 'text-emerald-400'
                          : result.status === 'fail' ? 'text-red-400'
                          : result.status === 'uncertain' ? 'text-amber-400'
                          : 'text-[var(--c-text-4)]'
                        }`}>
                          {Math.round(result.confidence * 100)}%
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Right panel — evidence */}
            <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
              {selectedRule === null ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
                  <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--c-border)] bg-[var(--c-surface-2)]">
                    <ShieldCheck size={16} className="text-[var(--c-text-5)]" />
                  </div>
                  <p className="text-[13px] font-medium text-[var(--c-text-4)]">{t('validate.selectRule')}</p>
                  <p className="text-[11px] text-[var(--c-text-5)]">{t('validate.selectRuleHint')}</p>
                </div>
              ) : isValidating ? (
                <div className="flex flex-1 items-center justify-center gap-2 py-16">
                  <Loader2 size={14} className="animate-spin text-indigo-400" />
                  <span className="text-[13px] text-indigo-400">{t('validate.checkingRule', { name: selectedRule.name })}</span>
                </div>
              ) : selectedResult ? (
                <div className="flex flex-col gap-6 p-6">
                  {/* Rule header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1.5">
                      <h3 className="text-[15px] font-semibold text-[var(--c-text-1)]">{selectedRule.name}</h3>
                      <div className="flex items-center gap-1.5">
                        {selectedRule.scope === 'cross_set' && (
                          <span className="w-fit rounded bg-violet-500/12 px-1.5 py-0.5 text-[9px] font-medium text-violet-400 ring-1 ring-violet-500/20">
                            {t('validate.scope.crossSet')}
                          </span>
                        )}
                        {selectedRule.scope === 'any_document' && (
                          <span className="w-fit rounded bg-sky-500/12 px-1.5 py-0.5 text-[9px] font-medium text-sky-400 ring-1 ring-sky-500/20">
                            {t('validate.scope.anyDocument')}
                          </span>
                        )}
                        {selectedRule.requirement === 'optional' && (
                          <span className="w-fit rounded bg-[var(--c-surface-3)] px-1.5 py-0.5 text-[9px] text-[var(--c-text-5)]">
                            {t('common.optional')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className={`rounded px-2.5 py-1 text-[12px] font-semibold ${RESULT_BADGE[selectedResult.status]}`}>
                        {t(RESULT_LABEL_KEYS[selectedResult.status] ?? '')}
                      </span>
                      <span className={`font-mono text-[14px] font-bold ${
                        selectedResult.status === 'pass' ? 'text-emerald-400'
                        : selectedResult.status === 'fail' ? 'text-red-400'
                        : selectedResult.status === 'uncertain' ? 'text-amber-400'
                        : 'text-[var(--c-text-4)]'
                      }`}>
                        {Math.round(selectedResult.confidence * 100)}%
                      </span>
                    </div>
                  </div>

                  {/* Evidence */}
                  {selectedResult.evidence && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">
                        {t('common.evidence')}
                      </span>
                      <p className="text-[13px] leading-relaxed text-[var(--c-text-2)]">
                        {selectedResult.evidence}
                      </p>
                    </div>
                  )}

                  {/* Extracted data */}
                  {selectedResult.extracted && Object.keys(selectedResult.extracted).length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">
                        {t('validate.extracted')}
                      </span>
                      <div className="overflow-hidden rounded-lg border border-[var(--c-border-2)] bg-[var(--c-surface-2)]">
                        {Object.entries(selectedResult.extracted).map(([k, v], idx, arr) => (
                          <div
                            key={k}
                            className={`flex items-baseline gap-4 px-4 py-2.5 ${
                              idx < arr.length - 1 ? 'border-b border-[var(--c-divider)]' : ''
                            }`}
                          >
                            <span className="w-[140px] shrink-0 font-mono text-[11px] text-[var(--c-text-5)]">{k}</span>
                            <span className="flex-1 text-[12px] text-[var(--c-text-2)]">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Cross-set: documents compared */}
                  {selectedResult.scope === 'cross_set' && selectedResult.per_document && selectedResult.per_document.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">
                        {t('validate.documentsCompared', { count: selectedResult.per_document.length })}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedResult.per_document.map((pd, i) => (
                          <span
                            key={i}
                            className="flex items-center gap-1.5 rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-2.5 py-1.5 text-[11px] text-[var(--c-text-2)]"
                          >
                            <FileText size={11} className="shrink-0 text-[var(--c-text-4)]" />
                            <span className="truncate">{pd.document_filename}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Per-document breakdown (per-document rules only) */}
                  {selectedResult.scope !== 'cross_set' && selectedResult.per_document && selectedResult.per_document.length > 1 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">
                        {t('validate.perDocument')}
                      </span>
                      <div className="flex flex-col divide-y divide-[var(--c-divider)] overflow-hidden rounded-lg border border-[var(--c-border-2)]">
                        {selectedResult.per_document.map((pd, i) => (
                          <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                            <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${RESULT_BADGE[pd.status]}`}>
                              {t(RESULT_LABEL_KEYS[pd.status] ?? '')}
                            </span>
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="truncate text-[12px] font-medium text-[var(--c-text-2)]">{pd.document_filename}</span>
                              {pd.evidence && (
                                <p className="text-[11px] leading-relaxed text-[var(--c-text-4)]">{pd.evidence}</p>
                              )}
                            </div>
                            <span className={`shrink-0 font-mono text-[12px] font-bold ${
                              pd.status === 'pass' ? 'text-emerald-400'
                              : pd.status === 'fail' ? 'text-red-400'
                              : pd.status === 'uncertain' ? 'text-amber-400'
                              : 'text-[var(--c-text-4)]'
                            }`}>
                              {Math.round(pd.confidence * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Page thumbnails */}
                  {imagePaths.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">
                        {t('validate.pages', { count: imagePaths.length })}
                      </span>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {imagePaths.slice(0, 12).map((rel, idx) => (
                          <button
                            key={rel}
                            onClick={() => setLightboxIndex(idx)}
                            className="group relative h-[96px] w-[70px] shrink-0 overflow-hidden rounded-md border border-[var(--c-border)] bg-[var(--c-surface-3)] transition-[border-color,box-shadow] hover:border-[var(--c-border-3)] hover:shadow-[0_0_0_1px_rgba(99,102,241,0.2)]"
                          >
                            <img
                              src={fileUrl(`${rel}`)}
                              alt={t('validate.page', { n: idx + 1 })}
                              className="h-full w-full object-contain"
                              loading="lazy"
                            />
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent py-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <span className="block text-center text-[9px] text-white">{idx + 1}</span>
                            </div>
                          </button>
                        ))}
                        {imagePaths.length > 12 && (
                          <button
                            onClick={() => setLightboxIndex(12)}
                            className="flex h-[96px] w-[70px] shrink-0 items-center justify-center rounded-md border border-[var(--c-border)] bg-[var(--c-surface-3)] text-[11px] font-medium text-[var(--c-text-4)] transition-colors hover:border-[var(--c-border-3)]"
                          >
                            +{imagePaths.length - 12}
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center py-16">
                  <p className="text-[12px] text-[var(--c-text-5)]">{t('validate.noResultForRule')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {lightboxIndex !== null && (
        <ImageLightbox
          paths={imagePaths}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  )
}

// ── Run item (simplified row) ─────────────────────────────────────────────

function RunItem({ run, onOpen }: { run: Run; onOpen: (run: Run) => void }) {
  const { t } = useI18n()
  const statusDot = run.status === 'completed' ? 'bg-emerald-400'
    : run.status === 'failed'  ? 'bg-red-400'
    : run.status === 'running' ? 'bg-indigo-400 animate-pulse'
    : 'bg-[var(--c-text-5)]'

  const statusLabel = run.status === 'completed' ? <span className="text-emerald-400">{t('status.completed')}</span>
    : run.status === 'failed'  ? <span className="text-red-400">{t('status.failed')}</span>
    : run.status === 'running' ? <span className="text-indigo-400">{t('status.running')}</span>
    : <span className="text-[var(--c-text-5)]">{t('status.pending')}</span>

  return (
    <div
      className="flex cursor-pointer items-center gap-3 border-b border-[var(--c-border)] px-4 py-3 last:border-0 transition-colors hover:bg-[var(--c-hover-1)]"
      onClick={() => onOpen(run)}
    >
      <div className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} />
      <span className="flex-1 truncate text-[13px] font-medium text-[var(--c-text-1)]">
        {run.name ?? t('validate.run', { id: run.id })}
      </span>
      {run.source === 'mail' && (
        <span className="flex shrink-0 items-center gap-1 rounded bg-[var(--c-surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--c-text-4)]" title={run.sender_email ?? t('validate.viaEmail')}>
          <Mail size={9} />
          {t('validate.mail')}
        </span>
      )}
      {run.document_ids && run.document_ids.length > 1 && (
        <span className="flex shrink-0 items-center gap-1 rounded bg-[var(--c-surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--c-text-4)]">
          <FileText size={9} />
          {t('validate.nDocs', { count: run.document_ids.length })}
        </span>
      )}
      <span className="shrink-0 text-[11px] font-medium">{statusLabel}</span>
      <span className="shrink-0 text-[10px] text-[var(--c-text-5)]">{timeAgo(run.created_at, t)}</span>
      <ChevronRight size={12} className="shrink-0 text-[var(--c-text-5)]" />
    </div>
  )
}

// ── Policy picker item ────────────────────────────────────────────────────

function PolicyItem({
  policy,
  selected,
  onSelect,
  onEdit,
  onDelete,
}: {
  policy: Policy
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useI18n()
  return (
    <div
      className={[
        'group relative flex w-full flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer',
        selected
          ? 'border-indigo-500/40 bg-indigo-500/8'
          : 'border-[var(--c-border)] hover:border-[var(--c-border-3)] hover:bg-[var(--c-hover-2)]',
      ].join(' ')}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <ShieldCheck size={12} className={selected ? 'text-indigo-400' : 'text-violet-400'} />
        <span className={`flex-1 truncate text-[12px] font-medium ${selected ? 'text-indigo-300' : 'text-[var(--c-text-1)]'}`}>
          {policy.name}
        </span>
        <span className="shrink-0 rounded bg-[var(--c-surface-3)] px-1.5 py-0.5 text-[9px] text-[var(--c-text-5)] group-hover:opacity-0 transition-opacity">
          {policy.rules.length !== 1 ? t('validate.nRules_plural', { count: policy.rules.length }) : t('validate.nRules', { count: policy.rules.length })}
        </span>
        <div className="absolute right-2 top-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={e => { e.stopPropagation(); onEdit() }}
            className="rounded p-1 text-[var(--c-text-5)] transition-colors hover:bg-[var(--c-hover-3)] hover:text-[var(--c-text-2)]"
            title={t('validate.editPolicy')}
          >
            <Pencil size={11} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); if (confirm(t('validate.deleteConfirm', { name: policy.name }))) onDelete() }}
            className="rounded p-1 text-[var(--c-text-5)] transition-colors hover:bg-red-500/10 hover:text-red-400"
            title={t('validate.deletePolicy')}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>
      {policy.brief && (
        <p className="line-clamp-2 text-[11px] leading-relaxed text-[var(--c-text-4)]">
          {policy.brief}
        </p>
      )}
    </div>
  )
}

// ── Launch bar ────────────────────────────────────────────────────────────

function LaunchBar({
  policy,
  files,
  onAddFiles,
  onRemoveFile,
  onRun,
  uploading,
  error,
}: {
  policy: Policy
  files: File[]
  onAddFiles: (files: File[]) => void
  onRemoveFile: (index: number) => void
  onRun: () => void
  uploading: boolean
  error: string | null
}) {
  const { t } = useI18n()
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragEnter={() => setDrag(true)}
      onDragLeave={() => setDrag(false)}
      onDrop={e => {
        e.preventDefault()
        setDrag(false)
        const added = Array.from(e.dataTransfer.files)
        if (added.length) onAddFiles(added)
      }}
      className={[
        'flex shrink-0 flex-col gap-3 border-b px-6 py-4 transition-colors',
        drag
          ? 'border-indigo-500/40 bg-indigo-500/5'
          : 'border-[var(--c-border)] bg-[var(--c-surface)]',
      ].join(' ')}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.xlsx,.xls,.csv,image/*"
        multiple
        className="hidden"
        onChange={e => {
          const added = Array.from(e.target.files ?? [])
          if (added.length) onAddFiles(added)
          e.target.value = ''
        }}
      />

      {files.length === 0 ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-4 rounded-lg border-2 border-dashed border-[var(--c-border-3)] px-5 py-3.5 text-left transition-colors hover:border-indigo-500/40 hover:bg-indigo-500/3"
        >
          <Upload size={16} className={drag ? 'text-indigo-400' : 'text-[var(--c-text-5)]'} />
          <div>
            <p className="text-[13px] font-medium text-[var(--c-text-2)]">{t('validate.dropToValidate')}</p>
            <p className="text-[11px] text-[var(--c-text-5)]">{t('validate.acceptedFormats')} · <span className="text-[var(--c-text-4)]">{policy.name}</span> · {policy.rules.length !== 1 ? t('validate.nRules_plural', { count: policy.rules.length }) : t('validate.nRules', { count: policy.rules.length })}</p>
          </div>
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col divide-y divide-[var(--c-divider)] overflow-hidden rounded-lg border border-[var(--c-border-2)] bg-[var(--c-surface-2)]">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                <FileText size={12} className="shrink-0 text-[var(--c-text-4)]" />
                <span className="flex-1 truncate text-[12px] text-[var(--c-text-1)]">{f.name}</span>
                <button
                  onClick={() => onRemoveFile(i)}
                  className="shrink-0 text-[var(--c-text-5)] transition-colors hover:text-[var(--c-text-3)]"
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1.5 rounded border border-[var(--c-border-2)] px-2.5 py-1.5 text-[11px] text-[var(--c-text-3)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-2)]"
            >
              <Plus size={11} />
              {t('btn.addMore')}
            </button>
            <div className="flex-1" />
            {error && <p className="shrink-0 text-[11px] text-red-400">{error}</p>}
            <button
              onClick={onRun}
              disabled={uploading}
              className="flex h-8 shrink-0 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
            >
              {uploading && <Loader2 size={11} className="animate-spin" />}
              {uploading ? t('validate.starting') : files.length > 1 ? t('validate.runN', { count: files.length }) : t('validate.runValidation')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────

export function Validate() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const { data: policies, isLoading: loadingPolicies } = usePolicies()
  const createPolicy = useCreatePolicy()
  const deletePolicy = useDeletePolicy()
  const [selectedPolicyId, setSelectedPolicyId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [openRun, setOpenRun] = useState<Run | null>(null)

  async function handleCreatePolicy(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    const p = await createPolicy.mutateAsync({ name: newName.trim() })
    navigate(`/policies/${p.id}`)
  }

  const { data: runs, isLoading: loadingRuns } = useValidateRuns(selectedPolicyId ?? undefined)
  const triggerRun = useTriggerValidateRun()

  const closeModal = useCallback(() => setOpenRun(null), [])

  const filteredPolicies = (policies ?? []).filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )
  const selectedPolicy = policies?.find(p => p.id === selectedPolicyId) ?? null

  async function handleRun() {
    if (!selectedPolicyId || files.length === 0) return
    setUploading(true)
    setRunError(null)
    try {
      const docIds: number[] = []
      for (const f of files) {
        const fd = new FormData()
        fd.append('file', f)
        const docRes = await client.post('/documents/upload', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        docIds.push(docRes.data.id)
      }
      const newRun = await triggerRun.mutateAsync({ policy_id: selectedPolicyId, document_ids: docIds })
      setFiles([])
      setOpenRun(newRun)
    } catch (err: unknown) {
      setRunError(err instanceof Error ? err.message : t('validate.failedToStart'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-1 overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      <LeftSidebar />

      <div className="flex min-w-0 flex-1 overflow-hidden">
        {/* Left panel — policy picker */}
        <div className="flex w-[280px] shrink-0 flex-col border-r border-[var(--c-border)] bg-[var(--c-surface)]">
          <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--c-border)] px-4">
            <h2 className="text-[13px] font-semibold text-[var(--c-text-1)]">{t('validate.checks')}</h2>
            <button
              onClick={() => { setCreating(true); setSearch('') }}
              className="flex h-6 w-6 items-center justify-center rounded text-[var(--c-text-4)] transition-colors hover:bg-[var(--c-hover-3)] hover:text-[var(--c-text-2)]"
              title={t('validate.newPolicy')}
            >
              <Plus size={13} strokeWidth={2.5} />
            </button>
          </div>

          {creating && (
            <form
              onSubmit={handleCreatePolicy}
              className="flex shrink-0 items-center gap-2 border-b border-[var(--c-border)] bg-[var(--c-surface-2)] px-3 py-2.5"
            >
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder={t('validate.policyNamePlaceholder')}
                className="flex-1 rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-2.5 py-1.5 text-[12px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
              />
              <button
                type="submit"
                disabled={createPolicy.isPending || !newName.trim()}
                className="flex h-7 items-center gap-1 rounded bg-indigo-600 px-2.5 text-[11px] font-medium text-white disabled:opacity-40 transition-colors hover:bg-indigo-500"
              >
                {createPolicy.isPending ? <Loader2 size={10} className="animate-spin" /> : t('btn.create')}
              </button>
              <button
                type="button"
                onClick={() => { setCreating(false); setNewName('') }}
                className="rounded p-1 text-[var(--c-text-5)] transition-colors hover:text-[var(--c-text-3)]"
              >
                <X size={12} />
              </button>
            </form>
          )}

          <div className="p-3 pb-2">
            <div className="flex items-center gap-2 rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-2.5 py-1.5">
              <Search size={12} className="shrink-0 text-[var(--c-text-5)]" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('btn.search')}
                className="flex-1 bg-transparent text-[12px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none"
              />
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-3 pt-1">
            {loadingPolicies ? (
              <div className="flex items-center gap-2 py-4 text-[12px] text-[var(--c-text-5)]">
                <Loader2 size={12} className="animate-spin" /> {t('common.loading')}
              </div>
            ) : filteredPolicies.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-[var(--c-text-5)]">
                {search ? t('validate.noMatches') : t('validate.noPoliciesYet')}
              </p>
            ) : filteredPolicies.map(p => (
              <PolicyItem
                key={p.id}
                policy={p}
                selected={p.id === selectedPolicyId}
                onSelect={() => {
                  setSelectedPolicyId(prev => prev === p.id ? null : p.id)
                  setFiles([])
                  setRunError(null)
                }}
                onEdit={() => navigate(`/policies/${p.id}`)}
                onDelete={() => {
                  deletePolicy.mutate(p.id)
                  if (selectedPolicyId === p.id) setSelectedPolicyId(null)
                }}
              />
            ))}
          </div>
        </div>

        {/* Right panel — launch bar + run list */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--c-border)] px-6">
            <h1 className="text-[14px] font-semibold text-[var(--c-text-1)]">
              {selectedPolicy ? selectedPolicy.name : t('validate.title')}
            </h1>
            {runs && runs.length > 0 && (
              <span className="rounded bg-[var(--c-surface-3)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--c-text-4)]">
                {runs.length}
              </span>
            )}
          </div>

          {!selectedPolicyId ? (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)]">
                <ShieldCheck size={22} className="text-[var(--c-text-5)]" />
              </div>
              <p className="text-[14px] font-medium text-[var(--c-text-3)]">{t('validate.selectAPolicy')}</p>
              <p className="mt-1.5 max-w-[260px] text-[12px] leading-relaxed text-[var(--c-text-5)]">
                {t('validate.selectAPolicyHint')}
              </p>
            </div>
          ) : (
            <>
              <LaunchBar
                policy={selectedPolicy!}
                files={files}
                onAddFiles={added => setFiles(prev => [...prev, ...added])}
                onRemoveFile={i => setFiles(prev => prev.filter((_, idx) => idx !== i))}
                onRun={handleRun}
                uploading={uploading}
                error={runError}
              />

              <div className="flex-1 overflow-y-auto">
                {loadingRuns ? (
                  <div className="flex items-center gap-2 p-6 text-[12px] text-[var(--c-text-5)]">
                    <Loader2 size={12} className="animate-spin" /> {t('validate.loadingRuns')}
                  </div>
                ) : runs && runs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-center">
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)]">
                      <FileText size={16} className="text-[var(--c-text-5)]" />
                    </div>
                    <p className="text-[13px] font-medium text-[var(--c-text-3)]">{t('validate.noRunsYet')}</p>
                    <p className="mt-1 text-[11px] text-[var(--c-text-5)]">{t('validate.dropToStart')}</p>
                  </div>
                ) : (
                  <div className="w-full">
                    {(runs ?? []).map(run => (
                      <RunItem key={run.id} run={run} onOpen={setOpenRun} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {openRun && <RunDetailModal run={openRun} onClose={closeModal} />}
    </div>
  )
}

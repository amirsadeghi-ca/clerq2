import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  X, CheckCircle2, XCircle, AlertCircle, Circle, Loader2, FileText,
  ChevronLeft, ChevronRight, MessageSquarePlus, RotateCcw, ExternalLink,
  ZoomIn, ShieldCheck,
} from 'lucide-react'
import { fileUrl } from '../lib/fileUrl'
import { useRun } from '../api/runs'
import { usePolicy } from '../api/policies'
import { useAnnotateFinding } from '../api/review'
import { getValidationOutput } from './ReportView'
import type { Run, ValidationRuleResult, FindingAnnotation } from '../types/workflow'

// ── Status presentation ─────────────────────────────────────────────────────

type Status = 'pass' | 'fail' | 'uncertain' | 'not_applicable'

const STATUS_META: Record<Status, { label: string; pill: string; dot: string; text: string }> = {
  pass:           { label: 'Pass',    pill: 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/25', dot: 'bg-emerald-400', text: 'text-emerald-400' },
  fail:           { label: 'Issue',   pill: 'text-red-400 bg-red-500/10 border border-red-500/25',             dot: 'bg-red-400',     text: 'text-red-400' },
  uncertain:      { label: 'Review',  pill: 'text-amber-400 bg-amber-500/10 border border-amber-500/25',       dot: 'bg-amber-400',   text: 'text-amber-400' },
  not_applicable: { label: 'N/A',     pill: 'text-[var(--c-text-4)] bg-[var(--c-surface-3)] border border-[var(--c-border-2)]', dot: 'bg-[var(--c-text-5)]', text: 'text-[var(--c-text-4)]' },
}

function StatusIcon({ status, size = 14 }: { status: Status; size?: number }) {
  if (status === 'pass')           return <CheckCircle2 size={size} className="shrink-0 text-emerald-400" />
  if (status === 'fail')           return <XCircle      size={size} className="shrink-0 text-red-400" />
  if (status === 'uncertain')      return <AlertCircle  size={size} className="shrink-0 text-amber-400" />
  return <Circle size={size} className="shrink-0 text-[var(--c-text-5)]" />
}

const RANK: Record<Status, number> = { fail: 0, uncertain: 1, pass: 2, not_applicable: 3 }

// Gather every rendered page image across the run's steps (single- or multi-doc).
function gatherImages(run: Run): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (p: unknown) => {
    if (typeof p === 'string' && !seen.has(p)) { seen.add(p); out.push(p) }
  }
  for (const s of run.steps) {
    const od = (s.output_data ?? {}) as Record<string, unknown>
    if (Array.isArray(od.image_paths)) od.image_paths.forEach(push)
    if (Array.isArray(od.documents)) {
      for (const d of od.documents as Array<Record<string, unknown>>) {
        if (d && Array.isArray(d.image_paths)) d.image_paths.forEach(push)
      }
    }
  }
  return out
}

// ── Image lightbox ───────────────────────────────────────────────────────────

function Lightbox({ paths, index, onClose }: { paths: string[]; index: number; onClose: () => void }) {
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
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90" onClick={onClose}>
      {i > 0 && (
        <button
          onClick={e => { e.stopPropagation(); setI(v => Math.max(v - 1, 0)) }}
          className="absolute left-4 rounded-full border border-[var(--c-border-3)] bg-[var(--c-surface)] p-2 text-[var(--c-text-3)] transition-colors hover:text-[var(--c-text-1)]"
        ><ChevronLeft size={16} /></button>
      )}
      <img
        src={fileUrl(paths[i])}
        alt={`Page ${i + 1}`}
        className="max-h-[92vh] max-w-[88vw] rounded object-contain shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
      {i < paths.length - 1 && (
        <button
          onClick={e => { e.stopPropagation(); setI(v => Math.min(v + 1, paths.length - 1)) }}
          className="absolute right-4 rounded-full border border-[var(--c-border-3)] bg-[var(--c-surface)] p-2 text-[var(--c-text-3)] transition-colors hover:text-[var(--c-text-1)]"
        ><ChevronRight size={16} /></button>
      )}
      <div className="absolute bottom-4 text-[12px] text-[var(--c-text-4)]">{i + 1} / {paths.length}</div>
    </div>
  )
}

// ── Resolve actions (Pass / Reject / Amend) ─────────────────────────────────

function ResolveActions({ runId, result, annotation, onResolved }: {
  runId: number
  result: ValidationRuleResult
  annotation: FindingAnnotation | undefined
  onResolved: () => void
}) {
  const annotate = useAnnotateFinding()
  const aiStatus = result.status as Status
  const override = annotation?.override ?? null
  const effective = (override?.status ?? aiStatus) as Status

  const [pending, setPending] = useState<null | 'pass' | 'fail'>(null)
  const [reason, setReason] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState(annotation?.note ?? '')
  const busy = annotate.isPending

  // Reset transient editors when the selected finding changes
  useEffect(() => {
    setPending(null); setReason(''); setNoteOpen(false); setNoteDraft(annotation?.note ?? '')
  }, [result.rule_name]) // eslint-disable-line react-hooks/exhaustive-deps

  function decide(target: 'pass' | 'fail') {
    if (target === aiStatus) {
      // Agreeing with the AI clears any override.
      if (override) annotate.mutate({ runId, ruleName: result.rule_name, clearOverride: true }, { onSuccess: onResolved })
      setPending(null)
      return
    }
    setReason(override?.status === target ? (override.reason ?? '') : '')
    setPending(target)
  }

  function saveDecision() {
    if (!pending || !reason.trim()) return
    annotate.mutate(
      { runId, ruleName: result.rule_name, overrideStatus: pending, overrideReason: reason.trim() },
      { onSuccess: () => { setPending(null); onResolved() } },
    )
  }

  function saveNote() {
    const v = noteDraft.trim()
    annotate.mutate(
      { runId, ruleName: result.rule_name, note: v, clearNote: v.length === 0 },
      { onSuccess: () => { setNoteOpen(false); onResolved() } },
    )
  }

  const passActive = effective === 'pass'
  const failActive = effective === 'fail'

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">Your decision</span>
        {override && (
          <button
            disabled={busy}
            onClick={() => annotate.mutate({ runId, ruleName: result.rule_name, clearOverride: true }, { onSuccess: onResolved })}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--c-text-5)] transition-colors hover:text-[var(--c-text-3)]"
          ><RotateCcw size={9} /> Reset to AI</button>
        )}
      </div>

      {/* Big action buttons */}
      <div className="grid grid-cols-3 gap-2">
        <button
          disabled={busy}
          onClick={() => decide('pass')}
          className={[
            'flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-3 text-[12px] font-semibold transition-colors disabled:opacity-50',
            passActive
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
              : 'border-[var(--c-border-2)] text-[var(--c-text-3)] hover:border-emerald-500/30 hover:bg-emerald-500/8 hover:text-emerald-400',
          ].join(' ')}
        ><CheckCircle2 size={16} /> Pass</button>

        <button
          disabled={busy}
          onClick={() => { setNoteDraft(annotation?.note ?? ''); setNoteOpen(o => !o); setPending(null) }}
          className={[
            'flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-3 text-[12px] font-semibold transition-colors disabled:opacity-50',
            (noteOpen || annotation?.note)
              ? 'border-amber-500/40 bg-amber-500/12 text-amber-400'
              : 'border-[var(--c-border-2)] text-[var(--c-text-3)] hover:border-amber-500/30 hover:bg-amber-500/8 hover:text-amber-400',
          ].join(' ')}
        ><MessageSquarePlus size={16} /> Amend</button>

        <button
          disabled={busy}
          onClick={() => decide('fail')}
          className={[
            'flex flex-col items-center justify-center gap-1 rounded-lg border px-2 py-3 text-[12px] font-semibold transition-colors disabled:opacity-50',
            failActive
              ? 'border-red-500/40 bg-red-500/15 text-red-400'
              : 'border-[var(--c-border-2)] text-[var(--c-text-3)] hover:border-red-500/30 hover:bg-red-500/8 hover:text-red-400',
          ].join(' ')}
        ><XCircle size={16} /> Reject</button>
      </div>

      {/* Reason capture for an override that differs from the AI */}
      {pending && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-2.5">
          <span className="text-[11px] text-[var(--c-text-3)]">
            Why are you marking this <span className="font-semibold">{pending === 'pass' ? 'Pass' : 'Reject'}</span>? (recorded on the report)
          </span>
          <textarea
            autoFocus value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Short reason for the override…" rows={2}
            className="w-full resize-none rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-2.5 py-1.5 text-[12px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none focus:border-indigo-500/50"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={saveDecision} disabled={busy || !reason.trim()}
              className="flex h-7 items-center gap-1 rounded bg-indigo-600 px-3 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
            >{busy && <Loader2 size={10} className="animate-spin" />} Save decision</button>
            <button onClick={() => setPending(null)} className="h-7 rounded px-2 text-[12px] text-[var(--c-text-5)] hover:text-[var(--c-text-3)]">Cancel</button>
          </div>
        </div>
      )}

      {/* Internal note (amend) */}
      {noteOpen && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5">
          <span className="text-[11px] text-[var(--c-text-3)]">What needs to be amended? (internal note)</span>
          <textarea
            autoFocus value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
            placeholder="e.g. Offer letter must be signed and dated on the last page." rows={2}
            className="w-full resize-none rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-2.5 py-1.5 text-[12px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none focus:border-amber-500/50"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={saveNote} disabled={busy}
              className="flex h-7 items-center gap-1 rounded bg-amber-500 px-3 text-[12px] font-medium text-white transition-colors hover:bg-amber-400 disabled:opacity-40"
            >{busy && <Loader2 size={10} className="animate-spin" />} Save note</button>
            <button onClick={() => setNoteOpen(false)} className="h-7 rounded px-2 text-[12px] text-[var(--c-text-5)] hover:text-[var(--c-text-3)]">Cancel</button>
          </div>
        </div>
      )}

      {/* Current decision summary */}
      {override && !pending && (
        <p className="text-[11.5px] leading-relaxed text-[var(--c-text-3)]">
          <span className="text-[var(--c-text-5)]">AI said {STATUS_META[aiStatus].label}.</span>{' '}
          You marked it <span className={`font-semibold ${STATUS_META[effective].text}`}>{STATUS_META[effective].label}</span>
          {override.reason ? <> — “{override.reason}”</> : null}
        </p>
      )}
      {annotation?.note && !noteOpen && (
        <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-amber-300/90">
          <MessageSquarePlus size={12} className="mt-0.5 shrink-0" /> {annotation.note}
        </p>
      )}
    </div>
  )
}

// ── Main drawer ──────────────────────────────────────────────────────────────

export function CaseReviewDrawer({ runId, caseId, initialDocTypeId, onClose }: {
  runId: number
  caseId: number
  initialDocTypeId?: number | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { data: run, isLoading } = useRun(runId)
  const { data: policy } = usePolicy(run?.policy_id ?? null)
  const output = getValidationOutput(run ?? null)

  const [selected, setSelected] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<number | null>(null)

  const review = run?.review ?? null
  const annotations = review?.annotations ?? {}

  // Findings, problems-first (effective status after any override)
  const findings = useMemo(() => {
    const results = output?.results ?? []
    const withEff = results.map((r, idx) => {
      const ov = annotations[r.rule_name]?.override?.status as Status | undefined
      const eff = (ov ?? r.status) as Status
      return { r, idx, eff }
    })
    return withEff.sort((a, b) => (RANK[a.eff] - RANK[b.eff]) || (a.idx - b.idx))
  }, [output, annotations])

  const images = useMemo(() => (run ? gatherImages(run) : []), [run])

  // Initial selection: requested doc-type's rule → else first problem
  useEffect(() => {
    if (selected || findings.length === 0) return
    let pick: string | null = null
    if (initialDocTypeId != null && policy) {
      const rule = policy.rules.find(r => r.document_type_id === initialDocTypeId)
      if (rule && findings.some(f => f.r.rule_name === rule.name)) pick = rule.name
    }
    if (!pick) pick = findings[0].r.rule_name
    setSelected(pick)
  }, [findings, policy, initialDocTypeId, selected])

  // Esc closes the drawer (when no lightbox is open)
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && lightbox === null) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, lightbox])

  const onResolved = () => {
    qc.invalidateQueries({ queryKey: ['cases', caseId] })
    qc.invalidateQueries({ queryKey: ['cases'] })
  }

  const sel = findings.find(f => f.r.rule_name === selected) ?? null
  const selResult = sel?.r ?? null
  const selAnnotation = selResult ? annotations[selResult.rule_name] : undefined
  const selEff = sel?.eff ?? 'pass'

  const unresolved = findings.filter(f => f.eff === 'fail' || f.eff === 'uncertain').length

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-stretch justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div
          className="flex h-full w-full flex-col overflow-hidden border-l border-[var(--c-border-2)] bg-[var(--c-surface)] shadow-2xl sm:w-[94vw] lg:w-[80vw] xl:max-w-[1180px]"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--c-border)] px-5">
            <ShieldCheck size={15} className="shrink-0 text-indigo-400" />
            <span className="truncate text-[14px] font-semibold text-[var(--c-text-1)]">Resolve issues</span>
            {output?.overall && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                output.overall === 'pass' ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/25'
                : output.overall === 'fail' ? 'text-red-400 bg-red-500/10 border border-red-500/25'
                : 'text-amber-400 bg-amber-500/10 border border-amber-500/25'
              }`}>
                {unresolved > 0 ? `${unresolved} to review` : 'All reviewed'}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Link
                to={`/reports/${runId}`}
                className="hidden h-7 items-center gap-1.5 rounded px-2.5 text-[11px] text-[var(--c-text-4)] transition-colors hover:bg-[var(--c-hover-3)] hover:text-[var(--c-text-1)] sm:flex"
              ><ExternalLink size={11} /> Full report</Link>
              <button onClick={onClose} className="rounded p-1.5 text-[var(--c-text-4)] transition-colors hover:bg-[var(--c-hover-3)] hover:text-[var(--c-text-1)]">
                <X size={15} />
              </button>
            </div>
          </div>

          {isLoading || !output ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-[var(--c-text-4)]">
              <Loader2 size={15} className="animate-spin" /> Loading findings…
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 overflow-hidden">

              {/* Findings list */}
              <div className="flex w-[200px] shrink-0 flex-col overflow-y-auto border-r border-[var(--c-border)] sm:w-[240px]">
                <div className="shrink-0 border-b border-[var(--c-border)] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">
                  Findings
                </div>
                <div className="flex flex-col divide-y divide-[var(--c-divider)]">
                  {findings.map(({ r, eff }) => {
                    const isSel = selected === r.rule_name
                    const overridden = !!annotations[r.rule_name]?.override
                    return (
                      <button
                        key={r.rule_name}
                        onClick={() => setSelected(r.rule_name)}
                        className={[
                          'flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors',
                          isSel ? 'bg-[var(--c-active)]' : 'hover:bg-[var(--c-hover-2)]',
                        ].join(' ')}
                      >
                        <span className="mt-0.5"><StatusIcon status={eff} size={13} /></span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-[12.5px] leading-snug ${
                            eff === 'fail' ? 'text-red-300' : eff === 'uncertain' ? 'text-amber-300'
                            : eff === 'pass' ? 'text-[var(--c-text-1)]' : 'text-[var(--c-text-4)]'
                          }`}>{r.rule_name}</span>
                          {overridden && (
                            <span className="mt-0.5 block text-[9.5px] font-medium uppercase tracking-wide text-indigo-400">Your call</span>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Finding detail + document preview */}
              <div className="flex min-w-0 flex-1 overflow-hidden">
                {selResult ? (
                  <>
                    {/* Detail column: scrollable content + pinned action footer */}
                    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                      <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5 lg:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <h3 className="text-[16px] font-semibold leading-snug text-[var(--c-text-1)]">{selResult.rule_name}</h3>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_META[selEff].pill}`}>
                          {STATUS_META[selEff].label}
                        </span>
                      </div>

                      {/* What the AI found */}
                      <div className="flex flex-col gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">What we found</span>
                        <p className="text-[13.5px] leading-relaxed text-[var(--c-text-2)]">
                          {selResult.evidence || 'No additional detail provided.'}
                        </p>
                      </div>

                      {/* Per-document breakdown */}
                      {selResult.per_document && selResult.per_document.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">
                            {selResult.scope === 'cross_set' ? 'Documents compared' : 'Per document'}
                          </span>
                          <div className="flex flex-col divide-y divide-[var(--c-divider)] overflow-hidden rounded-lg border border-[var(--c-border-2)]">
                            {selResult.per_document.map((pd, i) => (
                              <div key={i} className="flex items-start gap-3 px-3.5 py-2.5">
                                {selResult.scope === 'cross_set'
                                  ? <FileText size={13} className="mt-0.5 shrink-0 text-[var(--c-text-4)]" />
                                  : <span className="mt-0.5"><StatusIcon status={pd.status as Status} size={13} /></span>}
                                <div className="min-w-0 flex-1">
                                  <span className="block truncate text-[12px] font-medium text-[var(--c-text-2)]">{pd.document_filename}</span>
                                  {pd.evidence && selResult.scope !== 'cross_set' && (
                                    <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--c-text-4)]">{pd.evidence}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Extracted */}
                      {selResult.extracted && Object.keys(selResult.extracted).length > 0 && (
                        <div className="flex flex-col gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">Extracted</span>
                          <div className="overflow-hidden rounded-lg border border-[var(--c-border-2)] bg-[var(--c-surface-2)]">
                            {Object.entries(selResult.extracted).map(([k, v], idx, arr) => (
                              <div key={k} className={`flex items-baseline gap-4 px-3.5 py-2 ${idx < arr.length - 1 ? 'border-b border-[var(--c-divider)]' : ''}`}>
                                <span className="w-[130px] shrink-0 font-mono text-[11px] text-[var(--c-text-5)]">{k}</span>
                                <span className="flex-1 text-[12px] text-[var(--c-text-2)]">{String(v)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Mobile inline document preview (the side column is hidden on small screens) */}
                      {images.length > 0 && (
                        <div className="flex flex-col gap-2 lg:hidden">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">Document</span>
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {images.map((rel, idx) => (
                              <button key={rel} onClick={() => setLightbox(idx)}
                                className="h-[120px] w-[88px] shrink-0 overflow-hidden rounded-md border border-[var(--c-border)] bg-[var(--c-surface-3)]">
                                <img src={fileUrl(rel)} alt={`Page ${idx + 1}`} className="h-full w-full object-contain" loading="lazy" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      </div>

                      {/* Pinned action footer — always visible so the operator can act without scrolling */}
                      <div className="shrink-0 border-t border-[var(--c-border)] bg-[var(--c-surface)] px-5 py-3 lg:px-6">
                        <ResolveActions runId={runId} result={selResult} annotation={selAnnotation} onResolved={onResolved} />
                      </div>
                    </div>

                    {/* Document preview column (desktop) */}
                    <div className="hidden w-[300px] shrink-0 flex-col overflow-hidden border-l border-[var(--c-border)] bg-[var(--c-surface-2)] lg:flex xl:w-[340px]">
                      <div className="flex shrink-0 items-center justify-between border-b border-[var(--c-border)] px-4 py-2.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">Document</span>
                        <span className="text-[11px] text-[var(--c-text-5)]">{images.length} page{images.length !== 1 ? 's' : ''}</span>
                      </div>
                      {images.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center px-6 text-center text-[12px] text-[var(--c-text-5)]">
                          No page preview available for this run.
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3 overflow-y-auto p-3">
                          {images.map((rel, idx) => (
                            <button key={rel} onClick={() => setLightbox(idx)}
                              className="group relative overflow-hidden rounded-lg border border-[var(--c-border)] bg-[var(--c-surface-3)] transition-[border-color,box-shadow] hover:border-indigo-500/40 hover:shadow-[0_0_0_1px_rgba(99,102,241,0.25)]">
                              <img src={fileUrl(rel)} alt={`Page ${idx + 1}`} className="w-full object-contain" loading="lazy" />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
                                <ZoomIn size={20} className="text-white" />
                              </div>
                              <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white">{idx + 1}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center text-[13px] text-[var(--c-text-4)]">
                    No findings to review.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {lightbox !== null && images.length > 0 && (
        <Lightbox paths={images} index={lightbox} onClose={() => setLightbox(null)} />
      )}
    </>
  )
}

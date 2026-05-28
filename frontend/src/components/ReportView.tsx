import type { ReactNode } from 'react'
import type {
  Run, Policy, ValidationOutput, ValidationRuleResult, ReportReview, FindingAnnotation,
} from '../types/workflow'

// ──────────────────────────────────────────────────────────────────────────
// ReportView renders a validation report as a self-contained "paper" document.
// It uses its OWN class-based stylesheet (REPORT_CSS) with fixed, print-friendly
// colors — NOT the app's Tailwind/theme tokens — so the same markup renders
// identically on the in-app report page AND in the PDF print window.
//
// Phase 6: it also renders human-review state — reviewer notes and verdict
// overrides shown transparently next to the AI's original verdict — and the
// effective overall verdict / counts reflect overrides. Interactive editing
// controls are injected per-finding by the caller via `renderFindingControls`
// (omitted for the static PDF render).
// ──────────────────────────────────────────────────────────────────────────

type Status = 'pass' | 'fail' | 'uncertain' | 'not_applicable' | string

const STATUS_LABEL: Record<string, string> = {
  pass: 'Pass', fail: 'Fail', uncertain: 'Needs review', not_applicable: 'N/A',
}
const OVERALL_LABEL: Record<string, string> = {
  pass: 'Pass', fail: 'Fail', needs_review: 'Needs review',
}
const STATUS_RANK: Record<string, number> = { fail: 0, uncertain: 1, pass: 2, not_applicable: 3 }

export function getValidationOutput(run: Run | null | undefined): ValidationOutput | null {
  if (!run) return null
  const step = run.steps?.find(s => s.node_type === 'validate_documents' && s.status === 'completed')
  return (step?.output_data as unknown as ValidationOutput | null) ?? null
}

export function effectiveStatus(result: ValidationRuleResult, ann?: FindingAnnotation): Status {
  return ann?.override?.status ?? result.status
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export const REPORT_CSS = `
.report-paper {
  --pass: #16a34a; --fail: #dc2626; --uncertain: #d97706; --na: #6b7280; --rev: #4f46e5;
  background: #ffffff; color: #18181b;
  font-family: Inter, system-ui, -apple-system, sans-serif;
  font-size: 13px; line-height: 1.5;
  max-width: 820px; margin: 0 auto; padding: 40px 44px; box-sizing: border-box;
}
.report-paper * { box-sizing: border-box; }
.report-head { border-bottom: 2px solid #18181b; padding-bottom: 16px; margin-bottom: 24px; }
.report-eyebrow-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.report-eyebrow { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #71717a; font-weight: 600; }
.ribbon { font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; padding: 3px 10px; border-radius: 999px; }
.ribbon-draft { color: #b45309; background: #fffbeb; border: 1px solid #fde68a; }
.ribbon-final { color: #15803d; background: #f0fdf4; border: 1px solid #bbf7d0; }
.report-title { font-size: 22px; font-weight: 700; margin: 6px 0 10px; color: #18181b; }
.report-meta { display: flex; flex-wrap: wrap; gap: 4px 20px; font-size: 11.5px; color: #52525b; }
.report-meta b { color: #18181b; font-weight: 600; }
.report-verdict-row { display: flex; align-items: center; gap: 14px; margin: 22px 0; flex-wrap: wrap; }
.report-verdict { font-size: 15px; font-weight: 700; padding: 8px 16px; border-radius: 8px; border: 1.5px solid; }
.v-pass { color: var(--pass); border-color: var(--pass); background: #f0fdf4; }
.v-fail { color: var(--fail); border-color: var(--fail); background: #fef2f2; }
.v-needs_review { color: var(--uncertain); border-color: var(--uncertain); background: #fffbeb; }
.report-counts { font-size: 11.5px; color: #52525b; display: flex; gap: 14px; }
.report-counts .c-fail { color: var(--fail); font-weight: 600; }
.report-counts .c-uncertain { color: var(--uncertain); font-weight: 600; }
.report-counts .c-pass { color: var(--pass); font-weight: 600; }
.verdict-note { font-size: 11px; color: var(--rev); font-weight: 600; }
.report-section-label { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #71717a; font-weight: 600; margin: 26px 0 10px; }
.finding { border: 1px solid #e4e4e7; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; page-break-inside: avoid; }
.finding.has-override { border-color: #c7d2fe; }
.finding-head { display: flex; align-items: flex-start; gap: 10px; }
.finding-name { font-size: 14px; font-weight: 600; flex: 1; color: #18181b; }
.badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.b-pass { color: var(--pass); background: #f0fdf4; border: 1px solid #bbf7d0; }
.b-fail { color: var(--fail); background: #fef2f2; border: 1px solid #fecaca; }
.b-uncertain { color: var(--uncertain); background: #fffbeb; border: 1px solid #fde68a; }
.b-not_applicable { color: var(--na); background: #f4f4f5; border: 1px solid #e4e4e7; }
.tag { font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: .04em; }
.tag-set { color: #7c3aed; background: #f5f3ff; border: 1px solid #ddd6fe; }
.tag-any { color: #0284c7; background: #f0f9ff; border: 1px solid #bae6fd; }
.tag-optional { color: #71717a; background: #f4f4f5; border: 1px solid #e4e4e7; }
.conf { font-size: 11px; font-weight: 700; font-variant-numeric: tabular-nums; }
.finding-evidence { margin-top: 8px; font-size: 12.5px; color: #3f3f46; }
.override-line { margin-top: 10px; font-size: 12px; color: #312e81; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 8px; padding: 8px 10px; }
.override-line .ai { color: var(--na); text-decoration: line-through; }
.override-line .arrow { color: #6366f1; margin: 0 6px; }
.override-line .rev { color: var(--rev); font-weight: 700; }
.override-line .reason { display: block; margin-top: 3px; color: #4338ca; }
.override-line .stamp { display: block; margin-top: 3px; font-size: 10px; color: #818cf8; }
.note-box { margin-top: 10px; font-size: 12px; color: #713f12; background: #fefce8; border-left: 3px solid #eab308; border-radius: 0 6px 6px 0; padding: 8px 10px; }
.note-box .note-label { font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; color: #a16207; font-weight: 700; }
.finding-sub { margin-top: 10px; }
.finding-sub-label { font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; color: #a1a1aa; font-weight: 600; margin-bottom: 5px; }
.perdoc { display: flex; gap: 8px; align-items: flex-start; padding: 6px 0; border-top: 1px solid #f4f4f5; }
.perdoc:first-child { border-top: none; }
.perdoc-name { font-size: 12px; font-weight: 600; color: #3f3f46; flex: 1; }
.perdoc-ev { font-size: 11.5px; color: #71717a; }
.docchip { display: inline-block; font-size: 11px; color: #3f3f46; background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 6px; padding: 3px 8px; margin: 0 6px 6px 0; }
.extract-row { display: flex; gap: 12px; font-size: 11.5px; padding: 3px 0; }
.extract-k { color: #a1a1aa; min-width: 130px; font-family: ui-monospace, monospace; font-size: 10.5px; }
.extract-v { color: #3f3f46; }
.report-foot { margin-top: 30px; padding-top: 14px; border-top: 1px solid #e4e4e7; font-size: 10.5px; color: #a1a1aa; }
@media print {
  body { margin: 0; background: #fff; }
  .report-paper { max-width: none; padding: 0; }
  .no-print { display: none !important; }
}
`

function Badge({ status }: { status: Status }) {
  return <span className={`badge b-${status}`}>{STATUS_LABEL[status] ?? status}</span>
}

function ScopeTag({ scope }: { scope?: string }) {
  if (scope === 'cross_set') return <span className="tag tag-set">across set</span>
  if (scope === 'any_document') return <span className="tag tag-any">any doc</span>
  return null
}

function Finding({ result, annotation, controls }: {
  result: ValidationRuleResult
  annotation?: FindingAnnotation
  controls?: ReactNode
}) {
  const override = annotation?.override ?? null
  const eff = effectiveStatus(result, annotation)
  const isCrossSet = result.scope === 'cross_set'
  const perDoc = result.per_document ?? []
  const extracted = result.extracted && typeof result.extracted === 'object' ? result.extracted : {}

  return (
    <div className={`finding${override ? ' has-override' : ''}`}>
      <div className="finding-head">
        <span className="finding-name">{result.rule_name}</span>
        <ScopeTag scope={result.scope} />
        {result.requirement === 'optional' && <span className="tag tag-optional">optional</span>}
        <Badge status={eff} />
        <span className="conf" style={{ color: '#71717a' }}>{Math.round((result.confidence ?? 0) * 100)}%</span>
      </div>

      {result.evidence && <div className="finding-evidence">{result.evidence}</div>}

      {override && (
        <div className="override-line">
          <span className="ai">AI: {STATUS_LABEL[result.status] ?? result.status}</span>
          <span className="arrow">→</span>
          <span className="rev">Reviewer: {STATUS_LABEL[override.status] ?? override.status}</span>
          {override.reason && <span className="reason">“{override.reason}”</span>}
          {annotation?.updated_at && <span className="stamp">Reviewed {fmtDate(annotation.updated_at)}</span>}
        </div>
      )}

      {annotation?.note && (
        <div className="note-box">
          <div className="note-label">Reviewer note</div>
          {annotation.note}
        </div>
      )}

      {Object.keys(extracted).length > 0 && (
        <div className="finding-sub">
          <div className="finding-sub-label">Extracted</div>
          {Object.entries(extracted).map(([k, v]) => (
            <div className="extract-row" key={k}>
              <span className="extract-k">{k}</span>
              <span className="extract-v">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
            </div>
          ))}
        </div>
      )}

      {isCrossSet && perDoc.length > 0 && (
        <div className="finding-sub">
          <div className="finding-sub-label">Documents compared · {perDoc.length}</div>
          {perDoc.map((p, i) => <span className="docchip" key={i}>{p.document_filename}</span>)}
        </div>
      )}

      {!isCrossSet && perDoc.length > 1 && (
        <div className="finding-sub">
          <div className="finding-sub-label">Per document</div>
          {perDoc.map((p, i) => (
            <div className="perdoc" key={i}>
              <Badge status={p.status} />
              <span className="perdoc-name">
                {p.document_filename}
                {p.evidence && <div className="perdoc-ev">{p.evidence}</div>}
              </span>
              <span className="conf">{Math.round((p.confidence ?? 0) * 100)}%</span>
            </div>
          ))}
        </div>
      )}

      {controls && <div className="no-print">{controls}</div>}
    </div>
  )
}

export function ReportView({ run, policy, output, review, renderFindingControls }: {
  run: Run
  policy?: Policy | null
  output: ValidationOutput | null
  review?: ReportReview | null
  renderFindingControls?: (result: ValidationRuleResult, annotation: FindingAnnotation | undefined) => ReactNode
}) {
  const annotations = review?.annotations ?? {}
  const results = [...(output?.results ?? [])].sort((a, b) => {
    const ea = effectiveStatus(a, annotations[a.rule_name])
    const eb = effectiveStatus(b, annotations[b.rule_name])
    return (STATUS_RANK[ea] ?? 9) - (STATUS_RANK[eb] ?? 9)
  })

  const counts = { fail: 0, uncertain: 0, pass: 0, na: 0 }
  for (const r of results) {
    const eff = effectiveStatus(r, annotations[r.rule_name])
    if (eff === 'fail') counts.fail++
    else if (eff === 'uncertain') counts.uncertain++
    else if (eff === 'not_applicable') counts.na++
    else counts.pass++
  }

  const overall = review?.effective_overall ?? output?.overall ?? null
  const finalized = review?.state === 'finalized'
  const hasReview = !!review && (Object.keys(annotations).length > 0 || review.state === 'finalized')
  const docCount = run.document_ids?.length || 1

  return (
    <div className="report-paper">
      <div className="report-head">
        <div className="report-eyebrow-row">
          <span className="report-eyebrow">Validation report</span>
          {finalized
            ? <span className="ribbon ribbon-final">Finalized{review?.finalized_at ? ` · ${fmtDate(review.finalized_at)}` : ''}</span>
            : <span className="ribbon ribbon-draft">Draft · AI-generated</span>}
        </div>
        <div className="report-title">{run.name ?? `Case #${run.id}`}</div>
        <div className="report-meta">
          <span><b>Policy:</b> {output?.policy_name ?? policy?.name ?? '—'}</span>
          {output?.policy_version_num != null && <span><b>Version:</b> v{output.policy_version_num}</span>}
          <span><b>Documents:</b> {docCount}</span>
          <span><b>Run:</b> #{run.id}</span>
          <span><b>Date:</b> {fmtDate(run.created_at)}</span>
        </div>
      </div>

      {overall && (
        <div className="report-verdict-row">
          <span className={`report-verdict v-${overall}`}>{OVERALL_LABEL[overall] ?? overall}</span>
          <span className="report-counts">
            {counts.fail > 0 && <span className="c-fail">{counts.fail} fail</span>}
            {counts.uncertain > 0 && <span className="c-uncertain">{counts.uncertain} need review</span>}
            <span className="c-pass">{counts.pass} pass</span>
            {counts.na > 0 && <span>{counts.na} n/a</span>}
          </span>
          {hasReview && !finalized && <span className="verdict-note">Reflects reviewer edits</span>}
        </div>
      )}

      <div className="report-section-label">Findings · {results.length}</div>
      {results.length === 0 ? (
        <div className="finding-evidence">No validation results recorded for this run.</div>
      ) : (
        results.map((r, i) => (
          <Finding
            key={`${r.rule_name}-${i}`}
            result={r}
            annotation={annotations[r.rule_name]}
            controls={renderFindingControls?.(r, annotations[r.rule_name])}
          />
        ))
      )}

      <div className="report-foot">
        Generated by Clerq2 · {output?.policy_name ?? policy?.name ?? ''}
        {output?.policy_version_num != null ? ` v${output.policy_version_num}` : ''} · {fmtDate(run.created_at)}
        {finalized && review?.finalized_at ? ` · Finalized ${fmtDate(review.finalized_at)}` : ''}
      </div>
    </div>
  )
}

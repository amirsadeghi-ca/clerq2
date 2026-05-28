import type { Run, Policy, ValidationOutput, ValidationRuleResult } from '../types/workflow'

// ──────────────────────────────────────────────────────────────────────────
// ReportView renders a validation report as a self-contained "paper" document.
// It deliberately uses its OWN class-based stylesheet (REPORT_CSS) and fixed,
// print-friendly colors — NOT the app's Tailwind/theme tokens — so the exact
// same markup renders identically on the in-app report page AND in the PDF
// print window (which has none of the app's CSS). Screen == PDF by construction.
// ──────────────────────────────────────────────────────────────────────────

type Status = 'pass' | 'fail' | 'uncertain' | 'not_applicable' | string

const STATUS_LABEL: Record<string, string> = {
  pass: 'Pass',
  fail: 'Fail',
  uncertain: 'Needs review',
  not_applicable: 'N/A',
}

const OVERALL_LABEL: Record<string, string> = {
  pass: 'Pass', fail: 'Fail', needs_review: 'Needs review',
}

// Severity order for "problems first" sorting.
const STATUS_RANK: Record<string, number> = { fail: 0, uncertain: 1, pass: 2, not_applicable: 3 }

export function getValidationOutput(run: Run | null | undefined): ValidationOutput | null {
  if (!run) return null
  const step = run.steps?.find(s => s.node_type === 'validate_documents' && s.status === 'completed')
  return (step?.output_data as unknown as ValidationOutput | null) ?? null
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

// Stylesheet shared by the on-page report and the print window.
export const REPORT_CSS = `
.report-paper {
  --pass: #16a34a; --fail: #dc2626; --uncertain: #d97706; --na: #6b7280;
  background: #ffffff; color: #18181b;
  font-family: Inter, system-ui, -apple-system, sans-serif;
  font-size: 13px; line-height: 1.5;
  max-width: 820px; margin: 0 auto; padding: 40px 44px;
  box-sizing: border-box;
}
.report-paper * { box-sizing: border-box; }
.report-head { border-bottom: 2px solid #18181b; padding-bottom: 16px; margin-bottom: 24px; }
.report-eyebrow { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #71717a; font-weight: 600; }
.report-title { font-size: 22px; font-weight: 700; margin: 4px 0 10px; color: #18181b; }
.report-meta { display: flex; flex-wrap: wrap; gap: 4px 20px; font-size: 11.5px; color: #52525b; }
.report-meta b { color: #18181b; font-weight: 600; }
.report-verdict-row { display: flex; align-items: center; gap: 14px; margin: 22px 0; }
.report-verdict {
  font-size: 15px; font-weight: 700; padding: 8px 16px; border-radius: 8px; border: 1.5px solid;
}
.v-pass { color: var(--pass); border-color: var(--pass); background: #f0fdf4; }
.v-fail { color: var(--fail); border-color: var(--fail); background: #fef2f2; }
.v-needs_review { color: var(--uncertain); border-color: var(--uncertain); background: #fffbeb; }
.report-counts { font-size: 11.5px; color: #52525b; display: flex; gap: 14px; }
.report-counts .c-fail { color: var(--fail); font-weight: 600; }
.report-counts .c-uncertain { color: var(--uncertain); font-weight: 600; }
.report-counts .c-pass { color: var(--pass); font-weight: 600; }
.report-section-label { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #71717a; font-weight: 600; margin: 26px 0 10px; }
.finding { border: 1px solid #e4e4e7; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; page-break-inside: avoid; }
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
}
`

function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge b-${status}`}>{STATUS_LABEL[status] ?? status}</span>
}

function ScopeTag({ scope }: { scope?: string }) {
  if (scope === 'cross_set') return <span className="tag tag-set">across set</span>
  if (scope === 'any_document') return <span className="tag tag-any">any doc</span>
  return null
}

function Finding({ result }: { result: ValidationRuleResult }) {
  const isCrossSet = result.scope === 'cross_set'
  const perDoc = result.per_document ?? []
  const extracted = result.extracted && typeof result.extracted === 'object' ? result.extracted : {}
  return (
    <div className="finding">
      <div className="finding-head">
        <span className="finding-name">{result.rule_name}</span>
        <ScopeTag scope={result.scope} />
        {result.requirement === 'optional' && <span className="tag tag-optional">optional</span>}
        <StatusBadge status={result.status} />
        <span className={`conf b-${result.status}`} style={{ background: 'transparent', border: 'none', padding: 0 }}>
          {Math.round((result.confidence ?? 0) * 100)}%
        </span>
      </div>

      {result.evidence && <div className="finding-evidence">{result.evidence}</div>}

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
              <StatusBadge status={p.status} />
              <span className="perdoc-name">
                {p.document_filename}
                {p.evidence && <div className="perdoc-ev">{p.evidence}</div>}
              </span>
              <span className="conf">{Math.round((p.confidence ?? 0) * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ReportView({ run, policy, output }: {
  run: Run
  policy?: Policy | null
  output: ValidationOutput | null
}) {
  const results = [...(output?.results ?? [])].sort(
    (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)
  )
  const counts = {
    fail: results.filter(r => r.status === 'fail').length,
    uncertain: results.filter(r => r.status === 'uncertain').length,
    pass: results.filter(r => r.status === 'pass').length,
    na: results.filter(r => r.status === 'not_applicable').length,
  }
  const overall = output?.overall
  const docCount = run.document_ids?.length || 1

  return (
    <div className="report-paper">
      <div className="report-head">
        <div className="report-eyebrow">Validation report</div>
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
        </div>
      )}

      <div className="report-section-label">Findings · {results.length}</div>
      {results.length === 0 ? (
        <div className="finding-evidence">No validation results recorded for this run.</div>
      ) : (
        results.map((r, i) => <Finding key={`${r.rule_name}-${i}`} result={r} />)
      )}

      <div className="report-foot">
        Generated by Clerq2 · {output?.policy_name ?? policy?.name ?? ''}
        {output?.policy_version_num != null ? ` v${output.policy_version_num}` : ''} · {fmtDate(run.created_at)}
      </div>
    </div>
  )
}

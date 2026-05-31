import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Run, Policy, ValidationOutput, ValidationRuleResult } from '../types/workflow'
import type { Lang } from './i18n/dictionary'
import { ReportView, REPORT_CSS } from '../components/ReportView'

// ──────────────────────────────────────────────────────────────────────────
// Report export utilities: JSON, CSV, and PDF (via print window).
// The PDF path renders the same ReportView component used on screen into a
// new print window with the same REPORT_CSS, so the on-screen report and the
// downloaded PDF are visually identical by construction.
//
// These are NOT React components and cannot call useI18n(). The translator
// `t` (and the active `lang`) are passed in by the caller (ReportPage) so the
// CSV column headers, PDF document title, and the statically-rendered report
// markup are localized to match the on-screen page.
// ──────────────────────────────────────────────────────────────────────────

// Minimal translator signature — matches useI18n()'s `t`.
type Translate = (key: string, vars?: Record<string, string | number>) => string

function safeFilename(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'report'
}

function triggerDownload(content: BlobPart, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke after the click event has been dispatched.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function baseFilename(run: Run, output: ValidationOutput | null): string {
  const name = run.name ?? `case-${run.id}`
  const date = (run.created_at || '').slice(0, 10) || 'undated'
  const policy = output?.policy_name ? `-${output.policy_name}` : ''
  return safeFilename(`${date}-${name}${policy}`)
}

// Map a finding/verdict status value to a localized label (falls back to raw).
function statusLabel(t: Translate, status: string): string {
  const map: Record<string, string> = {
    pass: 'verdict.pass',
    fail: 'verdict.fail',
    uncertain: 'verdict.needs_review',
    not_applicable: 'verdict.not_applicable',
  }
  const key = map[status] ?? ''
  return key ? t(key) : status
}

// ─── JSON ────────────────────────────────────────────────────────────────
// JSON is a machine-readable export — keys and status VALUES stay canonical
// (untranslated) so downstream consumers can parse it reliably.

export function exportReportJSON(run: Run, output: ValidationOutput | null) {
  const payload = {
    case: {
      id: run.id,
      name: run.name,
      created_at: run.created_at,
      document_ids: run.document_ids,
      status: run.status,
      source: run.source,
    },
    policy: output ? {
      id: output.policy_id,
      name: output.policy_name,
      version: output.policy_version_num,
    } : null,
    overall: output?.overall ?? null,
    effective_overall: run.review?.effective_overall ?? output?.overall ?? null,
    results: output?.results ?? [],
    review: run.review ?? null,
    generated_at: new Date().toISOString(),
  }
  triggerDownload(
    JSON.stringify(payload, null, 2),
    'application/json',
    `${baseFilename(run, output)}.json`,
  )
}

// ─── CSV ─────────────────────────────────────────────────────────────────

export function exportReportCSV(run: Run, output: ValidationOutput | null, t: Translate) {
  const header = [
    t('report.csv.rule_name'),
    t('report.csv.scope'),
    t('report.csv.requirement'),
    t('report.csv.ai_status'),
    t('report.csv.effective_status'),
    t('report.csv.confidence_pct'),
    t('report.csv.evidence'),
    t('report.csv.reviewer_note'),
    t('report.csv.reviewer_override_reason'),
    t('report.csv.documents'),
    t('report.csv.extracted'),
  ]
  const lines: string[] = [header.map(csvEscape).join(',')]

  const annotations = run.review?.annotations ?? {}
  const results: ValidationRuleResult[] = output?.results ?? []
  for (const r of results) {
    const ann = annotations[r.rule_name]
    const effective = ann?.override?.status ?? r.status
    const perDocs = (r.per_document ?? []).map(p => p.document_filename).join('; ')
    const requirementLabel = r.requirement === 'optional' ? t('common.optional') : t('common.required')
    const row = [
      r.rule_name,
      r.scope ?? 'per_document',
      requirementLabel,
      statusLabel(t, r.status),
      statusLabel(t, effective),
      Math.round((r.confidence ?? 0) * 100),
      r.evidence ?? '',
      ann?.note ?? '',
      ann?.override?.reason ?? '',
      perDocs,
      r.extracted && Object.keys(r.extracted).length > 0 ? JSON.stringify(r.extracted) : '',
    ]
    lines.push(row.map(csvEscape).join(','))
  }

  // BOM + CRLF so Excel opens it cleanly.
  const csv = '﻿' + lines.join('\r\n') + '\r\n'
  triggerDownload(csv, 'text/csv;charset=utf-8', `${baseFilename(run, output)}.csv`)
}

// ─── PDF (via print window) ───────────────────────────────────────────────

export function printReportPDF(
  run: Run,
  policy: Policy | null | undefined,
  output: ValidationOutput | null,
  t: Translate,
  lang: Lang,
) {
  // ReportView is rendered to static markup OUTSIDE the I18nProvider here, so
  // it cannot read context — pass `t` explicitly so it localizes identically
  // to the on-screen page.
  const markup = renderToStaticMarkup(
    createElement(ReportView, { run, policy: policy ?? undefined, output, review: run.review ?? null, t })
  )
  const title = `${run.name ?? t('report.case', { id: run.id })} — ${t('report.export.reportSuffix')}`
  const html = `<!doctype html>
<html lang="${lang === 'fr' ? 'fr-CA' : 'en'}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    html, body { margin: 0; padding: 0; background: #f4f4f5; }
    body { padding: 20px 0; }
    @media print { body { background: #fff; padding: 0; } }
    ${REPORT_CSS}
  </style>
</head>
<body>
  ${markup}
  <script>
    window.addEventListener('load', () => {
      // Slight delay lets fonts settle before the print dialog opens.
      setTimeout(() => window.print(), 150);
    });
  </script>
</body>
</html>`
  // Use a Blob URL so the new window loads the HTML natively (more reliable
  // than document.write, which can fail across opener contexts). The HTML's
  // own onload script triggers window.print().
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const w = window.open(url, '_blank')
  if (!w) {
    URL.revokeObjectURL(url)
    alert(t('report.export.allowPopups'))
    return
  }
  // Revoke after the new window has had time to load the resource.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

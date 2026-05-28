import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Run, Policy, ValidationOutput, ValidationRuleResult } from '../types/workflow'
import { ReportView, REPORT_CSS } from '../components/ReportView'

// ──────────────────────────────────────────────────────────────────────────
// Report export utilities: JSON, CSV, and PDF (via print window).
// The PDF path renders the same ReportView component used on screen into a
// new print window with the same REPORT_CSS, so the on-screen report and the
// downloaded PDF are visually identical by construction.
// ──────────────────────────────────────────────────────────────────────────

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

// ─── JSON ────────────────────────────────────────────────────────────────

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
    results: output?.results ?? [],
    generated_at: new Date().toISOString(),
  }
  triggerDownload(
    JSON.stringify(payload, null, 2),
    'application/json',
    `${baseFilename(run, output)}.json`,
  )
}

// ─── CSV ─────────────────────────────────────────────────────────────────

export function exportReportCSV(run: Run, output: ValidationOutput | null) {
  const header = [
    'rule_name', 'scope', 'requirement', 'status', 'confidence_pct',
    'evidence', 'documents', 'extracted',
  ]
  const lines: string[] = [header.join(',')]

  const results: ValidationRuleResult[] = output?.results ?? []
  for (const r of results) {
    const perDocs = (r.per_document ?? []).map(p => p.document_filename).join('; ')
    const row = [
      r.rule_name,
      r.scope ?? 'per_document',
      r.requirement,
      r.status,
      Math.round((r.confidence ?? 0) * 100),
      r.evidence ?? '',
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

export function printReportPDF(run: Run, policy: Policy | null | undefined, output: ValidationOutput | null) {
  const markup = renderToStaticMarkup(
    createElement(ReportView, { run, policy: policy ?? undefined, output })
  )
  const title = (run.name ?? `Case ${run.id}`) + ' — Report'
  const html = `<!doctype html>
<html lang="en">
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
    alert('Please allow pop-ups to download the PDF.')
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

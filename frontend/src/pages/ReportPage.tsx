import { useParams, Link } from 'react-router-dom'
import { ChevronLeft, Download, FileJson, FileSpreadsheet, Loader2, FileText } from 'lucide-react'
import { LeftSidebar } from '../components/LeftSidebar'
import { ReportView, REPORT_CSS, getValidationOutput } from '../components/ReportView'
import { useRun } from '../api/runs'
import { usePolicy } from '../api/policies'
import { exportReportJSON, exportReportCSV, printReportPDF } from '../lib/reportExport'

export function ReportPage() {
  const { runId } = useParams<{ runId: string }>()
  const id = runId ? Number(runId) : NaN
  const { data: run, isLoading, isError } = useRun(Number.isFinite(id) ? id : null)
  const { data: policy } = usePolicy(run?.policy_id ?? null)
  const output = getValidationOutput(run)

  return (
    <div className="flex h-full min-w-0 flex-1 overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      {/* Inject the report stylesheet for the on-page paper rendering */}
      <style>{REPORT_CSS}</style>
      <LeftSidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--c-border)] px-6">
          <Link
            to="/validate"
            className="flex items-center gap-1.5 text-[12px] text-[var(--c-text-5)] transition-colors hover:text-[var(--c-text-2)]"
          >
            <ChevronLeft size={12} />
            Cases
          </Link>
          <div className="h-3.5 w-px bg-[var(--c-border-2)]" />
          <FileText size={13} className="shrink-0 text-[var(--c-text-4)]" />
          <span className="max-w-[420px] truncate text-[13px] font-medium text-[var(--c-text-1)]">
            {run?.name ?? (isLoading ? 'Loading…' : `Run #${id}`)}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {run && (
              <>
                <button
                  onClick={() => exportReportCSV(run, output)}
                  className="flex h-7 items-center gap-1.5 rounded border border-[var(--c-border-2)] px-3 text-[12px] text-[var(--c-text-3)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-1)]"
                  title="Export CSV"
                >
                  <FileSpreadsheet size={11} />
                  CSV
                </button>
                <button
                  onClick={() => exportReportJSON(run, output)}
                  className="flex h-7 items-center gap-1.5 rounded border border-[var(--c-border-2)] px-3 text-[12px] text-[var(--c-text-3)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-1)]"
                  title="Export JSON"
                >
                  <FileJson size={11} />
                  JSON
                </button>
                <button
                  onClick={() => printReportPDF(run, policy, output)}
                  className="flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-3 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500"
                  title="Download PDF"
                >
                  <Download size={11} />
                  Download PDF
                </button>
              </>
            )}
          </div>
        </header>

        {/* Body — the paper-style report on a calm surface */}
        <div className="flex-1 overflow-y-auto bg-[var(--c-bg)] py-8">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-24 text-[12px] text-[var(--c-text-5)]">
              <Loader2 size={12} className="animate-spin" /> Loading report…
            </div>
          )}
          {isError && (
            <div className="mx-auto max-w-[820px] px-6 py-12 text-center text-[13px] text-[var(--c-text-4)]">
              Could not load this report. It may have been removed.{' '}
              <Link to="/validate" className="text-indigo-400 hover:underline">Back to cases</Link>.
            </div>
          )}
          {!isLoading && !isError && run && (
            <ReportView run={run} policy={policy ?? undefined} output={output} />
          )}
        </div>
      </div>
    </div>
  )
}

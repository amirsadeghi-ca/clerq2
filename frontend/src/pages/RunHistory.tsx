import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ChevronRight, CheckCircle2, XCircle, Loader2, Clock, GitCommit, Terminal } from 'lucide-react'
import { useRuns } from '../api/runs'
import { useWorkflow } from '../api/workflows'
import { LeftSidebar } from '../components/LeftSidebar'
import { LogViewer } from '../components/LogViewer'
import type { Run, RunStep, RunStatus } from '../types/workflow'

const NODE_LABELS: Record<string, string> = {
  input: 'Document Input',
  email_input: 'Email Input',
  pdf_to_images: 'PDF → Images',
  ai: 'AI',
  validate_documents: 'Validate Documents',
  output: 'Collect Output',
  send_email: 'Send Email',
  show_results: 'Show Results',
}

function StatusDot({ status }: { status: RunStatus }) {
  if (status === 'completed') return <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
  if (status === 'failed')    return <div className="h-1.5 w-1.5 rounded-full bg-red-400" />
  if (status === 'running')   return <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
  return <div className="h-1.5 w-1.5 rounded-full bg-[var(--c-text-5)]" />
}

function StepStatus({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 size={12} className="text-emerald-400" />
  if (status === 'failed')    return <XCircle size={12} className="text-red-400" />
  if (status === 'running')   return <Loader2 size={12} className="animate-spin text-indigo-400" />
  return <div className="h-[12px] w-[12px] rounded-full border border-[var(--c-border-3)]" />
}

function ms(run: Run) {
  if (!run.started_at || !run.completed_at) return null
  const d = new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
  return d < 1000 ? `${d}ms` : `${(d / 1000).toFixed(1)}s`
}

export function RunHistory() {
  const { id } = useParams<{ id: string }>()
  const workflowId = Number(id)
  const navigate = useNavigate()
  const { data: workflow } = useWorkflow(workflowId)
  const { data: runs, isLoading } = useRuns(workflowId)
  const [logStep, setLogStep] = useState<{ step: RunStep; runId: number } | null>(null)

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      <LeftSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-[52px] shrink-0 items-center gap-1.5 border-b border-[var(--c-border)] px-8">
          <nav className="flex items-center gap-1 text-[13px]">
            <Link to="/workflows" className="text-[var(--c-text-4)] hover:text-[var(--c-text-3)] transition-colors">Workflows</Link>
            <ChevronRight size={12} className="text-[var(--c-text-5)]" />
            <Link
              to={`/workflows/${workflowId}`}
              className="text-[var(--c-text-4)] hover:text-[var(--c-text-3)] transition-colors"
            >
              {workflow?.name}
            </Link>
            <ChevronRight size={12} className="text-[var(--c-text-5)]" />
            <span className="text-[var(--c-text-3)]">Runs</span>
          </nav>
        </header>

        <main className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center gap-2 px-8 py-6 text-[13px] text-[var(--c-text-5)]">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : runs?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <Clock size={24} className="mb-3 text-[var(--c-text-6)]" />
              <p className="text-[13px] text-[var(--c-text-5)]">No runs yet</p>
              <p className="mt-1 text-[12px] text-[var(--c-text-6)]">
                Trigger a run from the workflow editor.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--c-divider)]">
              {/* Table header */}
              <div className="flex items-center px-8 py-2">
                <span className="text-[11px] font-medium text-[var(--c-text-5)] w-16">Status</span>
                <span className="text-[11px] font-medium text-[var(--c-text-5)] w-16">Run</span>
                <span className="text-[11px] font-medium text-[var(--c-text-5)] w-12">Ver.</span>
                <span className="text-[11px] font-medium text-[var(--c-text-5)]">Steps</span>
                <span className="text-[11px] font-medium text-[var(--c-text-5)] ml-auto">Date</span>
              </div>

              {runs?.map((run: Run) => (
                <div key={run.id} className="px-8 py-4 hover:bg-white/[0.01] transition-colors">
                  <div className="flex items-center gap-4">
                    {/* Status */}
                    <div className="flex w-16 items-center gap-2">
                      <StatusDot status={run.status} />
                      <span className="text-[12px] text-[var(--c-text-4)]">{run.status}</span>
                    </div>

                    {/* Run # */}
                    <span className="w-16 font-mono text-[12px] text-[var(--c-text-5)]">#{run.id}</span>

                    {/* Version */}
                    <div className="flex w-12 items-center">
                      {run.version_num != null ? (
                        <span className="flex items-center gap-0.5 font-mono text-[11px] text-[var(--c-text-5)]">
                          <GitCommit size={9} className="text-[var(--c-text-5)]" />
                          v{run.version_num}
                        </span>
                      ) : (
                        <span className="text-[11px] text-[var(--c-text-5)]">—</span>
                      )}
                    </div>

                    {/* Steps inline */}
                    <div className="flex flex-1 items-center gap-1.5">
                      {run.steps.map((step, i) => {
                        const hasLogs = step.logs && step.logs.length > 0
                        return (
                          <div key={step.id} className="flex items-center gap-1.5">
                            <div className="flex items-center gap-1.5 rounded border border-[var(--c-border)] bg-[var(--c-surface-2)] px-2.5 py-1.5">
                              <StepStatus status={step.status} />
                              <span className="text-[11px] text-[var(--c-text-4)]">
                                {NODE_LABELS[step.node_type] ?? step.node_type}
                              </span>
                              {step.node_type === 'validate_documents' && !!step.output_data?.policy_name && (
                                <span className="flex items-center gap-0.5 font-mono text-[10px] text-[var(--c-text-5)]">
                                  · {String(step.output_data.policy_name)}
                                  {step.output_data.policy_version_num != null && (
                                    <span className="ml-0.5 text-[9px] text-[var(--c-text-5)]">v{String(step.output_data.policy_version_num)}</span>
                                  )}
                                </span>
                              )}
                              <button
                                onClick={e => { e.stopPropagation(); setLogStep({ step, runId: run.id }) }}
                                className={[
                                  'flex items-center gap-1 rounded px-1 py-0.5 text-[10px] transition-colors',
                                  hasLogs
                                    ? 'text-indigo-400 hover:bg-indigo-500/10'
                                    : 'text-[var(--c-text-6)] hover:text-[var(--c-text-5)]',
                                ].join(' ')}
                                title="View logs"
                              >
                                <Terminal size={10} />
                                {hasLogs && <span>{step.logs!.length}</span>}
                              </button>
                            </div>
                            {i < run.steps.length - 1 && (
                              <div className="h-px w-3 bg-[var(--c-border)]" />
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Meta */}
                    <div className="ml-auto flex items-center gap-3 text-[12px] text-[var(--c-text-5)]">
                      {ms(run) && (
                        <span className="font-mono text-[var(--c-text-5)]">{ms(run)}</span>
                      )}
                      <span>
                        {new Date(run.created_at).toLocaleString(undefined, {
                          month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  {run.error && (
                    <p className="mt-2 rounded border border-red-500/20 bg-red-500/5 px-3 py-1.5 font-mono text-[11px] text-red-400">
                      {run.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {logStep && (
        <LogViewer
          title={`Run #${logStep.runId} · ${NODE_LABELS[logStep.step.node_type] ?? logStep.step.node_type} — Logs`}
          logs={logStep.step.logs ?? []}
          onClose={() => setLogStep(null)}
        />
      )}
    </div>
  )
}

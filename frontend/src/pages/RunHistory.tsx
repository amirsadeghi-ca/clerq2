import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronRight, CheckCircle2, XCircle, Loader2, Clock, GitCommit, Terminal, Menu } from 'lucide-react'
import { useRuns } from '../api/runs'
import { useWorkflow } from '../api/workflows'
import { LeftSidebar } from '../components/LeftSidebar'
import { LogViewer } from '../components/LogViewer'
import { useI18n } from '../context/i18n'
import { useMobileSidebar } from '../hooks/useMobileSidebar'
import type { Run, RunStep, RunStatus } from '../types/workflow'

const NODE_KEYS: Record<string, string> = {
  input: 'workflows.node.input',
  email_input: 'workflows.node.email_input',
  pdf_to_images: 'workflows.node.pdf_to_images',
  ai: 'workflows.node.ai',
  validate_documents: 'workflows.node.validate_documents',
  output: 'workflows.node.output',
  send_email: 'workflows.node.send_email',
  show_results: 'workflows.node.show_results',
}

const STATUS_KEYS: Record<string, string> = {
  pending: 'status.pending',
  running: 'status.running',
  completed: 'status.completed',
  failed: 'status.failed',
  cancelled: 'status.cancelled',
}

function StatusDot({ status }: { status: RunStatus }) {
  if (status === 'completed') return <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
  if (status === 'failed')    return <div className="h-1.5 w-1.5 rounded-full bg-red-400" />
  if (status === 'running')   return <div className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
  if (status === 'waiting')   return <div className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
  return <div className="h-1.5 w-1.5 rounded-full bg-[var(--c-text-5)]" />
}

function StepStatus({ status }: { status: string }) {
  if (status === 'succeeded') return <CheckCircle2 size={12} className="text-emerald-400" />
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
  const { t } = useI18n()
  const { sidebarOpen, openSidebar, closeSidebar } = useMobileSidebar()
  const nodeLabel = (type: string) => (NODE_KEYS[type] ? t(NODE_KEYS[type]) : type)
  const { data: workflow } = useWorkflow(workflowId)
  const { data: runs, isLoading } = useRuns(workflowId)
  const [logStep, setLogStep] = useState<{ step: RunStep; runId: number } | null>(null)

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={closeSidebar} />
      )}
      <div className={['fixed inset-y-0 left-0 z-50 md:relative md:z-auto md:flex md:shrink-0', sidebarOpen ? 'flex' : 'hidden'].join(' ')}>
        <LeftSidebar />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-[52px] shrink-0 items-center gap-1.5 border-b border-[var(--c-border)] px-4 md:px-8">
          <button
            className="rounded-md p-1.5 text-[var(--c-text-4)] hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-2)] md:hidden"
            onClick={openSidebar}
          >
            <Menu size={16} />
          </button>
          <nav className="flex items-center gap-1 text-[13px]">
            <Link to="/workflows" className="text-[var(--c-text-4)] hover:text-[var(--c-text-3)] transition-colors">{t('workflows.title')}</Link>
            <ChevronRight size={12} className="text-[var(--c-text-5)]" />
            <Link
              to={`/workflows/${workflowId}`}
              className="text-[var(--c-text-4)] hover:text-[var(--c-text-3)] transition-colors"
            >
              {workflow?.name}
            </Link>
            <ChevronRight size={12} className="text-[var(--c-text-5)]" />
            <span className="text-[var(--c-text-3)]">{t('workflows.runs.crumb')}</span>
          </nav>
        </header>

        <main className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center gap-2 px-8 py-6 text-[13px] text-[var(--c-text-5)]">
              <Loader2 size={14} className="animate-spin" /> {t('common.loading')}
            </div>
          ) : runs?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <Clock size={24} className="mb-3 text-[var(--c-text-6)]" />
              <p className="text-[13px] text-[var(--c-text-5)]">{t('workflows.runs.empty')}</p>
              <p className="mt-1 text-[12px] text-[var(--c-text-6)]">
                {t('workflows.runs.emptyHint')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <div className="divide-y divide-[var(--c-divider)] min-w-[540px]">
              {/* Table header */}
              <div className="flex items-center px-4 py-2 md:px-8">
                <span className="text-[11px] font-medium text-[var(--c-text-5)] w-16">{t('workflows.col.status')}</span>
                <span className="text-[11px] font-medium text-[var(--c-text-5)] w-16">{t('workflows.col.run')}</span>
                <span className="text-[11px] font-medium text-[var(--c-text-5)] w-12">{t('workflows.col.version')}</span>
                <span className="text-[11px] font-medium text-[var(--c-text-5)]">{t('workflows.col.steps')}</span>
                <span className="text-[11px] font-medium text-[var(--c-text-5)] ml-auto">{t('workflows.col.date')}</span>
              </div>

              {runs?.map((run: Run) => (
                <div key={run.id} className="px-4 py-4 hover:bg-white/[0.01] transition-colors md:px-8">
                  <div className="flex items-center gap-4">
                    {/* Status */}
                    <div className="flex w-16 items-center gap-2">
                      <StatusDot status={run.status} />
                      <span className="text-[12px] text-[var(--c-text-4)]">{STATUS_KEYS[run.status] ? t(STATUS_KEYS[run.status]) : run.status}</span>
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
                                {nodeLabel(step.node_type)}
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
                                title={t('workflows.runs.viewLogs')}
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
            </div>
          )}
        </main>
      </div>

      {logStep && (
        <LogViewer
          title={t('workflows.runs.logsTitle', { id: logStep.runId, node: nodeLabel(logStep.step.node_type) })}
          logs={logStep.step.logs ?? []}
          onClose={() => setLogStep(null)}
        />
      )}
    </div>
  )
}

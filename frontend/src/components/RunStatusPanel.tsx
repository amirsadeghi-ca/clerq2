import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, Circle, Loader2, XCircle, X, ChevronDown, ChevronUp, Images, Terminal, Square, Clock, MinusCircle, Ban } from 'lucide-react'
import type { RunStep, RunStatus, SSERunUpdate, ValidationOutput } from '../types/workflow'
import { RunOutputViewer } from './RunOutputViewer'
import { LogViewer } from './LogViewer'
import { useRun, useCancelRun } from '../api/runs'
import { useI18n } from '../context/i18n'

interface Props {
  runId: number
  onDismiss: () => void
}

function StepIcon({ status }: { status: string }) {
  if (status === 'succeeded') return <CheckCircle2 size={12} className="shrink-0 text-emerald-400" />
  if (status === 'running')   return <Loader2 size={12} className="shrink-0 animate-spin text-indigo-400" />
  if (status === 'failed')    return <XCircle size={12} className="shrink-0 text-red-400" />
  if (status === 'waiting')   return <Clock size={12} className="shrink-0 text-amber-400" />
  if (status === 'skipped')   return <MinusCircle size={12} className="shrink-0 text-[var(--c-text-5)]" />
  if (status === 'cancelled') return <Ban size={12} className="shrink-0 text-[var(--c-text-5)]" />
  return <Circle size={12} className="shrink-0 text-[var(--c-text-5)]" />  // pending / ready
}

const STATUS_COLOR: Record<RunStatus, string> = {
  pending: 'text-[var(--c-text-4)]',
  running: 'text-indigo-400',
  waiting: 'text-amber-400',
  completed: 'text-emerald-400',
  failed: 'text-red-400',
  cancelled: 'text-[var(--c-text-4)]',
}

const NODE_TYPES = new Set([
  'input',
  'email_input',
  'pdf_to_images',
  'ai',
  'validate_documents',
  'output',
  'send_email',
  'show_results',
])

function nodeLabel(t: (k: string) => string, nodeType: string): string {
  return NODE_TYPES.has(nodeType) ? t(`runstatus.node.${nodeType}`) : nodeType
}

const OVERALL_STYLES: Record<string, string> = {
  pass: 'text-emerald-400 bg-emerald-500/10',
  fail: 'text-red-400 bg-red-500/10',
  needs_review: 'text-amber-400 bg-amber-500/10',
}
const RESULT_STYLES: Record<string, string> = {
  pass: 'text-emerald-400',
  fail: 'text-red-400',
  uncertain: 'text-amber-400',
}

function collectImagePaths(steps: RunStep[]): string[] {
  for (const step of steps) {
    const paths = step.output_data?.image_paths
    if (Array.isArray(paths) && paths.length > 0) return paths as string[]
  }
  return []
}

export function RunStatusPanel({ runId, onDismiss }: Props) {
  const [sseState, setSseState] = useState<SSERunUpdate | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [showImages, setShowImages] = useState(false)
  const [logStep, setLogStep] = useState<RunStep | null>(null)
  const esRef = useRef<EventSource | null>(null)

  const { data: runData } = useRun(runId)
  const cancelRun = useCancelRun()
  const { t } = useI18n()

  useEffect(() => {
    setSseState(null)
    setShowImages(false)
    const tok = localStorage.getItem('auth.access_token') || ''
    const es = new EventSource(`/api/runs/${runId}/stream?access_token=${encodeURIComponent(tok)}`)
    esRef.current = es
    es.addEventListener('update', (e) => setSseState(JSON.parse(e.data)))
    es.addEventListener('done', () => es.close())
    es.onerror = () => es.close()
    return () => es.close()
  }, [runId])

  // SSE data takes priority; fall back to REST data when SSE hasn't arrived yet
  const state: SSERunUpdate | null = sseState ?? (runData ? {
    run_id: runData.id,
    status: runData.status,
    error: runData.error,
    steps: runData.steps,
  } : null)

  const imagePaths = state ? collectImagePaths(state.steps) : []
  const hasImages = imagePaths.length > 0
  const isActive = state?.status === 'pending' || state?.status === 'running'

  async function handleStop(e: React.MouseEvent) {
    e.stopPropagation()
    await cancelRun.mutateAsync(runId)
  }

  return (
    <>
      <div className="w-full shrink-0 border-t border-[var(--c-border)] bg-[var(--c-surface-2)]">
        <div
          className="flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-[var(--c-hover-1)]"
          onClick={() => setExpanded(v => !v)}
        >
          <span className="text-[12px] font-medium text-[var(--c-text-3)]">{t('runstatus.run', { id: runId })}</span>
          {state && (
            <span className={`text-[12px] font-medium ${STATUS_COLOR[state.status]}`}>
              · {t(`status.${state.status}`)}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {hasImages && (
              <button
                onClick={e => { e.stopPropagation(); setShowImages(true) }}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-indigo-400 hover:bg-indigo-500/10 transition-colors"
              >
                <Images size={11} /> {t('runstatus.viewImages')}
              </button>
            )}
            {isActive && (
              <button
                onClick={handleStop}
                disabled={cancelRun.isPending}
                className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                <Square size={10} fill="currentColor" /> {t('btn.stop')}
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); onDismiss() }}
              className="rounded p-0.5 text-[var(--c-text-5)] hover:text-[var(--c-text-4)] transition-colors"
              title={t('runstatus.dismiss')}
            >
              <X size={12} />
            </button>
            {expanded
              ? <ChevronDown size={12} className="text-[var(--c-text-5)]" />
              : <ChevronUp size={12} className="text-[var(--c-text-5)]" />}
          </div>
        </div>

        {expanded && (
          <div className="px-4 pb-3">
            {!state ? (
              <div className="flex items-center gap-2 text-[11px] text-[var(--c-text-5)]">
                <Loader2 size={10} className="animate-spin" /> {t('runstatus.connecting')}
              </div>
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto">
                {state.steps.map((step: RunStep, i: number) => {
                  const hasLogs = step.logs && step.logs.length > 0
                  return (
                    <div key={step.id} className="flex items-center gap-2 shrink-0">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 rounded border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2">
                          <StepIcon status={step.status} />
                          <span className="text-[12px] text-[var(--c-text-2)]">
                            {nodeLabel(t, step.node_type)}
                          </span>
                          {step.status === 'succeeded' && step.output_data?.page_count != null && (
                            <span className="text-[10px] text-[var(--c-text-5)] font-mono">
                              {t('runstatus.pages', { count: step.output_data.page_count as number })}
                            </span>
                          )}
                          {step.status === 'succeeded' && step.node_type === 'validate_documents' && (() => {
                            const vOut = step.output_data as ValidationOutput | null
                            if (!vOut?.overall) return null
                            return (
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${OVERALL_STYLES[vOut.overall] ?? ''}`}>
                                {t(`verdict.${vOut.overall}`)}
                              </span>
                            )
                          })()}
                          {step.error && (
                            <span className="max-w-[140px] truncate text-[10px] text-red-500 font-mono">
                              {step.error}
                            </span>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); setLogStep(step) }}
                            className={[
                              'ml-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors',
                              hasLogs
                                ? 'text-indigo-400 hover:bg-indigo-500/10'
                                : 'text-[var(--c-text-5)] hover:text-[var(--c-text-4)] hover:bg-white/[0.04]',
                            ].join(' ')}
                            title={t('runstatus.viewLogs')}
                          >
                            <Terminal size={10} />
                            <span>{hasLogs ? t('runstatus.logsCount', { count: step.logs!.length }) : t('runstatus.logs')}</span>
                          </button>
                        </div>
                        {step.status === 'succeeded' && step.node_type === 'validate_documents' && (() => {
                          const vOut = step.output_data as ValidationOutput | null
                          if (!vOut?.results?.length) return null
                          return (
                            <div className="flex flex-col gap-0.5 rounded border border-[var(--c-border)] bg-[var(--c-surface-2)] px-2 py-1.5">
                              {vOut.results.map((r, ri) => (
                                <div key={ri} className="flex items-center gap-1.5">
                                  <span className={`text-[10px] font-medium ${RESULT_STYLES[r.status] ?? 'text-[var(--c-text-4)]'}`}>
                                    {r.status === 'pass' ? '✓' : r.status === 'fail' ? '✗' : '?'}
                                  </span>
                                  <span className="text-[10px] text-[var(--c-text-4)] truncate max-w-[160px]">{r.rule_name}</span>
                                  <span className="ml-auto font-mono text-[9px] text-[var(--c-text-5)]">{Math.round(r.confidence * 100)}%</span>
                                </div>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                      {i < state.steps.length - 1 && (
                        <div className="h-px w-3 bg-[var(--c-border-2)] shrink-0" />
                      )}
                    </div>
                  )
                })}
                {state.error && (
                  <p className="ml-2 text-[11px] text-red-400">{state.error}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showImages && (
        <RunOutputViewer imagePaths={imagePaths} onClose={() => setShowImages(false)} />
      )}

      {logStep && (
        <LogViewer
          title={t('runstatus.logsTitle', { label: nodeLabel(t, logStep.node_type) })}
          logs={logStep.logs ?? []}
          onClose={() => setLogStep(null)}
        />
      )}
    </>
  )
}

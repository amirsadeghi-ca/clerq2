import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Star, ArrowRight, Upload, X, CheckCircle2, XCircle, Loader2,
  Circle, ExternalLink, ChevronLeft, ChevronRight, BarChart2,
} from 'lucide-react'
import { useWorkflows } from '../api/workflows'
import client from '../api/client'
import { useI18n } from '../context/i18n'
import { LeftSidebar } from '../components/LeftSidebar'
import type { RunStep, RunStatus, SSERunUpdate, ValidationOutput } from '../types/workflow'

// ── Types ──────────────────────────────────────────────────────────────────

type WidgetPhase = 'idle' | 'file-selected' | 'running' | 'done'

interface WidgetState {
  phase: WidgetPhase
  file: File | null
  documentId: number | null
  runId: number | null
  runStatus: RunStatus | null
  steps: RunStep[]
  error: string | null
  uploading: boolean
}

function emptyWidget(): WidgetState {
  return {
    phase: 'idle',
    file: null,
    documentId: null,
    runId: null,
    runStatus: null,
    steps: [],
    error: null,
    uploading: false,
  }
}

// ── Helper: find show_results step output ─────────────────────────────────

function findShowResultsOutput(steps: RunStep[]): Record<string, unknown> | null {
  const step = steps.find(s => s.node_type === 'show_results' && s.status === 'completed' && s.output_data)
  return step?.output_data ?? null
}

function collectImagePaths(steps: RunStep[]): string[] {
  for (const step of steps) {
    const paths = step.output_data?.image_paths
    if (Array.isArray(paths) && paths.length > 0) return paths as string[]
  }
  return []
}

// ── Status icon ───────────────────────────────────────────────────────────

function StepIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 size={11} className="shrink-0 text-emerald-400" />
  if (status === 'running') return <Loader2 size={11} className="shrink-0 animate-spin text-indigo-400" />
  if (status === 'failed') return <XCircle size={11} className="shrink-0 text-red-400" />
  return <Circle size={11} className="shrink-0 text-[var(--c-text-5)]" />
}

const STATUS_COLORS: Record<RunStatus, string> = {
  pending: 'text-[var(--c-text-5)]',
  running: 'text-indigo-400',
  completed: 'text-emerald-400',
  failed: 'text-red-400',
}

// ── Sidebar result renderers ──────────────────────────────────────────────

function ImageResultPanel({ steps }: { steps: RunStep[] }) {
  const imagePaths = collectImagePaths(steps)
  const [lightbox, setLightbox] = useState<number | null>(null)

  function prev() {
    setLightbox(i => (i === null ? null : i > 0 ? i - 1 : imagePaths.length - 1))
  }
  function next() {
    setLightbox(i => (i === null ? null : i < imagePaths.length - 1 ? i + 1 : 0))
  }

  if (!imagePaths.length) return null

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {imagePaths.map((rel, i) => (
          <button
            key={rel}
            onClick={() => setLightbox(i)}
            className="group relative aspect-[3/4] overflow-hidden rounded border border-[var(--c-border)] bg-[var(--c-surface-2)] transition-[border-color] hover:border-[var(--c-border-3)]"
          >
            <img
              src={`/api/files/${rel}`}
              alt={`Page ${i + 1}`}
              className="h-full w-full object-contain"
              loading="lazy"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/50 to-transparent px-1.5 py-1 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="text-[10px] text-white">p. {i + 1}</span>
            </div>
          </button>
        ))}
      </div>

      {lightbox !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={e => { e.stopPropagation(); prev() }}
            className="absolute left-4 rounded-full border border-[var(--c-border-3)] bg-[var(--c-surface)] p-2 text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
          >
            <ChevronLeft size={14} />
          </button>
          <img
            src={`/api/files/${imagePaths[lightbox]}`}
            alt={`Page ${lightbox + 1}`}
            className="max-h-[90vh] max-w-[80vw] rounded object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={e => { e.stopPropagation(); next() }}
            className="absolute right-4 rounded-full border border-[var(--c-border-3)] bg-[var(--c-surface)] p-2 text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
          >
            <ChevronRight size={14} />
          </button>
          <div className="absolute bottom-4 text-[12px] text-[var(--c-text-4)]">
            {lightbox + 1} / {imagePaths.length}
          </div>
        </div>
      )}
    </>
  )
}

const OVERALL_STYLES: Record<string, string> = {
  pass: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  fail: 'text-red-400 bg-red-500/10 border-red-500/20',
  needs_review: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
}

const RESULT_ICON: Record<string, string> = {
  pass: '✓',
  fail: '✗',
  uncertain: '?',
  not_applicable: '–',
}

const RESULT_COLORS: Record<string, string> = {
  pass: 'text-emerald-400',
  fail: 'text-red-400',
  uncertain: 'text-amber-400',
  not_applicable: 'text-[var(--c-text-4)]',
}

function ValidationResultPanel({ output }: { output: ValidationOutput }) {
  const { t } = useI18n()
  const OVERALL_LABELS: Record<string, string> = {
    pass: t('dashboard.overall.pass'),
    fail: t('dashboard.overall.fail'),
    needs_review: t('dashboard.overall.needs_review'),
  }
  return (
    <div className="flex flex-col gap-3">
      <div className={`flex items-center justify-center rounded-lg border px-4 py-3 ${OVERALL_STYLES[output.overall] ?? ''}`}>
        <span className="text-[16px] font-semibold">{OVERALL_LABELS[output.overall] ?? output.overall}</span>
      </div>
      {output.results.length > 0 && (
        <div className="flex flex-col gap-1">
          {output.results.map((r, i) => (
            <div key={i} className="flex items-center gap-2 rounded border border-[var(--c-border)] bg-[var(--c-surface-2)] px-2.5 py-1.5">
              <span className={`text-[12px] font-bold ${RESULT_COLORS[r.status] ?? 'text-[var(--c-text-4)]'}`}>
                {RESULT_ICON[r.status] ?? '?'}
              </span>
              <span className="flex-1 truncate text-[11px] text-[var(--c-text-3)]">{r.rule_name}</span>
              <span className="shrink-0 font-mono text-[10px] text-[var(--c-text-5)]">
                {Math.round(r.confidence * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ResultsSidebar({
  workflowName,
  runStatus,
  steps,
  onClose,
}: {
  workflowName: string
  runStatus: RunStatus | null
  steps: RunStep[]
  onClose: () => void
}) {
  const { t } = useI18n()
  const output = findShowResultsOutput(steps)
  const imagePaths = collectImagePaths(steps)
  const validationOutput = output && 'overall' in output ? (output as unknown as ValidationOutput) : null

  return (
    <div className="flex h-full w-[400px] shrink-0 flex-col border-l border-[var(--c-border)] bg-[var(--c-surface)]">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--c-border)] px-4 py-3">
        <div>
          <p className="text-[13px] font-medium text-[var(--c-text-1)]">{workflowName}</p>
          {runStatus && (
            <p className={`text-[11px] font-medium ${STATUS_COLORS[runStatus]}`}>
              {t(`status.${runStatus}`)}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-[var(--c-text-5)] hover:text-[var(--c-text-4)] transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {validationOutput ? (
          <ValidationResultPanel output={validationOutput} />
        ) : imagePaths.length > 0 ? (
          <ImageResultPanel steps={steps} />
        ) : output ? (
          <pre className="overflow-x-auto rounded border border-[var(--c-border)] bg-[var(--c-surface-2)] p-3 font-mono text-[11px] text-[var(--c-text-3)] whitespace-pre-wrap break-all">
            {JSON.stringify(output, null, 2)}
          </pre>
        ) : (
          <p className="text-[12px] text-[var(--c-text-5)]">{t('dashboard.noResultData')}</p>
        )}
      </div>
    </div>
  )
}

// ── Drop zone ─────────────────────────────────────────────────────────────

function DropZone({
  onFile,
  dragActive,
  onDragEnter,
  onDragLeave,
  onDrop,
}: {
  onFile: (f: File) => void
  dragActive: boolean
  onDragEnter: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { t } = useI18n()

  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragEnter(e) }}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={e => {
        e.preventDefault()
        onDrop(e)
        const file = e.dataTransfer.files?.[0]
        if (file) onFile(file)
      }}
      onClick={() => inputRef.current?.click()}
      className={[
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 transition-colors',
        dragActive
          ? 'border-indigo-500/50 bg-indigo-500/5'
          : 'border-[var(--c-border-3)] hover:border-indigo-500/30 hover:bg-indigo-500/3',
      ].join(' ')}
    >
      <Upload size={18} className={dragActive ? 'text-indigo-400' : 'text-[var(--c-text-5)]'} />
      <div className="text-center">
        <p className="text-[12px] font-medium text-[var(--c-text-3)]">{t('dashboard.dropTitle')}</p>
        <p className="text-[11px] text-[var(--c-text-5)]">{t('dashboard.dropHint')}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

// ── Widget ────────────────────────────────────────────────────────────────

function WorkflowWidget({
  workflowId,
  workflowName,
  onSidebarOpen,
}: {
  workflowId: number
  workflowName: string
  onSidebarOpen: (workflowId: number, runStatus: RunStatus, steps: RunStep[]) => void
}) {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [state, setState] = useState<WidgetState>(emptyWidget())
  const [dragActive, setDragActive] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  const NODE_LABELS: Record<string, string> = {
    input: t('dashboard.node.input'),
    pdf_to_images: t('dashboard.node.pdf_to_images'),
    output: t('dashboard.node.output'),
    validate_documents: t('dashboard.node.validate_documents'),
    show_results: t('dashboard.node.show_results'),
  }

  // Last run info
  const [lastRun, setLastRun] = useState<{ id: number; status: RunStatus; created_at: string } | null>(null)

  useEffect(() => {
    client.get('/runs/', { params: { workflow_id: workflowId } })
      .then(r => {
        const runs = r.data as Array<{ id: number; status: RunStatus; created_at: string }>
        if (runs.length > 0) setLastRun(runs[0])
      })
      .catch(() => {/* ignore */})
  }, [workflowId])

  const connectSSE = useCallback((runId: number) => {
    if (esRef.current) esRef.current.close()
    const es = new EventSource(`/api/runs/${runId}/stream`)
    esRef.current = es

    es.addEventListener('update', (e) => {
      const update = JSON.parse(e.data) as SSERunUpdate
      setState(prev => ({
        ...prev,
        runStatus: update.status,
        steps: update.steps,
        phase: update.status === 'completed' || update.status === 'failed' ? 'done' : 'running',
      }))

      // If show_results node completed, open sidebar
      const showResultsDone = update.steps.some(
        s => s.node_type === 'show_results' && s.status === 'completed'
      )
      if (showResultsDone && (update.status === 'completed' || update.status === 'failed')) {
        onSidebarOpen(workflowId, update.status, update.steps)
      }
    })

    es.addEventListener('done', () => {
      es.close()
    })

    es.onerror = () => es.close()
  }, [workflowId, onSidebarOpen])

  useEffect(() => {
    return () => { esRef.current?.close() }
  }, [])

  async function handleFile(file: File) {
    setState(prev => ({ ...prev, file, phase: 'file-selected' }))
  }

  async function handleRun() {
    if (!state.file) return
    setState(prev => ({ ...prev, uploading: true, error: null }))

    try {
      // 1. Upload document
      const fd = new FormData()
      fd.append('file', state.file)
      const docRes = await client.post('/documents/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const documentId = docRes.data.id as number

      // 2. Trigger run
      const runRes = await client.post('/runs/', { workflow_id: workflowId, document_id: documentId })
      const runId = runRes.data.id as number

      setState(prev => ({
        ...prev,
        documentId,
        runId,
        uploading: false,
        phase: 'running',
        runStatus: 'pending',
        steps: [],
      }))

      connectSSE(runId)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('dashboard.uploadFailed')
      setState(prev => ({ ...prev, uploading: false, error: message }))
    }
  }

  function handleClear() {
    esRef.current?.close()
    setState(emptyWidget())
  }

  function formatRelativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60_000)
    const hours = Math.floor(diff / 3_600_000)
    const days = Math.floor(diff / 86_400_000)
    if (mins < 1) return t('dashboard.justNow')
    if (mins < 60) return t('dashboard.minutesAgo', { mins })
    if (hours < 24) return t('dashboard.hoursAgo', { hours })
    return t('dashboard.daysAgo', { days })
  }

  return (
    <div className="flex flex-col rounded-lg border border-[var(--c-border-2)] bg-[var(--c-surface)] shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--c-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Star size={12} className="fill-current text-amber-400" />
          <span className="text-[13px] font-medium text-[var(--c-text-1)]">{workflowName}</span>
        </div>
        <button
          onClick={() => navigate(`/workflows/${workflowId}`)}
          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-[var(--c-text-5)] hover:text-[var(--c-text-3)] hover:bg-[var(--c-hover-3)] transition-colors"
          title={t('dashboard.openInEditor')}
        >
          <ExternalLink size={10} />
          {t('btn.open')}
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-3 p-4">
        {/* Idle — drop zone */}
        {state.phase === 'idle' && (
          <DropZone
            onFile={handleFile}
            dragActive={dragActive}
            onDragEnter={() => setDragActive(true)}
            onDragLeave={() => setDragActive(false)}
            onDrop={() => setDragActive(false)}
          />
        )}

        {/* File selected */}
        {state.phase === 'file-selected' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-3 py-2">
              <Upload size={12} className="shrink-0 text-[var(--c-text-5)]" />
              <span className="flex-1 truncate text-[12px] text-[var(--c-text-2)]">{state.file?.name}</span>
              <button
                onClick={handleClear}
                className="shrink-0 text-[10px] text-[var(--c-text-5)] hover:text-[var(--c-text-3)] transition-colors"
              >
                {t('dashboard.clear')}
              </button>
            </div>
            {state.error && (
              <p className="text-[11px] text-red-400">{state.error}</p>
            )}
            <button
              onClick={handleRun}
              disabled={state.uploading}
              className="flex h-7 w-full items-center justify-center gap-1.5 rounded bg-indigo-600 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
            >
              {state.uploading && <Loader2 size={11} className="animate-spin" />}
              {state.uploading ? t('btn.uploading') : t('dashboard.runWorkflow')}
            </button>
          </div>
        )}

        {/* Running */}
        {state.phase === 'running' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Loader2 size={11} className="animate-spin text-indigo-400" />
              <span className="text-[12px] text-[var(--c-text-3)]">{t('dashboard.runningEllipsis')}</span>
              <button
                onClick={handleClear}
                className="ml-auto text-[10px] text-[var(--c-text-5)] hover:text-[var(--c-text-3)] transition-colors"
              >
                {t('dashboard.dismiss')}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {state.steps.map(step => (
                <div
                  key={step.id}
                  className="flex items-center gap-1.5 rounded border border-[var(--c-border)] bg-[var(--c-surface-2)] px-2 py-1"
                >
                  <StepIcon status={step.status} />
                  <span className="text-[10px] text-[var(--c-text-4)]">
                    {NODE_LABELS[step.node_type] ?? step.node_type}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Done */}
        {state.phase === 'done' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              {state.runStatus === 'completed'
                ? <CheckCircle2 size={12} className="text-emerald-400" />
                : <XCircle size={12} className="text-red-400" />}
              <span className={`text-[12px] font-medium ${state.runStatus === 'completed' ? 'text-emerald-400' : 'text-red-400'}`}>
                {state.runStatus === 'completed' ? t('status.completed') : t('status.failed')}
              </span>
              {findShowResultsOutput(state.steps) && (
                <button
                  onClick={() => onSidebarOpen(workflowId, state.runStatus!, state.steps)}
                  className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                >
                  <BarChart2 size={10} />
                  {t('dashboard.viewResults')}
                </button>
              )}
              <button
                onClick={handleClear}
                className="text-[10px] text-[var(--c-text-5)] hover:text-[var(--c-text-3)] transition-colors"
              >
                {t('dashboard.reset')}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {state.steps.map(step => (
                <div
                  key={step.id}
                  className="flex items-center gap-1.5 rounded border border-[var(--c-border)] bg-[var(--c-surface-2)] px-2 py-1"
                >
                  <StepIcon status={step.status} />
                  <span className="text-[10px] text-[var(--c-text-4)]">
                    {NODE_LABELS[step.node_type] ?? step.node_type}
                  </span>
                </div>
              ))}
            </div>
            {state.error && (
              <p className="rounded border border-red-500/20 bg-red-500/5 px-2 py-1 font-mono text-[10px] text-red-400">
                {state.error}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Last run footer */}
      {lastRun && state.phase === 'idle' && (
        <div className="flex items-center gap-2 border-t border-[var(--c-border)] px-4 py-2">
          <div className={`h-1.5 w-1.5 rounded-full ${
            lastRun.status === 'completed' ? 'bg-emerald-400'
            : lastRun.status === 'failed' ? 'bg-red-400'
            : lastRun.status === 'running' ? 'bg-indigo-400 animate-pulse'
            : 'bg-[var(--c-text-5)]'
          }`} />
          <span className="text-[11px] text-[var(--c-text-5)]">
            {t('dashboard.lastRun', { time: formatRelativeTime(lastRun.created_at) })}
          </span>
          <span className={`ml-auto text-[10px] font-medium ${
            lastRun.status === 'completed' ? 'text-emerald-400'
            : lastRun.status === 'failed' ? 'text-red-400'
            : 'text-[var(--c-text-5)]'
          }`}>
            {t(`status.${lastRun.status}`)}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

interface SidebarData {
  workflowId: number
  workflowName: string
  runStatus: RunStatus
  steps: RunStep[]
}

export function Dashboard() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const { data: allWorkflows, isLoading } = useWorkflows()
  const favorites = allWorkflows?.filter(wf => wf.is_favorite && !wf.is_archived) ?? []

  const [sidebar, setSidebar] = useState<SidebarData | null>(null)

  function handleSidebarOpen(workflowId: number, runStatus: RunStatus, steps: RunStep[]) {
    const wf = favorites.find(w => w.id === workflowId)
    if (!wf) return
    setSidebar({ workflowId, workflowName: wf.name, runStatus, steps })
  }

  const sidebarOpen = sidebar !== null

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      <LeftSidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-[52px] shrink-0 items-center border-b border-[var(--c-border)] px-6">
          <h1 className="text-[14px] font-semibold text-[var(--c-text-1)]">{t('dashboard.title')}</h1>
        </header>

        {/* Content area with optional sidebar */}
        <div className="flex flex-1 overflow-hidden">
          {/* Widget grid */}
          <main className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="flex items-center gap-2 text-[13px] text-[var(--c-text-5)]">
                <Loader2 size={14} className="animate-spin" /> {t('common.loading')}
              </div>
            ) : favorites.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)]">
                  <Star size={22} className="text-[var(--c-text-5)]" />
                </div>
                <p className="text-[14px] font-medium text-[var(--c-text-3)]">{t('dashboard.noFavorites')}</p>
                <p className="mt-1.5 max-w-[280px] text-[12px] leading-relaxed text-[var(--c-text-5)]">
                  {t('dashboard.noFavoritesHint')}
                </p>
                <button
                  onClick={() => navigate('/workflows')}
                  className="mt-6 flex items-center gap-1.5 rounded bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  {t('dashboard.goToWorkflows')} <ArrowRight size={13} />
                </button>
              </div>
            ) : (
              <div className={[
                'grid gap-5',
                sidebarOpen
                  ? 'grid-cols-1 md:grid-cols-2'
                  : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3',
              ].join(' ')}>
                {favorites.map(wf => (
                  <WorkflowWidget
                    key={wf.id}
                    workflowId={wf.id}
                    workflowName={wf.name}
                    onSidebarOpen={handleSidebarOpen}
                  />
                ))}
              </div>
            )}
          </main>

          {/* Results sidebar — slide in from right */}
          <div
            className={[
              'overflow-hidden transition-all duration-300 ease-in-out',
              sidebarOpen ? 'w-[400px] opacity-100' : 'w-0 opacity-0',
            ].join(' ')}
          >
            {sidebar && (
              <ResultsSidebar
                workflowName={sidebar.workflowName}
                runStatus={sidebar.runStatus}
                steps={sidebar.steps}
                onClose={() => setSidebar(null)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

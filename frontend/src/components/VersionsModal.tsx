import { X, RotateCcw, GitCommit } from 'lucide-react'
import type { WorkflowVersion } from '../types/workflow'
import { useWorkflowVersions, useRestoreVersion } from '../api/workflows'
import { useI18n } from '../context/i18n'

interface Props {
  workflowId: number
  currentVersionNum: number
  onClose: () => void
  onRestored: () => void
}

function timeAgo(iso: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return t('workflows.versions.justNow')
  if (m < 60) return t('workflows.versions.minutesAgo', { n: m })
  const h = Math.floor(m / 60)
  if (h < 24) return t('workflows.versions.hoursAgo', { n: h })
  const d = Math.floor(h / 24)
  return t('workflows.versions.daysAgo', { n: d })
}

export function VersionsModal({ workflowId, currentVersionNum, onClose, onRestored }: Props) {
  const { data: versions, isLoading } = useWorkflowVersions(workflowId)
  const restoreVersion = useRestoreVersion()
  const { t } = useI18n()

  async function handleRestore(v: WorkflowVersion) {
    await restoreVersion.mutateAsync({ workflowId, versionId: v.id })
    onRestored()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[480px] rounded-xl border border-[var(--c-border-2)] bg-[var(--c-surface)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--c-border)] px-5 py-4">
          <div>
            <p className="text-[14px] font-semibold text-[var(--c-text-1)]">{t('workflows.versions.title')}</p>
            <p className="mt-0.5 text-[12px] text-[var(--c-text-4)]">{t('workflows.versions.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--c-text-5)] hover:text-[var(--c-text-3)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Version list */}
        <div className="max-h-[480px] overflow-y-auto">
          {isLoading ? (
            <div className="px-5 py-8 text-center text-[12px] text-[var(--c-text-5)]">{t('common.loading')}</div>
          ) : !versions?.length ? (
            <div className="px-5 py-8 text-center text-[12px] text-[var(--c-text-5)]">{t('workflows.versions.empty')}</div>
          ) : (
            <div className="divide-y divide-[var(--c-divider)]">
              {versions.map(v => {
                const isCurrent = v.version_num === currentVersionNum
                return (
                  <div
                    key={v.id}
                    className={[
                      'flex items-center gap-4 px-5 py-3.5',
                      isCurrent ? 'bg-[var(--c-hover-1)]' : '',
                    ].join(' ')}
                  >
                    {/* Icon */}
                    <div className={[
                      'flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-md',
                      isCurrent ? 'bg-indigo-500/15' : 'bg-[var(--c-surface-2)]',
                    ].join(' ')}>
                      <GitCommit
                        size={13}
                        className={isCurrent ? 'text-indigo-400' : 'text-[var(--c-text-5)]'}
                      />
                    </div>

                    {/* Meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-medium text-[var(--c-text-2)]">
                          v{v.version_num}
                        </span>
                        {isCurrent && (
                          <span className="rounded bg-indigo-600/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400 ring-1 ring-indigo-500/20">
                            {t('workflows.versions.current')}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--c-text-5)]">
                        <span>{timeAgo(v.created_at, t)}</span>
                        <span>·</span>
                        <span>{t(v.node_count !== 1 ? 'workflows.versions.nodeCountPlural' : 'workflows.versions.nodeCount', { n: v.node_count })}</span>
                      </div>
                    </div>

                    {/* Restore */}
                    {!isCurrent && (
                      <button
                        onClick={() => handleRestore(v)}
                        disabled={restoreVersion.isPending}
                        className="flex shrink-0 items-center gap-1.5 rounded border border-[var(--c-border-2)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--c-text-4)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-2)] disabled:opacity-40"
                      >
                        <RotateCcw size={11} />
                        {t('btn.restore')}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

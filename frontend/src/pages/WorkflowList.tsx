import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, GitBranch, Archive, Loader2, ChevronRight, Clock, ArchiveRestore, Star, Mail } from 'lucide-react'
import { useWorkflows, useCreateWorkflow, useArchiveWorkflow, useUnarchiveWorkflow, useFavoriteWorkflow, useUnfavoriteWorkflow, useEnableWorkflowInbox, useDisableWorkflowInbox } from '../api/workflows'
import { LeftSidebar } from '../components/LeftSidebar'

export function WorkflowList() {
  const navigate = useNavigate()
  const [showArchived, setShowArchived] = useState(false)
  const { data: workflows, isLoading } = useWorkflows(showArchived)
  const createWf = useCreateWorkflow()
  const archiveWf = useArchiveWorkflow()
  const unarchiveWf = useUnarchiveWorkflow()
  const favoriteWf = useFavoriteWorkflow()
  const unfavoriteWf = useUnfavoriteWorkflow()
  const enableInbox = useEnableWorkflowInbox()
  const disableInbox = useDisableWorkflowInbox()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    const wf = await createWf.mutateAsync({ name: newName.trim() })
    navigate(`/workflows/${wf.id}`)
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      <LeftSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Page header */}
        <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--c-border)] px-8">
          <div className="flex items-center gap-3">
            <h1 className="text-[14px] font-semibold text-[var(--c-text-1)]">Workflows</h1>
            <button
              onClick={() => setShowArchived(v => !v)}
              className={[
                'flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors',
                showArchived
                  ? 'bg-[var(--c-active)] text-[var(--c-text-3)]'
                  : 'text-[var(--c-text-5)] hover:text-[var(--c-text-4)]',
              ].join(' ')}
            >
              <Archive size={11} />
              {showArchived ? 'Hide archived' : 'Show archived'}
            </button>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-3 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <Plus size={13} strokeWidth={2.5} /> New workflow
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          {/* Create row */}
          {creating && (
            <form
              onSubmit={handleCreate}
              className="flex items-center gap-2 border-b border-[var(--c-border)] bg-[var(--c-surface-2)] px-8 py-3"
            >
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Workflow name…"
                className="flex-1 rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[13px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
              />
              <button
                type="submit"
                disabled={createWf.isPending || !newName.trim()}
                className="flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-3 text-[12px] font-medium text-white disabled:opacity-40 transition-colors hover:bg-indigo-500"
              >
                {createWf.isPending && <Loader2 size={11} className="animate-spin" />}
                Create
              </button>
              <button
                type="button"
                onClick={() => { setCreating(false); setNewName('') }}
                className="h-7 rounded px-2 text-[12px] text-[var(--c-text-5)] transition-colors hover:text-[var(--c-text-3)]"
              >
                Cancel
              </button>
            </form>
          )}

          {isLoading ? (
            <div className="flex items-center gap-2 px-8 py-6 text-[13px] text-[var(--c-text-5)]">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          ) : workflows?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)]">
                <GitBranch size={20} className="text-[var(--c-text-5)]" />
              </div>
              <p className="text-[13px] font-medium text-[var(--c-text-4)]">
                {showArchived ? 'No archived workflows' : 'No workflows yet'}
              </p>
              <p className="mt-1 text-[12px] text-[var(--c-text-5)]">
                {showArchived ? 'Archived workflows will appear here' : 'Create one to start processing documents'}
              </p>
              {!showArchived && (
                <button
                  onClick={() => setCreating(true)}
                  className="mt-5 flex items-center gap-1.5 rounded bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-indigo-500"
                >
                  <Plus size={13} /> New workflow
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[var(--c-divider)]">
              {/* Table header */}
              <div className="flex items-center px-8 py-2">
                <span className="w-6 shrink-0" />
                <span className="text-[11px] font-medium text-[var(--c-text-5)] w-1/2">Name</span>
                <span className="text-[11px] font-medium text-[var(--c-text-5)] w-14 text-right">Ver.</span>
                <span className="text-[11px] font-medium text-[var(--c-text-5)] w-16 text-right">Nodes</span>
                <span className="text-[11px] font-medium text-[var(--c-text-5)] ml-auto mr-16">Updated</span>
              </div>

              {workflows?.map(wf => (
                <div
                  key={wf.id}
                  className={[
                    'group flex cursor-pointer items-center px-8 py-3 transition-colors hover:bg-[var(--c-hover-1)]',
                    wf.is_archived ? 'opacity-50' : '',
                  ].join(' ')}
                  onClick={() => !wf.is_archived && navigate(`/workflows/${wf.id}`)}
                >
                  {/* Star toggle */}
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      wf.is_favorite ? unfavoriteWf.mutate(wf.id) : favoriteWf.mutate(wf.id)
                    }}
                    className="mr-1 shrink-0 rounded p-0.5 transition-colors"
                    title={wf.is_favorite ? 'Remove from dashboard' : 'Add to dashboard'}
                  >
                    <Star
                      size={13}
                      className={wf.is_favorite ? 'fill-current text-amber-400' : 'text-[var(--c-text-6)] hover:text-amber-400 transition-colors'}
                    />
                  </button>

                  {/* Mail inbox toggle — always visible when enabled, hover-only when not */}
                  {wf.email_inbox_enabled ? (
                    <button
                      onClick={e => { e.stopPropagation(); disableInbox.mutate(wf.id) }}
                      className="mr-2 shrink-0 rounded p-0.5 transition-colors"
                      title={`Email inbox: ${wf.email_address} — click to disable`}
                    >
                      <Mail size={13} className="text-indigo-400" />
                    </button>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); enableInbox.mutate(wf.id) }}
                      className="mr-2 shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Enable email inbox"
                    >
                      <Mail size={13} className="text-[var(--c-text-6)] hover:text-indigo-400 transition-colors" />
                    </button>
                  )}

                  <div className="flex flex-1 items-center gap-3">
                    <GitBranch size={14} className="shrink-0 text-[var(--c-text-5)] group-hover:text-[var(--c-text-4)] transition-colors" />
                    <span className={[
                      'text-[13px] font-medium transition-colors',
                      wf.is_archived ? 'text-[var(--c-text-4)]' : 'text-[var(--c-text-2)] group-hover:text-[var(--c-text-1)]',
                    ].join(' ')}>
                      {wf.name}
                    </span>
                    {wf.is_archived && (
                      <span className="rounded bg-[var(--c-surface-3)] px-1.5 py-0.5 text-[10px] text-[var(--c-text-5)]">
                        archived
                      </span>
                    )}
                  </div>

                  <span className="w-14 text-right font-mono text-[11px] text-[var(--c-text-5)]">
                    {wf.current_version_num > 0 ? `v${wf.current_version_num}` : '—'}
                  </span>

                  <span className="w-16 text-right text-[12px] text-[var(--c-text-5)]">
                    {wf.definition.nodes.length}
                  </span>

                  <div className="ml-auto flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[12px] text-[var(--c-text-5)]">
                      <Clock size={11} />
                      {new Date(wf.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>

                    {/* Actions - visible on hover */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!wf.is_archived && (
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/workflows/${wf.id}/runs`) }}
                          className="rounded p-1 text-[var(--c-text-5)] hover:text-[var(--c-text-3)] hover:bg-[var(--c-hover-3)] transition-colors"
                          title="Run history"
                        >
                          <Clock size={13} />
                        </button>
                      )}
                      {wf.is_archived ? (
                        <button
                          onClick={e => { e.stopPropagation(); unarchiveWf.mutate(wf.id) }}
                          className="rounded p-1 text-[var(--c-text-5)] hover:text-[var(--c-text-3)] hover:bg-[var(--c-hover-3)] transition-colors"
                          title="Unarchive"
                        >
                          <ArchiveRestore size={13} />
                        </button>
                      ) : (
                        <button
                          onClick={e => { e.stopPropagation(); archiveWf.mutate(wf.id) }}
                          className="rounded p-1 text-[var(--c-text-5)] hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                          title="Archive"
                        >
                          <Archive size={13} />
                        </button>
                      )}
                    </div>

                    {!wf.is_archived && (
                      <ChevronRight size={13} className="text-[var(--c-text-6)] group-hover:text-[var(--c-text-5)] transition-colors" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

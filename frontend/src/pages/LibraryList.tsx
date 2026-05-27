import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, BookOpen, Trash2, Loader2, ChevronRight, Clock } from 'lucide-react'
import { useDocumentTypes, useCreateDocumentType, useDeleteDocumentType } from '../api/library'
import { LeftSidebar } from '../components/LeftSidebar'

export function LibraryList() {
  const navigate = useNavigate()
  const { data: docTypes, isLoading } = useDocumentTypes()
  const createDt = useCreateDocumentType()
  const deleteDt = useDeleteDocumentType()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    const dt = await createDt.mutateAsync({ name: newName.trim() })
    navigate(`/library/${dt.id}`)
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      <LeftSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--c-border)] px-8">
          <h1 className="text-[14px] font-semibold text-[var(--c-text-1)]">Document Library</h1>
          <button
            onClick={() => setCreating(true)}
            className="flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-3 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <Plus size={13} strokeWidth={2.5} /> New document type
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          {creating && (
            <form
              onSubmit={handleCreate}
              className="flex items-center gap-2 border-b border-[var(--c-border)] bg-[var(--c-surface-2)] px-8 py-3"
            >
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Document type name…"
                className="flex-1 rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[13px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
              />
              <button
                type="submit"
                disabled={createDt.isPending || !newName.trim()}
                className="flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-3 text-[12px] font-medium text-white disabled:opacity-40 transition-colors hover:bg-indigo-500"
              >
                {createDt.isPending && <Loader2 size={11} className="animate-spin" />}
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
          ) : docTypes?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)]">
                <BookOpen size={20} className="text-[var(--c-text-5)]" />
              </div>
              <p className="text-[13px] font-medium text-[var(--c-text-4)]">No document types yet</p>
              <p className="mt-1 text-[12px] text-[var(--c-text-5)]">Define document types to use in validation policies</p>
              <button
                onClick={() => setCreating(true)}
                className="mt-5 flex items-center gap-1.5 rounded bg-indigo-600 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-indigo-500"
              >
                <Plus size={13} /> New document type
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--c-divider)]">
              <div className="flex items-center px-8 py-2">
                <span className="flex-1 text-[11px] font-medium text-[var(--c-text-5)]">Name</span>
                <span className="w-48 text-[11px] font-medium text-[var(--c-text-5)]">Description</span>
                <span className="w-16 text-right text-[11px] font-medium text-[var(--c-text-5)]">Samples</span>
                <span className="ml-8 mr-8 text-[11px] font-medium text-[var(--c-text-5)]">Updated</span>
              </div>

              {docTypes?.map(dt => (
                <div
                  key={dt.id}
                  className="group flex cursor-pointer items-center px-8 py-3 transition-colors hover:bg-[var(--c-hover-1)]"
                  onClick={() => navigate(`/library/${dt.id}`)}
                >
                  <div className="flex flex-1 items-center gap-3">
                    <BookOpen size={14} className="shrink-0 text-[var(--c-text-5)] group-hover:text-[var(--c-text-4)] transition-colors" />
                    <span className="text-[13px] font-medium text-[var(--c-text-2)] group-hover:text-[var(--c-text-1)] transition-colors">
                      {dt.name}
                    </span>
                  </div>

                  <span className="w-48 truncate text-[12px] text-[var(--c-text-5)]">
                    {dt.description || <span className="text-[var(--c-text-6)]">—</span>}
                  </span>

                  <span className="w-16 text-right font-mono text-[11px] text-[var(--c-text-5)]">
                    {dt.samples.length}
                  </span>

                  <div className="ml-8 flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[12px] text-[var(--c-text-5)]">
                      <Clock size={11} />
                      {new Date(dt.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); if (confirm('Delete this document type?')) deleteDt.mutate(dt.id) }}
                        className="rounded p-1 text-[var(--c-text-5)] transition-colors hover:text-red-400 hover:bg-red-500/10"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    <ChevronRight size={13} className="text-[var(--c-text-6)] group-hover:text-[var(--c-text-5)] transition-colors" />
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

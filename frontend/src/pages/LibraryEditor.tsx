import { useState, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronRight, Save, Loader2, Upload, Trash2, BookOpen } from 'lucide-react'
import { useDocumentType, useUpdateDocumentType, useUploadSample, useDeleteSample } from '../api/library'
import { LeftSidebar } from '../components/LeftSidebar'

export function LibraryEditor() {
  const { id } = useParams<{ id: string }>()
  const docTypeId = Number(id)

  const { data: dt, isLoading } = useDocumentType(docTypeId)
  const updateDt = useUpdateDocumentType()
  const uploadSample = useUploadSample()
  const deleteSample = useDeleteSample()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [aiInstructions, setAiInstructions] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const initialized = useRef(false)

  // Sync from server once
  if (dt && !initialized.current) {
    initialized.current = true
    setName(dt.name)
    setDescription(dt.description ?? '')
    setAiInstructions(dt.ai_instructions ?? '')
  }

  function markDirty() { setDirty(true); setSaveState('idle') }

  async function handleSave() {
    setSaveState('saving')
    await updateDt.mutateAsync({ id: docTypeId, name: name.trim(), description: description || undefined, ai_instructions: aiInstructions || undefined })
    setDirty(false)
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 2000)
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return
    for (const file of Array.from(files)) {
      await uploadSample.mutateAsync({ docTypeId, file })
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }, [docTypeId])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--c-bg)]">
        <Loader2 size={16} className="animate-spin text-[var(--c-text-5)]" />
      </div>
    )
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      <LeftSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--c-border)] px-6">
          <Link to="/library" className="text-[12px] text-[var(--c-text-5)] hover:text-[var(--c-text-3)] transition-colors">
            Library
          </Link>
          <ChevronRight size={12} className="text-[var(--c-text-5)]" />
          <input
            value={name}
            onChange={e => { setName(e.target.value); markDirty() }}
            className="min-w-0 flex-1 bg-transparent text-[14px] font-semibold text-[var(--c-text-1)] outline-none placeholder-[var(--c-text-5)]"
            placeholder="Document type name"
          />
          {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}
          <button
            onClick={handleSave}
            disabled={saveState === 'saving' || !dirty}
            className="flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-3 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
          >
            {saveState === 'saving' ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
            {saveState === 'saved' ? 'Saved' : 'Save'}
          </button>
        </header>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main content */}
          <main className="flex flex-1 flex-col gap-6 overflow-y-auto p-8">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-[var(--c-text-4)]">Description</label>
              <textarea
                value={description}
                onChange={e => { setDescription(e.target.value); markDirty() }}
                placeholder="What is this document? What purpose does it serve?"
                rows={3}
                className="w-full resize-none rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-2 text-[13px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--c-text-4)]">AI Instructions</label>
              <p className="mb-1.5 text-[11px] text-[var(--c-text-5)]">
                Tell the AI what to look for — required fields, layout, identifiers, expiry checks, name matching.
              </p>
              <textarea
                value={aiInstructions}
                onChange={e => { setAiInstructions(e.target.value); markDirty() }}
                placeholder="e.g. Must show full legal name, date of birth, expiry date, and a photograph. Document must not be expired. Name must not be obscured or cropped."
                rows={6}
                className="w-full resize-none rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-2 text-[13px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
              />
            </div>
          </main>

          {/* Right panel: sample images */}
          <aside className="flex w-[260px] shrink-0 flex-col border-l border-[var(--c-border)] bg-[var(--c-bg)]">
            <div className="border-b border-[var(--c-border)] px-4 py-3">
              <p className="text-[13px] font-medium text-[var(--c-text-2)]">Sample Images</p>
              <p className="mt-0.5 text-[11px] text-[var(--c-text-5)]">Help the AI recognize this document</p>
            </div>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={[
                  'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-6 text-center transition-colors',
                  dragOver
                    ? 'border-indigo-500/50 bg-indigo-500/5'
                    : 'border-[var(--c-border)] hover:border-[var(--c-border-3)] hover:bg-[var(--c-hover-1)]',
                ].join(' ')}
              >
                {uploadSample.isPending ? (
                  <Loader2 size={16} className="animate-spin text-[var(--c-text-5)]" />
                ) : (
                  <Upload size={16} className="text-[var(--c-text-5)]" />
                )}
                <p className="text-[11px] text-[var(--c-text-5)]">Drop image or click to upload</p>
                <p className="text-[10px] text-[var(--c-text-5)]">PNG, JPG up to 10MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => handleFiles(e.target.files)}
              />

              {/* Thumbnails */}
              {dt?.samples.map(sample => (
                <div key={sample.id} className="group relative overflow-hidden rounded-lg border border-[var(--c-border)]">
                  <img
                    src={`/api/files/library/${docTypeId}/${sample.filename}`}
                    alt={sample.original_filename}
                    className="w-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => deleteSample.mutate({ docTypeId, sampleId: sample.id })}
                      className="rounded-full bg-red-500/20 p-2 text-red-400 hover:bg-red-500/40 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="border-t border-[var(--c-border)] px-2 py-1">
                    <p className="truncate text-[10px] text-[var(--c-text-5)]">{sample.original_filename}</p>
                  </div>
                </div>
              ))}

              {dt?.samples.length === 0 && (
                <div className="flex flex-col items-center gap-1 py-4 text-center">
                  <BookOpen size={16} className="text-[var(--c-text-6)]" />
                  <p className="text-[11px] text-[var(--c-text-5)]">No samples yet</p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

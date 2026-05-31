import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, BookOpen, Trash2, Loader2, ChevronRight, Clock, ListChecks, X } from 'lucide-react'
import { useDocumentTypes, useCreateDocumentType, useDeleteDocumentType } from '../api/library'
import {
  useReferenceLists, useCreateReferenceList, useUpdateReferenceList, useDeleteReferenceList,
} from '../api/referenceLists'
import { LeftSidebar } from '../components/LeftSidebar'
import { useI18n } from '../context/i18n'
import type { ReferenceList } from '../types/workflow'

type Tab = 'documents' | 'references'

// ── Reference list editor modal ─────────────────────────────────────────────

function ReferenceListModal({ list, onClose }: { list: ReferenceList; onClose: () => void }) {
  const { t } = useI18n()
  const update = useUpdateReferenceList()
  const [name, setName] = useState(list.name)
  const [description, setDescription] = useState(list.description ?? '')
  const [itemsText, setItemsText] = useState((list.items ?? []).join('\n'))
  const [saved, setSaved] = useState(false)

  const itemCount = itemsText.split('\n').map(s => s.trim()).filter(Boolean).length

  async function handleSave() {
    const items = itemsText.split('\n').map(s => s.trim()).filter(Boolean)
    await update.mutateAsync({ id: list.id, name: name.trim() || list.name, description: description || null, items })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-[560px] flex-col overflow-hidden rounded-xl border border-[var(--c-border-2)] bg-[var(--c-surface)] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--c-border)] px-5">
          <div className="flex items-center gap-2">
            <ListChecks size={14} className="text-violet-400" />
            <span className="text-[13px] font-semibold text-[var(--c-text-1)]">{t('library.editReferenceList')}</span>
          </div>
          <button onClick={onClose} className="rounded p-1 text-[var(--c-text-5)] transition-colors hover:text-[var(--c-text-3)]">
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-5">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">{t('library.col.name')}</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-3 py-1.5 text-[13px] text-[var(--c-text-1)] outline-none focus:border-indigo-500/50"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">{t('library.col.description')}</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('library.descriptionOptional')}
              className="w-full rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-3 py-1.5 text-[13px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none focus:border-indigo-500/50"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">{t('library.values')}</label>
              <span className="text-[10px] text-[var(--c-text-5)]">{itemCount === 1 ? t('library.oneItem') : t('library.nItems', { count: itemCount })}</span>
            </div>
            <p className="mb-2 text-[11px] text-[var(--c-text-5)]">{t('library.valuesHint')}</p>
            <textarea
              value={itemsText}
              onChange={e => setItemsText(e.target.value)}
              rows={10}
              placeholder={'EcoHeat 200\nThermaPro X1\n…'}
              className="w-full resize-none rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-3 py-2 font-mono text-[12px] leading-relaxed text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none focus:border-indigo-500/50"
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--c-border)] px-5 py-3">
          <button onClick={onClose} className="h-7 rounded px-3 text-[12px] text-[var(--c-text-4)] transition-colors hover:text-[var(--c-text-2)]">
            {t('btn.close')}
          </button>
          <button
            onClick={handleSave}
            disabled={update.isPending}
            className="flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-3 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
          >
            {update.isPending ? <Loader2 size={11} className="animate-spin" /> : null}
            {saved ? t('library.saved') : t('btn.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────

export function LibraryList() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('documents')

  const { data: docTypes, isLoading } = useDocumentTypes()
  const createDt = useCreateDocumentType()
  const deleteDt = useDeleteDocumentType()

  const { data: refLists, isLoading: loadingRefs } = useReferenceLists()
  const createRef = useCreateReferenceList()
  const deleteRef = useDeleteReferenceList()

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<ReferenceList | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    if (tab === 'documents') {
      const dt = await createDt.mutateAsync({ name: newName.trim() })
      navigate(`/library/${dt.id}`)
    } else {
      const rl = await createRef.mutateAsync({ name: newName.trim(), items: [] })
      setCreating(false); setNewName('')
      setEditing(rl)
    }
  }

  const TabButton = ({ value, label }: { value: Tab; label: string }) => (
    <button
      onClick={() => { setTab(value); setCreating(false); setNewName('') }}
      className={[
        'h-7 rounded-md px-3 text-[12px] font-medium transition-colors',
        tab === value
          ? 'bg-[var(--c-active)] text-[var(--c-text-1)]'
          : 'text-[var(--c-text-4)] hover:text-[var(--c-text-2)] hover:bg-[var(--c-hover-2)]',
      ].join(' ')}
    >
      {label}
    </button>
  )

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      <LeftSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--c-border)] px-8">
          <div className="flex items-center gap-4">
            <h1 className="text-[14px] font-semibold text-[var(--c-text-1)]">{t('library.title')}</h1>
            <div className="flex items-center gap-1">
              <TabButton value="documents" label={t('library.tab.documents')} />
              <TabButton value="references" label={t('library.tab.references')} />
            </div>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-3 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500"
          >
            <Plus size={13} strokeWidth={2.5} /> {tab === 'documents' ? t('library.newDocumentType') : t('library.newReferenceList')}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          {creating && (
            <form onSubmit={handleCreate} className="flex items-center gap-2 border-b border-[var(--c-border)] bg-[var(--c-surface-2)] px-8 py-3">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder={tab === 'documents' ? t('library.documentTypeNamePlaceholder') : t('library.referenceListNamePlaceholder')}
                className="flex-1 rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[13px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
              />
              <button
                type="submit"
                disabled={(createDt.isPending || createRef.isPending) || !newName.trim()}
                className="flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-3 text-[12px] font-medium text-white disabled:opacity-40 transition-colors hover:bg-indigo-500"
              >
                {(createDt.isPending || createRef.isPending) && <Loader2 size={11} className="animate-spin" />}
                {t('btn.create')}
              </button>
              <button type="button" onClick={() => { setCreating(false); setNewName('') }} className="h-7 rounded px-2 text-[12px] text-[var(--c-text-5)] transition-colors hover:text-[var(--c-text-3)]">
                {t('btn.cancel')}
              </button>
            </form>
          )}

          {tab === 'documents' ? (
            isLoading ? (
              <div className="flex items-center gap-2 px-8 py-6 text-[13px] text-[var(--c-text-5)]"><Loader2 size={14} className="animate-spin" /> {t('common.loading')}</div>
            ) : docTypes?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)]"><BookOpen size={20} className="text-[var(--c-text-5)]" /></div>
                <p className="text-[13px] font-medium text-[var(--c-text-4)]">{t('library.noDocumentTypes')}</p>
                <p className="mt-1 text-[12px] text-[var(--c-text-5)]">{t('library.noDocumentTypesHint')}</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--c-divider)]">
                <div className="flex items-center px-8 py-2">
                  <span className="flex-1 text-[11px] font-medium text-[var(--c-text-5)]">{t('library.col.name')}</span>
                  <span className="w-48 text-[11px] font-medium text-[var(--c-text-5)]">{t('library.col.description')}</span>
                  <span className="w-16 text-right text-[11px] font-medium text-[var(--c-text-5)]">{t('library.col.samples')}</span>
                  <span className="ml-8 mr-8 text-[11px] font-medium text-[var(--c-text-5)]">{t('library.col.updated')}</span>
                </div>
                {docTypes?.map(dt => (
                  <div key={dt.id} className="group flex cursor-pointer items-center px-8 py-3 transition-colors hover:bg-[var(--c-hover-1)]" onClick={() => navigate(`/library/${dt.id}`)}>
                    <div className="flex flex-1 items-center gap-3">
                      <BookOpen size={14} className="shrink-0 text-[var(--c-text-5)] group-hover:text-[var(--c-text-4)] transition-colors" />
                      <span className="text-[13px] font-medium text-[var(--c-text-2)] group-hover:text-[var(--c-text-1)] transition-colors">{dt.name}</span>
                    </div>
                    <span className="w-48 truncate text-[12px] text-[var(--c-text-5)]">{dt.description || <span className="text-[var(--c-text-6)]">—</span>}</span>
                    <span className="w-16 text-right font-mono text-[11px] text-[var(--c-text-5)]">{dt.samples.length}</span>
                    <div className="ml-8 flex items-center gap-3">
                      <span className="flex items-center gap-1 text-[12px] text-[var(--c-text-5)]"><Clock size={11} />{new Date(dt.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={e => { e.stopPropagation(); if (confirm(t('library.deleteDocumentTypeConfirm'))) deleteDt.mutate(dt.id) }} className="rounded p-1 text-[var(--c-text-5)] transition-colors hover:text-red-400 hover:bg-red-500/10" title={t('btn.delete')}><Trash2 size={13} /></button>
                      </div>
                      <ChevronRight size={13} className="text-[var(--c-text-6)] group-hover:text-[var(--c-text-5)] transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            // ── Reference lists tab ──
            loadingRefs ? (
              <div className="flex items-center gap-2 px-8 py-6 text-[13px] text-[var(--c-text-5)]"><Loader2 size={14} className="animate-spin" /> {t('common.loading')}</div>
            ) : refLists?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--c-border)] bg-[var(--c-surface)]"><ListChecks size={20} className="text-[var(--c-text-5)]" /></div>
                <p className="text-[13px] font-medium text-[var(--c-text-4)]">{t('library.noReferenceLists')}</p>
                <p className="mt-1 max-w-[340px] text-[12px] leading-relaxed text-[var(--c-text-5)]">
                  {t('library.noReferenceListsHint')}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--c-divider)]">
                <div className="flex items-center px-8 py-2">
                  <span className="flex-1 text-[11px] font-medium text-[var(--c-text-5)]">{t('library.col.name')}</span>
                  <span className="w-48 text-[11px] font-medium text-[var(--c-text-5)]">{t('library.col.description')}</span>
                  <span className="w-16 text-right text-[11px] font-medium text-[var(--c-text-5)]">{t('library.col.items')}</span>
                  <span className="ml-8 mr-8 text-[11px] font-medium text-[var(--c-text-5)]">{t('library.col.updated')}</span>
                </div>
                {refLists?.map(rl => (
                  <div key={rl.id} className="group flex cursor-pointer items-center px-8 py-3 transition-colors hover:bg-[var(--c-hover-1)]" onClick={() => setEditing(rl)}>
                    <div className="flex flex-1 items-center gap-3">
                      <ListChecks size={14} className="shrink-0 text-violet-400" />
                      <span className="text-[13px] font-medium text-[var(--c-text-2)] group-hover:text-[var(--c-text-1)] transition-colors">{rl.name}</span>
                    </div>
                    <span className="w-48 truncate text-[12px] text-[var(--c-text-5)]">{rl.description || <span className="text-[var(--c-text-6)]">—</span>}</span>
                    <span className="w-16 text-right font-mono text-[11px] text-[var(--c-text-5)]">{rl.items.length}</span>
                    <div className="ml-8 flex items-center gap-3">
                      <span className="flex items-center gap-1 text-[12px] text-[var(--c-text-5)]"><Clock size={11} />{new Date(rl.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={e => { e.stopPropagation(); if (confirm(t('library.deleteReferenceListConfirm'))) deleteRef.mutate(rl.id) }} className="rounded p-1 text-[var(--c-text-5)] transition-colors hover:text-red-400 hover:bg-red-500/10" title={t('btn.delete')}><Trash2 size={13} /></button>
                      </div>
                      <ChevronRight size={13} className="text-[var(--c-text-6)] group-hover:text-[var(--c-text-5)] transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </main>
      </div>

      {editing && <ReferenceListModal list={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

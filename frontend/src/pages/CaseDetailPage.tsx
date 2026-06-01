import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Mail, ArrowRight, FileText, CheckCircle2, XCircle,
  AlertCircle, RefreshCw, ChevronDown, ChevronUp, StickyNote,
  Play, X, MessageSquare, Send
} from 'lucide-react'
import { LeftSidebar } from '../components/LeftSidebar'
import { useI18n } from '../context/i18n'
import { useCase, useUpdateCase, useRunCase, useReplyCase, useAddNote, type TimelineEvent } from '../api/cases'
import { useUploadDocument } from '../api/runs'
import { useRunContext } from '../context/run'
import { fileUrl } from '../lib/fileUrl'

function statusColor(status: string) {
  const map: Record<string, string> = {
    open: 'text-indigo-400 bg-indigo-500/10',
    awaiting_applicant: 'text-amber-400 bg-amber-500/10',
    under_review: 'text-blue-400 bg-blue-500/10',
    closed_accepted: 'text-emerald-400 bg-emerald-500/10',
    closed_rejected: 'text-[var(--c-text-4)] bg-[var(--c-surface-3)]',
  }
  return map[status] ?? 'text-[var(--c-text-4)] bg-[var(--c-surface-3)]'
}

function VerdictBadge({ overall }: { overall: string | undefined | null }) {
  if (!overall) return null
  const map: Record<string, [string, string]> = {
    pass: ['Pass', 'bg-emerald-500/15 text-emerald-400'],
    fail: ['Fail', 'bg-red-500/15 text-red-400'],
    needs_review: ['Needs review', 'bg-amber-500/15 text-amber-400'],
  }
  const [label, cls] = map[overall] ?? [overall, 'bg-[var(--c-surface-3)] text-[var(--c-text-3)]']
  return <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>
}

function ChecklistPanel({ checklist }: { checklist: Array<{ document_type: { id: number; name: string }; required: boolean; status: string }> }) {
  const { t } = useI18n()
  if (checklist.length === 0) return null
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">
        {t('cases.detail.checklist')}
      </p>
      <div className="flex flex-col gap-1">
        {checklist.map(item => (
          <div key={item.document_type.id} className="flex items-center gap-2">
            {item.status === 'satisfied' ? (
              <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />
            ) : item.status === 'partial' ? (
              <AlertCircle size={13} className="shrink-0 text-amber-400" />
            ) : (
              <XCircle size={13} className="shrink-0 text-red-400" />
            )}
            <span className="flex-1 text-[12px] text-[var(--c-text-2)] truncate">{item.document_type.name}</span>
            <span className={`text-[10px] ${item.required ? 'text-[var(--c-text-4)]' : 'text-[var(--c-text-5)]'}`}>
              {item.required ? t('cases.checklist.required') : t('cases.checklist.optional')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmailCard({ event }: { event: TimelineEvent }) {
  const [expanded, setExpanded] = useState(false)
  const isInbound = event.direction === 'inbound'
  const isNote = event.direction === 'note'

  return (
    <div className={`rounded-lg border ${isNote ? 'border-amber-500/20 bg-amber-500/5' : 'border-[var(--c-border-2)] bg-[var(--c-surface)]'} p-3`}>
      <div className="flex items-start gap-2">
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isNote ? 'bg-amber-500/15' : isInbound ? 'bg-indigo-500/15' : 'bg-emerald-500/15'}`}>
          {isNote ? <StickyNote size={11} className="text-amber-400" /> :
           isInbound ? <ArrowRight size={11} className="text-indigo-400" /> :
           <ArrowLeft size={11} className="text-emerald-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[11px] font-medium text-[var(--c-text-5)] uppercase tracking-wide">
                {isNote ? 'Note' : isInbound ? 'From' : 'To'}
              </span>
              <span className="text-[12px] text-[var(--c-text-2)] truncate">
                {isNote ? 'Internal' : isInbound ? event.from_addr : event.to_addr}
              </span>
            </div>
            <span className="shrink-0 text-[11px] text-[var(--c-text-5)]">
              {event.created_at ? new Date(event.created_at).toLocaleString() : ''}
            </span>
          </div>
          {event.subject && (
            <div className="mt-0.5 text-[12px] font-medium text-[var(--c-text-1)]">{event.subject}</div>
          )}
          {event.body && (
            <div className={`mt-1 overflow-hidden transition-all ${expanded ? '' : 'max-h-12'}`}>
              <pre className="whitespace-pre-wrap font-sans text-[12px] text-[var(--c-text-3)]">{event.body}</pre>
            </div>
          )}
          {event.body && event.body.length > 80 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="mt-1 flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
            >
              {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {expanded ? 'Less' : 'More'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function RunCard({ event }: { event: TimelineEvent }) {
  const [expanded, setExpanded] = useState(false)
  const overall = event.last_result?.kind === 'verdict' ? event.last_result.overall : undefined
  const isRunning = event.status === 'pending' || event.status === 'running'

  return (
    <div className="rounded-lg border border-[var(--c-border-2)] bg-[var(--c-surface)] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isRunning ? 'bg-indigo-500/15' : event.status === 'completed' ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
            <Play size={11} className={isRunning ? 'text-indigo-400' : event.status === 'completed' ? 'text-emerald-400' : 'text-red-400'} />
          </div>
          <span className="text-[12px] font-medium text-[var(--c-text-1)]">
            {event.name || 'Run'}
          </span>
          {isRunning && <span className="text-[11px] text-indigo-400 animate-pulse">Running…</span>}
        </div>
        <div className="flex items-center gap-2">
          {overall && <VerdictBadge overall={overall} />}
          <span className="text-[11px] text-[var(--c-text-5)]">
            {event.created_at ? new Date(event.created_at).toLocaleString() : ''}
          </span>
          {event.id && (
            <Link
              to={`/reports/${event.id}`}
              className="text-[11px] text-indigo-400 hover:text-indigo-300"
              onClick={e => e.stopPropagation()}
            >
              Open report →
            </Link>
          )}
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[var(--c-text-5)] hover:text-[var(--c-text-3)]"
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>
      {expanded && event.steps && event.steps.length > 0 && (
        <div className="mt-3 border-t border-[var(--c-border)] pt-3">
          <div className="flex flex-wrap gap-2">
            {event.steps.map(step => (
              <div key={step.id} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ${
                step.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                step.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                step.status === 'running' ? 'bg-indigo-500/10 text-indigo-400' :
                'bg-[var(--c-surface-3)] text-[var(--c-text-4)]'
              }`}>
                <span className="capitalize">{step.node_type.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Timeline({ events }: { events: TimelineEvent[] }) {
  const { t } = useI18n()
  if (events.length === 0) {
    return <p className="py-8 text-center text-[13px] text-[var(--c-text-4)]">{t('cases.detail.noTimeline')}</p>
  }
  return (
    <div className="flex flex-col gap-3">
      {events.map(event => (
        event.kind === 'email'
          ? <EmailCard key={`email-${event.id}`} event={event} />
          : <RunCard key={`run-${event.id}`} event={event} />
      ))}
    </div>
  )
}

export function CaseDetailPage() {
  const { t } = useI18n()
  const { caseId } = useParams<{ caseId: string }>()
  const navigate = useNavigate()
  const id = caseId ? parseInt(caseId, 10) : null
  const { setActiveRunId } = useRunContext()

  const { data: caseData, isLoading } = useCase(id)
  const updateCase = useUpdateCase()
  const runCase = useRunCase()
  const replyCase = useReplyCase()
  const addNote = useAddNote()
  const uploadDoc = useUploadDocument()

  const [activeAction, setActiveAction] = useState<'reply' | 'note' | null>(null)
  const [actionText, setActionText] = useState('')
  const [editingRef, setEditingRef] = useState(false)
  const [refValue, setRefValue] = useState('')

  if (isLoading) {
    return (
      <div className="flex h-full overflow-hidden">
        <LeftSidebar />
        <main className="flex flex-1 items-center justify-center">
          <span className="text-[13px] text-[var(--c-text-4)]">{t('common.loading')}</span>
        </main>
      </div>
    )
  }

  if (!caseData) {
    return (
      <div className="flex h-full overflow-hidden">
        <LeftSidebar />
        <main className="flex flex-1 items-center justify-center">
          <span className="text-[13px] text-[var(--c-text-4)]">Case not found</span>
        </main>
      </div>
    )
  }

  const isClosed = caseData.status.startsWith('closed_')
  const hasContact = !!caseData.contact_email

  async function handleRun() {
    if (!id) return
    const result = await runCase.mutateAsync({ caseId: id })
    if (result?.id) setActiveRunId(result.id)
  }

  async function handleSendAction() {
    if (!id || !actionText.trim()) return
    if (activeAction === 'reply') {
      await replyCase.mutateAsync({ caseId: id, body: actionText })
    } else if (activeAction === 'note') {
      await addNote.mutateAsync({ caseId: id, body: actionText })
    }
    setActionText('')
    setActiveAction(null)
  }

  async function handleStatusChange(status: string) {
    if (!id) return
    await updateCase.mutateAsync({ id, status })
  }

  async function handleSaveRef() {
    if (!id) return
    await updateCase.mutateAsync({ id, external_ref: refValue })
    setEditingRef(false)
  }

  const statusLabel: Record<string, string> = {
    open: t('cases.status.open'),
    awaiting_applicant: t('cases.status.awaiting_applicant'),
    under_review: t('cases.status.under_review'),
    closed_accepted: t('cases.status.closed_accepted'),
    closed_rejected: t('cases.status.closed_rejected'),
  }

  return (
    <div className="flex h-full overflow-hidden">
      <LeftSidebar />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex h-[52px] shrink-0 items-center gap-3 border-b border-[var(--c-border)] px-5">
          <button onClick={() => navigate('/cases')} className="text-[var(--c-text-4)] hover:text-[var(--c-text-2)]">
            <ArrowLeft size={15} />
          </button>
          <span className="text-[14px] font-semibold text-[var(--c-text-1)]">
            {caseData.contact_name || caseData.contact_email || caseData.name || `Case #${caseData.id}`}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusColor(caseData.status)}`}>
            {statusLabel[caseData.status] ?? caseData.status}
          </span>
        </div>

        {/* Three-column layout */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left — context + actions */}
          <div className="flex w-[220px] shrink-0 flex-col gap-4 overflow-y-auto border-r border-[var(--c-border)] p-4">
            {/* Contact */}
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">{t('cases.detail.contact')}</p>
              <p className="text-[13px] text-[var(--c-text-1)]">{caseData.contact_name || '—'}</p>
              {caseData.contact_email && (
                <p className="text-[11px] text-[var(--c-text-4)]">{caseData.contact_email}</p>
              )}
            </div>

            {/* Target */}
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">{t('cases.detail.target')}</p>
              <p className="text-[12px] text-[var(--c-text-2)]">
                {caseData.target_name || caseData.target_kind || '—'}
              </p>
            </div>

            {/* External ref */}
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">{t('cases.detail.externalRef')}</p>
              {editingRef ? (
                <div className="flex gap-1">
                  <input
                    autoFocus
                    value={refValue}
                    onChange={e => setRefValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void handleSaveRef(); if (e.key === 'Escape') { setEditingRef(false) } }}
                    placeholder={t('cases.detail.externalRefPlaceholder')}
                    className="flex-1 rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-2 py-1 text-[11px] text-[var(--c-text-1)] outline-none focus:border-indigo-500/50"
                  />
                  <button onClick={handleSaveRef} className="rounded bg-indigo-600 px-2 py-1 text-[11px] text-white hover:bg-indigo-500">✓</button>
                  <button onClick={() => setEditingRef(false)} className="text-[var(--c-text-4)] hover:text-[var(--c-text-2)]"><X size={12} /></button>
                </div>
              ) : (
                <button
                  onClick={() => { setRefValue(caseData.external_ref || ''); setEditingRef(true) }}
                  className="text-left text-[12px] text-[var(--c-text-3)] hover:text-[var(--c-text-1)]"
                >
                  {caseData.external_ref || <span className="text-[var(--c-text-5)]">{t('cases.detail.externalRefPlaceholder')}</span>}
                </button>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-1.5 border-t border-[var(--c-border)] pt-3">
              {hasContact && (
                <button
                  onClick={() => { setActiveAction('reply'); setActionText('') }}
                  className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-[var(--c-text-3)] hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-1)]"
                >
                  <Mail size={13} /> {t('cases.detail.reply')}
                </button>
              )}
              <button
                onClick={() => { setActiveAction('note'); setActionText('') }}
                className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-[var(--c-text-3)] hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-1)]"
              >
                <StickyNote size={13} /> {t('cases.detail.addNote')}
              </button>
              {(caseData.policy_id || caseData.workflow_id) && (
                <button
                  onClick={handleRun}
                  disabled={runCase.isPending}
                  className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-[var(--c-text-3)] hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-1)] disabled:opacity-50"
                >
                  <RefreshCw size={13} /> {t('cases.detail.rerun')}
                </button>
              )}
            </div>

            {/* Status transitions */}
            <div className="flex flex-col gap-1 border-t border-[var(--c-border)] pt-3">
              {!isClosed ? (
                <>
                  <button
                    onClick={() => handleStatusChange('closed_accepted')}
                    className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-emerald-400 hover:bg-emerald-500/10"
                  >
                    <CheckCircle2 size={13} /> {t('cases.detail.closeAccepted')}
                  </button>
                  <button
                    onClick={() => handleStatusChange('closed_rejected')}
                    className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-red-400 hover:bg-red-500/10"
                  >
                    <XCircle size={13} /> {t('cases.detail.closeRejected')}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleStatusChange('open')}
                  className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-[var(--c-text-3)] hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-1)]"
                >
                  <RefreshCw size={13} /> {t('cases.detail.reopen')}
                </button>
              )}
            </div>
          </div>

          {/* Center — timeline */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-5">
              <h2 className="mb-4 text-[12px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">
                {t('cases.detail.timeline')}
              </h2>
              <Timeline events={caseData.timeline} />
            </div>

            {/* Inline composer */}
            {activeAction && (
              <div className="shrink-0 border-t border-[var(--c-border)] bg-[var(--c-surface)] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[12px] font-medium text-[var(--c-text-2)]">
                    {activeAction === 'reply' ? t('cases.detail.reply') : t('cases.detail.addNote')}
                  </span>
                  <button onClick={() => setActiveAction(null)} className="ml-auto text-[var(--c-text-4)] hover:text-[var(--c-text-2)]">
                    <X size={13} />
                  </button>
                </div>
                <textarea
                  autoFocus
                  value={actionText}
                  onChange={e => setActionText(e.target.value)}
                  placeholder={activeAction === 'reply' ? t('cases.detail.replyPlaceholder') : t('cases.detail.notePlaceholder')}
                  rows={3}
                  className="w-full resize-none rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-2 text-[13px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    onClick={() => setActiveAction(null)}
                    className="rounded-md border border-[var(--c-border-2)] px-3 py-1.5 text-[12px] text-[var(--c-text-3)] hover:text-[var(--c-text-1)]"
                  >
                    {t('btn.cancel')}
                  </button>
                  <button
                    onClick={handleSendAction}
                    disabled={!actionText.trim() || replyCase.isPending || addNote.isPending}
                    className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-[12px] text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    <Send size={11} />
                    {activeAction === 'reply' ? t('cases.detail.sendReply') : t('cases.detail.saveNote')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right — current state */}
          <div className="flex w-[240px] shrink-0 flex-col gap-5 overflow-y-auto border-l border-[var(--c-border)] p-4">
            {/* Checklist */}
            <ChecklistPanel checklist={caseData.checklist} />

            {/* Documents */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">
                {t('cases.detail.documents')} ({caseData.documents.length})
              </p>
              {caseData.documents.length === 0 ? (
                <p className="text-[12px] text-[var(--c-text-5)]">{t('cases.detail.noDocuments')}</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {caseData.documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-2 rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface)] p-2">
                      <FileText size={12} className="shrink-0 text-[var(--c-text-4)]" />
                      <span className="flex-1 truncate text-[11px] text-[var(--c-text-2)]">{doc.original_filename}</span>
                      <span className="text-[10px] text-[var(--c-text-5)]">{doc.source}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Latest result */}
            {caseData.last_result && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">
                  {t('cases.detail.latestResult')}
                </p>
                {caseData.last_result.kind === 'verdict' ? (
                  <VerdictBadge overall={caseData.last_result.overall} />
                ) : (
                  <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                    caseData.last_result.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400' :
                    caseData.last_result.status === 'failed' ? 'bg-red-500/15 text-red-400' :
                    'bg-[var(--c-surface-3)] text-[var(--c-text-3)]'
                  }`}>
                    {caseData.last_result.status}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

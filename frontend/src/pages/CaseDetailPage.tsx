import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, FileText, CheckCircle2, XCircle, AlertCircle, RefreshCw,
  Send, X, Mail, StickyNote, Play, ExternalLink, ChevronDown, ChevronUp,
  ChevronRight, ShieldCheck, Circle, Loader2, Menu, Clock,
} from 'lucide-react'
import { LeftSidebar } from '../components/LeftSidebar'
import { CaseReviewDrawer } from '../components/CaseReviewDrawer'
import { useI18n } from '../context/i18n'
import { useCase, useUpdateCase, useRunCase, useReplyCase, useAddNote, type TimelineEvent } from '../api/cases'
import { useRunContext } from '../context/run'
import { useMobileSidebar } from '../hooks/useMobileSidebar'

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string | null, email: string | null): string {
  const src = name || email || '?'
  return src.split(/[\s@]/)[0]?.[0]?.toUpperCase() ?? '?'
}

function statusConfig(status: string) {
  const map: Record<string, { label: string; dot: string; pill: string }> = {
    open:              { label: 'Open',             dot: 'bg-indigo-400', pill: 'text-indigo-400 bg-indigo-500/10 border border-indigo-500/25' },
    awaiting_applicant:{ label: 'Awaiting',         dot: 'bg-amber-400',  pill: 'text-amber-400  bg-amber-500/10  border border-amber-500/25'  },
    under_review:      { label: 'Under review',     dot: 'bg-blue-400',   pill: 'text-blue-400   bg-blue-500/10   border border-blue-500/25'   },
    closed_accepted:   { label: 'Accepted',         dot: 'bg-emerald-400',pill: 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/25'},
    closed_rejected:   { label: 'Rejected',         dot: 'bg-[var(--c-text-5)]', pill: 'text-[var(--c-text-4)] bg-[var(--c-surface-3)] border border-[var(--c-border-2)]' },
  }
  return map[status] ?? { label: status, dot: 'bg-[var(--c-text-4)]', pill: 'text-[var(--c-text-4)] bg-[var(--c-surface-3)] border border-[var(--c-border-2)]' }
}

function verdictConfig(overall: string) {
  if (overall === 'pass')         return { bg: 'bg-emerald-500/8 border-emerald-500/25', icon: <CheckCircle2 size={18} className="text-emerald-400" />, text: 'text-emerald-400', label: 'All requirements met', sublabel: 'Eligible — ready to accept' }
  if (overall === 'fail')         return { bg: 'bg-red-500/8 border-red-500/25',         icon: <XCircle     size={18} className="text-red-400"     />, text: 'text-red-400',     label: 'Requirements not met',  sublabel: 'Issues found — review before deciding' }
  if (overall === 'needs_review') return { bg: 'bg-amber-500/8 border-amber-500/25',     icon: <AlertCircle size={18} className="text-amber-400"   />, text: 'text-amber-400',  label: 'Needs manual review',   sublabel: 'Flagged items need your attention' }
  return null
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return ''
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDateShort(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  if (diffDays < 7)  return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// ── Checklist ────────────────────────────────────────────────────────────────

function RequirementsPanel({ checklist, docCount, onOpenReview }: {
  checklist: Array<{ document_type: { id: number; name: string }; required: boolean; status: string }>
  docCount: number
  onOpenReview?: (docTypeId: number) => void
}) {
  const { t } = useI18n()
  if (checklist.length === 0) return null

  const satisfied = checklist.filter(i => i.status === 'satisfied').length
  const total = checklist.length
  const allMet = satisfied === total

  return (
    <div>
      {/* Progress header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">
          Requirements
        </span>
        <span className={`text-[12px] font-semibold ${allMet ? 'text-emerald-400' : 'text-[var(--c-text-3)]'}`}>
          {satisfied}/{total}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[var(--c-surface-3)]">
        <div
          className={`h-full rounded-full transition-all ${allMet ? 'bg-emerald-400' : 'bg-indigo-500'}`}
          style={{ width: `${(satisfied / total) * 100}%` }}
        />
      </div>

      {/* Items */}
      <div className="flex flex-col gap-1.5">
        {checklist.map(item => {
          const clickable = !!onOpenReview && item.status !== 'missing'
          const inner = (
            <>
              <div className="mt-0.5 shrink-0">
                {item.status === 'satisfied' ? (
                  <CheckCircle2 size={14} className="text-emerald-400" />
                ) : item.status === 'partial' ? (
                  <AlertCircle  size={14} className="text-amber-400" />
                ) : (
                  <XCircle      size={14} className="text-red-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-[var(--c-text-1)]">{item.document_type.name}</p>
                <p className={`text-[10px] font-medium uppercase tracking-wide ${
                  item.status === 'satisfied' ? 'text-emerald-500'  :
                  item.status === 'partial'   ? 'text-amber-500'    :
                  'text-red-500'
                }`}>
                  {item.status === 'satisfied' ? 'Received' :
                   item.status === 'partial'   ? 'Issues found' :
                   item.required               ? 'Missing — required' : 'Missing — optional'}
                </p>
              </div>
              {clickable && (
                <span className={`mt-0.5 flex shrink-0 items-center gap-0.5 text-[10px] font-medium ${
                  item.status === 'partial' ? 'text-amber-400' : 'text-[var(--c-text-5)] opacity-0 transition-opacity group-hover:opacity-100'
                }`}>
                  {item.status === 'partial' ? 'Review' : 'Open'} <ChevronRight size={11} />
                </span>
              )}
            </>
          )
          const cls = `group flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left ${
            item.status === 'satisfied' ? 'bg-emerald-500/5' :
            item.status === 'partial'   ? 'bg-amber-500/5' :
            'bg-red-500/5'
          } ${clickable ? 'w-full cursor-pointer transition-colors hover:bg-[var(--c-hover-2)]' : ''}`
          return clickable ? (
            <button key={item.document_type.id} onClick={() => onOpenReview!(item.document_type.id)} className={cls}>
              {inner}
            </button>
          ) : (
            <div key={item.document_type.id} className={cls}>{inner}</div>
          )
        })}
      </div>
    </div>
  )
}

// ── Timeline events ───────────────────────────────────────────────────────────

function EmailCard({ event }: { event: TimelineEvent }) {
  const [expanded, setExpanded] = useState(false)
  const isInbound  = event.direction === 'inbound'
  const isNote     = event.direction === 'note'
  const bodyLen    = event.body?.length ?? 0
  const preview    = event.body?.slice(0, 220) ?? ''
  const truncated  = bodyLen > 220

  const actorLabel  = isNote ? 'Internal note' : isInbound ? (event.from_addr ?? 'Unknown') : 'You replied'
  const verbLabel   = isNote ? 'added' : isInbound ? 'sent a message' : `→ ${event.to_addr ?? 'applicant'}`

  return (
    <div className="relative flex gap-3">
      {/* Avatar */}
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
        isNote     ? 'bg-amber-500/15' :
        isInbound  ? 'bg-[var(--c-surface-3)]' :
        'bg-indigo-500/15'
      }`}>
        {isNote ? (
          <StickyNote size={14} className="text-amber-400" />
        ) : isInbound ? (
          <span className="text-[12px] font-bold text-[var(--c-text-3)]">
            {initials(null, event.from_addr ?? null)}
          </span>
        ) : (
          <Mail size={14} className="text-indigo-400" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Header line */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[12px]">
            <span className="font-medium text-[var(--c-text-1)]">{actorLabel}</span>
            <span className="ml-1.5 text-[var(--c-text-5)]">{verbLabel}</span>
          </span>
          <span className="shrink-0 text-[11px] text-[var(--c-text-5)]" title={formatDate(event.created_at)}>
            {formatDateShort(event.created_at)}
          </span>
        </div>

        {/* Subject */}
        {event.subject && (
          <p className="mt-1 text-[13px] font-semibold text-[var(--c-text-1)]">{event.subject}</p>
        )}

        {/* Body */}
        {event.body && (
          <div className={`mt-1.5 rounded-lg border p-3 ${
            isNote ? 'border-amber-500/20 bg-amber-500/5' :
            isInbound ? 'border-[var(--c-border)] bg-[var(--c-surface)]' :
            'border-indigo-500/20 bg-indigo-500/5'
          }`}>
            <pre className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-[var(--c-text-2)]">
              {expanded || !truncated ? event.body : preview + '…'}
            </pre>
            {truncated && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="mt-2 flex items-center gap-1 text-[11px] font-medium text-indigo-400 hover:text-indigo-300"
              >
                {expanded ? <><ChevronUp size={11} /> Show less</> : <><ChevronDown size={11} /> Read full message</>}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function RunCard({ event }: { event: TimelineEvent }) {
  const [expanded, setExpanded] = useState(false)
  const overall  = event.last_result?.kind === 'verdict' ? event.last_result.overall : undefined
  const isActive = event.status === 'pending' || event.status === 'running'
  const isFailed = event.status === 'failed'

  const vc = overall ? verdictConfig(overall) : null

  return (
    <div className="relative flex gap-3">
      {/* Status dot */}
      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
        isActive ? 'bg-indigo-500/15' :
        vc?.bg?.includes('emerald') ? 'bg-emerald-500/15' :
        vc?.bg?.includes('red')     ? 'bg-red-500/15' :
        vc?.bg?.includes('amber')   ? 'bg-amber-500/15' :
        isFailed ? 'bg-red-500/15' :
        'bg-[var(--c-surface-3)]'
      }`}>
        {isActive ? (
          <Loader2 size={12} className="animate-spin text-indigo-400" />
        ) : vc ? (
          <span className="scale-75">{vc.icon}</span>
        ) : isFailed ? (
          <XCircle size={13} className="text-red-400" />
        ) : (
          <Play size={11} className="text-[var(--c-text-4)]" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[12px]">
              <span className="font-medium text-[var(--c-text-1)]">Automated validation</span>
              <span className="ml-1.5 text-[var(--c-text-5)]">on {event.name || 'document'}</span>
            </span>
            {isActive && (
              <span className="flex shrink-0 items-center gap-1 text-[11px] text-indigo-400">
                <Loader2 size={9} className="animate-spin" /> Running…
              </span>
            )}
            {overall && !isActive && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                overall === 'pass'         ? 'bg-emerald-500/15 text-emerald-400' :
                overall === 'fail'         ? 'bg-red-500/15 text-red-400' :
                'bg-amber-500/15 text-amber-400'
              }`}>
                {overall === 'pass' ? 'Pass' : overall === 'fail' ? 'Fail' : 'Review'}
              </span>
            )}
            {isFailed && !overall && (
              <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-400">
                Error
              </span>
            )}
          </div>
          <span className="shrink-0 text-[11px] text-[var(--c-text-5)]" title={formatDate(event.created_at)}>
            {formatDateShort(event.created_at)}
          </span>
        </div>

        {/* Result description */}
        {vc && !isActive && (
          <p className={`mt-0.5 text-[11.5px] ${vc.text}`}>{vc.sublabel}</p>
        )}

        {/* Actions row */}
        <div className="mt-1.5 flex items-center gap-2">
          {event.id && event.status === 'completed' && (
            <Link
              to={`/reports/${event.id}`}
              className="flex items-center gap-1 rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-2 py-1 text-[11px] text-[var(--c-text-3)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-1)]"
              onClick={e => e.stopPropagation()}
            >
              <ExternalLink size={10} /> View report
            </Link>
          )}
          {event.steps && event.steps.length > 0 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-1 text-[11px] text-[var(--c-text-5)] hover:text-[var(--c-text-3)]"
            >
              {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {expanded ? 'Hide steps' : `${event.steps.length} steps`}
            </button>
          )}
        </div>

        {/* Steps */}
        {expanded && event.steps && (
          <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface-2)] p-2.5">
            {event.steps.map(step => (
              <span key={step.id} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                step.status === 'succeeded' ? 'bg-emerald-500/10 text-emerald-400' :
                step.status === 'failed'    ? 'bg-red-500/10 text-red-400' :
                step.status === 'running'   ? 'bg-indigo-500/10 text-indigo-400' :
                step.status === 'waiting'   ? 'bg-amber-500/10 text-amber-400' :
                'bg-[var(--c-surface-3)] text-[var(--c-text-5)]'
              }`}>
                {step.node_type.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Activity feed ─────────────────────────────────────────────────────────────

function ActivityFeed({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--c-surface-3)]">
          <Clock size={20} className="text-[var(--c-text-5)]" />
        </div>
        <p className="text-[13px] font-medium text-[var(--c-text-3)]">No activity yet</p>
        <p className="mt-1 max-w-[240px] text-[12px] text-[var(--c-text-5)]">
          Activity will appear here when documents are received or validations run.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {events.map(event =>
        event.kind === 'email'
          ? <EmailCard key={`e-${event.id}`} event={event} />
          : <RunCard   key={`r-${event.id}`} event={event} />
      )}
    </div>
  )
}

// ── Verdict banner ────────────────────────────────────────────────────────────

function VerdictBanner({
  overall, latestRunId, nextStep, onReview,
}: { overall: string; latestRunId?: number; nextStep?: string | null; onReview?: () => void }) {
  const vc = verdictConfig(overall)
  if (!vc) return null
  return (
    <div className={`rounded-xl border ${vc.bg}`}>
      <div className="flex items-center gap-4 p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          overall === 'pass' ? 'bg-emerald-500/15' :
          overall === 'fail' ? 'bg-red-500/15' :
          'bg-amber-500/15'
        }`}>
          {vc.icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[15px] font-semibold ${vc.text}`}>{vc.label}</p>
          <p className="mt-0.5 text-[12px] text-[var(--c-text-3)]">{vc.sublabel}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onReview && overall !== 'pass' && (
            <button
              onClick={onReview}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold text-white transition-colors ${
                overall === 'fail' ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-600 hover:bg-amber-500'
              }`}
            >
              <ShieldCheck size={12} /> Review &amp; resolve
            </button>
          )}
          {latestRunId && (
            <Link
              to={`/reports/${latestRunId}`}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-2 text-[12px] font-medium text-[var(--c-text-2)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-1)]"
            >
              <ExternalLink size={12} /> View full report
            </Link>
          )}
        </div>
      </div>
      {nextStep && (
        <div className={`flex items-center gap-2 border-t px-4 py-2.5 text-[12px] ${
          overall === 'pass' ? 'border-emerald-500/20 text-emerald-300' :
          overall === 'fail' ? 'border-red-500/20 text-red-300' :
          'border-amber-500/20 text-amber-300'
        }`}>
          <span className="font-semibold">Next step:</span>
          <span>{nextStep}</span>
        </div>
      )}
    </div>
  )
}

// ── Inline reply composer ─────────────────────────────────────────────────────

interface ComposerProps {
  contactEmail: string | null
  caseId: number
  onSent: () => void
}

function InlineComposer({ contactEmail, caseId, onSent }: ComposerProps) {
  const [mode, setMode] = useState<null | 'reply' | 'note'>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const replyCase = useReplyCase()
  const addNote   = useAddNote()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (mode) setTimeout(() => textareaRef.current?.focus(), 50)
  }, [mode])

  async function send() {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      if (mode === 'reply') await replyCase.mutateAsync({ caseId, body: text })
      else await addNote.mutateAsync({ caseId, body: text })
      setText(''); setMode(null); onSent()
    } finally { setSending(false) }
  }

  if (!mode) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--c-surface-3)] text-[10px] font-bold text-[var(--c-text-3)]">
          {initials(null, contactEmail)}
        </div>
        <button
          onClick={() => setMode(contactEmail ? 'reply' : 'note')}
          className="flex-1 text-left text-[13px] text-[var(--c-text-5)] hover:text-[var(--c-text-3)]"
        >
          {contactEmail ? `Reply to ${contactEmail}…` : 'Add an internal note…'}
        </button>
        <div className="flex items-center gap-1">
          {contactEmail && (
            <button
              onClick={() => setMode('reply')}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] text-[var(--c-text-4)] hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-2)]"
            >
              <Mail size={12} /> Reply
            </button>
          )}
          <button
            onClick={() => setMode('note')}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] text-[var(--c-text-4)] hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-2)]"
          >
            <StickyNote size={12} /> Note
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--c-border-2)] bg-[var(--c-surface)] overflow-hidden">
      {/* Mode tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--c-border)] px-3 py-2">
        {contactEmail && (
          <button
            onClick={() => setMode('reply')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${mode === 'reply' ? 'bg-[var(--c-active)] text-[var(--c-text-1)]' : 'text-[var(--c-text-4)] hover:text-[var(--c-text-2)]'}`}
          >
            <Mail size={11} /> Reply
          </button>
        )}
        <button
          onClick={() => setMode('note')}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${mode === 'note' ? 'bg-amber-500/15 text-amber-400' : 'text-[var(--c-text-4)] hover:text-[var(--c-text-2)]'}`}
        >
          <StickyNote size={11} /> Internal note
        </button>
        <div className="flex-1" />
        <button onClick={() => { setMode(null); setText('') }} className="rounded p-1 text-[var(--c-text-5)] hover:text-[var(--c-text-3)]">
          <X size={12} />
        </button>
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
        placeholder={mode === 'reply'
          ? `Reply to ${contactEmail}…`
          : 'Add an internal note visible only to your team…'}
        rows={4}
        className={`w-full resize-none border-0 bg-transparent px-4 py-3 text-[13px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none ${mode === 'note' ? 'bg-amber-500/3' : ''}`}
      />

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-[var(--c-border)] px-3 py-2">
        <span className="text-[11px] text-[var(--c-text-5)]">⌘↵ to send</span>
        <button
          onClick={send}
          disabled={!text.trim() || sending}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-white transition-colors disabled:opacity-40 ${
            mode === 'note' ? 'bg-amber-500 hover:bg-amber-400' : 'bg-indigo-600 hover:bg-indigo-500'
          }`}
        >
          {sending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
          {mode === 'note' ? 'Save note' : 'Send reply'}
        </button>
      </div>
    </div>
  )
}

// ── Left sidebar ──────────────────────────────────────────────────────────────

type CaseData = NonNullable<ReturnType<typeof useCase>['data']>

function CaseSidebar({ caseData, onStatusChange, onRun, isRunning, onOpenReview }: {
  caseData: CaseData
  onStatusChange: (s: string) => void
  onRun: () => void
  isRunning: boolean
  onOpenReview?: (docTypeId?: number | null) => void
}) {
  const sidebarIsClosed = caseData.status.startsWith('closed_')
  const hasTarget = !!(caseData.policy_id || caseData.workflow_id)

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-5">

      {/* Contact card */}
      <div className="rounded-xl border border-[var(--c-border-2)] bg-[var(--c-surface)] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-[16px] font-bold text-indigo-400">
            {initials(caseData.contact_name, caseData.contact_email)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-[var(--c-text-1)]">
              {caseData.contact_name || caseData.contact_email || 'Unknown contact'}
            </p>
            {caseData.contact_name && caseData.contact_email && (
              <p className="mt-0.5 truncate text-[11px] text-[var(--c-text-4)]">{caseData.contact_email}</p>
            )}
            {!caseData.contact_email && !caseData.contact_name && (
              <p className="mt-0.5 text-[11px] text-[var(--c-text-5)]">No contact info</p>
            )}
          </div>
        </div>
        {caseData.target_name && (
          <div className="mt-3 flex items-center gap-2 border-t border-[var(--c-border)] pt-3">
            <span className="text-[11px] text-[var(--c-text-5)]">Application for:</span>
            <span className={`flex-1 truncate rounded px-2 py-0.5 text-[11px] font-medium ${
              caseData.target_kind === 'policy' ? 'bg-violet-500/10 text-violet-400' : 'bg-indigo-500/10 text-indigo-400'
            }`}>
              {caseData.target_name}
            </span>
          </div>
        )}
      </div>

      {/* Requirements */}
      {caseData.checklist.length > 0 && (
        <div>
          <RequirementsPanel
            checklist={caseData.checklist}
            docCount={caseData.documents.length}
            onOpenReview={onOpenReview ? (id) => onOpenReview(id) : undefined}
          />
        </div>
      )}

      {/* Documents */}
      {caseData.documents.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">
              Documents
            </span>
            <span className="text-[11px] text-[var(--c-text-5)]">{caseData.documents.length}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {caseData.documents.map(doc => (
              <button
                key={doc.id}
                onClick={() => onOpenReview?.(null)}
                disabled={!onOpenReview}
                className="group flex w-full items-center gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-left transition-colors enabled:hover:border-[var(--c-border-3)] disabled:cursor-default"
              >
                <FileText size={12} className="shrink-0 text-[var(--c-text-5)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-medium text-[var(--c-text-2)]">{doc.original_filename}</p>
                  <p className="text-[10px] capitalize text-[var(--c-text-5)]">
                    {doc.source === 'mail' ? 'Received by email' : doc.source === 'upload' ? 'Uploaded manually' : doc.source}
                  </p>
                </div>
                {onOpenReview && (
                  <ChevronRight size={12} className="shrink-0 text-[var(--c-text-5)] opacity-0 transition-opacity group-hover:opacity-100" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* External ref */}
      <ExternalRefField caseData={caseData} />

      {/* Quick actions */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">Actions</p>
        <div className="flex flex-col gap-1">
          {hasTarget && (
            <button
              onClick={onRun}
              disabled={isRunning}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-[var(--c-text-2)] transition-colors hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-1)] disabled:opacity-50"
            >
              <RefreshCw size={13} className={`shrink-0 ${isRunning ? 'animate-spin' : ''}`} />
              Re-run validation
            </button>
          )}
        </div>
      </div>

      {/* Decision */}
      <div className="mt-auto">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">Decision</p>
        {!sidebarIsClosed ? (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => onStatusChange('closed_accepted')}
              className="flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/8 px-3 py-2.5 text-[13px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/15"
            >
              <CheckCircle2 size={14} /> Accept — close case
            </button>
            <button
              onClick={() => onStatusChange('closed_rejected')}
              className="flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/8 px-3 py-2.5 text-[13px] font-semibold text-red-400 transition-colors hover:bg-red-500/15"
            >
              <XCircle size={14} /> Reject — close case
            </button>
          </div>
        ) : (
          <button
            onClick={() => onStatusChange('open')}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--c-border-2)] px-3 py-2 text-[12px] font-medium text-[var(--c-text-3)] transition-colors hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-1)]"
          >
            <RefreshCw size={12} /> Reopen case
          </button>
        )}
      </div>
    </div>
  )
}

function ExternalRefField({ caseData }: { caseData: CaseData }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(caseData.external_ref ?? '')
  const updateCase = useUpdateCase()

  async function save() {
    await updateCase.mutateAsync({ id: caseData.id, external_ref: value })
    setEditing(false)
  }

  if (!editing && !caseData.external_ref) return null

  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">Reference #</p>
      {editing ? (
        <div className="flex gap-1.5">
          <input
            autoFocus value={value} onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(false) }}
            className="min-w-0 flex-1 rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-2.5 py-1.5 text-[12px] text-[var(--c-text-1)] outline-none focus:border-indigo-500/50"
          />
          <button onClick={save} className="rounded bg-indigo-600 px-2.5 py-1.5 text-[12px] text-white hover:bg-indigo-500">✓</button>
          <button onClick={() => setEditing(false)} className="px-1 text-[var(--c-text-4)] hover:text-[var(--c-text-2)]"><X size={12} /></button>
        </div>
      ) : (
        <button onClick={() => { setValue(caseData.external_ref ?? ''); setEditing(true) }} className="text-[12px] text-[var(--c-text-3)] hover:text-[var(--c-text-1)]">
          {caseData.external_ref}
        </button>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>()
  const navigate    = useNavigate()
  const id          = caseId ? parseInt(caseId, 10) : null
  const { setActiveRunId } = useRunContext()
  const { sidebarOpen, openSidebar, closeSidebar } = useMobileSidebar()

  const { data: caseData, isLoading } = useCase(id)
  const updateCase = useUpdateCase()
  const runCase    = useRunCase()

  // Mobile panel
  const [mobilePanel, setMobilePanel] = useState<'activity' | 'overview'>('activity')

  // Inline review drawer
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewDocType, setReviewDocType] = useState<number | null>(null)

  const LoadingState = () => (
    <div className="flex h-full w-full overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={closeSidebar} />}
      <div className={['fixed inset-y-0 left-0 z-50 md:relative md:z-auto md:flex md:shrink-0', sidebarOpen ? 'flex' : 'hidden'].join(' ')}>
        <LeftSidebar />
      </div>
      <main className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-2 text-[13px] text-[var(--c-text-4)]">
          <Loader2 size={16} className="animate-spin" />
          Loading case…
        </div>
      </main>
    </div>
  )

  if (isLoading) return <LoadingState />
  if (!caseData) return (
    <div className="flex h-full w-full items-center justify-center bg-[var(--c-bg)] text-[13px] text-[var(--c-text-4)]">
      Case not found
    </div>
  )

  async function handleRun() {
    if (!id) return
    const result = await runCase.mutateAsync({ caseId: id })
    if (result?.id) setActiveRunId(result.id)
  }

  // Find latest verdict from timeline
  const latestVerdictRun = [...caseData.timeline]
    .reverse()
    .find(e => e.kind === 'run' && e.status === 'completed' && e.last_result?.kind === 'verdict')
  const latestOverall    = latestVerdictRun?.last_result?.overall
  const latestRunId      = latestVerdictRun?.id
  const sc               = statusConfig(caseData.status)
  const title            = caseData.contact_name || caseData.contact_email || caseData.name || `Case #${caseData.id}`
  const isClosed         = caseData.status.startsWith('closed_')

  // Open the inline review drawer (only meaningful once a validation run exists)
  const openReview = (docTypeId?: number | null) => {
    if (!latestRunId) return
    setReviewDocType(docTypeId ?? null)
    setReviewOpen(true)
  }

  // Compute "What to do next" guidance
  const cd = caseData  // narrow for closure typing
  const nextStep: string | null = (() => {
    if (isClosed) return null
    const missingReq = cd.checklist.find(c => c.status === 'missing' && c.required)
    if (missingReq && cd.contact_email) {
      return `Ask the applicant to send the missing "${missingReq.document_type.name}".`
    }
    if (latestOverall === 'pass') return 'All checks passed. Review and accept the case, or close it.'
    if (latestOverall === 'fail') return 'Reply to the applicant with what needs to change, or reject the case.'
    if (latestOverall === 'needs_review') return 'Review the flagged items and decide.'
    if (cd.documents.length > 0 && !latestVerdictRun) return 'Run validation to check the submitted documents.'
    return null
  })()

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      {/* Sidebar */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={closeSidebar} />}
      <div className={['fixed inset-y-0 left-0 z-50 md:relative md:z-auto md:flex md:shrink-0', sidebarOpen ? 'flex' : 'hidden'].join(' ')}>
        <LeftSidebar />
      </div>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--c-border)] px-3 md:px-5">
          <button className="rounded p-1.5 text-[var(--c-text-4)] hover:bg-[var(--c-hover-2)] md:hidden" onClick={openSidebar}>
            <Menu size={15} />
          </button>
          <button onClick={() => navigate('/cases')} className="rounded p-1.5 text-[var(--c-text-4)] hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-2)]" title="Back to Cases">
            <ArrowLeft size={15} />
          </button>
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--c-text-1)]">{title}</span>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${sc.pill}`}>
            <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${sc.dot}`} />
            {sc.label}
          </span>
        </div>

        {/* ── Verdict banner (full-width, only when result exists) ── */}
        {latestOverall && (
          <div className="shrink-0 border-b border-[var(--c-border)] px-4 py-3 md:px-5">
            <VerdictBanner overall={latestOverall} latestRunId={latestVerdictRun?.id} nextStep={nextStep} onReview={() => openReview(null)} />
          </div>
        )}

        {/* ── No-verdict-yet hint banner ── */}
        {!latestOverall && !isClosed && (
          <div className="shrink-0 border-b border-[var(--c-border)] bg-[var(--c-surface-2)] px-4 py-3 md:px-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/15">
                <Clock size={14} className="text-indigo-400" />
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-medium text-[var(--c-text-1)]">No validation yet</p>
                <p className="mt-0.5 text-[12px] text-[var(--c-text-4)]">
                  {caseData.documents.length === 0
                    ? 'Waiting for the applicant to send documents. They will appear here automatically.'
                    : nextStep || 'Documents received. Run validation when ready.'}
                </p>
              </div>
              {caseData.documents.length > 0 && (caseData.policy_id || caseData.workflow_id) && (
                <button
                  onClick={handleRun}
                  disabled={runCase.isPending}
                  className="shrink-0 flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
                >
                  {runCase.isPending ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                  Run validation
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Mobile tabs ── */}
        <div className="flex shrink-0 border-b border-[var(--c-border)] md:hidden">
          {(['activity', 'overview'] as const).map(p => (
            <button
              key={p}
              onClick={() => setMobilePanel(p)}
              className={[
                'flex-1 border-b-2 py-2.5 text-[12px] font-medium capitalize transition-colors',
                mobilePanel === p ? 'border-indigo-500 text-[var(--c-text-1)]' : 'border-transparent text-[var(--c-text-4)]',
              ].join(' ')}
            >
              {p === 'activity' ? '💬 Activity' : '📋 Overview'}
            </button>
          ))}
        </div>

        {/* ── Main content ── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">

          {/* Left: Case sidebar (overview/requirements/docs/actions) */}
          <div className={[
            'shrink-0 border-r border-[var(--c-border)] md:flex md:w-[260px] lg:w-[290px]',
            mobilePanel === 'overview' ? 'flex w-full flex-col' : 'hidden md:flex md:flex-col',
          ].join(' ')}>
            <CaseSidebar
              caseData={caseData}
              onStatusChange={s => updateCase.mutate({ id: caseData.id, status: s })}
              onRun={handleRun}
              isRunning={runCase.isPending}
              onOpenReview={latestRunId ? openReview : undefined}
            />
          </div>

          {/* Right: Activity + composer */}
          <div className={[
            'flex min-w-0 flex-1 flex-col overflow-hidden',
            mobilePanel === 'activity' ? 'flex' : 'hidden md:flex',
          ].join(' ')}>
            {/* Activity feed */}
            <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">
                  Activity
                </span>
                <span className="text-[11px] text-[var(--c-text-5)]">
                  {caseData.timeline.length} event{caseData.timeline.length !== 1 ? 's' : ''}
                </span>
              </div>
              <ActivityFeed events={caseData.timeline} />
            </div>

            {/* Inline composer */}
            <div className="shrink-0 border-t border-[var(--c-border)] bg-[var(--c-bg)] px-4 py-3 md:px-6">
              <InlineComposer
                contactEmail={caseData.contact_email}
                caseId={caseData.id}
                onSent={() => {}}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Inline review drawer */}
      {reviewOpen && latestRunId && (
        <CaseReviewDrawer
          runId={latestRunId}
          caseId={caseData.id}
          initialDocTypeId={reviewDocType}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </div>
  )
}

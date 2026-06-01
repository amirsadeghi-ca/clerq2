import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FolderOpen, Search, Plus, ChevronRight, Menu,
} from 'lucide-react'
import { LeftSidebar } from '../components/LeftSidebar'
import { useI18n } from '../context/i18n'
import { useCases, type CaseListItem } from '../api/cases'

const VIEWS = [
  { key: undefined as string | undefined, label: 'cases.title' },
  { key: 'needs_review', label: 'cases.filter.needs_review' },
  { key: 'awaiting_applicant', label: 'cases.filter.awaiting' },
  { key: 'closed', label: 'cases.filter.closed' },
  { key: 'all', label: 'cases.filter.all' },
]

function VerdictBadge({ overall }: { overall: string | undefined | null }) {
  if (!overall) return null
  const map: Record<string, [string, string]> = {
    pass: ['Pass', 'bg-emerald-500/15 text-emerald-400'],
    fail: ['Fail', 'bg-red-500/15 text-red-400'],
    needs_review: ['Review', 'bg-amber-500/15 text-amber-400'],
  }
  const [label, cls] = map[overall] ?? [overall, 'bg-[var(--c-surface-3)] text-[var(--c-text-3)]']
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: 'bg-indigo-400',
    awaiting_applicant: 'bg-amber-400',
    under_review: 'bg-blue-400',
    closed_accepted: 'bg-emerald-400',
    closed_rejected: 'bg-[var(--c-text-5)]',
  }
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${colors[status] ?? 'bg-[var(--c-text-4)]'}`} />
}

function ChecklistProgress({ progress, docCount }: { progress: string | null; docCount: number }) {
  if (progress) {
    const [done, total] = progress.split('/').map(Number)
    const isComplete = done === total
    return (
      <span className={isComplete ? 'text-emerald-400' : 'text-[var(--c-text-3)]'}>
        {progress}
      </span>
    )
  }
  if (docCount > 0) {
    return <span className="text-[var(--c-text-4)]">{docCount} doc{docCount !== 1 ? 's' : ''}</span>
  }
  return <span className="text-[var(--c-text-6)]">—</span>
}

function ResultCell({ result }: { result: CaseListItem['last_result'] }) {
  if (!result) return <span className="text-[var(--c-text-6)]">—</span>
  if (result.kind === 'verdict') return <VerdictBadge overall={result.overall} />
  const statusMap: Record<string, string> = {
    completed: 'bg-emerald-500/15 text-emerald-400',
    failed: 'bg-red-500/15 text-red-400',
    running: 'bg-indigo-500/15 text-indigo-400',
    pending: 'bg-[var(--c-surface-3)] text-[var(--c-text-4)]',
  }
  const cls = statusMap[result.status ?? ''] ?? 'bg-[var(--c-surface-3)] text-[var(--c-text-4)]'
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{result.status ?? '—'}</span>
}

function formatTimeAgo(date: Date): string {
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Mobile card layout for small screens
function CaseCard({ c, onClick }: { c: CaseListItem; onClick: () => void }) {
  const { t } = useI18n()
  const contact = c.contact_name || c.contact_email || t('cases.noContact')
  const target = c.target_name || c.target_kind || '—'
  const activityDate = c.last_activity_at ? new Date(c.last_activity_at) : null

  return (
    <button
      onClick={onClick}
      className="w-full border-b border-[var(--c-divider)] px-4 py-3 text-left hover:bg-[var(--c-hover-1)] transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={c.status} />
          <span className={`truncate text-[13px] text-[var(--c-text-1)] ${c.unread ? 'font-semibold' : 'font-medium'}`}>{contact}</span>
          {c.unread && <span className="shrink-0 rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400">new</span>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ResultCell result={c.last_result} />
          <ChevronRight size={13} className="text-[var(--c-text-5)]" />
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between pl-4">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-[11px] text-[var(--c-text-4)]">{target}</span>
          {c.target_kind && (
            <span className={`rounded px-1 py-0.5 text-[10px] ${c.target_kind === 'policy' ? 'bg-violet-500/10 text-violet-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
              {c.target_kind}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ChecklistProgress progress={c.checklist_progress} docCount={c.doc_count} />
          <span className="text-[11px] text-[var(--c-text-5)]">{activityDate ? formatTimeAgo(activityDate) : '—'}</span>
        </div>
      </div>
    </button>
  )
}

// Desktop table row
function CaseRow({ c, onClick }: { c: CaseListItem; onClick: () => void }) {
  const { t } = useI18n()
  const contact = c.contact_name || c.contact_email || t('cases.noContact')
  const target = c.target_name || c.target_kind || t('cases.noTarget')
  const activityDate = c.last_activity_at ? new Date(c.last_activity_at) : null

  return (
    <tr
      onClick={onClick}
      className="cursor-pointer border-b border-[var(--c-divider)] hover:bg-[var(--c-hover-1)] transition-colors"
    >
      <td className="w-5 py-3 pl-4 pr-1">
        {c.unread && <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-400" />}
      </td>
      <td className="py-3 pr-4 max-w-[200px]">
        <div className="flex items-center gap-2">
          <StatusDot status={c.status} />
          <span className="truncate text-[13px] font-medium text-[var(--c-text-1)]">{contact}</span>
        </div>
        {c.name && c.name !== contact && (
          <p className="mt-0.5 truncate pl-4 text-[11px] text-[var(--c-text-5)]">{c.name}</p>
        )}
      </td>
      <td className="py-3 pr-4 max-w-[180px]">
        <div className="flex items-center gap-1.5 truncate">
          <span className="truncate text-[12px] text-[var(--c-text-3)]">{target}</span>
          {c.target_kind && (
            <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] ${c.target_kind === 'policy' ? 'bg-violet-500/10 text-violet-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
              {c.target_kind}
            </span>
          )}
        </div>
      </td>
      <td className="py-3 pr-4">
        <ResultCell result={c.last_result} />
      </td>
      <td className="py-3 pr-4 text-[12px]">
        <ChecklistProgress progress={c.checklist_progress} docCount={c.doc_count} />
      </td>
      <td className="py-3 pr-4 text-right text-[11px] text-[var(--c-text-4)] whitespace-nowrap">
        {activityDate ? formatTimeAgo(activityDate) : '—'}
      </td>
      <td className="py-3 pr-3 text-[var(--c-text-5)]">
        <ChevronRight size={13} />
      </td>
    </tr>
  )
}

export function CasesPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [view, setView] = useState<string | undefined>(undefined)
  const [q, setQ] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const { data: cases = [], isLoading } = useCases({
    view,
    q: q || undefined,
  })

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — hidden on mobile unless toggled */}
      <div className={[
        'fixed inset-y-0 left-0 z-50 md:relative md:z-auto md:flex md:shrink-0',
        sidebarOpen ? 'flex' : 'hidden',
      ].join(' ')}>
        <LeftSidebar />
      </div>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--c-border)] px-4 md:px-5">
          <div className="flex items-center gap-3">
            <button
              className="rounded-md p-1.5 text-[var(--c-text-4)] hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-2)] md:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={16} />
            </button>
            <div className="flex items-center gap-2">
              <FolderOpen size={15} className="text-[var(--c-text-4)]" />
              <span className="text-[14px] font-semibold text-[var(--c-text-1)]">{t('cases.title')}</span>
            </div>
          </div>
          <button
            onClick={() => navigate('/validate')}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-indigo-500 active:bg-indigo-700"
          >
            <Plus size={13} />
            <span className="hidden sm:inline">{t('cases.new')}</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>

        {/* View tabs — scrollable on mobile */}
        <div className="flex shrink-0 items-center overflow-x-auto border-b border-[var(--c-border)] px-2 md:px-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {VIEWS.map(v => (
            <button
              key={v.key ?? 'default'}
              onClick={() => setView(v.key)}
              className={[
                'whitespace-nowrap border-b-2 px-3 py-2.5 text-[12px] font-medium transition-colors md:px-4',
                v.key === view
                  ? 'border-indigo-500 text-[var(--c-text-1)]'
                  : 'border-transparent text-[var(--c-text-4)] hover:text-[var(--c-text-2)]',
              ].join(' ')}
            >
              {t(v.label)}{v.key === 'all' && cases.length > 0 ? ` (${cases.length})` : ''}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="shrink-0 border-b border-[var(--c-border)] px-3 py-2 md:px-4">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--c-text-5)]" />
            <input
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={t('cases.search')}
              className="w-full rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface)] py-1.5 pl-8 pr-3 text-[13px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-[13px] text-[var(--c-text-4)]">
              {t('common.loading')}
            </div>
          ) : cases.length === 0 ? (
            <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 px-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--c-surface-3)]">
                <FolderOpen size={20} className="text-[var(--c-text-4)]" />
              </div>
              <div>
                <p className="text-[14px] font-medium text-[var(--c-text-2)]">{t('cases.empty')}</p>
                <p className="mt-1 max-w-sm text-[12px] text-[var(--c-text-5)]">{t('cases.emptyHint')}</p>
              </div>
            </div>
          ) : (
            <>
              {/* Mobile: cards */}
              <div className="md:hidden">
                {cases.map(c => (
                  <CaseCard key={c.id} c={c} onClick={() => navigate(`/cases/${c.id}`)} />
                ))}
              </div>

              {/* Desktop: table */}
              <table className="hidden w-full border-collapse md:table">
                <thead className="sticky top-0 bg-[var(--c-bg)]">
                  <tr className="border-b border-[var(--c-border)]">
                    <th className="w-5 py-2 pl-4 pr-1" />
                    <th className="py-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--c-text-5)]">
                      {t('cases.col.contact')}
                    </th>
                    <th className="py-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--c-text-5)]">
                      {t('cases.col.target')}
                    </th>
                    <th className="py-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--c-text-5)]">
                      {t('cases.col.result')}
                    </th>
                    <th className="py-2 pr-4 text-left text-[11px] font-medium uppercase tracking-wider text-[var(--c-text-5)]">
                      {t('cases.col.checklist')}
                    </th>
                    <th className="py-2 pr-4 text-right text-[11px] font-medium uppercase tracking-wider text-[var(--c-text-5)]">
                      {t('cases.col.activity')}
                    </th>
                    <th className="w-6 py-2 pr-3" />
                  </tr>
                </thead>
                <tbody>
                  {cases.map(c => (
                    <CaseRow key={c.id} c={c} onClick={() => navigate(`/cases/${c.id}`)} />
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

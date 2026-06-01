import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderOpen, Search, Plus, Circle, ChevronRight } from 'lucide-react'
import { LeftSidebar } from '../components/LeftSidebar'
import { useI18n } from '../context/i18n'
import { useCases, type CaseListItem } from '../api/cases'

const VIEWS = [
  { key: 'needs_review', label: 'cases.filter.needs_review' },
  { key: 'awaiting_applicant', label: 'cases.filter.awaiting' },
  { key: 'closed', label: 'cases.filter.closed' },
  { key: 'all', label: 'cases.filter.all' },
]

function VerdictBadge({ overall }: { overall: string | undefined }) {
  if (!overall) return null
  const colors: Record<string, string> = {
    pass: 'bg-emerald-500/15 text-emerald-400',
    fail: 'bg-red-500/15 text-red-400',
    needs_review: 'bg-amber-500/15 text-amber-400',
  }
  const labels: Record<string, string> = { pass: 'Pass', fail: 'Fail', needs_review: 'Review' }
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${colors[overall] ?? 'bg-[var(--c-surface-3)] text-[var(--c-text-3)]'}`}>
      {labels[overall] ?? overall}
    </span>
  )
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: 'bg-indigo-400',
    awaiting_applicant: 'bg-amber-400',
    under_review: 'bg-blue-400',
    closed_accepted: 'bg-emerald-400',
    closed_rejected: 'bg-[var(--c-text-4)]',
  }
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status] ?? 'bg-[var(--c-text-4)]'}`} />
}

function CaseRow({ c, onClick }: { c: CaseListItem; onClick: () => void }) {
  const { t } = useI18n()
  const contactLabel = c.contact_name || c.contact_email || t('cases.noContact')
  const targetLabel = c.target_name || (c.target_kind === 'policy' ? 'Policy' : c.target_kind === 'workflow' ? 'Workflow' : t('cases.noTarget'))
  const activityDate = c.last_activity_at ? new Date(c.last_activity_at) : null
  const timeAgo = activityDate ? formatTimeAgo(activityDate) : '—'

  return (
    <tr
      onClick={onClick}
      className="cursor-pointer border-b border-[var(--c-divider)] hover:bg-[var(--c-hover-1)] transition-colors"
    >
      <td className="w-6 py-3 pl-4 pr-2">
        {c.unread && <Circle size={7} className="fill-indigo-400 text-indigo-400" />}
      </td>
      <td className="py-3 pr-4 text-[13px] text-[var(--c-text-1)]">
        <div className="flex items-center gap-2">
          <StatusDot status={c.status} />
          <span className="font-medium">{contactLabel}</span>
        </div>
        {c.name && c.name !== contactLabel && (
          <div className="mt-0.5 text-[11px] text-[var(--c-text-4)] truncate max-w-[200px]">{c.name}</div>
        )}
      </td>
      <td className="py-3 pr-4 text-[12px] text-[var(--c-text-3)]">
        {targetLabel}
        <span className={`ml-1.5 rounded px-1 py-0.5 text-[10px] ${c.target_kind === 'policy' ? 'bg-violet-500/10 text-violet-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
          {c.target_kind ?? '—'}
        </span>
      </td>
      <td className="py-3 pr-4">
        {c.last_result?.kind === 'verdict' ? (
          <VerdictBadge overall={c.last_result.overall} />
        ) : c.last_result ? (
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${c.last_result.status === 'completed' ? 'bg-emerald-500/15 text-emerald-400' : c.last_result.status === 'failed' ? 'bg-red-500/15 text-red-400' : 'bg-[var(--c-surface-3)] text-[var(--c-text-3)]'}`}>
            {c.last_result.status ?? '—'}
          </span>
        ) : (
          <span className="text-[11px] text-[var(--c-text-5)]">—</span>
        )}
      </td>
      <td className="py-3 pr-4 text-[12px] text-[var(--c-text-3)]">
        {c.checklist_progress ? (
          <span className={c.checklist_progress.startsWith(c.checklist_progress.split('/')[1]?.charAt(0) ?? '') ? 'text-emerald-400' : ''}>
            {c.checklist_progress}
          </span>
        ) : c.doc_count > 0 ? (
          <span>{c.doc_count} doc{c.doc_count !== 1 ? 's' : ''}</span>
        ) : (
          <span className="text-[var(--c-text-5)]">—</span>
        )}
      </td>
      <td className="py-3 pr-4 text-right text-[11px] text-[var(--c-text-4)]">
        {timeAgo}
      </td>
      <td className="py-3 pr-3 text-[var(--c-text-5)]">
        <ChevronRight size={13} />
      </td>
    </tr>
  )
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
  return date.toLocaleDateString()
}

export function CasesPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [view, setView] = useState<string | undefined>(undefined)
  const [q, setQ] = useState('')

  const { data: cases = [], isLoading } = useCases({
    view: view === 'all' ? 'all' : view,
    q: q || undefined,
  })

  const filteredCases = cases

  return (
    <div className="flex h-full overflow-hidden">
      <LeftSidebar />

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--c-border)] px-5">
          <div className="flex items-center gap-2.5">
            <FolderOpen size={16} className="text-[var(--c-text-4)]" />
            <span className="text-[14px] font-semibold text-[var(--c-text-1)]">{t('cases.title')}</span>
          </div>
          <button
            onClick={() => navigate('/validate')}
            className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-indigo-500"
          >
            <Plus size={13} />
            {t('cases.new')}
          </button>
        </div>

        {/* View tabs */}
        <div className="flex shrink-0 items-center gap-0 border-b border-[var(--c-border)] px-4">
          {/* Default: interesting cases */}
          <button
            onClick={() => setView(undefined)}
            className={[
              'border-b-2 px-4 py-2.5 text-[12px] font-medium transition-colors',
              view === undefined
                ? 'border-indigo-500 text-[var(--c-text-1)]'
                : 'border-transparent text-[var(--c-text-4)] hover:text-[var(--c-text-2)]',
            ].join(' ')}
          >
            {t('cases.title')}
          </button>
          {VIEWS.map(v => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={[
                'border-b-2 px-4 py-2.5 text-[12px] font-medium transition-colors',
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
        <div className="shrink-0 border-b border-[var(--c-border)] px-4 py-2">
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

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-[13px] text-[var(--c-text-4)]">
              {t('common.loading')}
            </div>
          ) : filteredCases.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
              <p className="text-[13px] text-[var(--c-text-3)]">{t('cases.empty')}</p>
              <p className="max-w-sm text-[12px] text-[var(--c-text-5)]">{t('cases.emptyHint')}</p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--c-border)]">
                  <th className="w-6 py-2 pl-4 pr-2" />
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
                {filteredCases.map(c => (
                  <CaseRow key={c.id} c={c} onClick={() => navigate(`/cases/${c.id}`)} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}

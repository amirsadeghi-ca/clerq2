import { useState, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ChevronRight, Save, Loader2, Plus, Trash2, ChevronUp, ChevronDown,
  GitCommit, RotateCcw, X, History, Mail, Copy, Check,
} from 'lucide-react'
import {
  usePolicy, useUpdatePolicy, useCreateRule, useUpdateRule, useDeleteRule,
  useReorderRules, usePolicyVersions, useRestorePolicyVersion,
  useEnablePolicyInbox, useDisablePolicyInbox,
} from '../api/policies'
import { useDocumentTypes } from '../api/library'
import { LeftSidebar } from '../components/LeftSidebar'
import type { PolicyRule, PolicyVersion } from '../types/workflow'

const REQUIREMENTS = ['required', 'optional'] as const
const REQUIREMENT_LABELS: Record<string, string> = { required: 'Required', optional: 'Optional' }

const SCOPES = ['per_document', 'any_document', 'cross_set'] as const
const SCOPE_LABELS: Record<string, string> = { per_document: 'Each doc', any_document: 'Any doc', cross_set: 'Across set' }
const SCOPE_HINTS: Record<string, string> = {
  per_document: 'Every relevant document must satisfy it (documents the rule is not about are ignored)',
  any_document: 'Passes if at least one relevant document satisfies it (e.g. the packet must contain a valid passport)',
  cross_set: 'Evaluated once across the whole document set (cross-document consistency)',
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// ── Version history modal ─────────────────────────────────────────────────

function PolicyVersionsModal({
  policyId, currentVersionNum, onClose, onRestored,
}: {
  policyId: number; currentVersionNum: number; onClose: () => void; onRestored: () => void
}) {
  const { data: versions, isLoading } = usePolicyVersions(policyId)
  const restore = useRestorePolicyVersion()

  async function handleRestore(v: PolicyVersion) {
    await restore.mutateAsync({ policyId, versionId: v.id })
    onRestored()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[480px] rounded-xl border border-[var(--c-border-2)] bg-[var(--c-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--c-border)] px-5 py-4">
          <div>
            <p className="text-[14px] font-semibold text-[var(--c-text-1)]">Version history</p>
            <p className="mt-0.5 text-[12px] text-[var(--c-text-4)]">Each save creates a snapshot</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-[var(--c-text-5)] transition-colors hover:text-[var(--c-text-3)]">
            <X size={14} />
          </button>
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          {isLoading ? (
            <div className="px-5 py-8 text-center text-[12px] text-[var(--c-text-5)]">Loading…</div>
          ) : !versions?.length ? (
            <div className="px-5 py-8 text-center text-[12px] text-[var(--c-text-5)]">
              No versions yet. Save to create the first snapshot.
            </div>
          ) : (
            <div className="divide-y divide-[var(--c-divider)]">
              {versions.map(v => {
                const isCurrent = v.version_num === currentVersionNum
                return (
                  <div key={v.id} className={['flex items-center gap-4 px-5 py-3.5', isCurrent ? 'bg-[var(--c-hover-1)]' : ''].join(' ')}>
                    <div className={['flex h-7 w-7 shrink-0 items-center justify-center rounded-md', isCurrent ? 'bg-indigo-500/15' : 'bg-[var(--c-surface-2)]'].join(' ')}>
                      <GitCommit size={13} className={isCurrent ? 'text-indigo-400' : 'text-[var(--c-text-5)]'} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-medium text-[var(--c-text-2)]">v{v.version_num}</span>
                        {isCurrent && (
                          <span className="rounded bg-indigo-600/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400 ring-1 ring-indigo-500/20">current</span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--c-text-5)]">
                        <span>{timeAgo(v.created_at)}</span>
                        <span>·</span>
                        <span>{v.rule_count} rule{v.rule_count !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    {!isCurrent && (
                      <button
                        onClick={() => handleRestore(v)}
                        disabled={restore.isPending}
                        className="flex shrink-0 items-center gap-1.5 rounded border border-[var(--c-border-2)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--c-text-4)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-2)] disabled:opacity-40"
                      >
                        <RotateCcw size={11} />
                        Restore
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

// ── Rule card ─────────────────────────────────────────────────────────────

interface RuleCardProps {
  rule: PolicyRule
  policyId: number
  index: number
  docTypeOptions: { id: number; name: string }[]
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}

function RuleCard({ rule, policyId, index, docTypeOptions, onMoveUp, onMoveDown, isFirst, isLast }: RuleCardProps) {
  const updateRule = useUpdateRule()
  const deleteRule = useDeleteRule()

  const [nameDraft, setNameDraft] = useState(rule.name)
  const [acceptDraft, setAcceptDraft] = useState(rule.accept_criteria ?? '')
  const [failDraft, setFailDraft] = useState(rule.fail_criteria ?? '')
  const [aiDraft, setAiDraft] = useState(rule.ai_instructions ?? '')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Sync drafts when rule data changes externally (restore, refetch)
  useEffect(() => { setNameDraft(rule.name) }, [rule.name])
  useEffect(() => { setAcceptDraft(rule.accept_criteria ?? '') }, [rule.accept_criteria])
  useEffect(() => { setFailDraft(rule.fail_criteria ?? '') }, [rule.fail_criteria])
  useEffect(() => { setAiDraft(rule.ai_instructions ?? '') }, [rule.ai_instructions])

  function update(field: string, value: unknown) {
    updateRule.mutate({ policyId, ruleId: rule.id, [field]: value })
  }

  function saveName() {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== rule.name) update('name', trimmed)
    else if (!trimmed) setNameDraft(rule.name) // revert if cleared
  }

  const hasAdvanced = !!(rule.document_type_id || rule.ai_instructions || rule.confidence_threshold !== 0.8)

  return (
    <div className="group overflow-hidden rounded-xl border border-[var(--c-border-2)] bg-[var(--c-surface)] transition-[border-color] hover:border-[var(--c-border-3)]">

      {/* ── Rule header ── */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="w-5 shrink-0 text-right font-mono text-[11px] text-[var(--c-text-5)]">
          {String(index + 1).padStart(2, '0')}
        </span>

        <input
          value={nameDraft}
          onChange={e => setNameDraft(e.target.value)}
          onBlur={saveName}
          onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() } else if (e.key === 'Escape') { setNameDraft(rule.name); e.currentTarget.blur() } }}
          className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-[14px] font-semibold text-[var(--c-text-1)] outline-none placeholder-[var(--c-text-5)] caret-indigo-400 transition-colors hover:bg-[var(--c-hover-2)] focus:bg-[var(--c-surface-3)] focus:ring-1 focus:ring-indigo-500/30"
          placeholder="Rule name…"
        />

        {/* Scope (reach) pills — per-document vs across-set */}
        <div className="flex shrink-0 items-center gap-1" title={SCOPE_HINTS[rule.scope ?? 'per_document']}>
          {SCOPES.map(sc => (
            <button
              key={sc}
              onClick={() => update('scope', sc)}
              title={SCOPE_HINTS[sc]}
              className={[
                'rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors',
                (rule.scope ?? 'per_document') === sc
                  ? sc === 'cross_set'
                    ? 'bg-violet-500/12 text-violet-400 ring-1 ring-violet-500/25'
                    : sc === 'any_document'
                      ? 'bg-sky-500/12 text-sky-400 ring-1 ring-sky-500/25'
                      : 'bg-[var(--c-surface-3)] text-[var(--c-text-3)] ring-1 ring-[var(--c-border-2)]'
                  : 'text-[var(--c-text-5)] hover:text-[var(--c-text-4)]',
              ].join(' ')}
            >
              {SCOPE_LABELS[sc]}
            </button>
          ))}
        </div>

        <div className="h-3.5 w-px shrink-0 bg-[var(--c-border-2)]" />

        {/* Required / Optional pills */}
        <div className="flex shrink-0 items-center gap-1">
          {REQUIREMENTS.map(req => (
            <button
              key={req}
              onClick={() => update('requirement', req)}
              className={[
                'rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors',
                rule.requirement === req
                  ? req === 'required'
                    ? 'bg-red-500/12 text-red-400 ring-1 ring-red-500/25'
                    : 'bg-[var(--c-surface-3)] text-[var(--c-text-3)] ring-1 ring-[var(--c-border-2)]'
                  : 'text-[var(--c-text-5)] hover:text-[var(--c-text-4)]',
              ].join(' ')}
            >
              {REQUIREMENT_LABELS[req]}
            </button>
          ))}
        </div>

        {/* Order + delete — reveal on hover */}
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={onMoveUp} disabled={isFirst} className="rounded p-1 text-[var(--c-text-5)] transition-colors hover:text-[var(--c-text-3)] disabled:opacity-25">
            <ChevronUp size={12} />
          </button>
          <button onClick={onMoveDown} disabled={isLast} className="rounded p-1 text-[var(--c-text-5)] transition-colors hover:text-[var(--c-text-3)] disabled:opacity-25">
            <ChevronDown size={12} />
          </button>
          <button
            onClick={() => { if (confirm('Delete this rule?')) deleteRule.mutate({ policyId, ruleId: rule.id }) }}
            className="ml-0.5 rounded p-1 text-[var(--c-text-5)] transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* ── Accept / Fail ── */}
      <div className="grid grid-cols-2 gap-px border-t border-[var(--c-border)] bg-[var(--c-border)]">
        <div className="bg-[var(--c-surface)] px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/70">Accept when</span>
          </div>
          <textarea
            value={acceptDraft}
            onChange={e => setAcceptDraft(e.target.value)}
            onBlur={() => update('accept_criteria', acceptDraft || null)}
            placeholder="Describe what makes this check pass…"
            rows={3}
            className="w-full resize-none bg-transparent text-[12px] leading-relaxed text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none"
          />
        </div>
        <div className="bg-[var(--c-surface)] px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400/70">Fail when</span>
          </div>
          <textarea
            value={failDraft}
            onChange={e => setFailDraft(e.target.value)}
            onBlur={() => update('fail_criteria', failDraft || null)}
            placeholder="Describe what makes this check fail…"
            rows={3}
            className="w-full resize-none bg-transparent text-[12px] leading-relaxed text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none"
          />
        </div>
      </div>

      {/* ── Advanced ── */}
      <div className="border-t border-[var(--c-border)]">
        <button
          onClick={() => setShowAdvanced(v => !v)}
          className="flex w-full items-center gap-2 px-4 py-2 text-[11px] text-[var(--c-text-5)] transition-colors hover:text-[var(--c-text-3)]"
        >
          <ChevronRight size={10} className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
          Advanced
          {hasAdvanced && (
            <span className="ml-auto rounded bg-indigo-500/12 px-1.5 py-0.5 text-[9px] text-indigo-400">configured</span>
          )}
        </button>

        {showAdvanced && (
          <div className="flex flex-col gap-4 px-4 pb-4 pt-1">
            <div>
              <label className="mb-1 block text-[10px] font-medium text-[var(--c-text-5)]">Document type</label>
              <select
                value={rule.document_type_id ?? ''}
                onChange={e => update('document_type_id', e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-2.5 py-1.5 text-[11px] text-[var(--c-text-2)] outline-none transition-colors focus:border-indigo-500/50"
              >
                <option value="">— None —</option>
                {docTypeOptions.map(dt => <option key={dt.id} value={dt.id}>{dt.name}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-medium text-[var(--c-text-5)]">Extra AI instructions</label>
              <textarea
                value={aiDraft}
                onChange={e => setAiDraft(e.target.value)}
                onBlur={() => update('ai_instructions', aiDraft || null)}
                placeholder="Extra guidance for the AI — e.g. cross-check name against cover page, ignore stamps"
                rows={2}
                className="w-full resize-none rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-2.5 py-1.5 text-[11px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none transition-colors focus:border-indigo-500/50"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[10px] font-medium text-[var(--c-text-5)]">Confidence threshold</label>
                <span className="font-mono text-[11px] font-medium text-[var(--c-text-3)]">{Math.round(rule.confidence_threshold * 100)}%</span>
              </div>
              <input
                type="range"
                min={50} max={100} step={5}
                value={Math.round(rule.confidence_threshold * 100)}
                onChange={e => update('confidence_threshold', Number(e.target.value) / 100)}
                className="w-full accent-indigo-500"
              />
              <p className="mt-1 text-[10px] text-[var(--c-text-5)]">Results below this threshold are flagged as uncertain.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────

export function PolicyEditor() {
  const { id } = useParams<{ id: string }>()
  const policyId = Number(id)

  const { data: policy, isLoading } = usePolicy(policyId)
  const { data: docTypes } = useDocumentTypes()
  const updatePolicy = useUpdatePolicy()
  const createRule = useCreateRule()
  const reorderRules = useReorderRules()
  const enableInbox = useEnablePolicyInbox()
  const disableInbox = useDisablePolicyInbox()
  const [copied, setCopied] = useState(false)
  const [showEmailSettings, setShowEmailSettings] = useState(false)

  const [name, setName] = useState('')
  const [brief, setBrief] = useState('')
  const [emailReplyMode, setEmailReplyMode] = useState('always')
  const [emailPassMessage, setEmailPassMessage] = useState('')
  const [emailFailMessage, setEmailFailMessage] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [showVersions, setShowVersions] = useState(false)
  const initialized = useRef(false)

  if (policy && !initialized.current) {
    initialized.current = true
    setName(policy.name)
    setBrief(policy.brief)
    setEmailReplyMode(policy.email_reply_mode ?? 'always')
    setEmailPassMessage(policy.email_pass_message ?? '')
    setEmailFailMessage(policy.email_fail_message ?? '')
  }

  function markDirty() { setDirty(true); setSaveState('idle') }

  async function handleSave() {
    if (saveState === 'saving') return
    setSaveState('saving')
    try {
      await updatePolicy.mutateAsync({
        id: policyId,
        name: name.trim() || (policy?.name ?? ''),
        brief,
        email_reply_mode: emailReplyMode,
        email_pass_message: emailPassMessage || null,
        email_fail_message: emailFailMessage || null,
      })
      setDirty(false)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    } catch {
      setSaveState('idle')
    }
  }

  function moveRule(ruleId: number, direction: 'up' | 'down') {
    if (!policy) return
    const ids = policy.rules.map(r => r.id)
    const idx = ids.indexOf(ruleId)
    if (direction === 'up' && idx > 0) [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]]
    else if (direction === 'down' && idx < ids.length - 1) [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]]
    reorderRules.mutate({ policyId, ruleIds: ids })
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--c-bg)]">
        <Loader2 size={16} className="animate-spin text-[var(--c-text-5)]" />
      </div>
    )
  }

  const docTypeOptions = (docTypes ?? []).map(dt => ({ id: dt.id, name: dt.name }))

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      <LeftSidebar />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* ── Header ── */}
        <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--c-border)] px-6">
          <Link to="/validate" className="text-[12px] text-[var(--c-text-5)] transition-colors hover:text-[var(--c-text-3)]">
            Checks
          </Link>
          <ChevronRight size={12} className="shrink-0 text-[var(--c-text-5)]" />
          <span className="max-w-[220px] truncate text-[13px] font-medium text-[var(--c-text-3)]">
            {name || 'Untitled'}
          </span>
          {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}

          <div className="ml-auto flex items-center gap-2">
            {policy && policy.current_version_num > 0 && (
              <span className="flex items-center gap-1 font-mono text-[11px] text-[var(--c-text-5)]">
                <GitCommit size={10} />
                v{policy.current_version_num}
              </span>
            )}
            <button
              onClick={() => setShowVersions(true)}
              className="flex h-7 items-center gap-1.5 rounded border border-[var(--c-border-2)] px-3 text-[12px] text-[var(--c-text-3)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-2)]"
            >
              <History size={11} />
              History
            </button>
            <button
              onClick={handleSave}
              disabled={saveState === 'saving'}
              className="flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-3 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
            >
              {saveState === 'saving' ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              {saveState === 'saved' ? 'Saved' : 'Save'}
            </button>
          </div>
        </header>

        {/* ── Two-panel body ── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">

          {/* Left panel — policy meta */}
          <div className="flex w-[290px] shrink-0 flex-col overflow-y-auto border-r border-[var(--c-border)] bg-[var(--c-surface)]">

            {/* Name */}
            <div className="border-b border-[var(--c-border)] px-5 py-5">
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">Name</label>
              <input
                value={name}
                onChange={e => { setName(e.target.value); markDirty() }}
                className="w-full bg-transparent text-[15px] font-semibold text-[var(--c-text-1)] outline-none placeholder-[var(--c-text-5)]"
                placeholder="Policy name"
              />
            </div>

            {/* Brief */}
            <div className="border-b border-[var(--c-border)] px-5 py-4">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">Brief</label>
              <p className="mb-2 text-[11px] leading-relaxed text-[var(--c-text-5)]">
                Sent verbatim to the AI as context before evaluating each rule.
              </p>
              <textarea
                value={brief}
                onChange={e => { setBrief(e.target.value); markDirty() }}
                placeholder="Describe what this policy validates. E.g. 'Validates a mortgage application packet — the applicant must prove identity, income, and address.'"
                rows={7}
                className="w-full resize-none bg-transparent text-[12px] leading-relaxed text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none"
              />
            </div>

            {/* Email inbox */}
            <div className="px-5 py-4">
              <button
                onClick={() => setShowEmailSettings(v => !v)}
                className="flex w-full items-center gap-2 text-left"
              >
                <Mail size={12} className="shrink-0 text-[var(--c-text-4)]" />
                <span className="flex-1 text-[12px] font-medium text-[var(--c-text-2)]">Email Inbox</span>
                {policy?.email_inbox_enabled && (
                  <span className="rounded bg-indigo-500/12 px-1.5 py-0.5 text-[9px] text-indigo-400 ring-1 ring-indigo-500/20">on</span>
                )}
                <ChevronRight size={10} className={`shrink-0 text-[var(--c-text-5)] transition-transform ${showEmailSettings ? 'rotate-90' : ''}`} />
              </button>

              {showEmailSettings && (
                <div className="mt-4 flex flex-col gap-4">
                  {/* Enable toggle */}
                  {policy && (
                    policy.email_inbox_enabled ? (
                      <button
                        onClick={() => disableInbox.mutate(policyId)}
                        disabled={disableInbox.isPending}
                        className="flex h-7 w-full items-center justify-center gap-1.5 rounded border border-indigo-500/30 bg-indigo-500/10 text-[11px] text-indigo-400 transition-colors hover:bg-indigo-500/20"
                      >
                        {disableInbox.isPending && <Loader2 size={10} className="animate-spin" />}
                        Inbox enabled — click to disable
                      </button>
                    ) : (
                      <button
                        onClick={() => enableInbox.mutate(policyId)}
                        disabled={enableInbox.isPending}
                        className="flex h-7 w-full items-center justify-center gap-1.5 rounded border border-[var(--c-border-2)] text-[11px] text-[var(--c-text-4)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-2)]"
                      >
                        {enableInbox.isPending && <Loader2 size={10} className="animate-spin" />}
                        Enable inbox
                      </button>
                    )
                  )}

                  {policy?.email_inbox_enabled && policy.email_address && (
                    <>
                      <div className="flex items-center gap-1.5 rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-3 py-2">
                        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-indigo-400">{policy.email_address}</code>
                        <button
                          onClick={() => { navigator.clipboard.writeText(policy.email_address!); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                          className="shrink-0 rounded p-0.5 text-[var(--c-text-4)] transition-colors hover:text-[var(--c-text-2)]"
                        >
                          {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                        </button>
                      </div>

                      <div>
                        <label className="mb-1.5 block text-[10px] font-medium text-[var(--c-text-5)]">Reply when</label>
                        <div className="grid grid-cols-2 gap-1">
                          {(['always', 'on_pass', 'on_fail', 'never'] as const).map(mode => {
                            const labels: Record<string, string> = { always: 'Always', on_pass: 'Pass', on_fail: 'Fail', never: 'Never' }
                            const active = emailReplyMode === mode
                            return (
                              <button
                                key={mode}
                                onClick={() => { setEmailReplyMode(mode); markDirty() }}
                                className={[
                                  'rounded-md py-1.5 text-[11px] font-medium transition-colors',
                                  active
                                    ? 'bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/30'
                                    : 'bg-[var(--c-surface-2)] text-[var(--c-text-4)] hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-2)]',
                                ].join(' ')}
                              >
                                {labels[mode]}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {(emailReplyMode === 'always' || emailReplyMode === 'on_pass') && (
                        <div>
                          <label className="mb-1 block text-[10px] font-medium text-emerald-400/80">Pass message</label>
                          <textarea
                            value={emailPassMessage}
                            onChange={e => { setEmailPassMessage(e.target.value); markDirty() }}
                            placeholder="Leave blank for default summary."
                            rows={3}
                            className="w-full resize-none rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-2.5 py-2 text-[11px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none transition-colors focus:border-indigo-500/50"
                          />
                        </div>
                      )}

                      {(emailReplyMode === 'always' || emailReplyMode === 'on_fail') && (
                        <div>
                          <label className="mb-1 block text-[10px] font-medium text-red-400/80">Fail message</label>
                          <p className="mb-1.5 text-[10px] text-[var(--c-text-5)]">
                            Use <code className="rounded bg-[var(--c-surface-3)] px-1 font-mono text-[9px] text-amber-400">{'{{failed_rules}}'}</code> to include failed checks.
                          </p>
                          <textarea
                            value={emailFailMessage}
                            onChange={e => { setEmailFailMessage(e.target.value); markDirty() }}
                            placeholder={"e.g. Verification failed:\n\n{{failed_rules}}\n\nPlease resubmit."}
                            rows={5}
                            className="w-full resize-none rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-2.5 py-2 text-[11px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none transition-colors focus:border-indigo-500/50"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right panel — rules */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex h-[44px] shrink-0 items-center justify-between border-b border-[var(--c-border)] px-6">
              <div className="flex items-center gap-2.5">
                <span className="text-[12px] font-semibold text-[var(--c-text-2)]">Rules</span>
                <span className="rounded bg-[var(--c-surface-3)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--c-text-4)]">
                  {policy?.rules.length ?? 0}
                </span>
                <span className="text-[11px] text-[var(--c-text-5)]">
                  All required rules must pass for the policy to pass
                </span>
              </div>
              <button
                onClick={() => createRule.mutate({ policyId, name: 'New rule', requirement: 'required' })}
                disabled={createRule.isPending}
                className="flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-3 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
              >
                {createRule.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                Add rule
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {policy?.rules.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-20 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-[var(--c-border-3)] bg-[var(--c-surface)]">
                    <Plus size={16} className="text-[var(--c-text-5)]" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-[var(--c-text-4)]">No rules yet</p>
                    <p className="mt-1 max-w-[280px] text-[11px] leading-relaxed text-[var(--c-text-5)]">
                      The brief alone guides the AI. Add rules to enforce specific required checks with explicit pass/fail criteria.
                    </p>
                  </div>
                  <button
                    onClick={() => createRule.mutate({ policyId, name: 'New rule', requirement: 'required' })}
                    className="mt-1 flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-3 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500"
                  >
                    <Plus size={11} /> Add first rule
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {policy!.rules.map((rule, i) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      policyId={policyId}
                      index={i}
                      docTypeOptions={docTypeOptions}
                      onMoveUp={() => moveRule(rule.id, 'up')}
                      onMoveDown={() => moveRule(rule.id, 'down')}
                      isFirst={i === 0}
                      isLast={i === policy!.rules.length - 1}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {showVersions && policy && (
        <PolicyVersionsModal
          policyId={policyId}
          currentVersionNum={policy.current_version_num}
          onClose={() => setShowVersions(false)}
          onRestored={() => { initialized.current = false }}
        />
      )}
    </div>
  )
}

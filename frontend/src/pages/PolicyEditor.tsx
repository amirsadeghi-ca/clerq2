import { useState, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ChevronRight, Save, Loader2, Plus, Trash2, ChevronUp, ChevronDown,
  GitCommit, RotateCcw, X, History, Mail, Copy, Check,
} from 'lucide-react'
import {
  usePolicy, useUpdatePolicy, useCreateRule, useUpdateRule, useDeleteRule,
  useReorderRules, usePolicyVersions, useRestorePolicyVersion,
  useEnablePolicyInbox, useDisablePolicyInbox, useSetPolicyInboxAddress,
} from '../api/policies'
import { useDocumentTypes } from '../api/library'
import { useReferenceLists } from '../api/referenceLists'
import { LeftSidebar } from '../components/LeftSidebar'
import { useI18n } from '../context/i18n'
import type { PolicyRule, PolicyVersion } from '../types/workflow'

const REQUIREMENTS = ['required', 'optional'] as const

const SCOPES = ['per_document', 'any_document', 'cross_set'] as const

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
  const { t } = useI18n()
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
            <p className="text-[14px] font-semibold text-[var(--c-text-1)]">{t('policy.versions.title')}</p>
            <p className="mt-0.5 text-[12px] text-[var(--c-text-4)]">{t('policy.versions.subtitle')}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-[var(--c-text-5)] transition-colors hover:text-[var(--c-text-3)]">
            <X size={14} />
          </button>
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          {isLoading ? (
            <div className="px-5 py-8 text-center text-[12px] text-[var(--c-text-5)]">{t('common.loading')}</div>
          ) : !versions?.length ? (
            <div className="px-5 py-8 text-center text-[12px] text-[var(--c-text-5)]">
              {t('policy.versions.empty')}
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
                          <span className="rounded bg-indigo-600/20 px-1.5 py-0.5 text-[10px] font-medium text-indigo-400 ring-1 ring-indigo-500/20">{t('policy.versions.current')}</span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--c-text-5)]">
                        <span>{timeAgo(v.created_at)}</span>
                        <span>·</span>
                        <span>{t(v.rule_count !== 1 ? 'policy.versions.ruleCountPlural' : 'policy.versions.ruleCount', { count: v.rule_count })}</span>
                      </div>
                    </div>
                    {!isCurrent && (
                      <button
                        onClick={() => handleRestore(v)}
                        disabled={restore.isPending}
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
  const { t } = useI18n()
  const updateRule = useUpdateRule()
  const deleteRule = useDeleteRule()
  const { data: referenceLists } = useReferenceLists()

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

  const hasAdvanced = !!(rule.document_type_id || rule.ai_instructions || rule.reference_list_id || rule.confidence_threshold !== 0.8)

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
          placeholder={t('policy.rule.namePlaceholder')}
        />

        {/* Scope (reach) pills — per-document vs across-set */}
        <div className="flex shrink-0 items-center gap-1" title={t(`policy.rule.scopeHint.${rule.scope ?? 'per_document'}`)}>
          {SCOPES.map(sc => (
            <button
              key={sc}
              onClick={() => update('scope', sc)}
              title={t(`policy.rule.scopeHint.${sc}`)}
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
              {t(`policy.rule.scope.${sc}`)}
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
              {t(req === 'required' ? 'common.required' : 'common.optional')}
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
            onClick={() => { if (confirm(t('policy.rule.deleteConfirm'))) deleteRule.mutate({ policyId, ruleId: rule.id }) }}
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
            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/70">{t('policy.rule.acceptWhen')}</span>
          </div>
          <textarea
            value={acceptDraft}
            onChange={e => setAcceptDraft(e.target.value)}
            onBlur={() => update('accept_criteria', acceptDraft || null)}
            placeholder={t('policy.rule.acceptPlaceholder')}
            rows={3}
            className="w-full resize-none bg-transparent text-[12px] leading-relaxed text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none"
          />
        </div>
        <div className="bg-[var(--c-surface)] px-4 py-3">
          <div className="mb-2 flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-red-400/70">{t('policy.rule.failWhen')}</span>
          </div>
          <textarea
            value={failDraft}
            onChange={e => setFailDraft(e.target.value)}
            onBlur={() => update('fail_criteria', failDraft || null)}
            placeholder={t('policy.rule.failPlaceholder')}
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
          {t('policy.rule.advanced')}
          {hasAdvanced && (
            <span className="ml-auto rounded bg-indigo-500/12 px-1.5 py-0.5 text-[9px] text-indigo-400">{t('policy.rule.configured')}</span>
          )}
        </button>

        {showAdvanced && (
          <div className="flex flex-col gap-4 px-4 pb-4 pt-1">
            <div>
              <label className="mb-1 block text-[10px] font-medium text-[var(--c-text-5)]">{t('policy.rule.documentType')}</label>
              <select
                value={rule.document_type_id ?? ''}
                onChange={e => update('document_type_id', e.target.value ? Number(e.target.value) : null)}
                className="w-full rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-2.5 py-1.5 text-[11px] text-[var(--c-text-2)] outline-none transition-colors focus:border-indigo-500/50"
              >
                <option value="">— {t('common.none')} —</option>
                {docTypeOptions.map(dt => <option key={dt.id} value={dt.id}>{dt.name}</option>)}
              </select>
            </div>

            {/* Reference-list check (Phase 7) */}
            <div>
              <label className="mb-1 block text-[10px] font-medium text-[var(--c-text-5)]">{t('policy.rule.referenceCheck')}</label>
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--c-text-4)]">
                <span>{t('policy.rule.valueMustBe')}</span>
                <select
                  value={rule.reference_direction ?? 'in'}
                  onChange={e => update('reference_direction', e.target.value)}
                  disabled={!rule.reference_list_id}
                  className="rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-2 py-1 text-[11px] text-[var(--c-text-2)] outline-none transition-colors focus:border-indigo-500/50 disabled:opacity-50"
                >
                  <option value="in">{t('policy.rule.direction.in')}</option>
                  <option value="not_in">{t('policy.rule.direction.not_in')}</option>
                </select>
                <select
                  value={rule.reference_list_id ?? ''}
                  onChange={e => update('reference_list_id', e.target.value ? Number(e.target.value) : null)}
                  className="min-w-[140px] rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-2 py-1 text-[11px] text-[var(--c-text-2)] outline-none transition-colors focus:border-indigo-500/50"
                >
                  <option value="">{t('policy.rule.noList')}</option>
                  {(referenceLists ?? []).map(rl => (
                    <option key={rl.id} value={rl.id}>{rl.name} ({rl.items.length})</option>
                  ))}
                </select>
              </div>
              {rule.reference_list_id && (
                <div className="mt-2 flex items-center gap-1">
                  <span className="mr-1 text-[10px] text-[var(--c-text-5)]">{t('policy.rule.match')}</span>
                  {(['exact', 'smart'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => update('reference_match', m)}
                      title={m === 'exact'
                        ? t('policy.rule.matchHint.exact')
                        : t('policy.rule.matchHint.smart')}
                      className={[
                        'rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors',
                        (rule.reference_match ?? 'smart') === m
                          ? 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30'
                          : 'text-[var(--c-text-5)] hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-3)]',
                      ].join(' ')}
                    >
                      {m === 'exact' ? t('policy.rule.match.exact') : t('policy.rule.match.smart')}
                    </button>
                  ))}
                  {(referenceLists ?? []).length === 0 && (
                    <span className="ml-2 text-[10px] text-[var(--c-text-5)]">{t('policy.rule.noListsHint')}</span>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-medium text-[var(--c-text-5)]">{t('policy.rule.aiInstructions')}</label>
              <textarea
                value={aiDraft}
                onChange={e => setAiDraft(e.target.value)}
                onBlur={() => update('ai_instructions', aiDraft || null)}
                placeholder={t('policy.rule.aiPlaceholder')}
                rows={2}
                className="w-full resize-none rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-2.5 py-1.5 text-[11px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none transition-colors focus:border-indigo-500/50"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[10px] font-medium text-[var(--c-text-5)]">{t('policy.rule.confidenceThreshold')}</label>
                <span className="font-mono text-[11px] font-medium text-[var(--c-text-3)]">{Math.round(rule.confidence_threshold * 100)}%</span>
              </div>
              <input
                type="range"
                min={50} max={100} step={5}
                value={Math.round(rule.confidence_threshold * 100)}
                onChange={e => update('confidence_threshold', Number(e.target.value) / 100)}
                className="w-full accent-indigo-500"
              />
              <p className="mt-1 text-[10px] text-[var(--c-text-5)]">{t('policy.rule.confidenceHint')}</p>
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
  const { t } = useI18n()

  const { data: policy, isLoading } = usePolicy(policyId)
  const { data: docTypes } = useDocumentTypes()
  const updatePolicy = useUpdatePolicy()
  const createRule = useCreateRule()
  const reorderRules = useReorderRules()
  const enableInbox = useEnablePolicyInbox()
  const disableInbox = useDisablePolicyInbox()
  const setInboxAddress = useSetPolicyInboxAddress()
  const [copied, setCopied] = useState(false)
  const [showEmailSettings, setShowEmailSettings] = useState(false)
  const [addrLocal, setAddrLocal] = useState('')
  const [addrError, setAddrError] = useState<string | null>(null)

  // Keep the local-part field in sync with the server address (after enable / save).
  useEffect(() => {
    setAddrLocal(policy?.email_address?.split('@')[0] ?? '')
    setAddrError(null)
  }, [policy?.email_address])

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
            {t('nav.checks')}
          </Link>
          <ChevronRight size={12} className="shrink-0 text-[var(--c-text-5)]" />
          <span className="max-w-[220px] truncate text-[13px] font-medium text-[var(--c-text-3)]">
            {name || t('common.untitled')}
          </span>
          {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}

          {/* Email inbox address */}
          {policy?.email_inbox_enabled && policy.email_address && (
            <button
              onClick={() => { navigator.clipboard.writeText(policy.email_address!); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
              title={t('policy.email.copyAddress')}
              className="flex items-center gap-1 rounded bg-indigo-500/10 px-1.5 py-0.5 font-mono text-[10px] text-indigo-400 ring-1 ring-indigo-500/20 transition-colors hover:bg-indigo-500/20"
            >
              <Mail size={10} />
              <span className="max-w-[220px] truncate">{policy.email_address}</span>
            </button>
          )}

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
              {t('policy.editor.history')}
            </button>
            <button
              onClick={handleSave}
              disabled={saveState === 'saving'}
              className="flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-3 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
            >
              {saveState === 'saving' ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              {saveState === 'saving' ? t('btn.saving') : saveState === 'saved' ? t('policy.editor.saved') : t('btn.save')}
            </button>
          </div>
        </header>

        {/* ── Two-panel body ── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">

          {/* Left panel — policy meta */}
          <div className="flex w-[290px] shrink-0 flex-col overflow-y-auto border-r border-[var(--c-border)] bg-[var(--c-surface)]">

            {/* Name */}
            <div className="border-b border-[var(--c-border)] px-5 py-5">
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">{t('policy.field.name')}</label>
              <input
                value={name}
                onChange={e => { setName(e.target.value); markDirty() }}
                className="w-full bg-transparent text-[15px] font-semibold text-[var(--c-text-1)] outline-none placeholder-[var(--c-text-5)]"
                placeholder={t('policy.editor.namePlaceholder')}
              />
            </div>

            {/* Brief */}
            <div className="border-b border-[var(--c-border)] px-5 py-4">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">{t('policy.field.brief')}</label>
              <p className="mb-2 text-[11px] leading-relaxed text-[var(--c-text-5)]">
                {t('policy.field.briefHint')}
              </p>
              <textarea
                value={brief}
                onChange={e => { setBrief(e.target.value); markDirty() }}
                placeholder={t('policy.field.briefPlaceholder')}
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
                <span className="flex-1 text-[12px] font-medium text-[var(--c-text-2)]">{t('policy.email.title')}</span>
                {policy?.email_inbox_enabled && (
                  <span className="rounded bg-indigo-500/12 px-1.5 py-0.5 text-[9px] text-indigo-400 ring-1 ring-indigo-500/20">{t('policy.email.on')}</span>
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
                        {t('policy.email.enabledClickDisable')}
                      </button>
                    ) : (
                      <button
                        onClick={() => enableInbox.mutate(policyId)}
                        disabled={enableInbox.isPending}
                        className="flex h-7 w-full items-center justify-center gap-1.5 rounded border border-[var(--c-border-2)] text-[11px] text-[var(--c-text-4)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-2)]"
                      >
                        {enableInbox.isPending && <Loader2 size={10} className="animate-spin" />}
                        {t('policy.email.enable')}
                      </button>
                    )
                  )}

                  {policy?.email_inbox_enabled && policy.email_address && (
                    <>
                      {(() => {
                        const domain = policy.email_address!.split('@')[1] ?? ''
                        const current = policy.email_address!.split('@')[0]
                        const changed = addrLocal.trim() !== current
                        return (
                          <div className="flex flex-col gap-1.5">
                            <label className="block text-[10px] font-medium text-[var(--c-text-5)]">{t('policy.email.address')}</label>
                            <div className="flex items-stretch gap-1.5">
                              <div className="flex min-w-0 flex-1 items-center rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface-2)] focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/20">
                                <input
                                  value={addrLocal}
                                  onChange={e => { setAddrLocal(e.target.value.toLowerCase()); setAddrError(null) }}
                                  spellCheck={false}
                                  className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 font-mono text-[11px] text-indigo-400 outline-none"
                                />
                                <span className="shrink-0 pr-2.5 font-mono text-[11px] text-[var(--c-text-5)]">@{domain}</span>
                              </div>
                              <button
                                onClick={() => { navigator.clipboard.writeText(policy.email_address!); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                                className="shrink-0 rounded-md border border-[var(--c-border-2)] px-2 text-[var(--c-text-4)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-2)]"
                                title={t('policy.email.copyAddress')}
                              >
                                {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                              </button>
                            </div>
                            {changed && (
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={async () => {
                                    try {
                                      await setInboxAddress.mutateAsync({ id: policyId, localPart: addrLocal.trim() })
                                      setAddrError(null)
                                    } catch (err) {
                                      const e = err as { response?: { data?: { detail?: string } } }
                                      setAddrError(e.response?.data?.detail ?? t('policy.email.addressFailed'))
                                    }
                                  }}
                                  disabled={setInboxAddress.isPending || !addrLocal.trim()}
                                  className="flex h-6 items-center gap-1 rounded bg-indigo-600 px-2.5 text-[10px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
                                >
                                  {setInboxAddress.isPending && <Loader2 size={9} className="animate-spin" />}
                                  {t('policy.email.saveAddress')}
                                </button>
                                <button
                                  onClick={() => { setAddrLocal(current); setAddrError(null) }}
                                  className="text-[10px] text-[var(--c-text-5)] transition-colors hover:text-[var(--c-text-3)]"
                                >
                                  {t('btn.cancel')}
                                </button>
                              </div>
                            )}
                            {addrError && <p className="text-[10px] text-red-400">{addrError}</p>}
                            <p className="text-[10px] text-[var(--c-text-5)]">{t('policy.email.addressHelp')}</p>
                          </div>
                        )
                      })()}

                      <div>
                        <label className="mb-1.5 block text-[10px] font-medium text-[var(--c-text-5)]">{t('policy.email.replyWhen')}</label>
                        <div className="grid grid-cols-2 gap-1">
                          {(['always', 'on_pass', 'on_fail', 'never'] as const).map(mode => {
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
                                {t(`policy.email.reply.${mode}`)}
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      {(emailReplyMode === 'always' || emailReplyMode === 'on_pass') && (
                        <div>
                          <label className="mb-1 block text-[10px] font-medium text-emerald-400/80">{t('policy.email.passMessage')}</label>
                          <textarea
                            value={emailPassMessage}
                            onChange={e => { setEmailPassMessage(e.target.value); markDirty() }}
                            placeholder={t('policy.email.passPlaceholder')}
                            rows={3}
                            className="w-full resize-none rounded-md border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-2.5 py-2 text-[11px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none transition-colors focus:border-indigo-500/50"
                          />
                        </div>
                      )}

                      {(emailReplyMode === 'always' || emailReplyMode === 'on_fail') && (
                        <div>
                          <label className="mb-1 block text-[10px] font-medium text-red-400/80">{t('policy.email.failMessage')}</label>
                          <p className="mb-1.5 text-[10px] text-[var(--c-text-5)]">
                            {t('policy.email.failHintPre')} <code className="rounded bg-[var(--c-surface-3)] px-1 font-mono text-[9px] text-amber-400">{'{{failed_rules}}'}</code> {t('policy.email.failHintPost')}
                          </p>
                          <textarea
                            value={emailFailMessage}
                            onChange={e => { setEmailFailMessage(e.target.value); markDirty() }}
                            placeholder={t('policy.email.failPlaceholder')}
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
                <span className="text-[12px] font-semibold text-[var(--c-text-2)]">{t('policy.rules.title')}</span>
                <span className="rounded bg-[var(--c-surface-3)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--c-text-4)]">
                  {policy?.rules.length ?? 0}
                </span>
                <span className="text-[11px] text-[var(--c-text-5)]">
                  {t('policy.rules.allRequiredMustPass')}
                </span>
              </div>
              <button
                onClick={() => createRule.mutate({ policyId, name: t('policy.rules.newRuleName'), requirement: 'required' })}
                disabled={createRule.isPending}
                className="flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-3 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
              >
                {createRule.isPending ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                {t('policy.rules.add')}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {policy?.rules.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-20 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-[var(--c-border-3)] bg-[var(--c-surface)]">
                    <Plus size={16} className="text-[var(--c-text-5)]" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-[var(--c-text-4)]">{t('policy.rules.empty.title')}</p>
                    <p className="mt-1 max-w-[280px] text-[11px] leading-relaxed text-[var(--c-text-5)]">
                      {t('policy.rules.empty.subtitle')}
                    </p>
                  </div>
                  <button
                    onClick={() => createRule.mutate({ policyId, name: t('policy.rules.newRuleName'), requirement: 'required' })}
                    className="mt-1 flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-3 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500"
                  >
                    <Plus size={11} /> {t('policy.rules.addFirst')}
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

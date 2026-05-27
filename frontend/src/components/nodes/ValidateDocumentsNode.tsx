import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ShieldCheck, CheckCircle2, XCircle, AlertCircle, ArrowUpRight } from 'lucide-react'
import { usePolicy } from '../../api/policies'
import { useRun } from '../../api/runs'
import { useRunContext } from '../../context/run'
import { ValidationResultsModal } from '../ValidationResultsModal'
import type { ValidationOutput } from '../../types/workflow'

type RuleStatus = 'pending' | 'running' | 'pass' | 'fail' | 'uncertain'

function RuleStatusDot({ status }: { status: RuleStatus }) {
  if (status === 'pass')      return <CheckCircle2 size={10} className="shrink-0 text-emerald-400" />
  if (status === 'fail')      return <XCircle size={10} className="shrink-0 text-red-400" />
  if (status === 'uncertain') return <AlertCircle size={10} className="shrink-0 text-amber-400" />
  if (status === 'running')   return <div className="h-2 w-2 shrink-0 rounded-full bg-indigo-400 animate-pulse" />
  return <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--c-text-5)]" />
}

const OVERALL_BADGE: Record<string, string> = {
  pass:         'text-emerald-400 bg-emerald-500/10 border border-emerald-500/25',
  fail:         'text-red-400 bg-red-500/10 border border-red-500/25',
  needs_review: 'text-amber-400 bg-amber-500/10 border border-amber-500/25',
}

const OVERALL_LABEL: Record<string, string> = {
  pass: 'pass', fail: 'fail', needs_review: 'review',
}

const MAX_RULES_SHOWN = 5

export function ValidateDocumentsNode({ id, selected, data }: NodeProps) {
  const policyId = data?.policy_id as number | undefined
  const { data: policy } = usePolicy(policyId ?? null)
  const { activeRunId } = useRunContext()
  const { data: run } = useRun(activeRunId)
  const [showModal, setShowModal] = useState(false)

  const step = run?.steps.find(s => s.node_id === id)
  const isRunning = step?.status === 'running'
  const isDone = step?.status === 'completed' || step?.status === 'failed'
  const validationOut = isDone ? (step?.output_data as unknown as ValidationOutput | null) : null
  const hasResults = (validationOut?.results?.length ?? 0) > 0

  const resultsByName = new Map((validationOut?.results ?? []).map(r => [r.rule_name, r]))
  const rules = policy?.rules ?? []
  const shownRules = rules.slice(0, MAX_RULES_SHOWN)
  const hiddenCount = Math.max(0, rules.length - MAX_RULES_SHOWN)

  return (
    <>
      <div className={[
        'w-[260px] rounded-lg border bg-[var(--c-surface)] shadow-[0_2px_12px_rgba(0,0,0,0.4)]',
        'transition-[border-color,box-shadow] duration-100',
        selected
          ? 'border-violet-500/60 shadow-[0_0_0_1px_rgba(139,92,246,0.25),0_2px_12px_rgba(0,0,0,0.4)]'
          : 'border-violet-400/30 hover:border-violet-400/50',
      ].join(' ')}>

        <Handle
          type="target"
          position={Position.Top}
          className="!h-[10px] !w-[10px] !rounded-full !border-2 !border-[var(--c-surface)] !bg-violet-500"
        />

        {/* Header */}
        <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-3 py-2.5">
          <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[5px] bg-violet-500/15">
            <ShieldCheck size={13} className="text-violet-400" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold leading-tight text-[var(--c-text-1)]">Validate Documents</p>
            {policy ? (
              <p className="truncate text-[10px] leading-tight text-violet-400/70">{policy.name}</p>
            ) : (
              <p className="text-[10px] leading-tight text-[var(--c-text-5)]">
                {policyId ? 'Loading…' : 'No policy'}
              </p>
            )}
          </div>
          {validationOut?.overall ? (
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${OVERALL_BADGE[validationOut.overall] ?? ''}`}>
              {OVERALL_LABEL[validationOut.overall] ?? validationOut.overall}
            </span>
          ) : (
            <span className="shrink-0 rounded-sm bg-[var(--c-surface-3)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--c-text-5)]">
              validate
            </span>
          )}
        </div>

        {/* Rule list */}
        <div className="flex flex-col gap-1 px-3 py-2.5">
          {rules.length === 0 ? (
            <p className="py-0.5 text-[11px] text-[var(--c-text-5)]">
              {policyId ? 'Loading rules…' : 'Select a policy to see rules'}
            </p>
          ) : (
            <>
              {shownRules.map(rule => {
                const result = resultsByName.get(rule.name)
                const status: RuleStatus = isRunning
                  ? 'running'
                  : result
                  ? result.status
                  : 'pending'

                return (
                  <div key={rule.id} className="flex items-center gap-2">
                    <RuleStatusDot status={status} />
                    <span className={[
                      'flex-1 truncate text-[11px] leading-snug',
                      status === 'running'     ? 'text-indigo-400'
                      : status === 'pass'      ? 'text-[var(--c-text-3)]'
                      : status === 'fail'      ? 'text-red-400'
                      : status === 'uncertain' ? 'text-amber-400'
                      : 'text-[var(--c-text-4)]',
                    ].join(' ')}>
                      {rule.name}
                    </span>
                    {rule.requirement === 'optional' && (
                      <span className="shrink-0 text-[9px] text-[var(--c-text-5)]">opt</span>
                    )}
                    {result && (
                      <span className="shrink-0 font-mono text-[9px] text-[var(--c-text-5)]">
                        {Math.round(result.confidence * 100)}%
                      </span>
                    )}
                  </div>
                )
              })}
              {hiddenCount > 0 && (
                <p className="pt-0.5 text-[10px] text-[var(--c-text-5)]">+{hiddenCount} more rules</p>
              )}
            </>
          )}
        </div>

        {/* View results footer — only when results exist */}
        {hasResults && (
          <div className="border-t border-[var(--c-border)] px-3 py-2">
            <button
              onClick={e => { e.stopPropagation(); setShowModal(true) }}
              className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-medium text-violet-400 transition-colors hover:bg-violet-500/10"
            >
              <ArrowUpRight size={11} />
              View full results
            </button>
          </div>
        )}

        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-[10px] !w-[10px] !rounded-full !border-2 !border-[var(--c-surface)] !bg-violet-500"
        />
      </div>

      {showModal && validationOut && createPortal(
        <ValidationResultsModal
          policyName={validationOut.policy_name}
          overall={validationOut.overall}
          results={validationOut.results}
          onClose={() => setShowModal(false)}
        />,
        document.body
      )}
    </>
  )
}

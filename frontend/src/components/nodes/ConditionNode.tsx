import { Handle, Position, type NodeProps } from '@xyflow/react'
import { GitBranch } from 'lucide-react'
import { useI18n } from '../../context/i18n'

export function ConditionNode({ data, selected }: NodeProps) {
  const { t } = useI18n()
  const d = (data ?? {}) as Record<string, unknown>
  const isCustom = (d.mode as string) === 'custom'
    || (d.field != null && d.field !== '' && d.field !== 'overall')

  let summary
  if (isCustom) {
    const f = (d.field as string) || '—'
    const op = (d.op as string) || ''
    const v = d.value != null && d.value !== '' ? String(d.value) : ''
    summary = <span className="truncate font-mono text-[11px] text-[var(--c-text-2)]">{f} {op} {v}</span>
  } else {
    const v = (d.value as string) || 'fail'
    const label = v === 'pass' ? t('verdict.pass') : v === 'needs_review' ? t('verdict.needs_review') : t('verdict.fail')
    const tone = v === 'pass' ? 'text-emerald-400' : v === 'needs_review' ? 'text-amber-400' : 'text-red-400'
    summary = (
      <span className="text-[12px] text-[var(--c-text-3)]">
        {t('editor.cond.cardWhen')} <span className={`font-medium ${tone}`}>{label}</span>
      </span>
    )
  }

  return (
    <div className={[
      'w-[210px] rounded-lg border bg-[var(--c-surface)] shadow-[0_2px_8px_rgba(0,0,0,0.5)]',
      'transition-[border-color,box-shadow] duration-100',
      selected
        ? 'border-indigo-500/60 shadow-[0_0_0_1px_rgba(99,102,241,0.3)]'
        : 'border-[var(--c-border-2)] hover:border-[var(--c-border-3)]',
    ].join(' ')}>
      <Handle type="target" position={Position.Top}
        className="!h-[10px] !w-[10px] !rounded-full !border-2 !border-[var(--c-surface)] !bg-sky-500" />

      <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-3 py-2">
        <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] bg-sky-500/15">
          <GitBranch size={11} className="text-sky-400" strokeWidth={2.5} />
        </div>
        <span className="text-[11px] text-[var(--c-text-4)]">{t('editor.card.condition.header')}</span>
      </div>

      <div className="px-3 py-2.5">{summary}</div>

      {/* Branch labels read "Yes"/"No"; the engine handle ids stay true/false. */}
      <div className="flex justify-between px-4 pb-1.5 text-[9px] font-medium">
        <span className="text-emerald-400">{t('editor.branch.yes')}</span>
        <span className="text-red-400">{t('editor.branch.no')}</span>
      </div>
      <Handle id="true" type="source" position={Position.Bottom} style={{ left: '22%' }}
        className="!h-[10px] !w-[10px] !rounded-full !border-2 !border-[var(--c-surface)] !bg-emerald-500" />
      <Handle id="false" type="source" position={Position.Bottom} style={{ left: '78%' }}
        className="!h-[10px] !w-[10px] !rounded-full !border-2 !border-[var(--c-surface)] !bg-red-500" />
    </div>
  )
}

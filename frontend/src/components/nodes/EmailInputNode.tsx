import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Mail } from 'lucide-react'
import { useI18n } from '../../context/i18n'

const FIELD_KEYS = ['subject', 'from', 'to', 'body', 'attachments']

export function EmailInputNode({ selected, data }: NodeProps) {
  const { t } = useI18n()
  const fields = (data?.fields as string[] | undefined) ?? FIELD_KEYS
  const count = fields.length

  return (
    <div className={[
      'w-[200px] rounded-lg border bg-[var(--c-surface)] shadow-[0_2px_8px_rgba(0,0,0,0.5)]',
      'transition-[border-color,box-shadow] duration-100',
      selected
        ? 'border-indigo-500/60 shadow-[0_0_0_1px_rgba(99,102,241,0.3)]'
        : 'border-[var(--c-border-2)] hover:border-[var(--c-border-3)]',
    ].join(' ')}>

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-3 py-2">
        <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] bg-sky-500/15">
          <Mail size={11} className="text-sky-400" strokeWidth={2} />
        </div>
        <span className="text-[11px] text-[var(--c-text-4)]">{t('editor.card.email_input.header')}</span>
        <span className="ml-auto rounded-sm bg-[var(--c-surface-3)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--c-text-5)]">
          {t('editor.sublabel.source')}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        <p className="text-[13px] font-medium text-[var(--c-text-1)]">{t('editor.emailInput.title')}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--c-text-4)]">
          {count === 1 ? t('editor.emailInput.field', { count }) : t('editor.emailInput.fields', { count })}
        </p>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-[10px] !w-[10px] !rounded-full !border-2 !border-[var(--c-surface)] !bg-sky-500"
      />
    </div>
  )
}

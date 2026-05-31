import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ScanLine } from 'lucide-react'
import { useI18n } from '../../context/i18n'

export function PdfToImagesNode({ selected, data }: NodeProps) {
  const { t } = useI18n()
  const scale = (data?.scale as number | undefined) ?? 2.0

  return (
    <div className={[
      'w-[200px] rounded-lg border bg-[var(--c-surface)] shadow-[0_2px_8px_rgba(0,0,0,0.5)]',
      'transition-[border-color,box-shadow] duration-100',
      selected
        ? 'border-indigo-500/60 shadow-[0_0_0_1px_rgba(99,102,241,0.3)]'
        : 'border-[var(--c-border-2)] hover:border-[var(--c-border-3)]',
    ].join(' ')}>

      <Handle
        type="target"
        position={Position.Top}
        className="!h-[10px] !w-[10px] !rounded-full !border-2 !border-[var(--c-surface)] !bg-amber-500"
      />

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-3 py-2">
        <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] bg-amber-500/15">
          <ScanLine size={11} className="text-amber-400" strokeWidth={2} />
        </div>
        <span className="text-[11px] text-[var(--c-text-4)]">{t('editor.card.transform.header')}</span>
        <span className="ml-auto rounded-sm bg-[var(--c-surface-3)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--c-text-5)]">
          {t('editor.sublabel.process')}
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        <p className="text-[13px] font-medium text-[var(--c-text-1)]">{t('editor.pdf.title')}</p>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-[11px] text-[var(--c-text-4)]">{t('editor.pdf.subtitle')}</span>
          <span className="ml-auto shrink-0 rounded bg-[var(--c-surface-2)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--c-text-5)]">
            {scale}×
          </span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-[10px] !w-[10px] !rounded-full !border-2 !border-[var(--c-surface)] !bg-amber-500"
      />
    </div>
  )
}

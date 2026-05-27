import { Handle, Position, type NodeProps } from '@xyflow/react'
import { SendHorizontal } from 'lucide-react'

export function SendEmailNode({ selected, data }: NodeProps) {
  const to = (data?.to as string | undefined) ?? ''

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
        className="!h-[10px] !w-[10px] !rounded-full !border-2 !border-[var(--c-surface)] !bg-teal-500"
      />

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-3 py-2">
        <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] bg-teal-500/15">
          <SendHorizontal size={11} className="text-teal-400" strokeWidth={2} />
        </div>
        <span className="text-[11px] text-[var(--c-text-4)]">Send Email</span>
        <span className="ml-auto rounded-sm bg-[var(--c-surface-3)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--c-text-5)]">
          action
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        <p className="text-[13px] font-medium text-[var(--c-text-1)]">Send Email</p>
        <p className="mt-0.5 truncate text-[11px] leading-relaxed text-[var(--c-text-4)]">
          {to ? `To: ${to}` : 'No recipient configured'}
        </p>
      </div>
    </div>
  )
}

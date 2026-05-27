import { Handle, Position, type NodeProps } from '@xyflow/react'
import { BarChart2 } from 'lucide-react'

export function ShowResultsNode({ selected }: NodeProps) {
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
        className="!h-[10px] !w-[10px] !rounded-full !border-2 !border-[var(--c-surface)] !bg-violet-500"
      />

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--c-border)] px-3 py-2">
        <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] bg-violet-500/15">
          <BarChart2 size={11} className="text-violet-400" strokeWidth={2.5} />
        </div>
        <span className="text-[11px] text-[var(--c-text-4)]">Show Results</span>
        <span className="ml-auto rounded-sm bg-[var(--c-surface-3)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--c-text-5)]">
          sink
        </span>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        <p className="text-[13px] font-medium text-[var(--c-text-1)]">Show Results</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--c-text-4)]">Displays results on the Dashboard</p>
      </div>
    </div>
  )
}

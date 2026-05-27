import type { DragEvent } from 'react'
import { ArrowDownToLine, ScanLine, Check, ShieldCheck, BarChart2, GripVertical, Mail, Sparkles, SendHorizontal } from 'lucide-react'

const ITEMS = [
  {
    type: 'input',
    label: 'Input',
    sublabel: 'source',
    description: 'Entry point for the workflow',
    icon: ArrowDownToLine,
    iconBg: 'bg-indigo-500/15',
    iconColor: 'text-indigo-400',
  },
  {
    type: 'email_input',
    label: 'Email Input',
    sublabel: 'source',
    description: 'Triggers when an email is received',
    icon: Mail,
    iconBg: 'bg-sky-500/15',
    iconColor: 'text-sky-400',
  },
  {
    type: 'pdf_to_images',
    label: 'PDF → Images',
    sublabel: 'transform',
    description: 'Render PDF pages as PNG',
    icon: ScanLine,
    iconBg: 'bg-amber-500/15',
    iconColor: 'text-amber-400',
  },
  {
    type: 'ai',
    label: 'AI',
    sublabel: 'process',
    description: 'Process data with an AI prompt',
    icon: Sparkles,
    iconBg: 'bg-violet-500/15',
    iconColor: 'text-violet-400',
  },
  {
    type: 'validate_documents',
    label: 'Validate Documents',
    sublabel: 'process',
    description: 'Run a validation policy against documents',
    icon: ShieldCheck,
    iconBg: 'bg-violet-500/15',
    iconColor: 'text-violet-400',
  },
  {
    type: 'output',
    label: 'Output',
    sublabel: 'sink',
    description: 'Collect and finalize results',
    icon: Check,
    iconBg: 'bg-emerald-500/15',
    iconColor: 'text-emerald-400',
  },
  {
    type: 'send_email',
    label: 'Send Email',
    sublabel: 'action',
    description: 'Send an email using template variables',
    icon: SendHorizontal,
    iconBg: 'bg-teal-500/15',
    iconColor: 'text-teal-400',
  },
  {
    type: 'show_results',
    label: 'Show Results',
    sublabel: 'sink',
    description: 'Display run results on dashboard widget',
    icon: BarChart2,
    iconBg: 'bg-violet-500/15',
    iconColor: 'text-violet-400',
  },
] as const

function onDragStart(e: DragEvent, type: string) {
  e.dataTransfer.setData('application/reactflow', type)
  e.dataTransfer.effectAllowed = 'move'
}

export function NodePalette() {
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-l border-[var(--c-border)] bg-[var(--c-bg)]">
      <div className="border-b border-[var(--c-border)] px-4 py-3">
        <p className="text-[13px] font-medium text-[var(--c-text-2)]">Nodes</p>
        <p className="mt-0.5 text-[11px] text-[var(--c-text-5)]">Drag to canvas</p>
      </div>

      <div className="flex flex-col gap-1.5 p-3">
        {ITEMS.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => onDragStart(e, item.type)}
            className="group flex cursor-grab items-center gap-2.5 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2.5 transition-[border-color,background] hover:border-[var(--c-border-3)] hover:bg-[var(--c-surface-3)] active:cursor-grabbing active:opacity-75"
          >
            <div className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[6px] ${item.iconBg}`}>
              <item.icon size={13} className={item.iconColor} strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-[var(--c-text-2)]">{item.label}</p>
              <p className="text-[10px] text-[var(--c-text-5)]">{item.description}</p>
            </div>
            <GripVertical size={12} className="shrink-0 text-[var(--c-text-6)] group-hover:text-[var(--c-text-5)] transition-colors" />
          </div>
        ))}
      </div>

      <div className="mt-auto border-t border-[var(--c-border)] px-4 py-3">
        <p className="text-[11px] leading-relaxed text-[var(--c-text-5)]">
          Connect nodes by dragging from a bottom handle to a top handle.
        </p>
      </div>
    </aside>
  )
}

import { useRef, useState } from 'react'
import { X, CheckCircle2, XCircle, AlertCircle, ArrowUpRight } from 'lucide-react'
import type { Edge, Node } from '@xyflow/react'
import { usePolicies, usePolicy } from '../api/policies'
import { useRun } from '../api/runs'
import { useRunContext } from '../context/run'
import { useSettings, useOpenRouterModels } from '../api/settings'
import { ValidationResultsModal } from './ValidationResultsModal'
import type { ValidationOutput } from '../types/workflow'

interface Props {
  node: Node
  nodes: Node[]
  edges: Edge[]
  onUpdate: (id: string, data: Record<string, unknown>) => void
  onClose: () => void
}

// ── Variable discovery ────────────────────────────────────────────────────────

interface VarDef { key: string; label: string }
interface VarGroup { nodeId: string; nodeType: string; nodeLabel: string; vars: VarDef[] }

const NODE_OUTPUT_VARS: Record<string, VarDef[]> = {
  input:              [{ key: 'document_id', label: 'Document ID' }, { key: 'file_path', label: 'File Path' }, { key: 'mime_type', label: 'MIME Type' }],
  email_input:        [{ key: 'subject', label: 'Subject' }, { key: 'from', label: 'From' }, { key: 'to', label: 'To' }, { key: 'body', label: 'Body' }],
  pdf_to_images:      [{ key: 'image_paths', label: 'Image Paths' }, { key: 'page_count', label: 'Page Count' }, { key: 'document_id', label: 'Document ID' }],
  validate_documents: [{ key: 'overall', label: 'Overall Result' }, { key: 'results', label: 'Rule Results' }, { key: 'policy_name', label: 'Policy Name' }],
  ai:                 [{ key: 'ai_response', label: 'AI Response' }],
  send_email:         [{ key: 'sent_to', label: 'Sent To' }, { key: 'sent_subject', label: 'Sent Subject' }],
}

const NODE_TYPE_LABELS: Record<string, string> = {
  input: 'Input', email_input: 'Email Input', pdf_to_images: 'PDF → Images',
  validate_documents: 'Validate Documents', ai: 'AI', send_email: 'Send Email',
  output: 'Output', show_results: 'Show Results',
}

const NODE_DOT_COLOR: Record<string, string> = {
  input: 'bg-indigo-400', email_input: 'bg-sky-400', pdf_to_images: 'bg-amber-400',
  validate_documents: 'bg-violet-400', ai: 'bg-violet-400',
  send_email: 'bg-teal-400', output: 'bg-emerald-400',
}

function getUpstreamVarGroups(nodeId: string, nodes: Node[], edges: Edge[]): VarGroup[] {
  const groups: VarGroup[] = []
  const visited = new Set<string>()
  const queue = [nodeId]
  while (queue.length > 0) {
    const current = queue.shift()!
    for (const edge of edges.filter(e => e.target === current)) {
      if (visited.has(edge.source)) continue
      visited.add(edge.source)
      const src = nodes.find(n => n.id === edge.source)
      if (src) {
        const vars = NODE_OUTPUT_VARS[src.type ?? ''] ?? []
        if (vars.length > 0) groups.push({ nodeId: edge.source, nodeType: src.type ?? '', nodeLabel: NODE_TYPE_LABELS[src.type ?? ''] ?? src.type ?? '', vars })
        queue.push(edge.source)
      }
    }
  }
  return groups
}

// ── Prompt editor ─────────────────────────────────────────────────────────────

interface PromptEditorProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  varGroups: VarGroup[]
}

function ToolbarBtn({ label, title, bold, italic, onActivate }: { label: string; title: string; bold?: boolean; italic?: boolean; onActivate: () => void }) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={e => { e.preventDefault(); onActivate() }}
      className={['flex h-6 w-6 items-center justify-center rounded text-[12px] transition-colors text-[var(--c-text-4)] hover:bg-[var(--c-hover-3)] hover:text-[var(--c-text-2)]', bold ? 'font-bold' : '', italic ? 'italic' : ''].join(' ')}
    >{label}</button>
  )
}

function PromptEditor({ value, onChange, placeholder, rows = 8, varGroups }: PromptEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function insertAt(text: string) {
    const el = ref.current
    if (!el) { onChange(value + text); return }
    const s = el.selectionStart
    const e2 = el.selectionEnd
    const next = value.slice(0, s) + text + value.slice(e2)
    onChange(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + text.length, s + text.length) })
  }

  function applyFmt(type: 'bold' | 'italic' | 'bullet' | 'quote') {
    const el = ref.current
    if (!el) return
    const s = el.selectionStart
    const e2 = el.selectionEnd
    const sel = value.slice(s, e2)
    let wrapped: string
    switch (type) {
      case 'bold':   wrapped = `**${sel || 'bold'}**`; break
      case 'italic': wrapped = `*${sel || 'italic'}*`; break
      case 'bullet': wrapped = (sel || 'item').split('\n').map(l => `- ${l}`).join('\n'); break
      case 'quote':  wrapped = (sel || 'quote').split('\n').map(l => `> ${l}`).join('\n'); break
    }
    const next = value.slice(0, s) + wrapped + value.slice(e2)
    onChange(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + wrapped.length, s + wrapped.length) })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Variable chips */}
      {varGroups.length > 0 ? (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">Variables</p>
          <div className="flex flex-col gap-2.5">
            {varGroups.map(group => (
              <div key={group.nodeId}>
                <div className="mb-1 flex items-center gap-1.5">
                  <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${NODE_DOT_COLOR[group.nodeType] ?? 'bg-[var(--c-text-5)]'}`} />
                  <span className="text-[10px] text-[var(--c-text-5)]">from {group.nodeLabel}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {group.vars.map(v => (
                    <button
                      key={v.key}
                      type="button"
                      title={v.label}
                      onClick={() => insertAt(`{{${v.key}}}`)}
                      className="rounded border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] text-violet-400 transition-colors hover:border-violet-500/40 hover:bg-violet-500/20"
                    >
                      {`{{${v.key}}}`}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-[var(--c-border-3)] px-3 py-2.5 text-[10px] leading-relaxed text-[var(--c-text-5)]">
          Connect upstream nodes to see available variables.
        </div>
      )}

      {/* Editor */}
      <div>
        <div className="flex items-center gap-0.5 rounded-t-md border border-b-0 border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-1.5 py-1">
          <ToolbarBtn label="B" title="Bold" bold onActivate={() => applyFmt('bold')} />
          <ToolbarBtn label="I" title="Italic" italic onActivate={() => applyFmt('italic')} />
          <ToolbarBtn label="≡" title="Bullet list" onActivate={() => applyFmt('bullet')} />
          <ToolbarBtn label="❝" title="Blockquote" onActivate={() => applyFmt('quote')} />
        </div>
        <textarea
          ref={ref}
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          spellCheck
          className="w-full resize-y rounded-b-md border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-inset focus:ring-indigo-500/20"
          style={{ minHeight: 110 }}
        />
      </div>
    </div>
  )
}

const NODE_TITLES: Record<string, string> = {
  input: 'Document Input',
  email_input: 'Email Input',
  pdf_to_images: 'PDF → Images',
  ai: 'AI',
  validate_documents: 'Validate Documents',
  output: 'Collect Output',
  send_email: 'Send Email',
  show_results: 'Show Results',
}

export function NodeConfigPanel({ node, nodes, edges, onUpdate, onClose }: Props) {
  const data = (node.data ?? {}) as Record<string, unknown>
  const upstreamGroups = getUpstreamVarGroups(node.id, nodes, edges)
  const wide = node.type === 'ai' || node.type === 'send_email'

  function set(key: string, value: unknown) {
    onUpdate(node.id, { ...data, [key]: value })
  }

  return (
    <aside className={`flex ${wide ? 'w-[320px]' : 'w-[220px]'} shrink-0 flex-col border-l border-[var(--c-border)] bg-[var(--c-bg)]`}>
      <div className="flex items-center justify-between border-b border-[var(--c-border)] px-4 py-3">
        <div>
          <p className="text-[13px] font-medium text-[var(--c-text-2)]">{NODE_TITLES[node.type ?? ''] ?? node.type}</p>
          <p className="mt-0.5 text-[11px] text-[var(--c-text-5)]">Node configuration</p>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-[var(--c-text-5)] hover:text-[var(--c-text-4)] transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {node.type === 'input' && <InputConfig />}
        {node.type === 'email_input' && (
          <EmailInputConfig
            fields={data.fields as string[] | undefined}
            onChange={v => set('fields', v)}
          />
        )}
        {node.type === 'pdf_to_images' && (
          <PdfToImagesConfig
            scale={data.scale as number | undefined}
            onChange={v => set('scale', v)}
          />
        )}
        {node.type === 'ai' && (
          <AiConfig
            systemPrompt={data.system_prompt as string | undefined}
            model={data.model as string | undefined}
            onChangePrompt={v => set('system_prompt', v)}
            onChangeModel={v => set('model', v)}
            varGroups={upstreamGroups}
          />
        )}
        {node.type === 'output' && (
          <OutputConfig
            outputFolder={data.output_folder as string | undefined}
            onChange={v => set('output_folder', v)}
          />
        )}
        {node.type === 'send_email' && (
          <SendEmailConfig
            to={data.to as string | undefined}
            subject={data.subject as string | undefined}
            body={data.body as string | undefined}
            onChangeTo={v => set('to', v)}
            onChangeSubject={v => set('subject', v)}
            onChangeBody={v => set('body', v)}
            varGroups={upstreamGroups}
          />
        )}
        {node.type === 'validate_documents' && (
          <ValidateDocumentsConfig
            nodeId={node.id}
            policyId={data.policy_id as number | undefined}
            policyName={data.policy_name as string | undefined}
            failOnMissing={data.fail_on_missing as boolean | undefined}
            onChangePolicyId={(id, name) => onUpdate(node.id, { ...data, policy_id: id, policy_name: name })}
            onChangeFailOnMissing={v => set('fail_on_missing', v)}
          />
        )}
        {node.type === 'show_results' && <ShowResultsConfig />}
      </div>
    </aside>
  )
}

function InputConfig() {
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium text-[var(--c-text-4)]">About</p>
      <p className="text-[11px] leading-relaxed text-[var(--c-text-5)]">
        Accepts any uploaded document. The selected file is passed downstream as the workflow input.
      </p>
    </div>
  )
}

const EMAIL_FIELDS = [
  { key: 'subject', label: 'Subject' },
  { key: 'from', label: 'From' },
  { key: 'to', label: 'To' },
  { key: 'body', label: 'Body' },
  { key: 'attachments', label: 'Attachments' },
]

interface EmailInputConfigProps {
  fields: string[] | undefined
  onChange: (v: string[]) => void
}

function EmailInputConfig({ fields, onChange }: EmailInputConfigProps) {
  const active = fields ?? EMAIL_FIELDS.map(f => f.key)

  function toggle(key: string) {
    if (active.includes(key)) {
      onChange(active.filter(k => k !== key))
    } else {
      onChange([...active, key])
    }
  }

  return (
    <div>
      <p className="mb-2 text-[11px] font-medium text-[var(--c-text-4)]">Fields to pass downstream</p>
      <div className="flex flex-col gap-1">
        {EMAIL_FIELDS.map(f => {
          const on = active.includes(f.key)
          return (
            <button
              key={f.key}
              onClick={() => toggle(f.key)}
              className={[
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-left text-[11px] transition-colors',
                on
                  ? 'bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20'
                  : 'bg-[var(--c-surface-2)] text-[var(--c-text-4)] hover:bg-[var(--c-surface)] hover:text-[var(--c-text-3)]',
              ].join(' ')}
            >
              <span className={`h-3 w-3 shrink-0 rounded-sm border transition-colors ${on ? 'border-sky-400 bg-sky-400' : 'border-[var(--c-border-3)]'}`} />
              {f.label}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-[var(--c-text-5)]">
        Enable this workflow's email inbox from the Workflows list to receive emails.
      </p>
    </div>
  )
}

interface AiConfigProps {
  systemPrompt: string | undefined
  model: string | undefined
  varGroups: VarGroup[]
  onChangePrompt: (v: string) => void
  onChangeModel: (v: string) => void
}

function AiConfig({ systemPrompt, model, varGroups, onChangePrompt, onChangeModel }: AiConfigProps) {
  const { data: settings } = useSettings()
  const apiKeySet = settings?.openrouter_api_key_set ?? false
  const { data: models, isLoading: modelsLoading } = useOpenRouterModels(apiKeySet)
  const defaultModel = settings?.openrouter_default_model ?? ''

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-2 block text-[11px] font-medium text-[var(--c-text-4)]">Prompt</label>
        <PromptEditor
          value={systemPrompt ?? ''}
          onChange={onChangePrompt}
          placeholder={"Summarise the email in one sentence.\n\nEmail subject: {{subject}}\nFrom: {{from}}\n\n{{body}}"}
          rows={8}
          varGroups={varGroups}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-medium text-[var(--c-text-4)]">Model</label>
        {apiKeySet && !modelsLoading && models && models.length > 0 ? (
          <select
            value={model ?? ''}
            onChange={e => onChangeModel(e.target.value)}
            className="w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-2.5 py-1.5 text-[12px] text-[var(--c-text-2)] outline-none transition-colors focus:border-indigo-500/50"
          >
            <option value="">— Default ({defaultModel || 'from Settings'}) —</option>
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.id}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={model ?? ''}
            onChange={e => onChangeModel(e.target.value)}
            placeholder={defaultModel || 'e.g. google/gemini-2.0-flash-exp'}
            className="w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[12px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
          />
        )}
        {!apiKeySet && (
          <p className="mt-1 text-[10px] text-[var(--c-text-5)]">Set your API key in Settings to pick from available models.</p>
        )}
      </div>
    </div>
  )
}

interface SendEmailConfigProps {
  to: string | undefined
  subject: string | undefined
  body: string | undefined
  varGroups: VarGroup[]
  onChangeTo: (v: string) => void
  onChangeSubject: (v: string) => void
  onChangeBody: (v: string) => void
}

function SendEmailConfig({ to, subject, body, varGroups, onChangeTo, onChangeSubject, onChangeBody }: SendEmailConfigProps) {
  const inputCls = 'w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[12px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20'

  // All flat unique vars for the To/Subject inline chip row
  const allVars = varGroups.flatMap(g => g.vars)

  // Per-field ref+insert helpers
  const toRef = useRef<HTMLInputElement>(null)
  const subjectRef = useRef<HTMLInputElement>(null)

  function insertInto(ref: React.RefObject<HTMLInputElement | null>, current: string, onChange: (v: string) => void, text: string) {
    const el = ref.current
    if (!el) { onChange(current + text); return }
    const s = el.selectionStart ?? current.length
    const e2 = el.selectionEnd ?? current.length
    const next = current.slice(0, s) + text + current.slice(e2)
    onChange(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + text.length, s + text.length) })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Shared variable chips (flat, for To/Subject insertion) */}
      {allVars.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">Variables</p>
          <div className="flex flex-wrap gap-1">
            {allVars.map(v => (
              <button
                key={v.key}
                type="button"
                title={`Click to copy — then paste into any field`}
                onClick={() => {
                  const active = document.activeElement
                  if (active === toRef.current) insertInto(toRef, to ?? '', onChangeTo, `{{${v.key}}}`)
                  else if (active === subjectRef.current) insertInto(subjectRef, subject ?? '', onChangeSubject, `{{${v.key}}}`)
                }}
                className="rounded border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] text-violet-400 transition-colors hover:border-violet-500/40 hover:bg-violet-500/20"
              >
                {`{{${v.key}}}`}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-[var(--c-text-5)]">Focus a field, then click a chip to insert it there.</p>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-[11px] font-medium text-[var(--c-text-4)]">To</label>
        <input
          ref={toRef}
          type="text"
          value={to ?? ''}
          onChange={e => onChangeTo(e.target.value)}
          placeholder="{{from}} or alice@example.com"
          className={inputCls}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-medium text-[var(--c-text-4)]">Subject</label>
        <input
          ref={subjectRef}
          type="text"
          value={subject ?? ''}
          onChange={e => onChangeSubject(e.target.value)}
          placeholder="Re: {{subject}}"
          className={inputCls}
        />
      </div>

      <div>
        <label className="mb-2 block text-[11px] font-medium text-[var(--c-text-4)]">Body</label>
        <PromptEditor
          value={body ?? ''}
          onChange={onChangeBody}
          placeholder={"Hi,\n\n{{ai_response}}\n\nBest regards"}
          rows={6}
          varGroups={varGroups}
        />
      </div>
    </div>
  )
}

interface PdfToImagesConfigProps {
  scale: number | undefined
  onChange: (v: number) => void
}

function PdfToImagesConfig({ scale, onChange }: PdfToImagesConfigProps) {
  const current = scale ?? 2.0
  const options = [
    { value: 1.0, label: '1× — 72 dpi' },
    { value: 1.5, label: '1.5× — 108 dpi' },
    { value: 2.0, label: '2× — 144 dpi (default)' },
    { value: 3.0, label: '3× — 216 dpi' },
  ]
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-[var(--c-text-4)]">Render scale</label>
      <div className="flex flex-col gap-1">
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={[
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-left text-[11px] transition-colors',
              current === opt.value
                ? 'bg-indigo-600/15 text-[var(--c-text-2)] ring-1 ring-indigo-500/30'
                : 'bg-[var(--c-surface-2)] text-[var(--c-text-4)] hover:bg-[var(--c-surface)] hover:text-[var(--c-text-3)]',
            ].join(' ')}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

interface OutputConfigProps {
  outputFolder: string | undefined
  onChange: (v: string) => void
}

function OutputConfig({ outputFolder, onChange }: OutputConfigProps) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-[var(--c-text-4)]">Output folder</label>
      <input
        type="text"
        value={outputFolder ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder="e.g. exports/invoices"
        className="w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[12px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
      />
      <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--c-text-5)]">
        Relative path within storage. Leave empty to skip copying.
      </p>
    </div>
  )
}

interface ValidateDocumentsConfigProps {
  nodeId: string
  policyId: number | undefined
  policyName: string | undefined
  failOnMissing: boolean | undefined
  onChangePolicyId: (id: number, name: string) => void
  onChangeFailOnMissing: (v: boolean) => void
}

type RuleStatus = 'pending' | 'running' | 'pass' | 'fail' | 'uncertain'

function RuleStatusIcon({ status }: { status: RuleStatus }) {
  if (status === 'pass')      return <CheckCircle2 size={10} className="mt-0.5 shrink-0 text-emerald-400" />
  if (status === 'fail')      return <XCircle size={10} className="mt-0.5 shrink-0 text-red-400" />
  if (status === 'uncertain') return <AlertCircle size={10} className="mt-0.5 shrink-0 text-amber-400" />
  if (status === 'running')   return <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-400 animate-pulse" />
  return <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--c-text-5)]" />
}

const REQ_BADGE: Record<string, string> = {
  required: 'text-[var(--c-text-5)] bg-[var(--c-surface-3)]',
  optional: 'text-[var(--c-text-5)] bg-[var(--c-surface-3)]',
}

function ShowResultsConfig() {
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium text-[var(--c-text-4)]">About</p>
      <p className="text-[11px] leading-relaxed text-[var(--c-text-5)]">
        Add this node to display results on the Dashboard widget. When a run completes, the dashboard will show the output inline.
      </p>
    </div>
  )
}

function ValidateDocumentsConfig({ nodeId, policyId, failOnMissing, onChangePolicyId, onChangeFailOnMissing }: ValidateDocumentsConfigProps) {
  const { data: policies } = usePolicies()
  const { data: policy } = usePolicy(policyId ?? null)
  const { activeRunId } = useRunContext()
  const { data: run } = useRun(activeRunId)
  const [showModal, setShowModal] = useState(false)

  const step = run?.steps.find(s => s.node_id === nodeId)
  const isRunning = step?.status === 'running'
  const isDone = step?.status === 'completed' || step?.status === 'failed'
  const validationOut = isDone ? (step?.output_data as unknown as ValidationOutput | null) : null
  const resultsByName = new Map((validationOut?.results ?? []).map(r => [r.rule_name, r]))
  const hasResults = (validationOut?.results?.length ?? 0) > 0

  const rules = policy?.rules ?? []
  const failOn = failOnMissing ?? false

  return (
    <div className="flex flex-col gap-4">
      {/* Policy selector */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-[11px] font-medium text-[var(--c-text-4)]">Policy</label>
          {policy && policy.current_version_num > 0 && (
            <span className="font-mono text-[10px] text-[var(--c-text-5)]">v{policy.current_version_num}</span>
          )}
        </div>
        <select
          value={policyId ?? ''}
          onChange={e => {
            const selected = policies?.find(p => p.id === Number(e.target.value))
            if (selected) onChangePolicyId(selected.id, selected.name)
          }}
          className="w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-2.5 py-1.5 text-[12px] text-[var(--c-text-2)] outline-none transition-colors focus:border-indigo-500/50"
        >
          <option value="">— Select a policy —</option>
          {policies?.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Rule list */}
      {rules.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-medium text-[var(--c-text-4)]">
            Rules
            <span className="ml-1 font-normal text-[var(--c-text-5)]">({rules.length})</span>
          </p>
          <div className="flex flex-col gap-1.5">
            {rules.map(rule => {
              const result = resultsByName.get(rule.name)
              const status: RuleStatus = isRunning ? 'running' : result?.status ?? 'pending'
              return (
                <div
                  key={rule.id}
                  className="rounded border border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-2.5 py-2"
                >
                  <div className="flex items-start gap-2">
                    <RuleStatusIcon status={status} />
                    <div className="min-w-0 flex-1">
                      <p className={[
                        'text-[11px] leading-snug',
                        status === 'running'     ? 'text-indigo-400'
                        : status === 'pass'      ? 'text-[var(--c-text-2)]'
                        : status === 'fail'      ? 'text-red-400'
                        : status === 'uncertain' ? 'text-amber-400'
                        : 'text-[var(--c-text-3)]',
                      ].join(' ')}>
                        {rule.name}
                      </p>
                      {result?.evidence && (
                        <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-[var(--c-text-5)]">
                          {result.evidence}
                        </p>
                      )}
                    </div>
                    <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-medium ${REQ_BADGE[rule.requirement] ?? ''}`}>
                      {rule.requirement}
                    </span>
                  </div>
                  {result && (
                    <p className="mt-1.5 font-mono text-[9px] text-[var(--c-text-5)]">
                      {Math.round(result.confidence * 100)}% confidence
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* View full results button */}
      {hasResults && (
        <button
          onClick={() => setShowModal(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-violet-500/20 py-2 text-[11px] font-medium text-violet-400 transition-colors hover:bg-violet-500/10"
        >
          <ArrowUpRight size={11} />
          View full results
        </button>
      )}

      {/* Fail on rejection toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium text-[var(--c-text-4)]">Fail run on rejection</p>
          <p className="text-[10px] text-[var(--c-text-5)]">Stop workflow if required rules fail</p>
        </div>
        <button
          onClick={() => onChangeFailOnMissing(!failOn)}
          className={[
            'relative h-5 w-9 rounded-full transition-colors',
            failOn ? 'bg-indigo-600' : 'bg-[var(--c-border-3)]',
          ].join(' ')}
        >
          <span className={[
            'absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform',
            failOn ? 'translate-x-4' : 'translate-x-0.5',
          ].join(' ')} />
        </button>
      </div>

      {showModal && validationOut && (
        <ValidationResultsModal
          policyName={validationOut.policy_name}
          overall={validationOut.overall}
          results={validationOut.results}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

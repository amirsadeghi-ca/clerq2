import { useRef, useState } from 'react'
import { X, CheckCircle2, XCircle, AlertCircle, ArrowUpRight, Check } from 'lucide-react'
import type { Edge, Node } from '@xyflow/react'
import { usePolicies, usePolicy } from '../api/policies'
import { useRun } from '../api/runs'
import { useDocumentTypes } from '../api/library'
import { useRunContext } from '../context/run'
import { useSettings, useOpenRouterModels } from '../api/settings'
import { ValidationResultsModal } from './ValidationResultsModal'
import type { DocumentType, ValidationOutput } from '../types/workflow'
import { useI18n } from '../context/i18n'

interface Props {
  node: Node
  nodes: Node[]
  edges: Edge[]
  onUpdate: (id: string, data: Record<string, unknown>) => void
  onClose: () => void
}

// ── Variable discovery ────────────────────────────────────────────────────────

// `label` holds an i18n key (resolved via t() at render time), not literal text.
interface VarDef { key: string; label: string }
interface VarGroup { nodeId: string; nodeType: string; nodeLabel: string; vars: VarDef[] }

const NODE_OUTPUT_VARS: Record<string, VarDef[]> = {
  input:              [{ key: 'document_id', label: 'nodeconfig.var.document_id' }, { key: 'file_path', label: 'nodeconfig.var.file_path' }, { key: 'mime_type', label: 'nodeconfig.var.mime_type' }],
  email_input:        [{ key: 'subject', label: 'nodeconfig.var.subject' }, { key: 'from', label: 'nodeconfig.var.from' }, { key: 'to', label: 'nodeconfig.var.to' }, { key: 'body', label: 'nodeconfig.var.body' }],
  pdf_to_images:      [{ key: 'image_paths', label: 'nodeconfig.var.image_paths' }, { key: 'page_count', label: 'nodeconfig.var.page_count' }, { key: 'document_id', label: 'nodeconfig.var.document_id' }],
  validate_documents: [{ key: 'overall', label: 'nodeconfig.var.overall' }, { key: 'results', label: 'nodeconfig.var.results' }, { key: 'policy_name', label: 'nodeconfig.var.policy_name' }],
  ai:                 [{ key: 'ai_response', label: 'nodeconfig.var.ai_response' }],
  send_email:         [{ key: 'sent_to', label: 'nodeconfig.var.sent_to' }, { key: 'sent_subject', label: 'nodeconfig.var.sent_subject' }],
}

// Values are i18n keys, resolved via t() at render time.
const NODE_TYPE_LABELS: Record<string, string> = {
  input: 'nodeconfig.typeLabel.input', email_input: 'nodeconfig.typeLabel.email_input', pdf_to_images: 'nodeconfig.typeLabel.pdf_to_images',
  validate_documents: 'nodeconfig.typeLabel.validate_documents', ai: 'nodeconfig.typeLabel.ai', send_email: 'nodeconfig.typeLabel.send_email',
  output: 'nodeconfig.typeLabel.output', show_results: 'nodeconfig.typeLabel.show_results',
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
  // title is already-translated text passed by the caller
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
  const { t } = useI18n()
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
      case 'bold':   wrapped = `**${sel || t('nodeconfig.fmt.bold')}**`; break
      case 'italic': wrapped = `*${sel || t('nodeconfig.fmt.italic')}*`; break
      case 'bullet': wrapped = (sel || t('nodeconfig.fmt.item')).split('\n').map(l => `- ${l}`).join('\n'); break
      case 'quote':  wrapped = (sel || t('nodeconfig.fmt.quote')).split('\n').map(l => `> ${l}`).join('\n'); break
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
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">{t('nodeconfig.variables')}</p>
          <div className="flex flex-col gap-2.5">
            {varGroups.map(group => (
              <div key={group.nodeId}>
                <div className="mb-1 flex items-center gap-1.5">
                  <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${NODE_DOT_COLOR[group.nodeType] ?? 'bg-[var(--c-text-5)]'}`} />
                  <span className="text-[10px] text-[var(--c-text-5)]">{t('nodeconfig.var.from_node', { node: t(group.nodeLabel) })}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {group.vars.map(v => (
                    <button
                      key={v.key}
                      type="button"
                      title={t(v.label)}
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
          {t('nodeconfig.var.connectHint')}
        </div>
      )}

      {/* Editor */}
      <div>
        <div className="flex items-center gap-0.5 rounded-t-md border border-b-0 border-[var(--c-border-2)] bg-[var(--c-surface-2)] px-1.5 py-1">
          <ToolbarBtn label="B" title={t('nodeconfig.toolbar.bold')} bold onActivate={() => applyFmt('bold')} />
          <ToolbarBtn label="I" title={t('nodeconfig.toolbar.italic')} italic onActivate={() => applyFmt('italic')} />
          <ToolbarBtn label="≡" title={t('nodeconfig.toolbar.bullet')} onActivate={() => applyFmt('bullet')} />
          <ToolbarBtn label="❝" title={t('nodeconfig.toolbar.quote')} onActivate={() => applyFmt('quote')} />
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

// Values are i18n keys, resolved via t() at render time.
const NODE_TITLES: Record<string, string> = {
  input: 'nodeconfig.title.input',
  email_input: 'nodeconfig.title.email_input',
  pdf_to_images: 'nodeconfig.title.pdf_to_images',
  ai: 'nodeconfig.title.ai',
  validate_documents: 'nodeconfig.title.validate_documents',
  output: 'nodeconfig.title.output',
  send_email: 'nodeconfig.title.send_email',
  show_results: 'nodeconfig.title.show_results',
}

export function NodeConfigPanel({ node, nodes, edges, onUpdate, onClose }: Props) {
  const { t } = useI18n()
  const data = (node.data ?? {}) as Record<string, unknown>
  const upstreamGroups = getUpstreamVarGroups(node.id, nodes, edges)
  const wide = node.type === 'ai' || node.type === 'send_email'

  function set(key: string, value: unknown) {
    onUpdate(node.id, { ...data, [key]: value })
  }

  function update(patch: Record<string, unknown>) {
    onUpdate(node.id, { ...data, ...patch })
  }

  return (
    <aside className={`flex ${wide ? 'w-[320px]' : 'w-[220px]'} shrink-0 flex-col border-l border-[var(--c-border)] bg-[var(--c-bg)]`}>
      <div className="flex items-center justify-between border-b border-[var(--c-border)] px-4 py-3">
        <div>
          <p className="text-[13px] font-medium text-[var(--c-text-2)]">{NODE_TITLES[node.type ?? ''] ? t(NODE_TITLES[node.type ?? '']) : node.type}</p>
          <p className="mt-0.5 text-[11px] text-[var(--c-text-5)]">{t('nodeconfig.subtitle')}</p>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-[var(--c-text-5)] hover:text-[var(--c-text-4)] transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
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
        {node.type === 'condition' && <ConditionConfig data={data} update={update} />}
        {node.type === 'completeness_gate' && <CompletenessGateConfig data={data} update={update} />}
      </div>
    </aside>
  )
}

function InputConfig() {
  const { t } = useI18n()
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium text-[var(--c-text-4)]">{t('nodeconfig.about')}</p>
      <p className="text-[11px] leading-relaxed text-[var(--c-text-5)]">
        {t('nodeconfig.input.about')}
      </p>
    </div>
  )
}

// label holds an i18n key, resolved via t() at render time.
const EMAIL_FIELDS = [
  { key: 'subject', label: 'nodeconfig.email.field.subject' },
  { key: 'from', label: 'nodeconfig.email.field.from' },
  { key: 'to', label: 'nodeconfig.email.field.to' },
  { key: 'body', label: 'nodeconfig.email.field.body' },
  { key: 'attachments', label: 'nodeconfig.email.field.attachments' },
]

interface EmailInputConfigProps {
  fields: string[] | undefined
  onChange: (v: string[]) => void
}

function EmailInputConfig({ fields, onChange }: EmailInputConfigProps) {
  const { t } = useI18n()
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
      <p className="mb-2 text-[11px] font-medium text-[var(--c-text-4)]">{t('nodeconfig.email.fields')}</p>
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
              {t(f.label)}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-[var(--c-text-5)]">
        {t('nodeconfig.email.inboxHint')}
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
  const { t } = useI18n()
  const { data: settings } = useSettings()
  const apiKeySet = settings?.openrouter_api_key_set ?? false
  const { data: models, isLoading: modelsLoading } = useOpenRouterModels(apiKeySet)
  const defaultModel = settings?.openrouter_default_model ?? ''

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-2 block text-[11px] font-medium text-[var(--c-text-4)]">{t('nodeconfig.ai.prompt')}</label>
        <PromptEditor
          value={systemPrompt ?? ''}
          onChange={onChangePrompt}
          placeholder={t('nodeconfig.ai.promptPlaceholder')}
          rows={8}
          varGroups={varGroups}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-medium text-[var(--c-text-4)]">{t('nodeconfig.ai.model')}</label>
        {apiKeySet && !modelsLoading && models && models.length > 0 ? (
          <select
            value={model ?? ''}
            onChange={e => onChangeModel(e.target.value)}
            className="w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-2.5 py-1.5 text-[12px] text-[var(--c-text-2)] outline-none transition-colors focus:border-indigo-500/50"
          >
            <option value="">{t('nodeconfig.ai.defaultOption', { model: defaultModel || t('nodeconfig.ai.defaultFromSettings') })}</option>
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.id}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={model ?? ''}
            onChange={e => onChangeModel(e.target.value)}
            placeholder={defaultModel || t('nodeconfig.ai.modelPlaceholder')}
            className="w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[12px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
          />
        )}
        {!apiKeySet && (
          <p className="mt-1 text-[10px] text-[var(--c-text-5)]">{t('nodeconfig.ai.apiKeyHint')}</p>
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
  const { t } = useI18n()
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
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--c-text-5)]">{t('nodeconfig.variables')}</p>
          <div className="flex flex-wrap gap-1">
            {allVars.map(v => (
              <button
                key={v.key}
                type="button"
                title={t('nodeconfig.send.chipTitle')}
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
          <p className="mt-1.5 text-[10px] text-[var(--c-text-5)]">{t('nodeconfig.send.focusHint')}</p>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-[11px] font-medium text-[var(--c-text-4)]">{t('nodeconfig.send.to')}</label>
        <input
          ref={toRef}
          type="text"
          value={to ?? ''}
          onChange={e => onChangeTo(e.target.value)}
          placeholder={t('nodeconfig.send.toPlaceholder')}
          className={inputCls}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-[11px] font-medium text-[var(--c-text-4)]">{t('nodeconfig.send.subject')}</label>
        <input
          ref={subjectRef}
          type="text"
          value={subject ?? ''}
          onChange={e => onChangeSubject(e.target.value)}
          placeholder={t('nodeconfig.send.subjectPlaceholder')}
          className={inputCls}
        />
      </div>

      <div>
        <label className="mb-2 block text-[11px] font-medium text-[var(--c-text-4)]">{t('nodeconfig.send.body')}</label>
        <PromptEditor
          value={body ?? ''}
          onChange={onChangeBody}
          placeholder={t('nodeconfig.send.bodyPlaceholder')}
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
  const { t } = useI18n()
  const current = scale ?? 2.0
  const options = [
    { value: 1.0, label: t('nodeconfig.pdf.scale1') },
    { value: 1.5, label: t('nodeconfig.pdf.scale15') },
    { value: 2.0, label: t('nodeconfig.pdf.scale2') },
    { value: 3.0, label: t('nodeconfig.pdf.scale3') },
  ]
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-[var(--c-text-4)]">{t('nodeconfig.pdf.renderScale')}</label>
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
  const { t } = useI18n()
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-[var(--c-text-4)]">{t('nodeconfig.output.folder')}</label>
      <input
        type="text"
        value={outputFolder ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={t('nodeconfig.output.placeholder')}
        className="w-full rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[12px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none transition-colors focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
      />
      <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--c-text-5)]">
        {t('nodeconfig.output.hint')}
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

type RuleStatus = 'pending' | 'running' | 'pass' | 'fail' | 'uncertain' | 'not_applicable'

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
  const { t } = useI18n()
  return (
    <div>
      <p className="mb-2 text-[11px] font-medium text-[var(--c-text-4)]">{t('nodeconfig.about')}</p>
      <p className="text-[11px] leading-relaxed text-[var(--c-text-5)]">
        {t('nodeconfig.showResults.about')}
      </p>
    </div>
  )
}

function ValidateDocumentsConfig({ nodeId, policyId, failOnMissing, onChangePolicyId, onChangeFailOnMissing }: ValidateDocumentsConfigProps) {
  const { t } = useI18n()
  const { data: policies } = usePolicies()
  const { data: policy } = usePolicy(policyId ?? null)
  const { activeRunId } = useRunContext()
  const { data: run } = useRun(activeRunId)
  const [showModal, setShowModal] = useState(false)

  const step = run?.steps.find(s => s.node_id === nodeId)
  const isRunning = step?.status === 'running'
  const isDone = step?.status === 'succeeded' || step?.status === 'failed'
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
          <label className="text-[11px] font-medium text-[var(--c-text-4)]">{t('nodeconfig.validate.policy')}</label>
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
          <option value="">{t('nodeconfig.validate.selectPolicy')}</option>
          {policies?.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Rule list */}
      {rules.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-medium text-[var(--c-text-4)]">
            {t('nodeconfig.validate.rules')}
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
                      {rule.requirement === 'optional' ? t('common.optional') : rule.requirement === 'required' ? t('common.required') : rule.requirement}
                    </span>
                  </div>
                  {result && (
                    <p className="mt-1.5 font-mono text-[9px] text-[var(--c-text-5)]">
                      {t('nodeconfig.validate.confidence', { percent: Math.round(result.confidence * 100) })}
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
          {t('nodeconfig.validate.viewResults')}
        </button>
      )}

      {/* Fail on rejection toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium text-[var(--c-text-4)]">{t('nodeconfig.validate.failTitle')}</p>
          <p className="text-[10px] text-[var(--c-text-5)]">{t('nodeconfig.validate.failHint')}</p>
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

const _INPUT_CLS =
  'rounded border border-[var(--c-border-2)] bg-[var(--c-surface)] px-3 py-1.5 text-[13px] text-[var(--c-text-1)] placeholder-[var(--c-text-5)] outline-none focus:border-indigo-500/50'
const _HELP_CLS =
  'rounded-md border border-[var(--c-border)] bg-[var(--c-surface-2)] px-3 py-2 text-[11px] leading-relaxed text-[var(--c-text-4)]'

const COND_OPS = ['eq', 'ne', 'contains', 'gt', 'lt', 'gte', 'lte', 'truthy', 'falsy', 'exists'] as const

interface ConfigBlockProps {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
}

function ConditionConfig({ data, update }: ConfigBlockProps) {
  const { t } = useI18n()
  const isCustom = (data.mode as string) === 'custom'
    || (data.field != null && data.field !== '' && data.field !== 'overall')
  const verdict = (data.value as string) || 'fail'

  return (
    <div className="flex flex-col gap-3">
      {!isCustom ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-[11px] font-medium text-[var(--c-text-3)]">{t('editor.cond.whenResult')}</span>
          <select value={verdict}
            onChange={e => update({ mode: 'verdict', field: 'overall', op: 'eq', value: e.target.value })}
            className={_INPUT_CLS}>
            <option value="pass">{t('verdict.pass')}</option>
            <option value="needs_review">{t('verdict.needs_review')}</option>
            <option value="fail">{t('verdict.fail')}</option>
          </select>
        </label>
      ) : (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--c-text-3)]">{t('editor.cond.field')}</span>
            <input value={(data.field as string) ?? ''} onChange={e => update({ field: e.target.value })}
              placeholder="overall" className={`${_INPUT_CLS} font-mono`} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--c-text-3)]">{t('editor.cond.op')}</span>
            <select value={(data.op as string) ?? 'eq'} onChange={e => update({ op: e.target.value })} className={_INPUT_CLS}>
              {COND_OPS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--c-text-3)]">{t('editor.cond.value')}</span>
            <input value={(data.value as string) ?? ''} onChange={e => update({ value: e.target.value })} className={_INPUT_CLS} />
          </label>
        </>
      )}

      <label className="flex cursor-pointer items-center gap-2 text-[11px] text-[var(--c-text-4)]">
        <input type="checkbox" checked={isCustom}
          onChange={e => update(e.target.checked
            ? { mode: 'custom' }
            : { mode: 'verdict', field: 'overall', op: 'eq', value: verdict })}
          className="accent-indigo-500" />
        {t('editor.cond.advanced')}
      </label>

      <div className={_HELP_CLS}>{t('editor.cond.help')}</div>
    </div>
  )
}

function CompletenessGateConfig({ data, update }: ConfigBlockProps) {
  const { t } = useI18n()
  const { data: docTypes } = useDocumentTypes()
  const selected: number[] = Array.isArray(data.required_doc_types) ? (data.required_doc_types as number[]) : []

  function toggle(dt: DocumentType) {
    const ids = selected.includes(dt.id) ? selected.filter(i => i !== dt.id) : [...selected, dt.id]
    const names = (docTypes ?? []).filter(d => ids.includes(d.id)).map(d => d.name)
    update({ required_doc_types: ids, required_doc_type_names: names })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-[var(--c-text-3)]">{t('editor.gate.heading')}</span>
        {!docTypes || docTypes.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--c-border-2)] px-3 py-3 text-[11px] text-[var(--c-text-5)]">
            {t('editor.gate.noTypes')}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {docTypes.map(dt => {
              const on = selected.includes(dt.id)
              return (
                <button key={dt.id} type="button" onClick={() => toggle(dt)}
                  className={['flex items-center gap-2 rounded-md border px-3 py-2 text-left text-[12px] transition-colors',
                    on ? 'border-amber-500/40 bg-amber-500/10 text-[var(--c-text-1)]'
                       : 'border-[var(--c-border)] bg-[var(--c-surface)] text-[var(--c-text-3)] hover:border-[var(--c-border-3)]'].join(' ')}>
                  <span className={['flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border',
                    on ? 'border-amber-500 bg-amber-500 text-white' : 'border-[var(--c-border-3)]'].join(' ')}>
                    {on && <Check size={9} strokeWidth={3} />}
                  </span>
                  <span className="flex-1 truncate">{dt.name}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-[var(--c-text-3)]">{t('editor.gate.timeout')}</span>
        <input type="number" min={0} value={(data.timeout_days as number | undefined) ?? ''}
          onChange={e => update({ timeout_days: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder="7" className={_INPUT_CLS} />
      </label>

      <div className={_HELP_CLS}>{t('editor.gate.help')}</div>
    </div>
  )
}

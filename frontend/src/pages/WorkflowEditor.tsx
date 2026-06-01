import { useCallback, useRef, useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ReactFlow, addEdge, Background, BackgroundVariant,
  Controls, MiniMap, useNodesState, useEdgesState,
  type Connection, type Edge, type Node, type ReactFlowInstance,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ChevronRight, Save, Play, Loader2, X, Clock, History, GitCommit, Mail, Menu } from 'lucide-react'

import { LeftSidebar } from '../components/LeftSidebar'
import { useMobileSidebar } from '../hooks/useMobileSidebar'
import { NodePalette } from '../components/NodePalette'
import { NodeConfigPanel } from '../components/NodeConfigPanel'
import { VersionsModal } from '../components/VersionsModal'
import { InputNode } from '../components/nodes/InputNode'
import { PdfToImagesNode } from '../components/nodes/PdfToImagesNode'
import { OutputNode } from '../components/nodes/OutputNode'
import { ValidateDocumentsNode } from '../components/nodes/ValidateDocumentsNode'
import { ShowResultsNode } from '../components/nodes/ShowResultsNode'
import { EmailInputNode } from '../components/nodes/EmailInputNode'
import { AiNode } from '../components/nodes/AiNode'
import { SendEmailNode } from '../components/nodes/SendEmailNode'
import { ConditionNode } from '../components/nodes/ConditionNode'
import { CompletenessGateNode } from '../components/nodes/CompletenessGateNode'
import { useWorkflow, useUpdateWorkflow } from '../api/workflows'
import { useTriggerRun, useUploadDocument, useDocuments } from '../api/runs'
import { useRunContext } from '../context/run'
import { useI18n } from '../context/i18n'
import type { Document } from '../types/workflow'

const NODE_TYPES = { input: InputNode, pdf_to_images: PdfToImagesNode, output: OutputNode, validate_documents: ValidateDocumentsNode, show_results: ShowResultsNode, email_input: EmailInputNode, ai: AiNode, send_email: SendEmailNode, condition: ConditionNode, completeness_gate: CompletenessGateNode }

let _id = 1
const uid = () => `n_${Date.now()}_${_id++}`

export function WorkflowEditor() {
  const { id } = useParams<{ id: string }>()
  const workflowId = Number(id)
  const { sidebarOpen, openSidebar, closeSidebar } = useMobileSidebar()
  const navigate = useNavigate()
  const { t } = useI18n()

  const { data: workflow, isLoading } = useWorkflow(workflowId)
  const updateWf = useUpdateWorkflow()
  const triggerRun = useTriggerRun()
  const uploadDoc = useUploadDocument()
  const { data: documents } = useDocuments()

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)
  const { setActiveRunId } = useRunContext()
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [showRunModal, setShowRunModal] = useState(false)
  const [showVersions, setShowVersions] = useState(false)
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (workflow) {
      setNodes(workflow.definition.nodes as Node[])
      setEdges(workflow.definition.edges as Edge[])
    }
  }, [workflow])

  const onConnect = useCallback((p: Connection) => {
    setEdges(eds => { setDirty(true); return addEdge({ ...p, type: 'smoothstep' }, eds) })
  }, [setEdges])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/reactflow')
    if (!type || !rfInstance || !wrapperRef.current) return
    const b = wrapperRef.current.getBoundingClientRect()
    const position = rfInstance.screenToFlowPosition({ x: e.clientX - b.left, y: e.clientY - b.top })
    // Sensible per-type defaults so a freshly dropped node already works + its
    // card matches what the engine will do.
    const data: Record<string, unknown> =
      type === 'condition' ? { mode: 'verdict', field: 'overall', op: 'eq', value: 'fail' }
      : type === 'completeness_gate' ? { required_doc_types: [], required_doc_type_names: [], timeout_days: 7 }
      : { label: type }
    setNodes(nds => [...nds, { id: uid(), type, position, data }])
    setDirty(true)
  }, [rfInstance, setNodes])

  function handleNodeClick(_: React.MouseEvent, node: Node) {
    setSelectedNodeId(node.id)
  }

  function handlePaneClick() {
    setSelectedNodeId(null)
  }

  function handleNodeDataUpdate(nodeId: string, data: Record<string, unknown>) {
    setNodes(nds => nds.map(n => n.id === nodeId ? { ...n, data } : n))
    setDirty(true)
  }

  const selectedNode = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) ?? null : null

  async function save() {
    setSaveState('saving')
    await updateWf.mutateAsync({ id: workflowId, definition: { nodes: nodes as any, edges: edges as any } })
    setDirty(false)
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 2000)
  }

  // When a version is restored, reload the canvas from the refetched workflow
  function handleRestored() {
    // useWorkflow will refetch via query invalidation; the useEffect above will sync nodes/edges
    setDirty(false)
  }

  async function run() {
    if (!selectedDocId) return
    const r = await triggerRun.mutateAsync({ workflow_id: workflowId, document_id: selectedDocId })
    setActiveRunId(r.id)
    setShowRunModal(false)
  }


  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--c-bg)]">
        <Loader2 size={18} className="animate-spin text-[var(--c-text-5)]" />
      </div>
    )
  }

  const versionNum = workflow?.current_version_num ?? 0

  return (
    <div className="flex h-full w-full overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={closeSidebar} />
      )}
      <div className={['fixed inset-y-0 left-0 z-50 md:relative md:z-auto md:flex md:shrink-0', sidebarOpen ? 'flex' : 'hidden'].join(' ')}>
        <LeftSidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[var(--c-border)] bg-[var(--c-bg)] px-4">
          <button
            className="rounded-md p-1.5 text-[var(--c-text-4)] hover:bg-[var(--c-hover-2)] hover:text-[var(--c-text-2)] md:hidden"
            onClick={openSidebar}
          >
            <Menu size={16} />
          </button>
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-[13px]">
            <Link to="/workflows" className="text-[var(--c-text-4)] hover:text-[var(--c-text-3)] transition-colors">{t('editor.breadcrumb.workflows')}</Link>
            <ChevronRight size={13} className="text-[var(--c-text-5)]" />
            <span className="font-medium text-[var(--c-text-1)]">{workflow?.name}</span>
          </nav>

          {/* Version badge */}
          {versionNum > 0 && (
            <span className="flex items-center gap-1 rounded bg-[var(--c-surface-3)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--c-text-5)]">
              <GitCommit size={9} />
              v{versionNum}
            </span>
          )}

          {/* Email inbox address */}
          {workflow?.email_inbox_enabled && workflow.email_address && (
            <button
              onClick={() => { navigator.clipboard.writeText(workflow.email_address!) }}
              title={t('workflows.inbox.copyAddress')}
              className="flex items-center gap-1 rounded bg-indigo-500/10 px-1.5 py-0.5 font-mono text-[10px] text-indigo-400 ring-1 ring-indigo-500/20 transition-colors hover:bg-indigo-500/20"
            >
              <Mail size={10} />
              <span className="max-w-[220px] truncate">{workflow.email_address}</span>
            </button>
          )}

          {/* Unsaved indicator */}
          {dirty && <div className="h-1.5 w-1.5 rounded-full bg-amber-400/80" title={t('editor.unsaved')} />}

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => navigate(`/workflows/${workflowId}/runs`)}
              className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[12px] text-[var(--c-text-4)] transition-colors hover:text-[var(--c-text-2)] hover:bg-[var(--c-hover-3)]"
            >
              <History size={13} /> {t('editor.btn.runs')}
            </button>

            <button
              onClick={() => setShowVersions(true)}
              className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[12px] text-[var(--c-text-4)] transition-colors hover:text-[var(--c-text-2)] hover:bg-[var(--c-hover-3)]"
            >
              <GitCommit size={13} /> {t('editor.btn.versions')}
            </button>

            <div className="h-4 w-px bg-[var(--c-border)]" />

            <button
              onClick={save}
              disabled={updateWf.isPending}
              className="flex h-7 items-center gap-1.5 rounded border border-[var(--c-border-2)] px-3 text-[12px] font-medium text-[var(--c-text-3)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-2)] disabled:opacity-40"
            >
              {saveState === 'saving'
                ? <Loader2 size={11} className="animate-spin" />
                : saveState === 'saved'
                ? <span className="text-emerald-400 text-[11px]">✓</span>
                : <Save size={11} />}
              {saveState === 'saved' ? t('editor.btn.saved') : t('btn.save')}
            </button>

            <button
              onClick={() => setShowRunModal(true)}
              className="flex h-7 items-center gap-1.5 rounded bg-indigo-600 px-3 text-[12px] font-medium text-white transition-colors hover:bg-indigo-500"
            >
              <Play size={11} strokeWidth={2.5} /> {t('btn.run')}
            </button>
          </div>
        </header>

        {/* Canvas + right panel */}
        <div className="flex flex-1 overflow-hidden">
          <div ref={wrapperRef} className="flex-1 overflow-hidden">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={c => { onNodesChange(c); setDirty(true) }}
              onEdgesChange={c => { onEdgesChange(c); setDirty(true) }}
              onConnect={onConnect}
              onInit={setRfInstance}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeClick={handleNodeClick}
              onPaneClick={handlePaneClick}
              nodeTypes={NODE_TYPES}
              fitView
              proOptions={{ hideAttribution: true }}
              style={{ background: 'var(--c-bg)' }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--c-rf-dot)" />
              <Controls showInteractive={false} />
              <MiniMap
                nodeColor={n =>
                  n.type === 'input' ? '#6366f1'
                  : n.type === 'output' ? '#10b981'
                  : '#f59e0b'
                }
                maskColor="var(--c-rf-mask)"
                style={{ background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}
              />
            </ReactFlow>
          </div>

          {selectedNode
            ? <NodeConfigPanel
                node={selectedNode}
                nodes={nodes}
                edges={edges}
                onUpdate={handleNodeDataUpdate}
                onClose={() => setSelectedNodeId(null)}
              />
            : <NodePalette />
          }
        </div>

      </div>

      {/* Versions modal */}
      {showVersions && workflow && (
        <VersionsModal
          workflowId={workflowId}
          currentVersionNum={versionNum}
          onClose={() => setShowVersions(false)}
          onRestored={handleRestored}
        />
      )}

      {/* Run modal */}
      {showRunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[400px] rounded-xl border border-[var(--c-border-2)] bg-[var(--c-surface)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--c-border)] px-5 py-4">
              <div>
                <p className="text-[14px] font-semibold text-[var(--c-text-1)]">{t('editor.run.title')}</p>
                <p className="mt-0.5 text-[12px] text-[var(--c-text-4)]">
                  {t('editor.run.subtitle', { version: `v${versionNum}` })}
                </p>
              </div>
              <button
                onClick={() => setShowRunModal(false)}
                className="rounded p-1 text-[var(--c-text-5)] hover:text-[var(--c-text-3)] transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-3 p-5">
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-[var(--c-border-2)] py-6 text-[var(--c-text-5)] transition-colors hover:border-[var(--c-border-3)] hover:text-[var(--c-text-4)]">
                <input
                  type="file" className="hidden" accept=".pdf"
                  onChange={e => e.target.files?.[0] && uploadDoc.mutateAsync(e.target.files[0]).then(d => setSelectedDocId(d.id))}
                />
                {uploadDoc.isPending
                  ? <><Loader2 size={16} className="animate-spin text-indigo-400" /><span className="text-[12px]">{t('btn.uploading')}</span></>
                  : <><span className="text-[12px] font-medium">{t('editor.run.dropPrompt')}</span><span className="text-[11px] text-[var(--c-text-5)]">{t('editor.run.sizeHint')}</span></>
                }
              </label>

              {documents && documents.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-medium text-[var(--c-text-5)]">{t('editor.run.orChooseExisting')}</p>
                  <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                    {documents.map((doc: Document) => (
                      <button
                        key={doc.id}
                        onClick={() => setSelectedDocId(doc.id)}
                        className={[
                          'flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-[12px] transition-colors',
                          selectedDocId === doc.id
                            ? 'bg-indigo-600/15 text-[var(--c-text-2)] ring-1 ring-indigo-500/30'
                            : 'bg-[var(--c-surface-2)] text-[var(--c-text-3)] hover:bg-[var(--c-surface)] hover:text-[var(--c-text-2)]',
                        ].join(' ')}
                      >
                        <Clock size={11} className="shrink-0 text-[var(--c-text-5)]" />
                        <span className="flex-1 truncate">{doc.original_filename}</span>
                        {doc.size_bytes && (
                          <span className="shrink-0 text-[10px] text-[var(--c-text-5)]">
                            {(doc.size_bytes / 1024).toFixed(0)} KB
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={run}
                disabled={!selectedDocId || triggerRun.isPending}
                className="w-full rounded-lg bg-indigo-600 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-500 disabled:opacity-40"
              >
                {triggerRun.isPending
                  ? <span className="flex items-center justify-center gap-2"><Loader2 size={13} className="animate-spin" /> {t('editor.run.starting')}</span>
                  : t('editor.run.submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

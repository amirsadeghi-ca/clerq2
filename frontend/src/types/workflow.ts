export interface WorkflowDefinition {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export interface FlowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export interface FlowEdge {
  id: string
  source: string
  target: string
}

export interface Workflow {
  id: number
  name: string
  description: string | null
  definition: WorkflowDefinition
  is_archived: boolean
  is_favorite: boolean
  email_inbox_enabled: boolean
  email_address: string | null
  current_version_num: number
  created_at: string
  updated_at: string
}

export interface WorkflowVersion {
  id: number
  workflow_id: number
  version_num: number
  definition: WorkflowDefinition
  node_count: number
  created_at: string
}

export interface Document {
  id: number
  filename: string
  original_filename: string
  file_path: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed'
export type RunStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface RunStep {
  id: number
  node_id: string
  node_type: string
  status: StepStatus
  input_data: Record<string, unknown> | null
  output_data: Record<string, unknown> | null
  error: string | null
  started_at: string | null
  completed_at: string | null
  logs?: string[]
}

export interface Run {
  id: number
  workflow_id: number | null
  document_id: number
  document_ids: number[]
  version_id: number | null
  version_num: number | null
  name: string | null
  source: string | null
  policy_id: number | null
  sender_email: string | null
  status: RunStatus
  started_at: string | null
  completed_at: string | null
  error: string | null
  created_at: string
  steps: RunStep[]
}

export interface SSERunUpdate {
  run_id: number
  status: RunStatus
  error: string | null
  steps: RunStep[]
}

export interface DocumentTypeSample {
  id: number
  document_type_id: number
  filename: string
  original_filename: string
  file_path: string
  created_at: string
}

export interface DocumentType {
  id: number
  name: string
  description: string | null
  ai_instructions: string | null
  created_at: string
  updated_at: string
  samples: DocumentTypeSample[]
}

export interface PolicyRule {
  id: number
  policy_id: number
  position: number
  name: string
  requirement: 'required' | 'optional'
  scope: 'per_document' | 'cross_set'
  accept_criteria: string | null
  fail_criteria: string | null
  ai_instructions: string | null
  document_type_id: number | null
  confidence_threshold: number
  document_type: DocumentType | null
}

export interface PolicyVersion {
  id: number
  policy_id: number
  version_num: number
  snapshot: Record<string, unknown>
  rule_count: number
  created_at: string
}

export interface Policy {
  id: number
  name: string
  description: string | null
  brief: string
  email_inbox_enabled: boolean
  email_address: string | null
  email_reply_mode: string
  email_pass_message: string | null
  email_fail_message: string | null
  current_version_num: number
  created_at: string
  updated_at: string
  rules: PolicyRule[]
}

export interface Mailbox {
  type: 'policy' | 'workflow'
  id: number
  name: string
  email_address: string
  rule_count?: number
}

export interface MailMessage {
  id: number
  run_id: number | null
  document_id: number | null
  direction: 'inbound' | 'outbound'
  from_addr: string
  to_addr: string
  subject: string | null
  body: string | null
  created_at: string
}

export interface PerDocumentResult {
  document_id: number | null
  document_filename: string
  status: 'pass' | 'fail' | 'uncertain'
  confidence: number
  evidence: string
}

export interface ValidationRuleResult {
  rule_name: string
  requirement: string
  scope?: 'per_document' | 'cross_set'
  status: 'pass' | 'fail' | 'uncertain'
  confidence: number
  evidence: string
  extracted: Record<string, unknown>
  per_document?: PerDocumentResult[]
}

export interface ValidationOutput {
  policy_id: number
  policy_name: string
  policy_version_num: number | null
  overall: 'pass' | 'fail' | 'needs_review'
  results: ValidationRuleResult[]
}

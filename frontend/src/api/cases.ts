import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from './client'

export interface CaseListItem {
  id: number
  name: string | null
  status: string
  target_kind: string | null
  target_name: string | null
  policy_id: number | null
  workflow_id: number | null
  contact_email: string | null
  contact_name: string | null
  external_ref: string | null
  last_result: { kind: string; overall?: string; policy_name?: string; status?: string } | null
  checklist_progress: string | null
  doc_count: number
  unread: boolean
  last_activity_at: string | null
  created_at: string | null
}

export interface ChecklistItem {
  document_type: { id: number; name: string }
  required: boolean
  status: 'satisfied' | 'partial' | 'missing'
}

export interface TimelineEvent {
  kind: 'email' | 'run'
  id: number
  created_at: string | null
  // email
  direction?: string
  from_addr?: string
  to_addr?: string
  subject?: string | null
  body?: string | null
  document_id?: number | null
  run_id?: number | null
  // run
  name?: string | null
  status?: string
  source?: string | null
  policy_id?: number | null
  version_num?: number | null
  steps?: Array<{ id: number; node_type: string; status: string; output_data: Record<string, unknown> | null; started_at: string | null; completed_at: string | null }>
  last_result?: { kind: string; overall?: string; policy_name?: string } | null
  review?: Record<string, unknown> | null
  completed_at?: string | null
}

export interface CaseDocument {
  id: number
  original_filename: string
  mime_type: string | null
  size_bytes: number | null
  source: string
  added_at: string | null
}

export interface CaseDetail extends CaseListItem {
  checklist: ChecklistItem[]
  timeline: TimelineEvent[]
  documents: CaseDocument[]
  email_token: string | null
  closed_at: string | null
}

export function useCases(params?: { view?: string; status?: string; target?: string; q?: string }) {
  return useQuery<CaseListItem[]>({
    queryKey: ['cases', params],
    queryFn: () => client.get('/cases/', { params }).then(r => r.data),
    refetchInterval: 5000,
  })
}

export function useCase(id: number | null) {
  return useQuery<CaseDetail>({
    queryKey: ['cases', id],
    queryFn: () => client.get(`/cases/${id}`).then(r => r.data),
    enabled: id !== null,
    refetchInterval: (q) => {
      // Refetch while a run is in progress
      const data = q.state.data
      if (data?.timeline?.some(e => e.kind === 'run' && (e.status === 'pending' || e.status === 'running'))) {
        return 2000
      }
      return 10000
    },
  })
}

export function useCreateCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      name?: string
      target_kind?: string
      policy_id?: number
      workflow_id?: number
      contact_email?: string
      contact_name?: string
      external_ref?: string
    }) => client.post<CaseDetail>('/cases/', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cases'] })
    },
  })
}

export function useUpdateCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: number
      name?: string
      status?: string
      contact_email?: string
      contact_name?: string
      external_ref?: string
    }) => client.patch<CaseDetail>(`/cases/${id}`, data).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['cases', data.id] })
      qc.invalidateQueries({ queryKey: ['cases'] })
    },
  })
}

export function useAttachDocuments() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ caseId, documentIds }: { caseId: number; documentIds: number[] }) =>
      client.post<CaseDetail>(`/cases/${caseId}/documents`, { document_ids: documentIds }).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['cases', data.id] })
    },
  })
}

export function useRunCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ caseId, policyId, workflowId }: { caseId: number; policyId?: number; workflowId?: number }) =>
      client.post(`/cases/${caseId}/run`, { policy_id: policyId, workflow_id: workflowId }).then(r => r.data),
    onSuccess: (_data, { caseId }) => {
      qc.invalidateQueries({ queryKey: ['cases', caseId] })
      qc.invalidateQueries({ queryKey: ['cases'] })
    },
  })
}

export function useReplyCase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ caseId, body, subject }: { caseId: number; body: string; subject?: string }) =>
      client.post(`/cases/${caseId}/reply`, { body, subject }).then(r => r.data),
    onSuccess: (_data, { caseId }) => {
      qc.invalidateQueries({ queryKey: ['cases', caseId] })
    },
  })
}

export function useAddNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ caseId, body }: { caseId: number; body: string }) =>
      client.post(`/cases/${caseId}/notes`, { body }).then(r => r.data),
    onSuccess: (_data, { caseId }) => {
      qc.invalidateQueries({ queryKey: ['cases', caseId] })
    },
  })
}

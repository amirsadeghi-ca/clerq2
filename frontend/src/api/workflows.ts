import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Workflow, WorkflowDefinition, WorkflowVersion } from '../types/workflow'
import client from './client'

export function useWorkflows(includeArchived = false) {
  return useQuery<Workflow[]>({
    queryKey: ['workflows', { includeArchived }],
    queryFn: () =>
      client.get('/workflows/', { params: includeArchived ? { include_archived: true } : {} })
        .then(r => r.data),
  })
}

export function useWorkflow(id: number | null) {
  return useQuery<Workflow>({
    queryKey: ['workflows', id],
    queryFn: () => client.get(`/workflows/${id}`).then(r => r.data),
    enabled: id !== null,
  })
}

export function useWorkflowVersions(workflowId: number | null) {
  return useQuery<WorkflowVersion[]>({
    queryKey: ['workflows', workflowId, 'versions'],
    queryFn: () => client.get(`/workflows/${workflowId}/versions`).then(r => r.data),
    enabled: workflowId !== null,
  })
}

export function useCreateWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      client.post<Workflow>('/workflows/', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  })
}

export function useUpdateWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; definition?: WorkflowDefinition }) =>
      client.put<Workflow>(`/workflows/${id}`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      qc.invalidateQueries({ queryKey: ['workflows', vars.id] })
      qc.invalidateQueries({ queryKey: ['workflows', vars.id, 'versions'] })
    },
  })
}

export function useArchiveWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => client.post<Workflow>(`/workflows/${id}/archive`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  })
}

export function useUnarchiveWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => client.post<Workflow>(`/workflows/${id}/unarchive`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  })
}

export function useFavoriteWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => client.post<Workflow>(`/workflows/${id}/favorite`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  })
}

export function useUnfavoriteWorkflow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => client.post<Workflow>(`/workflows/${id}/unfavorite`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  })
}

export function useEnableWorkflowInbox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => client.post<Workflow>(`/workflows/${id}/enable-inbox`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      qc.invalidateQueries({ queryKey: ['mail', 'mailboxes'] })
    },
  })
}

export function useDisableWorkflowInbox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => client.post<Workflow>(`/workflows/${id}/disable-inbox`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      qc.invalidateQueries({ queryKey: ['mail', 'mailboxes'] })
    },
  })
}

export function useSetWorkflowInboxAddress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, localPart }: { id: number; localPart: string }) =>
      client.put<Workflow>(`/workflows/${id}/inbox-address`, { local_part: localPart }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      qc.invalidateQueries({ queryKey: ['mail', 'mailboxes'] })
    },
  })
}

export function useRestoreVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ workflowId, versionId }: { workflowId: number; versionId: number }) =>
      client.post<Workflow>(`/workflows/${workflowId}/versions/${versionId}/restore`).then(r => r.data),
    onSuccess: (wf) => {
      qc.invalidateQueries({ queryKey: ['workflows'] })
      qc.invalidateQueries({ queryKey: ['workflows', wf.id] })
      qc.invalidateQueries({ queryKey: ['workflows', wf.id, 'versions'] })
    },
  })
}

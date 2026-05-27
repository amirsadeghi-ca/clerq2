import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Document, Run } from '../types/workflow'
import client from './client'

export function useRuns(workflowId?: number) {
  return useQuery<Run[]>({
    queryKey: ['runs', workflowId],
    queryFn: () =>
      client.get('/runs/', { params: workflowId ? { workflow_id: workflowId } : {} }).then(r => r.data),
  })
}

export function useRun(id: number | null) {
  return useQuery<Run>({
    queryKey: ['runs', 'detail', id],
    queryFn: () => client.get(`/runs/${id}`).then(r => r.data),
    enabled: id !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'pending' || status === 'running' ? 1000 : false
    },
  })
}

export function useTriggerRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { workflow_id: number; document_id: number }) =>
      client.post<Run>('/runs/', data).then(r => r.data),
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ['runs'] })
      qc.invalidateQueries({ queryKey: ['runs', run.workflow_id] })
    },
  })
}

export function useDocuments() {
  return useQuery<Document[]>({
    queryKey: ['documents'],
    queryFn: () => client.get('/documents/').then(r => r.data),
  })
}

export function useCancelRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: number) =>
      client.post<Run>(`/runs/${runId}/cancel`).then(r => r.data),
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ['runs', 'detail', run.id] })
      qc.invalidateQueries({ queryKey: ['runs'] })
    },
  })
}

export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return client.post<Document>('/documents/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
  })
}

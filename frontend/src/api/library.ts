import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from './client'
import type { DocumentType, DocumentTypeSample } from '../types/workflow'

export function useDocumentTypes() {
  return useQuery<DocumentType[]>({
    queryKey: ['documentTypes'],
    queryFn: () => client.get('/library/').then(r => r.data),
  })
}

export function useDocumentType(id: number | null) {
  return useQuery<DocumentType>({
    queryKey: ['documentTypes', id],
    queryFn: () => client.get(`/library/${id}`).then(r => r.data),
    enabled: id !== null,
  })
}

export function useCreateDocumentType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description?: string; ai_instructions?: string }) =>
      client.post('/library/', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documentTypes'] }),
  })
}

export function useUpdateDocumentType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; description?: string; ai_instructions?: string }) =>
      client.put(`/library/${id}`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['documentTypes'] })
      qc.invalidateQueries({ queryKey: ['documentTypes', vars.id] })
    },
  })
}

export function useDeleteDocumentType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => client.delete(`/library/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['documentTypes'] }),
  })
}

export function useUploadSample() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ docTypeId, file }: { docTypeId: number; file: File }) => {
      const fd = new FormData()
      fd.append('file', file)
      return client.post<DocumentTypeSample>(`/library/${docTypeId}/samples`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }).then(r => r.data)
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['documentTypes', vars.docTypeId] })
      qc.invalidateQueries({ queryKey: ['documentTypes'] })
    },
  })
}

export function useDeleteSample() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ docTypeId, sampleId }: { docTypeId: number; sampleId: number }) =>
      client.delete(`/library/${docTypeId}/samples/${sampleId}`),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['documentTypes', vars.docTypeId] })
      qc.invalidateQueries({ queryKey: ['documentTypes'] })
    },
  })
}

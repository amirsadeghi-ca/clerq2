import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ReferenceList } from '../types/workflow'
import client from './client'

export function useReferenceLists() {
  return useQuery<ReferenceList[]>({
    queryKey: ['reference-lists'],
    queryFn: () => client.get('/reference-lists/').then(r => r.data),
  })
}

export function useCreateReferenceList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description?: string | null; items?: string[] }) =>
      client.post<ReferenceList>('/reference-lists/', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reference-lists'] }),
  })
}

export function useUpdateReferenceList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; description?: string | null; items?: string[] }) =>
      client.put<ReferenceList>(`/reference-lists/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reference-lists'] }),
  })
}

export function useDeleteReferenceList() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => client.delete(`/reference-lists/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reference-lists'] }),
  })
}

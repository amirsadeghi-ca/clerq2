import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Run } from '../types/workflow'
import client from './client'

export function useValidateRuns(policyId?: number) {
  return useQuery<Run[]>({
    queryKey: ['validate-runs', policyId ?? null],
    queryFn: () =>
      client.get('/validate/runs', { params: policyId ? { policy_id: policyId } : {} }).then(r => r.data),
    refetchInterval: 3000,
  })
}

export function useTriggerValidateRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { policy_id: number; document_id?: number; document_ids?: number[] }) =>
      client.post<Run>('/validate/run', data).then(r => r.data),
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ['validate-runs'] })
      qc.invalidateQueries({ queryKey: ['validate-runs', run.policy_id] })
    },
  })
}

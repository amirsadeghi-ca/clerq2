import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from './client'
import type { Policy, PolicyRule, PolicyVersion } from '../types/workflow'

export function usePolicies() {
  return useQuery<Policy[]>({
    queryKey: ['policies'],
    queryFn: () => client.get('/policies/').then(r => r.data),
  })
}

export function usePolicy(id: number | null) {
  return useQuery<Policy>({
    queryKey: ['policies', id],
    queryFn: () => client.get(`/policies/${id}`).then(r => r.data),
    enabled: id !== null,
  })
}

export function usePolicyVersions(id: number | null) {
  return useQuery<PolicyVersion[]>({
    queryKey: ['policies', id, 'versions'],
    queryFn: () => client.get(`/policies/${id}/versions`).then(r => r.data),
    enabled: id !== null,
  })
}

export function useCreatePolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; description?: string; brief?: string }) =>
      client.post<Policy>('/policies/', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies'] }),
  })
}

export function useUpdatePolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: number; name?: string; description?: string; brief?: string;
      email_reply_mode?: string; email_pass_message?: string | null; email_fail_message?: string | null;
    }) => client.put<Policy>(`/policies/${id}`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['policies'] })
      qc.invalidateQueries({ queryKey: ['policies', vars.id] })
    },
  })
}

export function useDeletePolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => client.delete(`/policies/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['policies'] }),
  })
}

export function useRestorePolicyVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ policyId, versionId }: { policyId: number; versionId: number }) =>
      client.post<Policy>(`/policies/${policyId}/versions/${versionId}/restore`).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['policies'] })
      qc.invalidateQueries({ queryKey: ['policies', vars.policyId] })
      qc.invalidateQueries({ queryKey: ['policies', vars.policyId, 'versions'] })
    },
  })
}

export function useCreateRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ policyId, ...data }: {
      policyId: number; name: string; requirement?: string;
      accept_criteria?: string | null; fail_criteria?: string | null;
      ai_instructions?: string | null;
      document_type_id?: number | null; confidence_threshold?: number
    }) => client.post<PolicyRule>(`/policies/${policyId}/rules`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['policies', vars.policyId] })
      qc.invalidateQueries({ queryKey: ['policies', vars.policyId, 'versions'] })
      qc.invalidateQueries({ queryKey: ['policies'] })
    },
  })
}

export function useUpdateRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ policyId, ruleId, ...data }: {
      policyId: number; ruleId: number; name?: string; requirement?: string;
      accept_criteria?: string | null; fail_criteria?: string | null;
      ai_instructions?: string | null;
      document_type_id?: number | null; confidence_threshold?: number
    }) => client.put<PolicyRule>(`/policies/${policyId}/rules/${ruleId}`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['policies', vars.policyId] })
    },
  })
}

export function useDeleteRule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ policyId, ruleId }: { policyId: number; ruleId: number }) =>
      client.delete(`/policies/${policyId}/rules/${ruleId}`),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['policies', vars.policyId] })
      qc.invalidateQueries({ queryKey: ['policies', vars.policyId, 'versions'] })
      qc.invalidateQueries({ queryKey: ['policies'] })
    },
  })
}

export function useEnablePolicyInbox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => client.post<Policy>(`/policies/${id}/enable-inbox`).then(r => r.data),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['policies'] })
      qc.invalidateQueries({ queryKey: ['policies', id] })
      qc.invalidateQueries({ queryKey: ['mail', 'mailboxes'] })
    },
  })
}

export function useDisablePolicyInbox() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => client.post<Policy>(`/policies/${id}/disable-inbox`).then(r => r.data),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['policies'] })
      qc.invalidateQueries({ queryKey: ['policies', id] })
      qc.invalidateQueries({ queryKey: ['mail', 'mailboxes'] })
    },
  })
}

export function useReorderRules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ policyId, ruleIds }: { policyId: number; ruleIds: number[] }) =>
      client.patch<Policy>(`/policies/${policyId}/rules/reorder`, { rule_ids: ruleIds }).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['policies', vars.policyId] })
      qc.invalidateQueries({ queryKey: ['policies', vars.policyId, 'versions'] })
    },
  })
}

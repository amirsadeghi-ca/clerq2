import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import client from './client'

export interface Integrations {
  resend_api_key_set: boolean
  resend_inbound_webhook_secret_set: boolean
  mail_inbound_domain: string
  invite_from_address: string
  invite_from_name: string
  webhook_url: string
  inbound_mx_value: string
  inbound_mx_priority: number
}

export interface IntegrationsUpdate {
  resend_api_key?: string | null
  resend_inbound_webhook_secret?: string | null
  mail_inbound_domain?: string | null
  invite_from_address?: string | null
  invite_from_name?: string | null
  clear_resend_api_key?: boolean
  clear_resend_inbound_webhook_secret?: boolean
}

export interface IntegrationTestResult {
  ok: boolean
  error?: string | null
  detail?: string | null
}

const key = ['admin', 'integrations']

export function useIntegrations() {
  return useQuery<Integrations>({
    queryKey: key,
    queryFn: async () => (await client.get<Integrations>('/admin/integrations')).data,
  })
}

export function useUpdateIntegrations() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: IntegrationsUpdate) =>
      (await client.put<Integrations>('/admin/integrations', body)).data,
    onSuccess: (data) => qc.setQueryData(key, data),
  })
}

export function useTestEmailIntegration() {
  return useMutation({
    mutationFn: async () =>
      (await client.post<IntegrationTestResult>('/admin/integrations/email/test')).data,
  })
}

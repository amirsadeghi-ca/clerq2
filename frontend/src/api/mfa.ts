import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import client from './client'

export interface MfaMethod {
  id: number
  type: string
  label: string | null
  is_confirmed: boolean
  created_at: string
  last_used_at: string | null
}

export interface EnrollTotpResponse {
  credential_id: number
  provisioning_uri: string
  secret: string
}

export interface ConfirmTotpResponse {
  recovery_codes: string[]
}

export function useMfaMethods() {
  return useQuery<MfaMethod[]>({
    queryKey: ['mfa', 'methods'],
    queryFn: async () => (await client.get('/auth/mfa')).data,
  })
}

export function useEnrollTotp() {
  return useMutation<EnrollTotpResponse, unknown, { label?: string }>({
    mutationFn: async (body) => (await client.post('/auth/mfa/totp/enroll', body)).data,
  })
}

export function useConfirmTotp() {
  const qc = useQueryClient()
  return useMutation<ConfirmTotpResponse, unknown, { credential_id: number; code: string }>({
    mutationFn: async (body) => (await client.post('/auth/mfa/totp/confirm', body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mfa', 'methods'] })
      // Refresh /auth/me so mfa_enrolled updates in the sidebar / header.
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useRemoveMfa() {
  const qc = useQueryClient()
  return useMutation<void, unknown, { credential_id: number; current_password?: string; totp_code?: string }>({
    mutationFn: async ({ credential_id, ...body }) => {
      await client.delete(`/auth/mfa/${credential_id}`, { data: body })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mfa', 'methods'] })
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useRegenerateRecoveryCodes() {
  return useMutation<{ recovery_codes: string[] }, unknown, { totp_code: string }>({
    mutationFn: async (body) =>
      (await client.post('/auth/mfa/recovery-codes/regenerate', body)).data,
  })
}

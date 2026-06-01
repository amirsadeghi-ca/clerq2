import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import client from './client'
import type { AdminUser, AdminUserUpdate } from './admin'

export interface PermissionDef { key: string; label: string; category: string }

export interface TenantSelf {
  tenant: { id: number; name: string; slug: string; is_active: boolean }
  my_permissions: string[]
}

export interface Invite {
  id: number
  tenant_id: number
  email: string
  role: string
  invited_by_user_id: number | null
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
  created_at: string | null
  invite_url: string | null
}

export interface InviteCreate { email: string; role?: string }

export function useTenantSelf() {
  return useQuery<TenantSelf>({
    queryKey: ['tenant', 'self'],
    queryFn: async () => (await client.get<TenantSelf>('/tenant')).data,
  })
}

export function useTenantPermissions() {
  return useQuery<{ permissions: PermissionDef[] }>({
    queryKey: ['tenant', 'permissions'],
    queryFn: async () => (await client.get('/tenant/permissions')).data,
  })
}

export function useTenantRolePermissions() {
  return useQuery<Record<string, string[]>>({
    queryKey: ['tenant', 'role-permissions'],
    queryFn: async () => (await client.get('/tenant/role-permissions')).data,
  })
}

export function useSetTenantRolePermissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ role, permission_keys }: { role: string; permission_keys: string[] }) =>
      (await client.put(`/tenant/role-permissions/${role}`, { permission_keys })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant', 'role-permissions'] }) },
  })
}

export function useTenantUsers() {
  return useQuery<AdminUser[]>({
    queryKey: ['tenant', 'users'],
    queryFn: async () => (await client.get<AdminUser[]>('/tenant/users')).data,
  })
}

export function useUpdateTenantUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: AdminUserUpdate }) =>
      (await client.put<AdminUser>(`/tenant/users/${id}`, body)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant', 'users'] }) },
  })
}

export function useSetTenantUserPassword() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, password }: { id: number; password: string }) =>
      (await client.post<AdminUser>(`/tenant/users/${id}/set-password`, { new_password: password })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant', 'users'] }) },
  })
}

// Invites
export function useInvites() {
  return useQuery<Invite[]>({
    queryKey: ['tenant', 'invites'],
    queryFn: async () => (await client.get<Invite[]>('/tenant/invites')).data,
  })
}
export function useCreateInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: InviteCreate) => (await client.post<Invite>('/tenant/invites', body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant', 'invites'] })
      qc.invalidateQueries({ queryKey: ['tenant', 'users'] })
    },
  })
}
export function useRevokeInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => (await client.post<Invite>(`/tenant/invites/${id}/revoke`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant', 'invites'] }) },
  })
}
export function useResendInvite() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => (await client.post<Invite>(`/tenant/invites/${id}/resend`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tenant', 'invites'] }) },
  })
}

// Public invite endpoints (no auth)
export async function lookupInvite(token: string): Promise<{ valid: boolean; email?: string; tenant_name?: string; role?: string; error?: string }> {
  const resp = await client.post('/invites/lookup', { token })
  return resp.data
}
export async function acceptInvite(token: string, password: string, display_name?: string) {
  const resp = await client.post('/invites/accept', { token, password, display_name })
  return resp.data as { access_token: string; refresh_token: string; expires_at: string }
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import client from './client'

export interface AdminTenant {
  id: number
  name: string
  slug: string
  is_active: boolean
  user_count: number
  created_at: string | null
}

export interface AdminUser {
  id: number
  tenant_id: number
  email: string
  display_name: string | null
  role: string
  is_active: boolean
  is_superadmin: boolean
  mfa_required: boolean
  has_password: boolean
  last_login_at: string | null
  created_at: string | null
}

export interface AdminTenantCreate { name: string; slug?: string }
export interface AdminTenantUpdate { name?: string; slug?: string; is_active?: boolean }
export interface AdminUserCreate { email: string; password: string; display_name?: string; role?: string; is_superadmin?: boolean }
export interface AdminUserUpdate { display_name?: string; role?: string; is_active?: boolean; is_superadmin?: boolean; mfa_required?: boolean }

const tenantsKey = ['admin', 'tenants']
const tenantUsersKey = (id: number) => ['admin', 'tenants', id, 'users']

export function useAdminTenants() {
  return useQuery<AdminTenant[]>({
    queryKey: tenantsKey,
    queryFn: async () => (await client.get<AdminTenant[]>('/admin/tenants')).data,
  })
}

export function useAdminTenantUsers(tenantId: number | null) {
  return useQuery<AdminUser[]>({
    queryKey: tenantId ? tenantUsersKey(tenantId) : ['admin', 'tenants', 'none'],
    queryFn: async () => (await client.get<AdminUser[]>(`/admin/tenants/${tenantId}/users`)).data,
    enabled: tenantId !== null,
  })
}

export function useCreateTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: AdminTenantCreate) => (await client.post<AdminTenant>('/admin/tenants', body)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: tenantsKey }) },
  })
}

export function useUpdateTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: AdminTenantUpdate }) =>
      (await client.put<AdminTenant>(`/admin/tenants/${id}`, body)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: tenantsKey }) },
  })
}

export function useCreateUser(tenantId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: AdminUserCreate) =>
      (await client.post<AdminUser>(`/admin/tenants/${tenantId}/users`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tenantUsersKey(tenantId) })
      qc.invalidateQueries({ queryKey: tenantsKey })
    },
  })
}

export function useUpdateUser(tenantId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: AdminUserUpdate }) =>
      (await client.put<AdminUser>(`/admin/users/${id}`, body)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: tenantUsersKey(tenantId) }) },
  })
}

export function useSetUserPassword(tenantId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, password }: { id: number; password: string }) =>
      (await client.post<AdminUser>(`/admin/users/${id}/set-password`, { new_password: password })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: tenantUsersKey(tenantId) }) },
  })
}

export function useDeleteUser(tenantId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (userId: number) => { await client.delete(`/admin/users/${userId}`) },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tenantUsersKey(tenantId) })
      qc.invalidateQueries({ queryKey: tenantsKey })
    },
  })
}

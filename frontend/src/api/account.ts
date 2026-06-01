/** Self-service account endpoints: update display name, change password,
 *  sign out everywhere. The auth context (`useAuth`) handles initial /me load
 *  and storing tokens; these hooks just call the mutations and re-fetch /me
 *  where the context cares. */
import { useMutation } from '@tanstack/react-query'
import client from './client'

export interface UpdateMePayload { display_name?: string }
export interface ChangePasswordPayload { current_password: string; new_password: string }

export function useUpdateMe() {
  return useMutation({
    mutationFn: async (body: UpdateMePayload) => (await client.patch('/auth/me', body)).data,
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (body: ChangePasswordPayload) => {
      await client.post('/auth/change-password', body)
    },
  })
}

export function useLogoutAll() {
  return useMutation({
    mutationFn: async () => { await client.post('/auth/logout-all') },
  })
}

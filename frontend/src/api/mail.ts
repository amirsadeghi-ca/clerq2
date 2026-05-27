import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Mailbox, MailMessage, Run } from '../types/workflow'
import client from './client'

export function useMailboxes() {
  return useQuery<Mailbox[]>({
    queryKey: ['mail', 'mailboxes'],
    queryFn: () => client.get('/mail/mailboxes').then(r => r.data),
  })
}

export function useMailMessages() {
  return useQuery<MailMessage[]>({
    queryKey: ['mail', 'messages'],
    queryFn: () => client.get('/mail/messages').then(r => r.data),
    refetchInterval: 5000,
  })
}

export function useSendMail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: {
      to: string
      from_email: string
      subject?: string
      body?: string
      document_id?: number
    }) => client.post<Run>('/mail/inbound', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mail', 'messages'] })
      qc.invalidateQueries({ queryKey: ['runs'] })
      qc.invalidateQueries({ queryKey: ['validate-runs'] })
    },
  })
}

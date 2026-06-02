import { useQuery } from '@tanstack/react-query'
import client from './client'

export interface ReadinessCheck {
  ok: boolean
  reason?: string
  warning_only?: boolean
}

export interface ReadinessResult {
  ok: boolean
  checks: {
    database: ReadinessCheck
    redis: ReadinessCheck
    openrouter: ReadinessCheck
    email: ReadinessCheck
    secret_key: ReadinessCheck
  }
}

export function useReadiness(enabled: boolean) {
  return useQuery<ReadinessResult>({
    queryKey: ['health', 'readiness'],
    queryFn: () => client.get('/health/readiness').then(r => r.data),
    enabled,
    staleTime: 60_000,
    retry: false,
  })
}

import { useQuery } from '@tanstack/react-query'
import client from './client'

export interface InsightsTotals {
  dossiers_total: number
  dossiers_processed: number
  documents_processed: number
  nonconformities_detected: number
  avg_rt_seconds: number | null
  reviews_finalized: number
  human_validation_rate: number | null
  corrections_after_generation: number
}

export interface InsightsPerRun {
  id: number
  name: string | null
  status: string
  policy_id: number | null
  policy_name: string | null
  created_at: string | null
  documents: number
  overall_ai: string | null
  overall_effective: string | null
  nonconformities: number
  duration_seconds: number | null
  reviewed: boolean
  finalized: boolean
  overrides: number
}

export interface Insights {
  filters: { policy_id: number | null; source: string }
  generated_at: string
  totals: InsightsTotals
  verdict_breakdown: Record<string, number>
  by_day: { date: string; count: number }[]
  per_run: InsightsPerRun[]
}

export function useInsights(policyId?: number | null, source = 'validate') {
  return useQuery<Insights>({
    queryKey: ['insights', policyId ?? null, source],
    queryFn: () =>
      client
        .get('/metrics/insights', {
          params: { source, ...(policyId ? { policy_id: policyId } : {}) },
        })
        .then(r => r.data),
    refetchInterval: 10000,
  })
}

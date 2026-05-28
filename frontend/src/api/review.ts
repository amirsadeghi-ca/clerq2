import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Run } from '../types/workflow'
import client from './client'

// Phase 6 — human review on the report. All mutations return the updated Run
// (with its `review`) and invalidate the run detail cache so the UI refetches.

interface AnnotateArgs {
  runId: number
  ruleName: string
  note?: string | null
  clearNote?: boolean
  overrideStatus?: string | null
  overrideReason?: string | null
  clearOverride?: boolean
}

function useRunInvalidation() {
  const qc = useQueryClient()
  return (run: Run) => {
    qc.invalidateQueries({ queryKey: ['runs', 'detail', run.id] })
    qc.invalidateQueries({ queryKey: ['validate-runs'] })
  }
}

export function useAnnotateFinding() {
  const invalidate = useRunInvalidation()
  return useMutation({
    mutationFn: ({ runId, ruleName, ...rest }: AnnotateArgs) =>
      client
        .patch<Run>(
          `/runs/${runId}/review/finding/${encodeURIComponent(ruleName)}`,
          {
            note: rest.note,
            clear_note: rest.clearNote ?? false,
            override_status: rest.overrideStatus,
            override_reason: rest.overrideReason,
            clear_override: rest.clearOverride ?? false,
          },
        )
        .then(r => r.data),
    onSuccess: invalidate,
  })
}

export function useFinalizeReview() {
  const invalidate = useRunInvalidation()
  return useMutation({
    mutationFn: (runId: number) =>
      client.post<Run>(`/runs/${runId}/review/finalize`).then(r => r.data),
    onSuccess: invalidate,
  })
}

export function useReopenReview() {
  const invalidate = useRunInvalidation()
  return useMutation({
    mutationFn: (runId: number) =>
      client.post<Run>(`/runs/${runId}/review/reopen`).then(r => r.data),
    onSuccess: invalidate,
  })
}

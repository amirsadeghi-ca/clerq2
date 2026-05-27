import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from './client'

export interface SettingsOut {
  openrouter_api_key: string
  openrouter_default_model: string
  openrouter_api_key_set: boolean
}

export interface SettingsUpdate {
  openrouter_api_key?: string
  openrouter_default_model?: string
}

export interface ModelInfo {
  id: string
  name: string
}

export interface TestResult {
  ok: boolean
  response?: string
  error?: string
}

export function useSettings() {
  return useQuery<SettingsOut>({
    queryKey: ['settings'],
    queryFn: () => client.get('/settings/').then(r => r.data),
  })
}

export function useUpdateSettings() {
  const qc = useQueryClient()
  return useMutation<SettingsOut, Error, SettingsUpdate>({
    mutationFn: body => client.put('/settings/', body).then(r => r.data),
    onSuccess: data => {
      qc.setQueryData(['settings'], data)
      qc.invalidateQueries({ queryKey: ['openrouter-models'] })
    },
  })
}

export function useOpenRouterModels(enabled: boolean) {
  return useQuery<ModelInfo[]>({
    queryKey: ['openrouter-models'],
    queryFn: () => client.get('/settings/models').then(r => r.data),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

export function useTestConnection() {
  return useMutation<TestResult, Error>({
    mutationFn: () => client.post('/settings/test').then(r => r.data),
  })
}

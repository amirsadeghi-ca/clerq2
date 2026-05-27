import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface RunContextValue {
  activeRunId: number | null
  setActiveRunId: (id: number) => void
  dismissRun: () => void
}

const RunContext = createContext<RunContextValue>({
  activeRunId: null,
  setActiveRunId: () => {},
  dismissRun: () => {},
})

const LS_KEY = 'clerq_active_run'

export function RunProvider({ children }: { children: ReactNode }) {
  const [activeRunId, setActiveRunIdState] = useState<number | null>(() => {
    const stored = localStorage.getItem(LS_KEY)
    return stored ? Number(stored) : null
  })

  const setActiveRunId = useCallback((id: number) => {
    setActiveRunIdState(id)
    localStorage.setItem(LS_KEY, String(id))
  }, [])

  const dismissRun = useCallback(() => {
    setActiveRunIdState(null)
    localStorage.removeItem(LS_KEY)
  }, [])

  return (
    <RunContext.Provider value={{ activeRunId, setActiveRunId, dismissRun }}>
      {children}
    </RunContext.Provider>
  )
}

export function useRunContext() {
  return useContext(RunContext)
}

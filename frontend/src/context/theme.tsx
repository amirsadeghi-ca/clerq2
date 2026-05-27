import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  mode: ThemeMode
  resolved: 'light' | 'dark'
  setMode: (m: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  resolved: 'dark',
  setMode: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(resolved: 'light' | 'dark') {
  const root = document.documentElement
  if (resolved === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    return (localStorage.getItem('theme') as ThemeMode) ?? 'dark'
  })

  const [resolved, setResolved] = useState<'light' | 'dark'>(() => {
    const stored = (localStorage.getItem('theme') as ThemeMode) ?? 'dark'
    return stored === 'system' ? getSystemTheme() : stored
  })

  // Apply theme class immediately on mount and whenever resolved changes
  useEffect(() => {
    applyTheme(resolved)
  }, [resolved])

  // Listen for OS-level theme changes when in system mode
  useEffect(() => {
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      const next = e.matches ? 'dark' : 'light'
      setResolved(next)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  function setMode(m: ThemeMode) {
    localStorage.setItem('theme', m)
    setModeState(m)
    const next = m === 'system' ? getSystemTheme() : m
    setResolved(next)
  }

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

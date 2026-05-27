import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from './context/theme'
import { RunProvider, useRunContext } from './context/run'
import { RunStatusPanel } from './components/RunStatusPanel'
import { Dashboard } from './pages/Dashboard'
import { WorkflowList } from './pages/WorkflowList'
import { WorkflowEditor } from './pages/WorkflowEditor'
import { RunHistory } from './pages/RunHistory'
import { LibraryList } from './pages/LibraryList'
import { LibraryEditor } from './pages/LibraryEditor'
import { PolicyEditor } from './pages/PolicyEditor'
import { Settings } from './pages/Settings'
import { Validate } from './pages/Validate'
import { MailInbox } from './pages/MailInbox'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
})

function GlobalRunStatus() {
  const { activeRunId, dismissRun } = useRunContext()
  if (!activeRunId) return null
  return <RunStatusPanel runId={activeRunId} onDismiss={dismissRun} />
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RunProvider>
          <BrowserRouter>
            <div className="flex h-screen flex-col overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
              <div className="flex min-h-0 flex-1 overflow-hidden">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/validate" element={<Validate />} />
                  <Route path="/workflows" element={<WorkflowList />} />
                  <Route path="/workflows/:id" element={<WorkflowEditor />} />
                  <Route path="/workflows/:id/runs" element={<RunHistory />} />
                  <Route path="/library" element={<LibraryList />} />
                  <Route path="/library/:id" element={<LibraryEditor />} />
                  <Route path="/policies/:id" element={<PolicyEditor />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/mail" element={<MailInbox />} />
                </Routes>
              </div>
              <GlobalRunStatus />
            </div>
          </BrowserRouter>
        </RunProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}

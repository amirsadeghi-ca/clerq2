import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from './context/theme'
import { I18nProvider } from './context/i18n'
import { AuthProvider, useAuth } from './context/auth'
import { RunProvider, useRunContext } from './context/run'
import { RunStatusPanel } from './components/RunStatusPanel'
import { ReadinessBanner } from './components/ReadinessBanner'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Dashboard } from './pages/Dashboard'
import { CasesPage } from './pages/CasesPage'
import { CaseDetailPage } from './pages/CaseDetailPage'
import { WorkflowList } from './pages/WorkflowList'
import { WorkflowEditor } from './pages/WorkflowEditor'
import { RunHistory } from './pages/RunHistory'
import { LibraryList } from './pages/LibraryList'
import { LibraryEditor } from './pages/LibraryEditor'
import { PolicyEditor } from './pages/PolicyEditor'
import { SettingsLayout } from './pages/settings/SettingsLayout'
import { AccountSection } from './pages/settings/AccountSection'
import { AppearanceSection } from './pages/settings/AppearanceSection'
import { LanguageSection } from './pages/settings/LanguageSection'
import { AiSection } from './pages/settings/AiSection'
import { Validate } from './pages/Validate'
import { ReportPage } from './pages/ReportPage'
import { MailInbox } from './pages/MailInbox'
import { Insights } from './pages/Insights'
import { LoginPage } from './pages/LoginPage'
import { AdminPage } from './pages/AdminPage'
import { InviteAcceptPage } from './pages/InviteAcceptPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
})

function GlobalRunStatus() {
  const { activeRunId, dismissRun } = useRunContext()
  const { user } = useAuth()
  if (!activeRunId || !user) return null
  return <RunStatusPanel runId={activeRunId} onDismiss={dismissRun} />
}

export default function App() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <RunProvider>
                <div className="flex h-screen flex-col overflow-hidden bg-[var(--c-bg)] text-[var(--c-text-1)]">
                  <ReadinessBanner />
                  <div className="flex min-h-0 flex-1 overflow-hidden">
                    <Routes>
                      <Route path="/login" element={<LoginPage />} />
                      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                      <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
                      <Route path="/invite/:token" element={<InviteAcceptPage />} />
                      <Route path="/" element={<ProtectedRoute><CasesPage /></ProtectedRoute>} />
                      <Route path="/cases" element={<ProtectedRoute><CasesPage /></ProtectedRoute>} />
                      <Route path="/cases/:caseId" element={<ProtectedRoute><CaseDetailPage /></ProtectedRoute>} />
                      <Route path="/validate" element={<ProtectedRoute><Validate /></ProtectedRoute>} />
                      <Route path="/mail" element={<Navigate to="/cases" replace />} />
                      <Route path="/reports/:runId" element={<ProtectedRoute><ReportPage /></ProtectedRoute>} />
                      <Route path="/workflows" element={<ProtectedRoute><WorkflowList /></ProtectedRoute>} />
                      <Route path="/workflows/:id" element={<ProtectedRoute><WorkflowEditor /></ProtectedRoute>} />
                      <Route path="/workflows/:id/runs" element={<ProtectedRoute><RunHistory /></ProtectedRoute>} />
                      <Route path="/library" element={<ProtectedRoute><LibraryList /></ProtectedRoute>} />
                      <Route path="/library/:id" element={<ProtectedRoute><LibraryEditor /></ProtectedRoute>} />
                      <Route path="/policies/:id" element={<ProtectedRoute><PolicyEditor /></ProtectedRoute>} />
                      <Route path="/settings" element={<ProtectedRoute><SettingsLayout /></ProtectedRoute>}>
                        <Route index element={<Navigate to="account" replace />} />
                        <Route path="account" element={<AccountSection />} />
                        <Route path="appearance" element={<AppearanceSection />} />
                        <Route path="language" element={<LanguageSection />} />
                        <Route path="ai" element={<AiSection />} />
                      </Route>
                      <Route path="/insights" element={<ProtectedRoute><Insights /></ProtectedRoute>} />
                      <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
                    </Routes>
                  </div>
                  <GlobalRunStatus />
                </div>
              </RunProvider>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </I18nProvider>
    </ThemeProvider>
  )
}

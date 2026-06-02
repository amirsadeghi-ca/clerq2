import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useReadiness } from '../api/health'
import { useAuth } from '../context/auth'

export function ReadinessBanner() {
  const { user } = useAuth()
  const [dismissed, setDismissed] = useState(false)
  const { data } = useReadiness(!!user && !dismissed)

  if (!user || dismissed || !data || data.ok) return null

  // Collect all hard failures (not warning-only)
  const failures = Object.entries(data.checks)
    .filter(([, v]) => !v.ok && !v.warning_only && v.reason)
    .map(([, v]) => v.reason as string)

  if (failures.length === 0) return null

  const isCritical = !data.checks.database?.ok || !data.checks.redis?.ok

  return (
    <div
      className={`flex items-center gap-2 px-4 py-2 text-[12px] ${
        isCritical
          ? 'bg-red-500/10 border-b border-red-500/20 text-red-400'
          : 'bg-amber-500/10 border-b border-amber-500/20 text-amber-400'
      }`}
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">
        {failures.join(' · ')}
        {!isCritical && (
          <a
            href="/settings/ai"
            className="ml-2 underline underline-offset-2 opacity-80 hover:opacity-100"
          >
            Configure →
          </a>
        )}
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="ml-2 opacity-60 hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

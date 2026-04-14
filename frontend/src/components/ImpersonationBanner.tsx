import { useAuth } from '../auth/AuthContext'

/**
 * Sticky banner displayed when an admin is impersonating another user.
 * Always rendered at the top of the layout so it's visible on every page.
 */
export function ImpersonationBanner() {
  const { impersonating, stopImpersonation } = useAuth()

  if (!impersonating) return null

  const displayName = impersonating.name || impersonating.email || impersonating.sub

  return (
    <div className="w-full bg-amber-400 dark:bg-amber-500 text-amber-950 dark:text-amber-950 px-4 py-2 flex items-center justify-between gap-4 text-sm z-50 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-bold whitespace-nowrap">👤 Impersonating:</span>
        <span className="font-semibold truncate">{displayName}</span>
        {impersonating.email && impersonating.name && (
          <span className="text-amber-800 dark:text-amber-800 truncate hidden sm:inline">
            ({impersonating.email})
          </span>
        )}
        <span className="text-amber-800 dark:text-amber-800 text-xs whitespace-nowrap hidden md:inline">
          — API calls are made as this user. Admin actions are blocked.
        </span>
      </div>
      <button
        onClick={stopImpersonation}
        className="shrink-0 px-3 py-1 rounded bg-amber-950/15 hover:bg-amber-950/25 font-semibold text-xs transition-colors whitespace-nowrap"
      >
        Stop Impersonating
      </button>
    </div>
  )
}

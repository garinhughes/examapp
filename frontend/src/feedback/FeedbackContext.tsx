import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'

const STORAGE_KEY = 'certshack:feedbackLastVisit'

interface FeedbackState {
  badgeCount: number
  markVisited: () => void
  refresh: () => void
}

const FeedbackCtx = createContext<FeedbackState | null>(null)

export function useFeedback() {
  const ctx = useContext(FeedbackCtx)
  if (!ctx) throw new Error('useFeedback must be used within FeedbackProvider')
  return ctx
}

interface Props {
  children: ReactNode
  authFetch: (url: string, init?: RequestInit) => Promise<Response>
  isAdmin: boolean
}

export function FeedbackProvider({ children, authFetch, isAdmin }: Props) {
  const [badgeCount, setBadgeCount] = useState(0)

  const fetchCount = useCallback(async () => {
    if (!isAdmin) return
    const since = localStorage.getItem(STORAGE_KEY) ?? new Date(0).toISOString()
    try {
      const res = await authFetch(`/admin/feedback/count?since=${encodeURIComponent(since)}`)
      if (res.ok) {
        const data = await res.json()
        setBadgeCount(data.total ?? 0)
      }
    } catch {
      // non-fatal
    }
  }, [authFetch, isAdmin])

  useEffect(() => {
    fetchCount()
  }, [fetchCount])

  const markVisited = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString())
    setBadgeCount(0)
  }, [])

  return (
    <FeedbackCtx.Provider value={{ badgeCount, markVisited, refresh: fetchCount }}>
      {children}
    </FeedbackCtx.Provider>
  )
}

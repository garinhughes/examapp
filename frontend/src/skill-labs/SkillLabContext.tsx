import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useExam } from '@/exam/ExamContext'
import { apiUrl } from '@/apiBase'
import { LAB_CANCELLED_EVENT } from './labs/shared'

export interface InProgressLab {
  labId: string
  attemptId: string
  timed: boolean
  startedAt?: string
  lastSavedAt?: string
}

interface Ctx {
  inProgressLab: InProgressLab | null
  loading: boolean
  refresh: () => Promise<void>
  /** Called by useLabSession after the server POST /attempt resolves with an attemptId. */
  setActive: (lab: InProgressLab) => void
  /** Cancel the active in-progress lab. Calls server, clears local context state. */
  cancelActive: () => Promise<void>
  /** Mark the active lab as completed (cleared from context). */
  clearActive: () => void
}

const SkillLabCtx = createContext<Ctx | null>(null)

export function useSkillLab() {
  const v = useContext(SkillLabCtx)
  if (!v) throw new Error('useSkillLab must be used within SkillLabProvider')
  return v
}

export function SkillLabProvider({ children }: { children: ReactNode }) {
  const { user, authFetch } = useExam()
  const [inProgressLab, setInProgressLab] = useState<InProgressLab | null>(null)
  const [loading, setLoading] = useState(false)
  const inFlightRef = useRef<Promise<void> | null>(null)

  const refresh = useCallback(async () => {
    if (!user) { setInProgressLab(null); return }
    if (inFlightRef.current) return inFlightRef.current
    setLoading(true)
    const promise = (async () => {
      try {
        const r = await authFetch(apiUrl('/skill-labs/my-active-attempt'))
        if (!r.ok) { setInProgressLab(null); return }
        const d = await r.json()
        const a = d?.active
        if (a && a.labId && a.attemptId) {
          setInProgressLab({
            labId: a.labId,
            attemptId: a.attemptId,
            timed: !!a.timed,
            startedAt: a.startedAt,
            lastSavedAt: a.lastSavedAt,
          })
        } else {
          setInProgressLab(null)
        }
      } catch { setInProgressLab(null) }
      finally { setLoading(false) }
    })()
    inFlightRef.current = promise
    promise.finally(() => { inFlightRef.current = null })
    return promise
  }, [user, authFetch])

  // Initial hydration + tab focus refresh
  useEffect(() => {
    void refresh()
    function onVis() { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [refresh])

  // React to cancel events from anywhere (including this tab dispatching it)
  useEffect(() => {
    function onCancel() { setInProgressLab(null) }
    window.addEventListener(LAB_CANCELLED_EVENT, onCancel)
    return () => window.removeEventListener(LAB_CANCELLED_EVENT, onCancel)
  }, [])

  const setActive = useCallback((lab: InProgressLab) => {
    setInProgressLab(lab)
  }, [])

  const cancelActive = useCallback(async () => {
    const lab = inProgressLab
    if (!lab) return
    setInProgressLab(null)
    try {
      await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.labId)}/attempt/cancel-active`), { method: 'POST' })
    } catch {}
    try { window.dispatchEvent(new CustomEvent(LAB_CANCELLED_EVENT, { detail: { labId: lab.labId } })) } catch {}
  }, [inProgressLab, authFetch])

  const clearActive = useCallback(() => setInProgressLab(null), [])

  const value = useMemo<Ctx>(
    () => ({ inProgressLab, loading, refresh, setActive, cancelActive, clearActive }),
    [inProgressLab, loading, refresh, setActive, cancelActive, clearActive],
  )

  return <SkillLabCtx.Provider value={value}>{children}</SkillLabCtx.Provider>
}

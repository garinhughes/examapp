/**
 * useLabSession - extracts all shared lifecycle boilerplate from lab runners:
 *   timer, pause/resume, submit scaffolding, gamification, attempt recording,
 *   and the server-side attempt lifecycle (dev-guide §15 / 14.2-14.5).
 *
 * Each runner only needs to implement its unique interaction surface and validation,
 * then call session.finalize(correct, selectedAnswer) when done.
 *
 * Server lifecycle:
 *   * First dirty edit            → POST  /skill-labs/:id/attempt           (start)
 *   * Subsequent saveProgress     → PATCH /skill-labs/:id/attempt/:aid      (debounced ~5s)
 *   * finalize(correct)           → POST  /skill-labs/:id/attempt/:aid/complete
 *   * handleCancelLab             → POST  /skill-labs/:id/attempt/:aid/cancel
 *   * Resume from localStorage    → GET   /skill-labs/:id/attempt/active    (adopt server attemptId)
 *
 * Visitors (no `user`) keep working purely client-side — no server calls fire.
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { useExam } from '@/exam/ExamContext'
import { apiUrl } from '@/apiBase'
import type { LabSummary } from '../types'
import { LAB_TIME_LIMITS } from '../types'
import { useLabProgress } from './useLabProgress'
import { useLabComplete, signalLabCancelled } from './shared'
import { useSkillLab } from '@/skill-labs/SkillLabContext'
import { captureError } from '@/lib/sentry'

type LabMeta = Pick<LabSummary, 'id' | 'type' | 'difficulty' | 's3VersionId'>

const PROGRESS_PATCH_DEBOUNCE_MS = 2000

/**
 * Auto-rating prompt signal (dev-guide §15 / 14.6). Fired from finalize() when
 * a successful complete lands; LabHeader listens and opens RatingModal after a
 * short delay so the user sees their success first. Custom event keeps this
 * decoupled — runners don't need any new wiring.
 */
export const LAB_RATING_PROMPT_EVENT = 'lab-rating-prompt'

/** Save-state ping ('saving' | 'saved' | 'idle') so the header can show an indicator without prop drilling. */
export const LAB_SAVE_STATE_EVENT = 'lab-save-state'

function signalRatingPrompt(labId: string) {
  try {
    window.dispatchEvent(new CustomEvent(LAB_RATING_PROMPT_EVENT, { detail: { labId } }))
  } catch { /* SSR / older browsers */ }
}

function signalSaveState(labId: string, state: 'idle' | 'saving' | 'saved') {
  try {
    window.dispatchEvent(new CustomEvent(LAB_SAVE_STATE_EVENT, { detail: { labId, state } }))
  } catch { /* SSR / older browsers */ }
}

export function useLabSession<TProgress extends { timeLeft: number }>(options: {
  lab: LabMeta
  timed: boolean
}): {
  savedProgress: TProgress | null
  saveProgress: (state: TProgress) => void
  timeLimit: number
  timeLeft: number
  labPaused: boolean
  setLabPaused: (v: boolean) => void
  submitted: boolean
  resumeNotice: boolean
  showConfirmModal: boolean
  setShowConfirmModal: (v: boolean) => void
  /** UI hint for the header — 'idle' | 'saving' | 'saved'. Only meaningful when authed. */
  serverSaveState: 'idle' | 'saving' | 'saved'
  /** Result of the most recent Check — null until first check. (dev-guide §15 / 14.11) */
  lastCheck: { correct: boolean; checkedAt: number; feedback?: string | string[] | null } | null
  /** Record a Check result. Validation runners call this after their /validate-* response. */
  recordCheck: (correct: boolean, feedback?: string | string[] | null) => void
  /** Reset session for Retry Lab — clears submitted, timer, attemptId, lastCheck, localStorage. */
  restart: () => void
  /** Bumps each time restart() is called; runners use as a useEffect dep to reset their own state. */
  restartKey: number
  /** Call after computing correct/result. Handles submitted state, clearProgress, timer, gamification, and attempt API. */
  finalize: (correct: boolean, selectedAnswer?: string, opts?: { skipRatingPrompt?: boolean }) => Promise<void>
  /** Save current progress snapshot and navigate back to skill-labs. */
  handlePauseAndExit: (snapshot: TProgress) => void
  /** Discard saved progress and navigate back to skill-labs. */
  handleCancelLab: () => void
  /** Force-mark the lab as in-progress (materialise server attempt). Idempotent. */
  markDirty: () => void
} {
  const { authFetch, user, setRoute } = useExam()
  const { setActive, clearActive } = useSkillLab()
  const { lab, timed } = options
  const completeWithGamification = useLabComplete(lab)
  const timeLimit = LAB_TIME_LIMITS[lab.difficulty]

  // Server attempt id, lazily created on first dirty edit. Held in a ref so the
  // PATCH/complete/cancel callbacks always read the freshest value.
  const attemptIdRef = useRef<string | null>(null)
  const startInFlightRef = useRef<Promise<string | null> | null>(null)
  const patchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSnapshotRef = useRef<TProgress | null>(null)

  async function startServerAttempt(initialState?: TProgress): Promise<string | null> {
    if (attemptIdRef.current) return attemptIdRef.current
    if (!user) return null
    if (startInFlightRef.current) return startInFlightRef.current
    const promise = (async () => {
      try {
        const r = await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ labType: lab.type, timed, progressState: initialState ?? null }),
        })
        if (r.status === 409) {
          // Another lab is in progress for this user. Surface via context refresh on the page.
          console.warn('[useLabSession] cannot start: another lab is in progress')
          return null
        }
        if (!r.ok) return null
        const d = await r.json()
        const aid: string | null = d?.attemptId ?? null
        if (aid) {
          attemptIdRef.current = aid
          setActive({ labId: lab.id, attemptId: aid, timed, startedAt: d?.startedAt })
        }
        return aid
      } catch (err) {
        captureError(err, { tags: { surface: 'skill-lab', stage: 'attempt-start' }, extra: { labId: lab.id, labType: lab.type } })
        return null
      }
    })()
    startInFlightRef.current = promise
    promise.finally(() => { startInFlightRef.current = null })
    return promise
  }

  async function patchProgress(state: TProgress) {
    if (!user) return
    const aid = attemptIdRef.current
    if (!aid) return
    setServerSaveState('saving')
    signalSaveState(lab.id, 'saving')
    try {
      const r = await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt/${encodeURIComponent(aid)}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ progressState: state }),
      })
      if (r.ok) {
        setServerSaveState('saved')
        signalSaveState(lab.id, 'saved')
        if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current)
        savedFlashTimerRef.current = setTimeout(() => {
          setServerSaveState('idle')
          signalSaveState(lab.id, 'idle')
        }, 2000)
      } else {
        setServerSaveState('idle')
        signalSaveState(lab.id, 'idle')
      }
    } catch {
      setServerSaveState('idle')
      signalSaveState(lab.id, 'idle')
    }
  }

  // useLabProgress fires onFirstDirty exactly once when the runner state actually
  // diverges from baseline. That's the natural moment to materialise the server attempt.
  const handleFirstDirty = useCallback((state: TProgress) => {
    lastSnapshotRef.current = state
    void startServerAttempt(state)
  }, [lab.id])

  const { savedProgress, saveProgress: baseSaveProgress, clearProgress } = useLabProgress<TProgress>(lab.id, timed, lab.s3VersionId, handleFirstDirty)

  const [timeLeft, setTimeLeft] = useState<number>(savedProgress ? savedProgress.timeLeft : timeLimit)
  const [labPaused, setLabPaused] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [resumeNotice, setResumeNotice] = useState(savedProgress !== null)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [serverSaveState, setServerSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const savedFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [lastCheck, setLastCheck] = useState<{ correct: boolean; checkedAt: number; feedback?: string | string[] | null } | null>(null)
  const [restartKey, setRestartKey] = useState(0)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(Date.now())
  const submittedRef = useRef(false)

  // Resume hydration: if we restored state from localStorage, adopt any matching
  // server-side in_progress attempt so /complete + /cancel target the right row.
  // Cross-device "pull state from server" is deferred to Phase 6 — here we only
  // borrow the attemptId.
  useEffect(() => {
    if (!user || !savedProgress) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt/active`))
        if (!r.ok) return
        const d = await r.json()
        if (cancelled) return
        const aid = d?.active?.attemptId
        if (aid && !attemptIdRef.current) attemptIdRef.current = aid
      } catch { /* non-critical */ }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-dismiss resume notice after 3 seconds
  useEffect(() => {
    if (!resumeNotice) return
    const t = setTimeout(() => setResumeNotice(false), 1500)
    return () => clearTimeout(t)
  }, [resumeNotice])

  // Timer - starts/stops based on submitted/timed/labPaused
  useEffect(() => {
    if (submitted || !timed || labPaused) return
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [submitted, timed, labPaused])

  // Flush pending PATCH on tab close so we don't lose the last few seconds.
  useEffect(() => {
    const flush = () => {
      if (patchTimerRef.current) { clearTimeout(patchTimerRef.current); patchTimerRef.current = null }
      const aid = attemptIdRef.current
      const snapshot = lastSnapshotRef.current
      if (!user || !aid || !snapshot || submittedRef.current) return
      try {
        authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt/${encodeURIComponent(aid)}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ progressState: snapshot }),
          keepalive: true,
        } as any).catch(() => {})
      } catch {}
    }
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Wrap saveProgress: passes through to localStorage (which fires onFirstDirty
  // for us) and schedules a debounced PATCH against the live attempt.
  const saveProgress = useCallback((state: TProgress) => {
    lastSnapshotRef.current = state
    baseSaveProgress(state)
    if (!user) return
    if (patchTimerRef.current) clearTimeout(patchTimerRef.current)
    patchTimerRef.current = setTimeout(() => {
      patchTimerRef.current = null
      void patchProgress(state)
    }, PROGRESS_PATCH_DEBOUNCE_MS)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseSaveProgress, user])

  const finalize = useCallback(async (correct: boolean, selectedAnswer = '', opts?: { skipRatingPrompt?: boolean }) => {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitted(true)
    clearProgress()
    if (timerRef.current) clearInterval(timerRef.current)
    if (patchTimerRef.current) { clearTimeout(patchTimerRef.current); patchTimerRef.current = null }
    completeWithGamification(correct)

    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000)
    if (!user) return

    // Prefer the explicit /complete endpoint when we have a live attempt id.
    let aid = attemptIdRef.current
    if (!aid) aid = await startServerAttempt(lastSnapshotRef.current ?? undefined)

    if (aid) {
      try {
        await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt/${encodeURIComponent(aid)}/complete`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ correct, selectedAnswer, timeTaken, labType: lab.type }),
        })
      } catch (err) {
        captureError(err, { tags: { surface: 'skill-lab', stage: 'complete' }, extra: { labId: lab.id, attemptId: aid, correct, timeTaken } })
      }
      clearActive()
      if (!opts?.skipRatingPrompt) signalRatingPrompt(lab.id)
      return
    }
    clearActive()

    // Total fallback: legacy one-shot. Backend writes a completed row directly.
    try {
      await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedAnswer, correct, timeTaken, labType: lab.type }),
      })
    } catch (err) {
      captureError(err, { tags: { surface: 'skill-lab', stage: 'legacy-complete' }, extra: { labId: lab.id, correct, timeTaken } })
    }
    if (!opts?.skipRatingPrompt) signalRatingPrompt(lab.id)
  }, [clearProgress, clearActive, completeWithGamification, authFetch, user, lab.id, lab.type])

  const handlePauseAndExit = useCallback((snapshot: TProgress) => {
    saveProgress(snapshot)
    if (patchTimerRef.current) { clearTimeout(patchTimerRef.current); patchTimerRef.current = null }
    // Fire PATCH async so navigation is immediate; await in-flight POST if needed
    ;(async () => {
      let aid = attemptIdRef.current
      if (!aid && startInFlightRef.current) aid = await startInFlightRef.current
      if (!user || !aid) return
      try {
        authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt/${encodeURIComponent(aid)}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ progressState: snapshot }),
          keepalive: true,
        } as any).catch(() => {})
      } catch {}
    })()
    setRoute('skill-labs')
  }, [saveProgress, setRoute, authFetch, user, lab.id])

  const handleCancelLab = useCallback(() => {
    if (patchTimerRef.current) { clearTimeout(patchTimerRef.current); patchTimerRef.current = null }
    const aid = attemptIdRef.current
    if (user && aid) {
      // Fire-and-forget; UI navigates immediately. keepalive keeps the request
      // alive past the route change.
      try {
        authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt/${encodeURIComponent(aid)}/cancel`), {
          method: 'POST',
          keepalive: true,
        } as any).catch(() => {})
      } catch {}
    }
    clearProgress()
    clearActive()
    signalLabCancelled(lab.id)
    setRoute('skill-labs')
  }, [clearProgress, clearActive, setRoute, authFetch, user, lab.id])

  const markDirty = useCallback(() => {
    if (!user) return
    if (attemptIdRef.current) return
    void startServerAttempt(lastSnapshotRef.current ?? undefined)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  function recordCheck(correct: boolean, feedback?: string | string[] | null) {
    setLastCheck({ correct, checkedAt: Date.now(), feedback: feedback ?? null })
  }

  function restart() {
    // Clear timers and pending PATCHes
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (patchTimerRef.current) { clearTimeout(patchTimerRef.current); patchTimerRef.current = null }
    if (savedFlashTimerRef.current) { clearTimeout(savedFlashTimerRef.current); savedFlashTimerRef.current = null }
    // Reset attempt + snapshot tracking so a fresh attempt is created on the next dirty edit.
    attemptIdRef.current = null
    lastSnapshotRef.current = null
    submittedRef.current = false
    startTimeRef.current = Date.now()
    // Clear local + reset session state
    clearProgress()
    setSubmitted(false)
    setTimeLeft(timeLimit)
    setLabPaused(false)
    setLastCheck(null)
    setServerSaveState('idle')
    setRestartKey((k) => k + 1)
  }

  return {
    savedProgress,
    saveProgress,
    timeLimit,
    timeLeft,
    labPaused,
    setLabPaused,
    submitted,
    resumeNotice,
    showConfirmModal,
    setShowConfirmModal,
    serverSaveState,
    lastCheck,
    recordCheck,
    restart,
    restartKey,
    finalize,
    handlePauseAndExit,
    handleCancelLab,
    markDirty,
  }
}

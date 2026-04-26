/**
 * useLabProgress - generic hook for saving/restoring in-progress skill lab state.
 *
 * Mirrors the exam `examProgress:{code}` localStorage pattern.
 * Key: `skillLabProgress:{labId}`
 * Expiry: 24 hours (same as exams).
 *
 * Dirty-flag gate (dev-guide §15 / 14.1): runners call saveProgress on every state
 * change including the initial mount. To stop "opened a lab and bounced" from
 * leaving an in-progress banner, we only persist once the runner state actually
 * diverges from the baseline observed on first save. `timeLeft` is excluded from
 * that comparison — a ticking timer isn't a user mutation. If we resumed from
 * an existing localStorage row, we start dirty (already a real session).
 */

import { useRef } from 'react'

const PREFIX = 'skillLabProgress:'
const EXPIRY_MS = 24 * 60 * 60 * 1000

function fingerprint<T>(state: T): string {
  // Compare runner state ignoring timeLeft (timer tick is not user intent).
  const { timeLeft: _t, ...rest } = (state ?? {}) as Record<string, unknown>
  void _t
  return JSON.stringify(rest)
}

export function useLabProgress<T>(labId: string, timed?: boolean, labVersion?: string, onFirstDirty?: (state: T) => void): {
  savedProgress: T | null
  savedTimed: boolean | null
  saveProgress: (state: T) => void
  clearProgress: () => void
} {
  // Read once on mount - useRef ensures we don't re-read on every render.
  const initialRef = useRef<{ progress: T | null; timed: boolean | null } | undefined>(undefined)
  if (initialRef.current === undefined) {
    try {
      const raw = localStorage.getItem(PREFIX + labId)
      if (!raw) {
        initialRef.current = { progress: null, timed: null }
      } else {
        const parsed = JSON.parse(raw)
        if (!parsed.savedAt || Date.now() - parsed.savedAt > EXPIRY_MS) {
          localStorage.removeItem(PREFIX + labId)
          initialRef.current = { progress: null, timed: null }
        } else if (labVersion && parsed._version && parsed._version !== labVersion) {
          localStorage.removeItem(PREFIX + labId)
          initialRef.current = { progress: null, timed: null }
        } else {
          const { savedAt: _savedAt, _timed, _version: _v, ...rest } = parsed
          initialRef.current = { progress: rest as T, timed: typeof parsed._timed === 'boolean' ? parsed._timed : null }
        }
      }
    } catch {
      initialRef.current = { progress: null, timed: null }
    }
  }

  const savedProgress = initialRef.current.progress
  const savedTimed = initialRef.current.timed

  // Resume case: existing localStorage row → already dirty. Fresh start: dirty flips
  // once a saveProgress call diverges from the first observed snapshot.
  const dirtyRef = useRef<boolean>(savedProgress !== null)
  const baselineRef = useRef<string | undefined>(undefined)

  function saveProgress(state: T) {
    if (!dirtyRef.current) {
      const fp = fingerprint(state)
      if (baselineRef.current === undefined) {
        baselineRef.current = fp
        return
      }
      if (fp === baselineRef.current) return
      dirtyRef.current = true
      // First time the runner state actually diverges — let the caller fire its
      // server-side "start attempt" POST (dev-guide §15 / 14.3).
      try { onFirstDirty?.(state) } catch {}
    }
    try {
      localStorage.setItem(PREFIX + labId, JSON.stringify({ ...state, _timed: timed, _version: labVersion, savedAt: Date.now() }))
    } catch {}
  }

  function clearProgress() {
    try {
      localStorage.removeItem(PREFIX + labId)
    } catch {}
    dirtyRef.current = false
    baselineRef.current = undefined
  }

  return { savedProgress, savedTimed, saveProgress, clearProgress }
}

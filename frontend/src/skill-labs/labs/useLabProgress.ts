/**
 * useLabProgress — generic hook for saving/restoring in-progress skill lab state.
 *
 * Mirrors the exam `examProgress:{code}` localStorage pattern.
 * Key: `skillLabProgress:{labId}`
 * Expiry: 24 hours (same as exams).
 */

import { useRef } from 'react'

const PREFIX = 'skillLabProgress:'
const EXPIRY_MS = 24 * 60 * 60 * 1000

export function useLabProgress<T>(labId: string, timed?: boolean, labVersion?: string): {
  savedProgress: T | null
  savedTimed: boolean | null
  saveProgress: (state: T) => void
  clearProgress: () => void
} {
  // Read once on mount — useRef ensures we don't re-read on every render.
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

  function saveProgress(state: T) {
    try {
      localStorage.setItem(PREFIX + labId, JSON.stringify({ ...state, _timed: timed, _version: labVersion, savedAt: Date.now() }))
    } catch {}
  }

  function clearProgress() {
    try {
      localStorage.removeItem(PREFIX + labId)
    } catch {}
  }

  return { savedProgress, savedTimed, saveProgress, clearProgress }
}

import { useCallback } from 'react'
import { useGamification } from '@/gamification/GamificationContext'
import type { LabSummary } from '../types'

export function markLabCompleted(labId: string) {
  const stored = JSON.parse(localStorage.getItem('skill-labs-completed') || '[]')
  if (!stored.includes(labId)) {
    stored.push(labId)
    localStorage.setItem('skill-labs-completed', JSON.stringify(stored))
  }
}

/**
 * Hook that returns a completion handler which marks the lab done in
 * localStorage AND fires gamification rewards.
 */
export function useLabComplete(lab: Pick<LabSummary, 'id' | 'type' | 'difficulty'>) {
  const { recordLabFinish } = useGamification()
  return useCallback((correct: boolean) => {
    markLabCompleted(lab.id)
    recordLabFinish({ labId: lab.id, labType: lab.type, difficulty: lab.difficulty, correct })
  }, [lab.id, lab.type, lab.difficulty, recordLabFinish])
}

export function getBookmarkedLabs(): Set<string> {
  const stored: string[] = JSON.parse(localStorage.getItem('skill-labs-bookmarked') || '[]')
  return new Set(stored)
}

export function toggleBookmark(labId: string): Set<string> {
  const stored: string[] = JSON.parse(localStorage.getItem('skill-labs-bookmarked') || '[]')
  const idx = stored.indexOf(labId)
  if (idx >= 0) {
    stored.splice(idx, 1)
  } else {
    stored.push(labId)
  }
  localStorage.setItem('skill-labs-bookmarked', JSON.stringify(stored))
  return new Set(stored)
}

const PROGRESS_PREFIX = 'skillLabProgress:'
const PROGRESS_EXPIRY_MS = 24 * 60 * 60 * 1000

/**
 * Returns all in-progress lab IDs from localStorage (not yet submitted, not expired).
 * Used by SkillLabsPage to show "In Progress" badges and resume banner.
 */
export function clearLabProgress(labId: string): void {
  try {
    localStorage.removeItem(`${PROGRESS_PREFIX}${labId}`)
  } catch {}
}

export function getInProgressLabs(): Array<{ labId: string; savedAt: number; timed: boolean | null }> {
  const result: Array<{ labId: string; savedAt: number; timed: boolean | null }> = []
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(PROGRESS_PREFIX)) keys.push(k)
    }
    for (const key of keys) {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      let parsed: any
      try { parsed = JSON.parse(raw) } catch { continue }
      if (!parsed.savedAt || Date.now() - parsed.savedAt > PROGRESS_EXPIRY_MS) {
        localStorage.removeItem(key)
        continue
      }
      const labId = key.slice(PROGRESS_PREFIX.length)
      result.push({ labId, savedAt: parsed.savedAt, timed: typeof parsed._timed === 'boolean' ? parsed._timed : null })
    }
  } catch {}
  return result
}

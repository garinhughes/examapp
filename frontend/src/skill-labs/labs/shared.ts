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

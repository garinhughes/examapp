import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from 'react'
import type { GamificationState, EarnedBadge, BadgeCheckContext, DomainMastery } from './types'
import { XP_PER_QUESTION, XP_BONUS_PASS, XP_BONUS_PERFECT, levelFromXP, computeMasteryTier } from './types'
import { BADGES } from './badges'

/* ------------------------------------------------------------------ */
/*  Defaults                                                           */
/* ------------------------------------------------------------------ */
const STORAGE_KEY = 'examapp_gamification'

function defaultState(): GamificationState {
  return {
    xp: 0,
    level: 0,
    streak: 0,
    lastPracticeDate: null,
    badges: [],
    domainMastery: {},
    leaderboardOptIn: false,
  }
}

function load(): GamificationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaultState(), ...JSON.parse(raw) }
  } catch {}
  return defaultState()
}

function save(state: GamificationState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {}
}

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */
export interface GamificationEvent {
  xpGained: number
  newLevel: number | null // non-null if just levelled up
  newBadges: EarnedBadge[]
  streakUpdated: boolean
  passed: boolean
}

interface GamificationContextValue {
  state: GamificationState
  /** Call after an attempt is finished. Returns events for reward UIs. */
  recordAttemptFinish: (data: {
    examCode: string
    score: number
    correctCount: number
    total: number
    perDomain?: Record<string, { correct: number; total: number; score: number }>
    allScores: number[]
    finishedCount: number
    passMark: number
  }) => GamificationEvent
  /** Mark today as a practice day (call on attempt start) */
  recordPracticeDay: () => { streakBefore: number; streakAfter: number }
  /** Toggle leaderboard opt-in */
  toggleLeaderboard: () => void
  /** Force-refresh state from localStorage */
  refresh: () => void
}

const GamificationContext = createContext<GamificationContextValue>({
  state: defaultState(),
  recordAttemptFinish: () => ({ xpGained: 0, newLevel: null, newBadges: [], streakUpdated: false, passed: false }),
  recordPracticeDay: () => ({ streakBefore: 0, streakAfter: 0 }),
  toggleLeaderboard: () => {},
  refresh: () => {},
})

export const useGamification = () => useContext(GamificationContext)

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */
export function GamificationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GamificationState>(load)

  // persist on every state change
  useEffect(() => {
    save(state)
  }, [state])

  const todayStr = () => new Date().toISOString().slice(0, 10)

  /* ---- record a practice day (streak logic) ---- */
  const recordPracticeDay = useCallback((): { streakBefore: number; streakAfter: number } => {
    const today = todayStr()
    let updated = false
    let before = 0, after = 0

    setState((prev) => {
      before = prev.streak
      if (prev.lastPracticeDate === today) {
        after = prev.streak
        return prev // already recorded today
      }

      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yStr = yesterday.toISOString().slice(0, 10)

      let newStreak: number
      if (prev.lastPracticeDate === yStr) {
        newStreak = prev.streak + 1
      } else {
        newStreak = 1
      }
      after = newStreak
      updated = true
      return { ...prev, streak: newStreak, lastPracticeDate: today }
    })

    return { streakBefore: before, streakAfter: after }
  }, [])

  /* ---- record attempt finish ---- */
  const recordAttemptFinish = useCallback((data: {
    examCode: string
    score: number
    correctCount: number
    total: number
    perDomain?: Record<string, { correct: number; total: number; score: number }>
    allScores: number[]
    finishedCount: number
    passMark: number
  }): GamificationEvent => {
    let xpGained = 0
    let newLevel: number | null = null
    const newBadges: EarnedBadge[] = []
    const passed = data.score >= data.passMark

    // XP calculation
    xpGained += data.total * XP_PER_QUESTION
    if (passed) xpGained += XP_BONUS_PASS
    if (data.score >= 100) xpGained += XP_BONUS_PERFECT

    setState((prev) => {
      const next = { ...prev }

      // XP + level
      const oldLevel = levelFromXP(prev.xp).level
      next.xp = prev.xp + xpGained
      const nl = levelFromXP(next.xp).level
      next.level = nl
      if (nl > oldLevel) newLevel = nl

      // Domain mastery update
      const newMastery = { ...prev.domainMastery }
      if (data.perDomain) {
        for (const [domain, vals] of Object.entries(data.perDomain)) {
          const existing = newMastery[domain] || { domain, recentScores: [], tier: 'none' as const, progress: 0 }
          const scores = [...existing.recentScores, vals.score].slice(-10) // keep last 10
          const { tier, progress } = computeMasteryTier(scores)
          newMastery[domain] = { domain, recentScores: scores, tier, progress }
        }
      }
      next.domainMastery = newMastery

      // Badge checks
      const badgeCtx: BadgeCheckContext = {
        attempt: {
          examCode: data.examCode,
          score: data.score,
          correctCount: data.correctCount,
          total: data.total,
          perDomain: data.perDomain,
        },
        finishedCount: data.finishedCount,
        allScores: data.allScores,
      }

      const earnedIds = new Set(prev.badges.map((b) => b.id))
      for (const badge of BADGES) {
        if (earnedIds.has(badge.id)) continue
        try {
          if (badge.check(next, badgeCtx)) {
            const earned: EarnedBadge = { id: badge.id, earnedAt: new Date().toISOString() }
            newBadges.push(earned)
            earnedIds.add(badge.id)
          }
        } catch {}
      }
      if (newBadges.length > 0) {
        next.badges = [...prev.badges, ...newBadges]
      }

      return next
    })

    return { xpGained, newLevel, newBadges, streakUpdated: false, passed }
  }, [])

  const toggleLeaderboard = useCallback(() => {
    setState((prev) => ({ ...prev, leaderboardOptIn: !prev.leaderboardOptIn }))
  }, [])

  const refresh = useCallback(() => {
    setState(load())
  }, [])

  return (
    <GamificationContext.Provider value={{ state, recordAttemptFinish, recordPracticeDay, toggleLeaderboard, refresh }}>
      {children}
    </GamificationContext.Provider>
  )
}

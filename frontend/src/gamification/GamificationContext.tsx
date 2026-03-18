import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from 'react'
import type { GamificationState, EarnedBadge, BadgeCheckContext, PassedExam, LabCompletion } from './types'
import { levelFromXP, computeMasteryTier, computeExamXP, computeCmrGain, LAB_DIFFICULTY_XP, LAB_DIFFICULTY_XP_DEFAULT } from './types'
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
    passedExams: {},
    labsCompleted: [],
    cmr: 0,
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
  cmrGained: number
}

interface GamificationContextValue {
  state: GamificationState
  /** Call after an exam attempt is finished. Returns events for reward UIs. */
  recordAttemptFinish: (data: {
    examCode: string
    score: number
    correctCount: number
    total: number
    perDomain?: Record<string, { correct: number; total: number; score: number }>
    allScores: number[]
    finishedCount: number
    passMark: number
    avgDifficulty?: number
    examLevel?: string
    provider?: string
    prevScoresForExam?: number[]
  }) => GamificationEvent
  /** Call after a skill lab is completed. */
  recordLabFinish: (data: {
    labId: string
    labType: string
    difficulty: string
    correct: boolean
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
  recordAttemptFinish: () => ({ xpGained: 0, newLevel: null, newBadges: [], streakUpdated: false, passed: false, cmrGained: 0 }),
  recordLabFinish: () => ({ xpGained: 0, newLevel: null, newBadges: [], streakUpdated: false, passed: false, cmrGained: 0 }),
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
      return { ...prev, streak: newStreak, lastPracticeDate: today }
    })

    return { streakBefore: before, streakAfter: after }
  }, [])

  /* ---- shared badge checker ---- */
  function checkBadges(
    next: GamificationState,
    prev: GamificationState,
    badgeCtx: BadgeCheckContext,
  ): EarnedBadge[] {
    const earned: EarnedBadge[] = []
    const earnedIds = new Set(prev.badges.map((b) => b.id))
    for (const badge of BADGES) {
      if (earnedIds.has(badge.id)) continue
      try {
        if (badge.check(next, badgeCtx)) {
          earned.push({ id: badge.id, earnedAt: new Date().toISOString() })
          earnedIds.add(badge.id)
        }
      } catch {}
    }
    return earned
  }

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
    avgDifficulty?: number
    examLevel?: string
    provider?: string
    prevScoresForExam?: number[]
  }): GamificationEvent => {
    const passed = data.score >= data.passMark
    let xpGained = 0
    let cmrGained = 0
    let newLevel: number | null = null
    const newBadges: EarnedBadge[] = []

    setState((prev) => {
      const isFirstPassForThisExam = passed && !prev.passedExams[data.examCode]

      // XP calculation
      xpGained = computeExamXP({
        total: data.total,
        avgDifficulty: data.avgDifficulty,
        score: data.score,
        passed,
        examLevel: data.examLevel,
        isFirstPassForThisExam,
      })

      const next = { ...prev }

      // XP + level
      const oldLevel = levelFromXP(prev.xp).level
      next.xp = prev.xp + xpGained
      const nl = levelFromXP(next.xp).level
      next.level = nl
      if (nl > oldLevel) newLevel = nl

      // CMR (only on first-time pass)
      if (isFirstPassForThisExam) {
        cmrGained = computeCmrGain(data.examLevel, data.score)
        next.cmr = prev.cmr + cmrGained
      }

      // Track passed exams
      if (passed) {
        const existing = prev.passedExams[data.examCode]
        const updatedExam: PassedExam = {
          examCode: data.examCode,
          examLevel: data.examLevel ?? '',
          provider: data.provider ?? '',
          firstPassedAt: existing?.firstPassedAt ?? new Date().toISOString(),
          bestScore: Math.max(data.score, existing?.bestScore ?? 0),
          attempts: data.finishedCount,
        }
        next.passedExams = { ...prev.passedExams, [data.examCode]: updatedExam }
      }

      // Domain mastery update
      const newMastery = { ...prev.domainMastery }
      if (data.perDomain) {
        for (const [domain, vals] of Object.entries(data.perDomain)) {
          const existing = newMastery[domain] || { domain, recentScores: [], tier: 'none' as const, progress: 0 }
          const scores = [...existing.recentScores, vals.score].slice(-10)
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
        examLevel: data.examLevel,
        provider: data.provider,
        prevScoresForExam: data.prevScoresForExam,
      }

      const earned = checkBadges(next, prev, badgeCtx)
      newBadges.push(...earned)
      if (earned.length > 0) {
        next.badges = [...prev.badges, ...earned]
      }

      return next
    })

    return { xpGained, newLevel, newBadges, streakUpdated: false, passed, cmrGained }
  }, [])

  /* ---- record skill lab finish ---- */
  const recordLabFinish = useCallback((data: {
    labId: string
    labType: string
    difficulty: string
    correct: boolean
  }): GamificationEvent => {
    const xpEarned = LAB_DIFFICULTY_XP[data.difficulty] ?? LAB_DIFFICULTY_XP_DEFAULT
    let xpGained = 0
    let newLevel: number | null = null
    const newBadges: EarnedBadge[] = []

    setState((prev) => {
      // Prevent double-counting already completed labs
      const alreadyDone = prev.labsCompleted.some((l) => l.labId === data.labId)
      xpGained = alreadyDone ? 0 : xpEarned

      const next = { ...prev }

      // XP + level
      if (xpGained > 0) {
        const oldLevel = levelFromXP(prev.xp).level
        next.xp = prev.xp + xpGained
        const nl = levelFromXP(next.xp).level
        next.level = nl
        if (nl > oldLevel) newLevel = nl
      }

      // Track lab completion
      if (!alreadyDone) {
        const completion: LabCompletion = {
          labId: data.labId,
          labType: data.labType,
          completedAt: new Date().toISOString(),
          correct: data.correct,
        }
        next.labsCompleted = [...prev.labsCompleted, completion]
      }

      // Badge checks (no attempt context for labs)
      const badgeCtx: BadgeCheckContext = {
        finishedCount: 0,
        allScores: [],
      }
      const earned = checkBadges(next, prev, badgeCtx)
      newBadges.push(...earned)
      if (earned.length > 0) {
        next.badges = [...prev.badges, ...earned]
      }

      return next
    })

    return { xpGained, newLevel, newBadges, streakUpdated: false, passed: data.correct, cmrGained: 0 }
  }, [])

  const toggleLeaderboard = useCallback(() => {
    setState((prev) => ({ ...prev, leaderboardOptIn: !prev.leaderboardOptIn }))
  }, [])

  const refresh = useCallback(() => {
    setState(load())
  }, [])

  return (
    <GamificationContext.Provider value={{ state, recordAttemptFinish, recordLabFinish, recordPracticeDay, toggleLeaderboard, refresh }}>
      {children}
    </GamificationContext.Provider>
  )
}

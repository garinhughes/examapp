/* ------------------------------------------------------------------ */
/*  Gamification data types                                            */
/* ------------------------------------------------------------------ */

export interface GamificationState {
  xp: number
  level: number
  streak: number
  lastPracticeDate: string | null // ISO date string (yyyy-mm-dd)
  badges: EarnedBadge[]
  domainMastery: Record<string, DomainMastery>
  leaderboardOptIn: boolean
}

export interface EarnedBadge {
  id: string
  earnedAt: string // ISO timestamp
}

export interface DomainMastery {
  domain: string
  recentScores: number[] // last N scores (percent) for this domain
  tier: 'none' | 'bronze' | 'silver' | 'gold'
  progress: number // 0-100 toward next tier
}

export interface BadgeDefinition {
  id: string
  name: string
  description: string
  icon: string // emoji
  category: 'milestone' | 'score' | 'streak' | 'mastery' | 'special'
  check: (state: GamificationState, context: BadgeCheckContext) => boolean
}

export interface BadgeCheckContext {
  /** just-finished attempt data (null if not in finish flow) */
  attempt?: {
    examCode: string
    score: number
    correctCount: number
    total: number
    perDomain?: Record<string, { correct: number; total: number; score: number }>
  }
  /** total finished attempts count */
  finishedCount: number
  /** all finished scores as percentages */
  allScores: number[]
}

/** XP formula constants */
export const XP_PER_QUESTION = 10
export const XP_BONUS_PASS = 50
export const XP_BONUS_PERFECT = 200

/** Level thresholds — xp needed to reach level N is LEVEL_THRESHOLDS[N] (cumulative) */
export function levelFromXP(xp: number): { level: number; currentXP: number; nextLevelXP: number; progress: number } {
  // Level N requires N*100 XP cumulative: L1=100, L2=300, L3=600, L4=1000 ...
  let level = 0
  let cumulative = 0
  while (true) {
    const needed = (level + 1) * 100
    if (xp < cumulative + needed) {
      const progress = Math.round(((xp - cumulative) / needed) * 100)
      return { level, currentXP: xp - cumulative, nextLevelXP: needed, progress }
    }
    cumulative += needed
    level++
  }
}

/** Mastery tier thresholds */
export function computeMasteryTier(recentScores: number[]): { tier: DomainMastery['tier']; progress: number } {
  if (recentScores.length === 0) return { tier: 'none', progress: 0 }
  const avg = recentScores.reduce((s, v) => s + v, 0) / recentScores.length
  const count = recentScores.length
  // Bronze: >= 3 attempts with avg >= 50
  // Silver: >= 5 attempts with avg >= 70
  // Gold:   >= 7 attempts with avg >= 85
  if (count >= 7 && avg >= 85) return { tier: 'gold', progress: 100 }
  if (count >= 5 && avg >= 70) {
    // progress toward gold
    const scoreProgress = Math.min(100, ((avg - 70) / 15) * 50)
    const countProgress = Math.min(50, ((count - 5) / 2) * 50)
    return { tier: 'silver', progress: Math.round(scoreProgress + countProgress) }
  }
  if (count >= 3 && avg >= 50) {
    const scoreProgress = Math.min(100, ((avg - 50) / 20) * 50)
    const countProgress = Math.min(50, ((count - 3) / 2) * 50)
    return { tier: 'bronze', progress: Math.round(scoreProgress + countProgress) }
  }
  // progress toward bronze
  const scoreProgress = avg >= 50 ? 50 : Math.round((avg / 50) * 50)
  const countProgress = count >= 3 ? 50 : Math.round((count / 3) * 50)
  return { tier: 'none', progress: Math.round((scoreProgress + countProgress) / 2) }
}

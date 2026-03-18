/* ------------------------------------------------------------------ */
/*  Gamification data types                                            */
/* ------------------------------------------------------------------ */

export interface PassedExam {
  examCode: string
  examLevel: string  // 'Foundational' | 'Associate' | 'Professional' | 'Specialty'
  provider: string   // 'AWS' | 'Azure' | etc.
  firstPassedAt: string
  bestScore: number
  attempts: number   // total attempts on this exam at time of first pass
}

export interface LabCompletion {
  labId: string
  labType: string
  completedAt: string
  correct: boolean
}

export interface GamificationState {
  xp: number
  level: number
  streak: number
  lastPracticeDate: string | null // ISO date string (yyyy-mm-dd)
  badges: EarnedBadge[]
  domainMastery: Record<string, DomainMastery>
  leaderboardOptIn: boolean
  passedExams: Record<string, PassedExam>   // keyed by examCode
  labsCompleted: LabCompletion[]
  cmr: number  // Cloud Mastery Rating (prestige, earned only on first-time passes)
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
  category: 'milestone' | 'score' | 'streak' | 'mastery' | 'special' | 'journey'
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
  /** exam certification level e.g. 'Associate', 'Specialty' */
  examLevel?: string
  /** exam provider e.g. 'AWS', 'Azure' */
  provider?: string
  /** previous scores for this same examCode (before current attempt) */
  prevScoresForExam?: number[]
}

/* ------------------------------------------------------------------ */
/*  XP formula                                                         */
/* ------------------------------------------------------------------ */

/** Base XP per question by difficulty (1-5). Most real questions are 3-4. */
export const DIFFICULTY_XP: Record<number, number> = {
  1: 3,
  2: 5,
  3: 6,
  4: 9,
  5: 15,
}
export const DIFFICULTY_XP_DEFAULT = 6

/** Full exam baseline for the length multiplier */
export const FULL_EXAM_BASELINE = 65

/**
 * Non-linear length multiplier that heavily penalises very short exams.
 * 1 question → ~0.3%, 10 → ~6%, 33 → ~36%, 65 → 100%.
 */
export function completionMultiplier(numQuestions: number): number {
  return Math.min(1.0, Math.pow(numQuestions / FULL_EXAM_BASELINE, 1.5))
}

/** Score quality multiplier */
export function scoreMultiplier(score: number): number {
  if (score >= 100) return 2.0
  if (score >= 90)  return 1.5
  if (score >= 80)  return 1.2
  if (score >= 70)  return 1.0
  return 0.8
}

/** Pass bonus XP by exam level */
export function passBonus(examLevel: string | undefined): number {
  const l = String(examLevel ?? '').toLowerCase()
  if (l === 'foundational') return 100
  if (l === 'associate')    return 200
  if (l === 'professional' || l === 'specialty') return 350
  return 150
}

/**
 * Compute XP gained for an exam attempt.
 * @param total - number of questions in the attempt
 * @param avgDifficulty - average difficulty of questions (1-5 or undefined)
 * @param score - percentage 0-100
 * @param passed - whether score >= passMark
 * @param examLevel - certification level string
 * @param isFirstPassForThisExam - true if this is the first time passing this exam code
 */
export function computeExamXP(params: {
  total: number
  avgDifficulty: number | undefined
  score: number
  passed: boolean
  examLevel: string | undefined
  isFirstPassForThisExam: boolean
}): number {
  const { total, avgDifficulty, score, passed, examLevel, isFirstPassForThisExam } = params
  const xpPerQ = DIFFICULTY_XP[Math.round(avgDifficulty ?? 0)] ?? DIFFICULTY_XP_DEFAULT
  const base = total * xpPerQ
  const withLength = base * completionMultiplier(total)
  const withScore = withLength * scoreMultiplier(score)
  const bonus = passed ? passBonus(examLevel) * (isFirstPassForThisExam ? 1.5 : 1.0) : 0
  return Math.round(withScore + bonus)
}

/* ------------------------------------------------------------------ */
/*  Skill lab XP                                                       */
/* ------------------------------------------------------------------ */

export const LAB_DIFFICULTY_XP: Record<string, number> = {
  beginner:     50,
  intermediate: 100,
  advanced:     175,
}
export const LAB_DIFFICULTY_XP_DEFAULT = 75

/* ------------------------------------------------------------------ */
/*  Level thresholds                                                   */
/* ------------------------------------------------------------------ */

/** Level N requires N*100 XP cumulative: L1=100, L2=300, L3=600 ... */
export function levelFromXP(xp: number): { level: number; currentXP: number; nextLevelXP: number; progress: number } {
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

/* ------------------------------------------------------------------ */
/*  Cloud Mastery Rating (CMR)                                         */
/* ------------------------------------------------------------------ */

/** Earned only on first-time passes of unique exam codes. Cannot be grinded. */
export function computeCmrGain(examLevel: string | undefined, score: number): number {
  const l = String(examLevel ?? '').toLowerCase()
  let base = 0
  let bonus = 0
  if (l === 'foundational') { base = 20; bonus = 10 }
  else if (l === 'associate') { base = 50; bonus = 25 }
  else if (l === 'professional' || l === 'specialty') { base = 100; bonus = 50 }
  else { base = 30; bonus = 15 } // unknown level
  return base + (score >= 85 ? bonus : 0)
}

export interface CmrTier {
  minCmr: number
  name: string
}

export const CMR_TIERS: CmrTier[] = [
  { minCmr: 970, name: 'Champion'    },
  { minCmr: 820, name: 'Authority'   },
  { minCmr: 620, name: 'Specialist'  },
  { minCmr: 420, name: 'Expert'      },
  { minCmr: 270, name: 'Professional'},
  { minCmr: 170, name: 'Associate'   },
  { minCmr:  70, name: 'Practitioner'},
  { minCmr:  20, name: 'Explorer'    },
  { minCmr:   0, name: 'Newcomer'    },
]

export function cmrRank(cmr: number): string {
  for (const tier of CMR_TIERS) {
    if (cmr >= tier.minCmr) return tier.name
  }
  return 'Newcomer'
}

/* ------------------------------------------------------------------ */
/*  Domain mastery                                                     */
/* ------------------------------------------------------------------ */

export function computeMasteryTier(recentScores: number[]): { tier: DomainMastery['tier']; progress: number } {
  if (recentScores.length === 0) return { tier: 'none', progress: 0 }
  const avg = recentScores.reduce((s, v) => s + v, 0) / recentScores.length
  const count = recentScores.length
  // Bronze: >= 3 attempts with avg >= 50
  // Silver: >= 5 attempts with avg >= 70
  // Gold:   >= 7 attempts with avg >= 85
  if (count >= 7 && avg >= 85) return { tier: 'gold', progress: 100 }
  if (count >= 5 && avg >= 70) {
    const scoreProgress = Math.min(100, ((avg - 70) / 15) * 50)
    const countProgress = Math.min(50, ((count - 5) / 2) * 50)
    return { tier: 'silver', progress: Math.round(scoreProgress + countProgress) }
  }
  if (count >= 3 && avg >= 50) {
    const scoreProgress = Math.min(100, ((avg - 50) / 20) * 50)
    const countProgress = Math.min(50, ((count - 3) / 2) * 50)
    return { tier: 'bronze', progress: Math.round(scoreProgress + countProgress) }
  }
  const scoreProgress = avg >= 50 ? 50 : Math.round((avg / 50) * 50)
  const countProgress = count >= 3 ? 50 : Math.round((count / 3) * 50)
  return { tier: 'none', progress: Math.round((scoreProgress + countProgress) / 2) }
}

import type { BadgeDefinition } from './types'

/** All badge definitions — order matters for display */
export const BADGES: BadgeDefinition[] = [
  // ── Milestones ──
  {
    id: 'first_exam',
    name: 'First Steps',
    description: 'Complete your first exam',
    icon: '🎯',
    category: 'milestone',
    check: (_s, ctx) => ctx.finishedCount >= 1,
  },
  {
    id: 'five_exams',
    name: 'Getting Serious',
    description: 'Complete 5 exams',
    icon: '📚',
    category: 'milestone',
    check: (_s, ctx) => ctx.finishedCount >= 5,
  },
  {
    id: 'ten_exams',
    name: 'Dedicated Learner',
    description: 'Complete 10 exams',
    icon: '🏋️',
    category: 'milestone',
    check: (_s, ctx) => ctx.finishedCount >= 10,
  },
  {
    id: 'twentyfive_exams',
    name: 'Exam Veteran',
    description: 'Complete 25 exams',
    icon: '🎖️',
    category: 'milestone',
    check: (_s, ctx) => ctx.finishedCount >= 25,
  },
  {
    id: 'fifty_exams',
    name: 'Half-Century',
    description: 'Complete 50 exams',
    icon: '🏆',
    category: 'milestone',
    check: (_s, ctx) => ctx.finishedCount >= 50,
  },

  // ── Score-based ──
  {
    id: 'perfect_score',
    name: 'Perfectionist',
    description: 'Score 100% on an exam',
    icon: '💯',
    category: 'score',
    check: (_s, ctx) => ctx.allScores.some((s) => s >= 100),
  },
  {
    id: 'pass_first_try',
    name: 'Natural Talent',
    description: 'Pass an exam on your first attempt',
    icon: '⭐',
    category: 'score',
    check: (_s, ctx) => (ctx.attempt?.score ?? 0) >= 70 && ctx.finishedCount === 1,
  },
  {
    id: 'above_90',
    name: 'A+ Student',
    description: 'Score above 90% on any exam',
    icon: '🌟',
    category: 'score',
    check: (_s, ctx) => ctx.allScores.some((s) => s >= 90),
  },
  {
    id: 'improver',
    name: 'Growth Mindset',
    description: 'Improve your score by 20+ points between attempts',
    icon: '📈',
    category: 'score',
    check: (_s, ctx) => {
      const scores = ctx.allScores
      if (scores.length < 2) return false
      for (let i = 1; i < scores.length; i++) {
        if (scores[i] - scores[i - 1] >= 20) return true
      }
      return false
    },
  },

  // ── Streaks ──
  {
    id: 'streak_3',
    name: 'On a Roll',
    description: 'Maintain a 3-day practice streak',
    icon: '🔥',
    category: 'streak',
    check: (s) => s.streak >= 3,
  },
  {
    id: 'streak_7',
    name: 'Weekly Warrior',
    description: 'Maintain a 7-day practice streak',
    icon: '🗓️',
    category: 'streak',
    check: (s) => s.streak >= 7,
  },
  {
    id: 'streak_14',
    name: 'Fortnight Fighter',
    description: 'Maintain a 14-day practice streak',
    icon: '⚡',
    category: 'streak',
    check: (s) => s.streak >= 14,
  },
  {
    id: 'streak_30',
    name: 'Monthly Master',
    description: 'Maintain a 30-day practice streak',
    icon: '👑',
    category: 'streak',
    check: (s) => s.streak >= 30,
  },

  // ── Mastery ──
  {
    id: 'bronze_mastery',
    name: 'Bronze Scholar',
    description: 'Reach Bronze mastery in any domain',
    icon: '🥉',
    category: 'mastery',
    check: (s) => Object.values(s.domainMastery).some((d) => d.tier === 'bronze' || d.tier === 'silver' || d.tier === 'gold'),
  },
  {
    id: 'silver_mastery',
    name: 'Silver Scholar',
    description: 'Reach Silver mastery in any domain',
    icon: '🥈',
    category: 'mastery',
    check: (s) => Object.values(s.domainMastery).some((d) => d.tier === 'silver' || d.tier === 'gold'),
  },
  {
    id: 'gold_mastery',
    name: 'Gold Scholar',
    description: 'Reach Gold mastery in any domain',
    icon: '🥇',
    category: 'mastery',
    check: (s) => Object.values(s.domainMastery).some((d) => d.tier === 'gold'),
  },
  {
    id: 'all_domains',
    name: 'Renaissance Student',
    description: 'Reach Bronze+ mastery in all studied domains',
    icon: '🌍',
    category: 'mastery',
    check: (s) => {
      const domains = Object.values(s.domainMastery)
      return domains.length >= 3 && domains.every((d) => d.tier !== 'none')
    },
  },

  // ── Special ──
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Complete an exam between midnight and 5am',
    icon: '🦉',
    category: 'special',
    check: () => {
      const h = new Date().getHours()
      return h >= 0 && h < 5
    },
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    description: 'Complete an exam between 5am and 7am',
    icon: '🐦',
    category: 'special',
    check: () => {
      const h = new Date().getHours()
      return h >= 5 && h < 7
    },
  },
  {
    id: 'level_5',
    name: 'Apprentice',
    description: 'Reach Level 5',
    icon: '🔰',
    category: 'special',
    check: (s) => s.level >= 5,
  },
  {
    id: 'level_10',
    name: 'Expert',
    description: 'Reach Level 10',
    icon: '💎',
    category: 'special',
    check: (s) => s.level >= 10,
  },
  {
    id: 'xp_1000',
    name: 'XP Collector',
    description: 'Earn 1,000 XP total',
    icon: '🎪',
    category: 'special',
    check: (s) => s.xp >= 1000,
  },
  {
    id: 'xp_5000',
    name: 'XP Hoarder',
    description: 'Earn 5,000 XP total',
    icon: '💰',
    category: 'special',
    check: (s) => s.xp >= 5000,
  },
]

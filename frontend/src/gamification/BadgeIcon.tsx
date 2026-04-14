import {
  Target, BookOpen, Dumbbell, Award, Trophy,
  Microscope, FlaskConical, Telescope, Globe,
  Star, TrendingUp, Rocket, Sparkles,
  Flame, Calendar, Zap, Crown,
  GraduationCap, Gem, Shield,
  Moon, Sun,
  type LucideIcon,
} from 'lucide-react'

type BadgeConfig = { Icon: LucideIcon; color: string }

const BADGE_ICONS: Record<string, BadgeConfig> = {
  // Milestones
  first_exam:          { Icon: Target,         color: '#ef4444' },
  five_exams:          { Icon: BookOpen,        color: '#3b82f6' },
  ten_exams:           { Icon: Dumbbell,        color: '#8b5cf6' },
  twentyfive_exams:    { Icon: Award,           color: '#f97316' },
  fifty_exams:         { Icon: Trophy,          color: '#f59e0b' },

  // Skill Lab Milestones
  lab_initiate:        { Icon: Microscope,      color: '#06b6d4' },
  lab_explorer:        { Icon: FlaskConical,    color: '#10b981' },
  lab_master:          { Icon: FlaskConical,    color: '#8b5cf6' },
  lab_diversity:       { Icon: Telescope,       color: '#6366f1' },

  // Score
  perfect_score:       { Icon: Star,            color: '#f59e0b' },
  pass_first_try:      { Icon: Star,            color: '#fbbf24' },
  above_90:            { Icon: Sparkles,        color: '#fbbf24' },
  improver:            { Icon: TrendingUp,      color: '#10b981' },
  perseverance:        { Icon: Shield,          color: '#6b7280' },
  comeback_kid:        { Icon: Rocket,          color: '#6366f1' },
  full_exam_perfect:   { Icon: Sparkles,        color: '#ec4899' },

  // Streaks
  streak_3:            { Icon: Flame,           color: '#ef4444' },
  streak_7:            { Icon: Calendar,        color: '#f59e0b' },
  streak_14:           { Icon: Zap,             color: '#a78bfa' },
  streak_30:           { Icon: Crown,           color: '#f59e0b' },

  // Mastery
  bronze_mastery:      { Icon: Award,           color: '#cd7f32' },
  silver_mastery:      { Icon: Award,           color: '#9ca3af' },
  gold_mastery:        { Icon: Trophy,          color: '#f59e0b' },
  all_domains:         { Icon: Globe,           color: '#10b981' },

  // Journey
  dual_certified:      { Icon: GraduationCap,   color: '#6366f1' },
  triple_certified:    { Icon: Award,           color: '#f97316' },
  quad_certified:      { Icon: Gem,             color: '#06b6d4' },
  specialist_achieved: { Icon: Star,            color: '#f97316' },
  multi_provider:      { Icon: Globe,           color: '#3b82f6' },

  // Special
  night_owl:           { Icon: Moon,            color: '#818cf8' },
  early_bird:          { Icon: Sun,             color: '#f59e0b' },
  level_5:             { Icon: Shield,          color: '#10b981' },
  level_10:            { Icon: Gem,             color: '#3b82f6' },
  xp_1000:             { Icon: Zap,             color: '#ec4899' },
  xp_5000:             { Icon: Zap,             color: '#f59e0b' },
  xp_10000:            { Icon: Star,            color: '#6366f1' },
  xp_25000:            { Icon: Sparkles,        color: '#f59e0b' },
}

const DEFAULT: BadgeConfig = { Icon: Award, color: '#f59e0b' }

export function BadgeIcon({ id, size = 20 }: { id: string; size?: number }) {
  const { Icon, color } = BADGE_ICONS[id] ?? DEFAULT
  return <Icon size={size} style={{ color }} strokeWidth={1.75} />
}

import type { SkillLevel } from './types'

export type { ProviderMeta as PlatformMeta } from '@/lib/providerLogos'
export { normalisePlatformKey, getProviderLogo as getPlatformMeta } from '@/lib/providerLogos'
export { CloudIcon } from '@/components/CloudIcon'

export const DIFFICULTY_COLORS: Record<SkillLevel, string> = {
  beginner: 'bg-green-500/15 text-green-700 dark:text-green-400',
  intermediate: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  advanced: 'bg-red-500/15 text-red-700 dark:text-red-400',
}

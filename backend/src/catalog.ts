/**
 * Product & tier catalog - single source of truth for pricing,
 * feature gating, and what each tier unlocks.
 */

/* ------------------------------------------------------------------ */
/*  Tiers                                                              */
/* ------------------------------------------------------------------ */

export type Tier = 'visitor' | 'registered' | 'pro' | 'pro_plus'

export interface TierConfig {
  tier: Tier
  label: string
  /** Max questions a user can access per exam (null = unlimited) */
  questionLimit: number | null
  /** Max saved attempts per exam (null = unlimited) */
  attemptLimit: number | null
  /** Can view detailed review / explanations after attempt */
  reviewEnabled: boolean
  /** Can export CSV / PDF */
  exportEnabled: boolean
  /** Can opt-in to public leaderboard */
  leaderboardEnabled: boolean
  /** Can view domain mastery history */
  domainMasteryEnabled: boolean
  /** Days after registration the showcase trial is active (null = no trial limit) */
  trialDays: number | null
  /** Max showcase skill labs this tier can access (null = all labs) */
  labShowcaseCount: number | null
}

export const TIERS: Record<Tier, TierConfig> = {
  visitor: {
    tier: 'visitor',
    label: 'Free / Visitor',
    questionLimit: 20,
    attemptLimit: 0,
    reviewEnabled: false,
    exportEnabled: false,
    leaderboardEnabled: false,
    domainMasteryEnabled: false,
    trialDays: null,
    labShowcaseCount: 6,
  },
  registered: {
    tier: 'registered',
    label: 'Free',
    questionLimit: 40,
    attemptLimit: null,
    reviewEnabled: true,
    exportEnabled: true,
    leaderboardEnabled: false,
    domainMasteryEnabled: false,
    trialDays: null,
    labShowcaseCount: 6,
  },
  pro: {
    tier: 'pro',
    label: 'Pro',
    questionLimit: null,
    attemptLimit: null,
    reviewEnabled: true,
    exportEnabled: true,
    leaderboardEnabled: true,
    domainMasteryEnabled: true,
    trialDays: null,
    labShowcaseCount: 12,
  },
  pro_plus: {
    tier: 'pro_plus',
    label: 'Pro Plus',
    questionLimit: null,
    attemptLimit: null,
    reviewEnabled: true,
    exportEnabled: true,
    leaderboardEnabled: true,
    domainMasteryEnabled: true,
    trialDays: null,
    labShowcaseCount: null,
  },
}

/** Returns true if the tier has a paid plan (Pro or Pro Plus). */
export function isPaidTier(tier: Tier): boolean {
  return tier === 'pro' || tier === 'pro_plus'
}

/* ------------------------------------------------------------------ */
/*  Products                                                           */
/* ------------------------------------------------------------------ */

export type ProductKind = 'subscription' | 'one-off' | 'extra' // 'one-off' kept for backward-compat with existing entitlement records

export interface Product {
  /** e.g. "sub:pro", "sub:pro-plus", "sub:pro-oneoff" */
  productId: string
  kind: ProductKind
  label: string
  description: string
  /** Price in pence (GBP) - e.g. 800 = £8.00 */
  priceGBP: number
  /** If subscription, the billing period */
  billingPeriod?: 'monthly'
}

/**
 * Master product list — subscriptions only.
 *
 * subscription  — recurring monthly payment (Stripe recurring / PayPal Billing Plan)
 */
export const PRODUCTS: Product[] = [
  {
    productId: 'sub:pro',
    kind: 'subscription',
    label: 'Pro',
    description: 'Full access to all practice exams and 80+ skill labs. Cancel anytime.',
    priceGBP: 700,
    billingPeriod: 'monthly',
  },
  {
    productId: 'sub:pro-plus',
    kind: 'subscription',
    label: 'Pro Plus',
    description: 'Full access to all practice exams and all skill labs. Cancel anytime.',
    priceGBP: 900,
    billingPeriod: 'monthly',
  },
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function getProduct(productId: string): Product | undefined {
  return PRODUCTS.find((p) => p.productId === productId)
}

/** Resolve the effective tier for a user */
export function resolveUserTier(opts: {
  isAuthenticated: boolean
  ownedProductIds: string[]
  /** @deprecated No longer used — kept for call-site compatibility */
  examCode?: string
}): Tier {
  if (!opts.isAuthenticated) return 'visitor'

  const ids = opts.ownedProductIds

  // Pro Plus wins over Pro
  if (ids.includes('sub:pro-plus') || ids.includes('sub:pro-plus-oneoff')) return 'pro_plus'
  if (ids.includes('sub:pro') || ids.includes('sub:pro-oneoff')) return 'pro'

  return 'registered'
}

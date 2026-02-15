/**
 * Product & tier catalog — single source of truth for pricing,
 * feature gating, and what each tier unlocks.
 *
 * Stripe integration is scaffolded but will be wired later.
 */

/* ------------------------------------------------------------------ */
/*  Tiers                                                              */
/* ------------------------------------------------------------------ */

export type Tier = 'visitor' | 'registered' | 'paying'

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
}

export const TIERS: Record<Tier, TierConfig> = {
  visitor: {
    tier: 'visitor',
    label: 'Free / Visitor',
    questionLimit: 10,
    attemptLimit: null,
    reviewEnabled: true,
    exportEnabled: true,
    leaderboardEnabled: true,
    domainMasteryEnabled: true,
  },
  registered: {
    tier: 'registered',
    label: 'Registered (Free)',
    questionLimit: 25,
    attemptLimit: 1,
    reviewEnabled: true,
    exportEnabled: false,
    leaderboardEnabled: false,
    domainMasteryEnabled: false,
  },
  paying: {
    tier: 'paying',
    label: 'Paying',
    questionLimit: null,
    attemptLimit: null,
    reviewEnabled: true,
    exportEnabled: true,
    leaderboardEnabled: true,
    domainMasteryEnabled: true,
  },
}

/* ------------------------------------------------------------------ */
/*  Products (Stripe SKUs)                                             */
/* ------------------------------------------------------------------ */

export type ProductKind = 'exam' | 'bundle' | 'subscription' | 'extra'

export interface Product {
  /** e.g. "exam:SAA-C03", "bundle:aws", "sub:all-access" */
  productId: string
  kind: ProductKind
  label: string
  description: string
  /** Price in pence (GBP) — e.g. 300 = £3.00 */
  priceGBP: number
  /** If subscription, the billing period */
  billingPeriod?: 'monthly' | 'annual'
  /** If bundle, list of exam codes included */
  examCodes?: string[]
  /** Stripe Price ID — filled in when Stripe products are created */
  stripePriceId?: string
}

/**
 * Master product list.
 * New exams/bundles are added here; Stripe Price IDs are populated later.
 */
export const PRODUCTS: Product[] = [
  // ── Single exams ──
  {
    productId: 'exam:SAA-C03',
    kind: 'exam',
    label: 'AWS SAA-C03',
    description: 'Full access to AWS Solutions Architect Associate practice exam',
    priceGBP: 300,
  },
  {
    productId: 'exam:CLF-C02',
    kind: 'exam',
    label: 'AWS CLF-C02',
    description: 'Full access to AWS Cloud Practitioner practice exam',
    priceGBP: 300,
  },
  {
    productId: 'exam:DVA-C02',
    kind: 'exam',
    label: 'AWS DVA-C02',
    description: 'Full access to AWS Developer Associate practice exam',
    priceGBP: 300,
  },
  {
    productId: 'exam:SOA-C02',
    kind: 'exam',
    label: 'AWS SOA-C02',
    description: 'Full access to AWS SysOps Administrator practice exam',
    priceGBP: 300,
  },
  {
    productId: 'exam:AZ-900',
    kind: 'exam',
    label: 'Azure AZ-900',
    description: 'Full access to Azure Fundamentals practice exam',
    priceGBP: 300,
  },

  // ── Bundles ──
  {
    productId: 'bundle:aws',
    kind: 'bundle',
    label: 'AWS Bundle',
    description: 'All AWS certification practice exams',
    priceGBP: 900,
    examCodes: ['SAA-C03', 'CLF-C02', 'DVA-C02', 'SOA-C02'],
  },

  // ── Subscription ──
  {
    productId: 'sub:all-access',
    kind: 'subscription',
    label: 'Unlimited (Monthly)',
    description: 'Full access to every exam — billed monthly',
    priceGBP: 600,
    billingPeriod: 'monthly',
  },
  {
    productId: 'sub:all-access-annual',
    kind: 'subscription',
    label: 'Unlimited (Annual)',
    description: 'Full access to every exam — billed annually (save 25%)',
    priceGBP: 5400,
    billingPeriod: 'annual',
  },

  // ── Extras ──
  {
    productId: 'extra:pdf-report',
    kind: 'extra',
    label: 'PDF Report Export',
    description: 'Export detailed PDF reports of your exam attempts',
    priceGBP: 99,
  },
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function getProduct(productId: string): Product | undefined {
  return PRODUCTS.find((p) => p.productId === productId)
}

/** Given a set of product IDs the user owns, does that grant access to the exam? */
export function hasExamAccess(ownedProductIds: string[], examCode: string): boolean {
  // Direct exam purchase
  if (ownedProductIds.includes(`exam:${examCode}`)) return true

  // Bundle that includes this exam
  for (const pid of ownedProductIds) {
    const prod = getProduct(pid)
    if (prod?.kind === 'bundle' && prod.examCodes?.includes(examCode)) return true
  }

  // Active subscription (all-access)
  if (ownedProductIds.some((id) => id.startsWith('sub:'))) return true

  return false
}

/** Resolve the effective tier for a user */
export function resolveUserTier(opts: {
  isAuthenticated: boolean
  ownedProductIds: string[]
  examCode?: string
}): Tier {
  if (!opts.isAuthenticated) return 'visitor'

  // If they have any active entitlement for the exam (or a subscription), they're 'paying' for that exam
  if (opts.examCode && hasExamAccess(opts.ownedProductIds, opts.examCode)) return 'paying'

  // If they have any subscription at all they're paying-tier everywhere
  if (opts.ownedProductIds.some((id) => id.startsWith('sub:'))) return 'paying'

  return 'registered'
}

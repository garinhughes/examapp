/**
 * Product & tier catalog - single source of truth for pricing,
 * feature gating, and what each tier unlocks.
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
  /** Days after registration the showcase trial is active (null = no trial limit) */
  trialDays: number | null
  /** Max showcase skill labs this tier can access (null = all labs) */
  labShowcaseCount: number | null
}

export const TIERS: Record<Tier, TierConfig> = {
  visitor: {
    tier: 'visitor',
    label: 'Free / Visitor',
    questionLimit: 10,
    attemptLimit: 0,
    reviewEnabled: false,
    exportEnabled: false,
    leaderboardEnabled: false,
    domainMasteryEnabled: false,
    trialDays: null,
    labShowcaseCount: 3,
  },
  registered: {
    tier: 'registered',
    label: 'Registered (Free)',
    questionLimit: 40,
    attemptLimit: 3,
    reviewEnabled: true,
    exportEnabled: true,
    leaderboardEnabled: false,
    domainMasteryEnabled: false,
    trialDays: 3,
    labShowcaseCount: 6,
  },
  paying: {
    tier: 'paying',
    label: 'Paid',
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

/* ------------------------------------------------------------------ */
/*  Products                                                           */
/* ------------------------------------------------------------------ */

export type ProductKind = 'exam' | 'bundle' | 'subscription' | 'extra'

export interface Product {
  /** e.g. "exam:SAA-C03", "bundle:aws", "sub:all-access" */
  productId: string
  kind: ProductKind
  label: string
  description: string
  /** Price in pence (GBP) - e.g. 300 = £3.00 */
  priceGBP: number
  /** If subscription, the billing period */
  billingPeriod?: 'monthly' | 'annual'
  /** If bundle, list of exam codes included */
  examCodes?: string[]
  /** Cloud provider — used to group exam passes in the UI */
  provider?: string
}

/**
 * Master product list.
 */
export const PRODUCTS: Product[] = [
  // -- Single exams (Exam Pass - £9 each, 1 year access) --
  {
    productId: 'exam:SAA-C03',
    kind: 'exam',
    label: 'Exam Pass - SAA-C03',
    description: 'AWS Solutions Architect Associate - full question bank + all AWS skill labs for 1 year',
    priceGBP: 900,
    examCodes: ['SAA-C03'],
    provider: 'AWS',
  },
  {
    productId: 'exam:CLF-C02',
    kind: 'exam',
    label: 'Exam Pass - CLF-C02',
    description: 'AWS Cloud Practitioner - full question bank + all AWS skill labs for 1 year',
    priceGBP: 900,
    examCodes: ['CLF-C02'],
    provider: 'AWS',
  },
  {
    productId: 'exam:DVA-C02',
    kind: 'exam',
    label: 'Exam Pass - DVA-C02',
    description: 'AWS Developer Associate - full question bank + all AWS skill labs for 1 year',
    priceGBP: 900,
    examCodes: ['DVA-C02'],
    provider: 'AWS',
  },
  {
    productId: 'exam:SOA-C02',
    kind: 'exam',
    label: 'Exam Pass - SOA-C02',
    description: 'AWS SysOps Administrator Associate - full question bank + all AWS skill labs for 1 year',
    priceGBP: 900,
    examCodes: ['SOA-C02'],
    provider: 'AWS',
  },
  {
    productId: 'exam:SCS-C03',
    kind: 'exam',
    label: 'Exam Pass - SCS-C03',
    description: 'AWS Security Specialty - full question bank + all AWS skill labs for 1 year',
    priceGBP: 900,
    examCodes: ['SCS-C03'],
    provider: 'AWS',
  },
  {
    productId: 'exam:AZ-900',
    kind: 'exam',
    label: 'Exam Pass - AZ-900',
    description: 'Azure Fundamentals - full question bank + all Azure skill labs for 1 year',
    priceGBP: 900,
    examCodes: ['AZ-900'],
    provider: 'Azure',
  },

  // -- Bundles (Exam Pack - pick 2 for £17, pick 3 for £25) --
  {
    productId: 'bundle:pick-2',
    kind: 'bundle',
    label: 'Exam Pack - Any 2 Exams',
    description: 'Choose any 2 practice exams + provider skill labs for 1 year (save over individual purchases)',
    priceGBP: 1700,
  },
  {
    productId: 'bundle:pick-3',
    kind: 'bundle',
    label: 'Exam Pack - Any 3 Exams',
    description: 'Choose any 3 practice exams + provider skill labs for 1 year (best multi-exam value)',
    priceGBP: 2500,
  },

  // -- Subscription (All-Access) --
  {
    productId: 'sub:all-access',
    kind: 'subscription',
    label: 'All-Access Monthly',
    description: 'Unlimited access to every exam, all skill labs, certificates, leaderboard & more',
    priceGBP: 1000,
    billingPeriod: 'monthly',
  },
  {
    productId: 'sub:all-access-annual',
    kind: 'subscription',
    label: 'All-Access Annual',
    description: 'Unlimited access - billed annually at £8/mo (save 20%)',
    priceGBP: 9600,
    billingPeriod: 'annual',
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

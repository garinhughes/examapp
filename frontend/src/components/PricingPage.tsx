/**
 * PricingPage - three plan cards (Free, Pro, Pro Plus) with billing toggle
 * and optional discount display.
 */

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useEntitlements, isPaidTier, type CatalogProduct } from '../hooks/useEntitlements'
import { useBasket } from '../basket/BasketContext'
import { useExam } from '../exam/ExamContext'
import { Check, X, ShoppingCart, Hourglass } from 'lucide-react'
import { clarityEvent, clarityTag } from '../clarity'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatPrice(pence: number): string {
  const pounds = pence / 100
  return pounds % 1 === 0 ? `£${pounds}` : `£${pounds.toFixed(2)}`
}

/* ------------------------------------------------------------------ */
/*  Feature comparison table                                           */
/* ------------------------------------------------------------------ */

interface FeatureDef {
  label: string
  free: string
  pro: string
  proPlus: string
}

const FEATURES: FeatureDef[] = [
  { label: 'Practice exams',           free: '40 questions',    pro: 'Full question bank', proPlus: 'Full question bank' },
  { label: 'Skill labs',               free: '12 per provider', pro: '12 per provider',   proPlus: 'All (full access)' },
  { label: 'Saved attempts',           free: 'Unlimited',       pro: 'Unlimited',         proPlus: 'Unlimited' },
  { label: 'Review & explanations',    free: '✓',               pro: '✓',                proPlus: '✓' },
  { label: 'Analytics & badges',       free: '✓',               pro: '✓',                proPlus: '✓' },
  { label: 'Leaderboard',              free: '-',               pro: '✓',                proPlus: '✓' },
  { label: 'Certificates',             free: '-',               pro: '✓',                proPlus: '✓' },
  { label: 'Report issues',            free: '-',               pro: '✓',                proPlus: '✓' },
  { label: 'Request content',          free: '-',               pro: '✓',                proPlus: '✓' },
]

function FeatureTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b-2 border-border">
            <th className="py-3 px-3 text-sm font-semibold text-muted-foreground w-2/5">Feature</th>
            <th className="py-3 px-3 text-sm font-semibold text-center text-muted-foreground">Free</th>
            <th className="py-3 px-3 text-sm font-semibold text-center text-foreground">Pro</th>
            <th className="py-3 px-3 text-sm font-semibold text-center text-primary">Pro Plus</th>
          </tr>
        </thead>
        <tbody>
          {FEATURES.map((f) => (
            <tr key={f.label} className="border-t border-border">
              <td className="py-2.5 px-3 text-sm font-medium text-foreground">{f.label}</td>
              <td className="py-2.5 px-3 text-sm text-center text-muted-foreground">{f.free}</td>
              <td className="py-2.5 px-3 text-sm text-center text-foreground">{f.pro}</td>
              <td className="py-2.5 px-3 text-sm text-center font-semibold text-primary">{f.proPlus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Plan definitions                                                   */
/* ------------------------------------------------------------------ */

interface PlanDef {
  name: string
  tier: 'registered' | 'pro' | 'pro_plus'
  monthlyProductId: string | null
  features: string[]
  missingFeatures?: string[]
  badge?: string
}

const PLAN_DEFS: PlanDef[] = [
  {
    name: 'Free',
    tier: 'registered',
    monthlyProductId: null,
    features: [
      '40 questions per exam',
      '40+ skill labs',
      'Review & explanations',
      'Analytics & badges',
      'Unlimited saved attempts',
    ],
    missingFeatures: ['Full question banks', 'Full skill lab access', 'Leaderboard', 'Certificates'],
  },
  {
    name: 'Pro',
    tier: 'pro',
    monthlyProductId: 'sub:pro',
    badge: 'Exam ready package',
    features: [
      'Full question banks (all exams)',
      '80+ skill labs',
      'Review & explanations',
      'Analytics & badges',
      'Leaderboard',
      'Certificates',
      'Request content & features',
    ],
    missingFeatures: ['Full skill lab access'],
  },
  {
    name: 'Pro Plus',
    tier: 'pro_plus',
    monthlyProductId: 'sub:pro-plus',
    badge: 'Job ready package',
    features: [
      'Full question banks (all exams)',
      'All 200+ skill labs',
      'Review & explanations',
      'Analytics & badges',
      'Leaderboard',
      'Certificates',
      'Request content & features',
    ],
  },
]

/* ------------------------------------------------------------------ */
/*  Plan card                                                          */
/* ------------------------------------------------------------------ */

interface PlanCardProps {
  plan: PlanDef
  currentTier: string
  products: CatalogProduct[]
  discountActive: boolean
  onBuy: (product: CatalogProduct) => void
  inBasket: (productId: string) => boolean
  onSignUp: () => void
}

function PlanCard({ plan, currentTier, products, discountActive, onBuy, inBasket, onSignUp }: PlanCardProps) {
  const navigate = useNavigate()
  const isCurrent = currentTier === plan.tier
  const isHigherThanCurrent =
    (plan.tier === 'pro' && (currentTier === 'registered' || currentTier === 'visitor')) ||
    (plan.tier === 'pro_plus' && currentTier !== 'pro_plus')

  const productId = plan.monthlyProductId
  const product = productId ? products.find((p) => p.productId === productId) : null
  const basePrice = product?.priceGBP ?? 0
  const discountedPrice = discountActive ? product?.discountedPriceGBP : undefined
  const effectivePrice = discountedPrice ?? basePrice
  const productInBasket = productId ? inBasket(productId) : false

  const isPopular = plan.tier === 'pro_plus'
  const isFree = plan.monthlyProductId === null

  return (
    <div className={`relative flex flex-col rounded-2xl border transition-all ${
      plan.badge ? 'pt-8 px-6 pb-6' : 'p-6'
    } ${
      isPopular
        ? 'border-primary ring-2 ring-primary/30 bg-card'
        : 'border-border bg-card hover:border-primary/50'
    }`}>
      {plan.badge && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider whitespace-nowrap bg-primary text-primary-foreground">
          {plan.badge}
        </div>
      )}

      {/* Name + price */}
      <div className="mb-5">
        <h3 className="text-xl font-bold text-foreground">
          <span className="text-primary font-extrabold mr-1">//</span>{plan.name}
        </h3>
        {isFree ? (
          <div className="mt-2">
            <div>
              <span className="text-3xl font-extrabold text-foreground">£0</span>
              <span className="text-muted-foreground text-sm ml-1">forever</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Register free · no card required</p>
          </div>
        ) : (
          <div className="mt-2 flex items-baseline gap-2 flex-wrap">
            {discountedPrice !== undefined ? (
              <>
                <span className="text-3xl font-extrabold text-foreground">{formatPrice(discountedPrice)}</span>
                <span className="text-lg line-through text-muted-foreground">{formatPrice(basePrice)}</span>
              </>
            ) : (
              <span className="text-3xl font-extrabold text-foreground">{formatPrice(basePrice)}</span>
            )}
            <span className="text-muted-foreground text-sm">/month</span>
          </div>
        )}
        {!isFree && (
          <p className="text-xs text-muted-foreground mt-1">Auto-renews monthly · cancel anytime</p>
        )}
      </div>

      {/* Features */}
      <ul className="space-y-2 mb-6 flex-1">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span className="text-foreground">{f}</span>
          </li>
        ))}
        {plan.missingFeatures?.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm">
            <X className="w-4 h-4 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
            <span className="text-muted-foreground">{f}</span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      {isFree ? (
        <div className="mt-auto">
          {isCurrent ? (
            <span className="inline-flex w-full justify-center items-center py-2.5 rounded-lg text-sm font-semibold text-muted-foreground bg-muted">
              Your current plan
            </span>
          ) : (
            <button
              onClick={onSignUp}
              className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all inline-flex items-center justify-center bg-foreground text-background hover:bg-foreground/80"
            >
              Sign up free
            </button>
          )}
        </div>
      ) : isCurrent ? (
        <div className="mt-auto">
          <span className="inline-flex w-full justify-center items-center py-2.5 rounded-lg text-sm font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
            <Check className="w-4 h-4 mr-1.5" /> Current plan
          </span>
        </div>
      ) : productInBasket ? (
        <div className="mt-auto">
          <button
            onClick={() => navigate('/basket')}
            className="inline-flex w-full justify-center items-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors"
          >
            <ShoppingCart className="w-4 h-4" /> View in basket
          </button>
        </div>
      ) : product ? (
        <button
          onClick={() => onBuy(product)}
          className="mt-auto w-full py-2.5 rounded-lg text-sm font-semibold transition-all inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/80"
        >
          <ShoppingCart className="w-4 h-4" />
          {isHigherThanCurrent ? 'Get started' : 'Add to basket'}
        </button>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function PricingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { tier, products, discountActive, loading } = useEntitlements()
  const basket = useBasket()
  const { showToast } = useExam()
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    clarityTag('funnel_stage', 'pricing')
    clarityEvent('pricing_page_viewed')
  }, [])

  const handleBuy = (product: CatalogProduct) => {
    clarityEvent('add_to_basket')
    clarityTag('product_added', `${product.kind}:${product.productId}`)
    clarityTag('funnel_stage', 'add_to_basket')
    const ok = basket.add(product)
    if (ok) {
      setActionError(null)
      showToast(`${product.label} added to basket`, 'info')
    } else {
      setActionError(basket.lastError)
    }
  }

  const tierLabel =
    tier === 'pro_plus' ? 'Pro Plus'
    : tier === 'pro' ? 'Pro'
    : tier === 'registered' ? 'Free'
    : 'Visitor'

  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-extrabold">Simple, fair pricing</h2>
        <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
          Start free. Upgrade for full access to all practice exams and skill labs.
        </p>
        {tier && (
          <div className="mt-3 flex flex-col items-center gap-1">
            <div className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary">
              Your plan: <span className="font-bold">{tierLabel}</span>
            </div>
            {tier === 'visitor' && (
              <p className="text-xs text-muted-foreground">
                20 questions per exam &amp; 6 labs per provider, always free, no registration required
              </p>
            )}
          </div>
        )}
      </div>

      {/* Discount banner */}
      {discountActive && (
        <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
          <Hourglass className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
            Limited time offer - Discounted prices applied automatically at checkout.
          </p>
        </div>
      )}

      {actionError && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {actionError}
          <button className="ml-2 underline text-xs" onClick={() => setActionError(null)}>Dismiss</button>
        </div>
      )}

      {/* Plan cards */}
      {loading ? (
        <div className="text-center text-sm text-muted-foreground py-8">Loading plans…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {PLAN_DEFS.map((plan) => (
            <PlanCard
              key={plan.name}
              plan={plan}
              currentTier={tier}
              products={products}
              discountActive={discountActive}
              onBuy={handleBuy}
              inBasket={basket.has.bind(basket)}
              onSignUp={() => navigate('/login')}
            />
          ))}
        </div>
      )}

      {/* Not logged in CTA */}
      {!user && (
        <div className="text-center p-6 rounded-xl border border-dashed border-border bg-muted/40">
          <p className="text-muted-foreground mb-3">
            Register for free to unlock 40 questions per exam, analytics, badges, and unlimited saved attempts.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="px-5 py-2 rounded-lg bg-primary text-primary-foreground font-semibold"
          >
            Login / Register
          </button>
        </div>
      )}

    </div>
  )
}

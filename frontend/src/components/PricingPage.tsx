/**
 * PricingPage - plan comparison, product catalog, and recommendation wizard.
 *
 * Stripe checkout is stubbed; buy buttons show a preview until Stripe is configured.
 */

import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useEntitlements, type CatalogProduct } from '../hooks/useEntitlements'
import { useAuthFetch } from '../auth/useAuthFetch'
import { useBasket } from '../basket/BasketContext'
import { Check, Sparkles, ChevronRight, RotateCcw, Zap, Award, ChevronDown, ShoppingCart } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const CHECK = '✓'
const CROSS = '—'

function formatPrice(pence: number): string {
  const pounds = pence / 100
  return pounds % 1 === 0 ? `£${pounds}` : `£${pounds.toFixed(2)}`
}

function ComingSoonBadge() {
  return (
    <span className="ml-1.5 inline-block text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
      Coming soon
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Feature comparison table                                           */
/* ------------------------------------------------------------------ */

interface FeatureDef {
  label: string
  visitor: string
  registered: string
  paid: string
  comingSoon?: boolean
}

const FEATURES: FeatureDef[] = [
  { label: 'Practice questions',     visitor: '10 sample', registered: '40 questions per exam', paid: 'Full question bank' },
  { label: 'Skill Labs',             visitor: '3 labs',     registered: '6 labs',               paid: 'All labs' },
  { label: 'Review & explanations',  visitor: CHECK,       registered: CHECK,                  paid: CHECK },
  { label: 'Saved attempts',         visitor: CROSS,       registered: '3 per exam',           paid: 'Unlimited' },
  { label: 'Analytics',              visitor: CROSS,      registered: CHECK,                  paid: CHECK },
  { label: 'CSV / PDF export',       visitor: CROSS,       registered: '1 per exam',           paid: CHECK },
  { label: 'Leaderboard',            visitor: CROSS,       registered: CROSS,                  paid: CHECK },
  { label: 'Rewards & badges',       visitor: CROSS,       registered: CHECK,                  paid: CHECK },
  { label: 'Report issues',          visitor: CROSS,       registered: CROSS,                  paid: CHECK },
  { label: 'Request features',       visitor: CROSS,       registered: CROSS,                  paid: CHECK },
  { label: 'Certificates',           visitor: CROSS,       registered: CROSS,                  paid: CHECK },
]

function FeatureRow({ f }: { f: FeatureDef }) {
  return (
    <tr className="border-t border-border">
      <td className="py-2.5 px-3 text-sm font-medium text-foreground">
        {f.label}
        {f.comingSoon && <ComingSoonBadge />}
      </td>
      <td className="py-2.5 px-3 text-sm text-center text-muted-foreground">{f.visitor}</td>
      <td className="py-2.5 px-3 text-sm text-center text-muted-foreground">{f.registered}</td>
      <td className="py-2.5 px-3 text-sm text-center font-semibold text-primary">{f.paid}</td>
    </tr>
  )
}

/* ------------------------------------------------------------------ */
/*  Product card                                                       */
/* ------------------------------------------------------------------ */

function ProductCard({ product, onBuy, bestValue, inBasket }: { product: CatalogProduct; onBuy: (p: CatalogProduct) => void; bestValue?: boolean; inBasket?: boolean }) {
  const kindLabels: Record<string, string> = {
    exam: 'Exam Pass',
    bundle: 'Exam Pack',
    subscription: 'All-Access',
  }

  return (
    <div className={`relative p-4 rounded-xl border transition-all flex flex-col ${
      product.owned
        ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50/50 dark:bg-emerald-900/10'
        : bestValue
          ? 'border-primary ring-2 ring-primary/30 bg-card'
          : 'border-border bg-card hover:border-primary'
    }`}>
      {bestValue && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-primary text-primary-foreground">
          Best value
        </div>
      )}
      <div className="flex items-start justify-between">
        <div>
          <span className="inline-block text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground mb-1.5">
            {kindLabels[product.kind] ?? product.kind}
          </span>
          <h3 className="font-semibold text-foreground">{product.label}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{product.description}</p>
          {product.billingPeriod && (
            <p className="text-xs text-muted-foreground mt-1">Billed {product.billingPeriod === 'annual' ? 'annually' : 'monthly'}</p>
          )}
        </div>
        <div className="text-right ml-4 flex-shrink-0">
          <div className="text-xl font-bold text-foreground">{formatPrice(product.priceGBP)}</div>
          {product.billingPeriod === 'monthly' && <div className="text-xs text-muted-foreground">/month</div>}
          {product.billingPeriod === 'annual' && <div className="text-xs text-muted-foreground">/year</div>}
          {!product.billingPeriod && product.kind !== 'subscription' && <div className="text-xs text-muted-foreground">one-off</div>}
        </div>
      </div>

      {product.examCodes && product.examCodes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {product.examCodes.map((c) => (
            <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
              {c}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 mt-auto">
        {product.owned ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="w-4 h-4" /> Owned
          </span>
        ) : inBasket ? (
          <span className="inline-flex items-center gap-1 w-full justify-center text-sm font-medium text-primary">
            <ShoppingCart className="w-4 h-4" /> In basket
          </span>
        ) : (
          <button
            onClick={() => onBuy(product)}
            className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/80 transition-all inline-flex items-center justify-center gap-1.5"
          >
            <ShoppingCart className="w-4 h-4" /> Add to basket
          </button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Recommendation wizard                                              */
/* ------------------------------------------------------------------ */

type WizardStep = 'start' | 'how-many' | 'pick-exams' | 'result'

function RecommendationWizard({ products, onBuy }: { products: CatalogProduct[]; onBuy: (p: CatalogProduct) => void }) {
  const basket = useBasket()
  const [step, setStep] = useState<WizardStep>('start')
  const [wantLabs, setWantLabs] = useState(false)
  const [examCount, setExamCount] = useState<'one' | 'two' | 'three-plus' | null>(null)
  const [pickedExams, setPickedExams] = useState<string[]>([])

  const examProducts = products.filter((p) => p.kind === 'exam')
  const availableExams = examProducts.map((p) => ({
    code: p.examCodes?.[0] ?? p.productId.replace('exam:', ''),
    label: p.label.replace('Exam Pass - ', ''),
    description: p.description,
  }))

  const recommendation = useMemo(() => {
    if (step !== 'result') return null

    const numExams = pickedExams.length || (examCount === 'one' ? 1 : examCount === 'two' ? 2 : 3)

    // 3+ exams or wants labs with multiple -> subscription
    if (numExams >= 3 || (numExams >= 2 && wantLabs)) {
      const annual = products.find((p) => p.productId === 'sub:all-access-annual')
      const monthly = products.find((p) => p.productId === 'sub:all-access')
      return {
        primary: annual,
        alternative: monthly,
        reason: `With ${numExams} exams${wantLabs ? ' + skill labs' : ''}, the All-Access Annual plan is your best value at £8/month.`,
      }
    }

    // 2 exams -> bundle
    if (numExams === 2) {
      const bundle = products.find((p) => p.productId === 'bundle:pick-2')
      const singleTotal = numExams * 900
      const saving = singleTotal - (bundle?.priceGBP ?? 1700)
      return {
        primary: bundle,
        alternative: products.find((p) => p.productId === 'sub:all-access'),
        reason: `The 2-exam pack saves you ${formatPrice(saving)} compared to buying individually.`,
      }
    }

    // 1 exam -> single exam pass
    const match = pickedExams.length > 0
      ? products.find((p) => p.productId === `exam:${pickedExams[0]}`)
      : examProducts[0]
    return {
      primary: match,
      alternative: products.find((p) => p.productId === 'sub:all-access'),
      reason: 'A single Exam Pass gives you a full year of access to the question bank and all provider skill labs.',
    }
  }, [step, pickedExams, examCount, wantLabs, products, examProducts])

  function reset() {
    setStep('start')
    setWantLabs(false)
    setExamCount(null)
    setPickedExams([])
  }

  function toggleExam(code: string) {
    setPickedExams((prev) => prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code])
  }

  return (
    <div className="p-5 rounded-xl border border-primary/30 bg-primary/5">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-bold text-foreground">Find your plan</h3>
      </div>

      {/* Step: start */}
      {step === 'start' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">What are you looking for?</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setWantLabs(false); setStep('how-many') }} className="px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:border-primary transition">
              Practice exams
            </button>
            <button onClick={() => { setWantLabs(true); setStep('how-many') }} className="px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:border-primary transition">
              Exams + Skill Labs
            </button>
            <button onClick={() => { setWantLabs(true); setExamCount('three-plus'); setStep('result') }} className="px-4 py-2 rounded-lg border border-primary bg-primary/10 text-sm font-medium text-primary hover:bg-primary/20 transition">
              Everything - unlimited access
            </button>
          </div>
        </div>
      )}

      {/* Step: how-many */}
      {step === 'how-many' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">How many exams are you preparing for?</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setExamCount('one'); setStep('pick-exams') }} className="px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:border-primary transition">
              1 exam
            </button>
            <button onClick={() => { setExamCount('two'); setStep('pick-exams') }} className="px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:border-primary transition">
              2 exams
            </button>
            <button onClick={() => { setExamCount('three-plus'); setStep('result') }} className="px-4 py-2 rounded-lg border border-primary bg-primary/10 text-sm font-medium text-primary hover:bg-primary/20 transition">
              3 or more
            </button>
          </div>
          <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mt-1">
            <RotateCcw className="w-3 h-3" /> Start over
          </button>
        </div>
      )}

      {/* Step: pick-exams */}
      {step === 'pick-exams' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Which exam{examCount === 'two' ? 's' : ''} are you studying for?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {availableExams.map((ex) => {
              const selected = pickedExams.includes(ex.code)
              const max = examCount === 'one' ? 1 : examCount === 'two' ? 2 : 99
              const disabled = !selected && pickedExams.length >= max
              return (
                <button
                  key={ex.code}
                  onClick={() => !disabled && toggleExam(ex.code)}
                  disabled={disabled}
                  className={`text-left p-3 rounded-lg border text-sm transition ${
                    selected
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : disabled
                        ? 'border-border bg-muted/40 text-muted-foreground cursor-not-allowed'
                        : 'border-border bg-card hover:border-primary'
                  }`}
                >
                  <span className="font-medium">{ex.code}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{ex.label}</span>
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => pickedExams.length > 0 && setStep('result')}
              disabled={pickedExams.length === 0}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/80 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
            >
              See recommendation <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Start over
            </button>
          </div>
        </div>
      )}

      {/* Step: result */}
      {step === 'result' && recommendation && (
        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <Award className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground">{recommendation.reason}</p>
          </div>

          {recommendation.primary && (
            <ProductCard product={recommendation.primary} onBuy={onBuy} bestValue inBasket={basket.has(recommendation.primary.productId)} />
          )}

          {recommendation.alternative && recommendation.alternative.productId !== recommendation.primary?.productId && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">Or consider:</p>
              <ProductCard product={recommendation.alternative} onBuy={onBuy} inBasket={basket.has(recommendation.alternative.productId)} />
            </div>
          )}

          <button onClick={reset} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Start over
          </button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Exam provider group (collapsible)                                 */
/* ------------------------------------------------------------------ */

function ExamProviderGroup({
  provider,
  products,
  onBuy,
}: {
  provider: string
  products: CatalogProduct[]
  onBuy: (p: CatalogProduct) => void
}) {
  // collapsed by default
  const [open, setOpen] = useState(false)
  const basket = useBasket()
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition w-full text-left mb-3"
      >
        <ChevronDown
          className={`w-4 h-4 transition-transform ${open ? '' : '-rotate-90'}`}
          aria-hidden
        />
        {provider}
        <span className="text-xs font-normal text-muted-foreground">({products.length})</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => (
            <ProductCard key={p.productId} product={p} onBuy={onBuy} inBasket={basket.has(p.productId)} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function PricingPage() {
  const { user, login } = useAuth()
  const { tier, products, loading } = useEntitlements()
  const authFetch = useAuthFetch()
  const basket = useBasket()
  const [actionError, setActionError] = useState<string | null>(null)

  // Load available exam codes from the server and use them to defensively
  // filter any exam products that don't have a backing JSON file.
  const [availableExamCodes, setAvailableExamCodes] = useState<Set<string> | null>(null)
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await authFetch('/exams')
        if (!res.ok) return
        const json = await res.json()
        const codes = new Set<string>(json.map((e: any) => String(e.code).toUpperCase()))
        if (mounted) setAvailableExamCodes(codes)
      } catch (err) {
        // ignore — we'll fallback to backend /pricing filtering
      }
    })()
    return () => { mounted = false }
  }, [authFetch])

  const handleBuy = (product: CatalogProduct) => {
    const ok = basket.add(product)
    if (!ok) setActionError(basket.lastError)
  }

  let exams = products.filter((p) => p.kind === 'exam')
  if (availableExamCodes) {
    exams = exams.filter((p) => (p.examCodes ?? []).some((c) => availableExamCodes.has(String(c).toUpperCase())))
  }
  const bundles = products.filter((p) => p.kind === 'bundle')
  const subs = products.filter((p) => p.kind === 'subscription')

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-extrabold">Simple, fair pricing</h2>
        <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
          Start free, upgrade when you're ready. Pay per exam or go unlimited.
        </p>
        {tier && (
          <div className="mt-3 inline-block px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary">
            Your plan: <span className="font-bold capitalize">{tier === 'paying' ? 'Paid' : tier}</span>
          </div>
        )}
      </div>

      {/* ── Recommendation wizard ── */}
      <RecommendationWizard products={products} onBuy={handleBuy} />

      {actionError && (
        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm">
          {actionError}
        </div>
      )}

      {/* ── Tier comparison table ── */}
      <section>
        <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" /> What's included
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-border">
                <th className="py-3 px-3 text-sm font-semibold text-muted-foreground w-1/3">Feature</th>
                <th className="py-3 px-3 text-sm font-semibold text-center text-muted-foreground">Visitor</th>
                <th className="py-3 px-3 text-sm font-semibold text-center text-muted-foreground">Registered (3 day trial)</th>
                <th className="py-3 px-3 text-sm font-semibold text-center text-primary">Paid</th>
              </tr>
            </thead>
            <tbody>
              {FEATURES.map((f) => <FeatureRow key={f.label} f={f} />)}
            </tbody>
          </table>
        </div>
      </section>

      {loading && (
        <div className="text-center text-sm text-muted-foreground">Loading catalog…</div>
      )}

      {/* ── All-Access subscriptions ── */}
      {subs.length > 0 && (
        <section>
          <h3 className="text-lg font-bold mb-3">🔑 All-Access</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {subs.map((p) => (
              <ProductCard
                key={p.productId}
                product={p}
                onBuy={handleBuy}
                bestValue={p.billingPeriod === 'annual'}
                inBasket={basket.has(p.productId)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Exam Packs (bundles) ── */}
      {bundles.length > 0 && (
        <section>
          <h3 className="text-lg font-bold mb-3">📦 Exam Packs</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {bundles.map((p) => (
              <ProductCard key={p.productId} product={p} onBuy={handleBuy} inBasket={basket.has(p.productId)} />
            ))}
          </div>
        </section>
      )}

      {/* ── Single exam passes ── */}
      {exams.length > 0 && (
        <section>
          <h3 className="text-lg font-bold mb-4">📝 Exam Passes</h3>
          <div className="space-y-6">
            {Object.entries(
              exams.reduce<Record<string, CatalogProduct[]>>((acc, p) => {
                const provRaw = (p.provider ?? '').toString().trim()
                let prov = 'Other'
                if (provRaw) {
                  const up = provRaw.toLowerCase()
                  if (up === 'aws' || up.includes('amazon')) prov = 'AWS'
                  else if (up === 'azure') prov = 'Azure'
                  else prov = provRaw
                }
                acc[prov] = acc[prov] ?? []
                acc[prov].push(p)
                return acc
              }, {})
            ).map(([prov, provProducts]) => (
              <ExamProviderGroup key={prov} provider={prov} products={provProducts} onBuy={handleBuy} />
            ))}
          </div>
        </section>
      )}

      {/* Not logged in CTA */}
      {!user && (
        <div className="text-center p-6 rounded-xl border border-dashed border-border bg-muted/40">
          <p className="text-muted-foreground mb-3">Register for free to unlock a full practice exam for 3 days.</p>
          <button
            onClick={login}
            className="px-5 py-2 rounded-lg bg-primary text-primary-foreground font-semibold"
          >
            Sign in with Google
          </button>
        </div>
      )}
    </div>
  )
}

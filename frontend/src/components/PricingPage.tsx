/**
 * PricingPage — shows tier comparison and product catalog with purchase CTAs.
 *
 * Stripe checkout is stubbed; buttons show "Coming soon" until Stripe is configured.
 */

import { useAuth } from '../auth/AuthContext'
import { useEntitlements, type CatalogProduct, type TierConfig } from '../hooks/useEntitlements'
import { Check } from 'lucide-react'

const CHECK = '✓'
const CROSS = '—'

function FeatureRow({ label, visitor, registered, paying }: { label: string; visitor: string; registered: string; paying: string }) {
  return (
    <tr className="border-t border-border">
      <td className="py-2.5 px-3 text-sm font-medium text-foreground">{label}</td>
      <td className="py-2.5 px-3 text-sm text-center text-muted-foreground">{visitor}</td>
      <td className="py-2.5 px-3 text-sm text-center text-muted-foreground">{registered}</td>
      <td className="py-2.5 px-3 text-sm text-center font-semibold text-primary">{paying}</td>
    </tr>
  )
}

function formatPrice(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

function ProductCard({ product, onBuy }: { product: CatalogProduct; onBuy: (p: CatalogProduct) => void }) {
  const kindLabels: Record<string, string> = {
    exam: 'Single Exam',
    bundle: 'Bundle',
    subscription: 'Subscription',
    extra: 'Add-on',
  }

  return (
    <div className={`p-4 rounded-xl border transition-all ${
      product.owned
        ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50/50 dark:bg-emerald-900/10'
        : 'border-border bg-card hover:border-primary'
    }`}>
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
          {product.billingPeriod === 'monthly' && (
            <div className="text-xs text-muted-foreground">/month</div>
          )}
          {product.billingPeriod === 'annual' && (
            <div className="text-xs text-muted-foreground">/year</div>
          )}
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

      <div className="mt-3">
        {product.owned ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="w-4 h-4" />
            Owned
          </span>
        ) : (
          <button
            onClick={() => onBuy(product)}
            className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/80 transition-all"
          >
            Buy {formatPrice(product.priceGBP)}
          </button>
        )}
      </div>
    </div>
  )
}

export default function PricingPage() {
  const { user, login } = useAuth()
  const { tier, products, loading } = useEntitlements()

  const handleBuy = (product: CatalogProduct) => {
    if (!user) {
      login()
      return
    }
    // TODO: call /stripe/create-checkout and redirect to session.url
    alert(`Stripe checkout for "${product.label}" will be available soon.\n\nProduct: ${product.productId}\nPrice: ${formatPrice(product.priceGBP)}`)
  }

  const exams = products.filter((p) => p.kind === 'exam')
  const bundles = products.filter((p) => p.kind === 'bundle')
  const subs = products.filter((p) => p.kind === 'subscription')
  const extras = products.filter((p) => p.kind === 'extra')

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-extrabold">Simple, fair pricing</h2>
        <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
          Start free, upgrade when you're ready. Pay once per exam or go unlimited.
        </p>
        {tier && (
          <div className="mt-3 inline-block px-3 py-1 rounded-full text-sm font-medium bg-primary/10 text-primary">
            Your tier: <span className="font-bold capitalize">{tier}</span>
          </div>
        )}
      </div>

      {/* Tier comparison table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-border">
              <th className="py-3 px-3 text-sm font-semibold text-muted-foreground w-1/3">Feature</th>
              <th className="py-3 px-3 text-sm font-semibold text-center text-muted-foreground">
                Free / Visitor
              </th>
              <th className="py-3 px-3 text-sm font-semibold text-center text-muted-foreground">
                Registered
              </th>
              <th className="py-3 px-3 text-sm font-semibold text-center text-primary">
                Paying ✨
              </th>
            </tr>
          </thead>
          <tbody>
            <FeatureRow label="Practice questions" visitor="~10 sample" registered="~25 rotating" paying="Full bank" />
            <FeatureRow label="Saved attempts" visitor={CROSS} registered="1 per exam" paying="Unlimited" />
            <FeatureRow label="Review & explanations" visitor={CROSS} registered={CHECK} paying={CHECK} />
            <FeatureRow label="Domain filters" visitor="Demo" registered={CHECK} paying={CHECK} />
            <FeatureRow label="CSV / PDF export" visitor={CROSS} registered={CROSS} paying={CHECK} />
            <FeatureRow label="Leaderboard" visitor={CROSS} registered={CROSS} paying={CHECK} />
            <FeatureRow label="Domain mastery history" visitor={CROSS} registered={CROSS} paying={CHECK} />
            <FeatureRow label="Gamification & badges" visitor="Local only" registered={CHECK} paying={CHECK} />
          </tbody>
        </table>
      </div>

      {loading && (
        <div className="text-center text-sm text-muted-foreground">Loading catalog…</div>
      )}

      {/* Subscriptions */}
      {subs.length > 0 && (
        <section>
          <h3 className="text-lg font-bold mb-3">🔑 Unlimited Access</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {subs.map((p) => (
              <ProductCard key={p.productId} product={p} onBuy={handleBuy} />
            ))}
          </div>
        </section>
      )}

      {/* Bundles */}
      {bundles.length > 0 && (
        <section>
          <h3 className="text-lg font-bold mb-3">📦 Bundles</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {bundles.map((p) => (
              <ProductCard key={p.productId} product={p} onBuy={handleBuy} />
            ))}
          </div>
        </section>
      )}

      {/* Single exams */}
      {exams.length > 0 && (
        <section>
          <h3 className="text-lg font-bold mb-3">📝 Single Exams</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {exams.map((p) => (
              <ProductCard key={p.productId} product={p} onBuy={handleBuy} />
            ))}
          </div>
        </section>
      )}

      {/* Extras */}
      {extras.length > 0 && (
        <section>
          <h3 className="text-lg font-bold mb-3">🧩 Extras</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {extras.map((p) => (
              <ProductCard key={p.productId} product={p} onBuy={handleBuy} />
            ))}
          </div>
        </section>
      )}

      {/* Not logged in CTA */}
      {!user && (
        <div className="text-center p-6 rounded-xl border border-dashed border-border bg-muted/40">
          <p className="text-muted-foreground mb-3">Register to save your progress and unlock more questions for free.</p>
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

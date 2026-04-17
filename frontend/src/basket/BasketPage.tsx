/**
 * BasketPage -- shows basket contents, smart upgrade suggestions,
 * and checkout options: Stripe (card / Apple Pay / Google Pay) and PayPal.
 */

import { lazy, Suspense, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '@iconify/react'
import { Trash2, ShoppingCart, ArrowRight, Sparkles, X } from 'lucide-react'
import { clarityEvent, clarityTag } from '../clarity'

const PayPalCheckout = lazy(() => import('./PayPalCheckout'))
import { useBasket } from './BasketContext'
import { useEntitlements, type CatalogProduct } from '../hooks/useEntitlements'
import { useAuth } from '../auth/AuthContext'
import { apiUrl } from '../apiBase'

function formatPrice(pence: number): string {
  const pounds = pence / 100
  return pounds % 1 === 0 ? `\u00a3${pounds}` : `\u00a3${pounds.toFixed(2)}`
}

export default function BasketPage() {
  const { items, remove, clear, total, suggestions, itemCount } = useBasket()
  const { products } = useEntitlements()
  const { user, login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    clarityTag('funnel_stage', 'checkout')
    clarityTag('basket_item_count', String(itemCount))
    clarityEvent('checkout_page_viewed')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCheckout = () => {
    if (!user) {
      navigate('/login')
      return
    }
    doCheckout()
  }

  async function doCheckout() {
    if (!user) {
      navigate('/login')
      return
    }

    clarityEvent('checkout_initiated')
    clarityTag('payment_method', 'stripe')
    const productIds = items.map((i) => i.product.productId)
    if (productIds.length === 0) return

    try {
      const successUrl = window.location.origin + '/?payment=success'
      const cancelUrl = window.location.origin + '/?payment=cancel'

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const t = typeof localStorage !== 'undefined' ? localStorage.getItem('examapp_id_token') : null
      if (t) headers['Authorization'] = `Bearer ${t}`

      const res = await fetch(apiUrl('/payments/create-checkout'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ productIds, successUrl, cancelUrl }),
      })

      if (!res.ok) {
        const text = await res.text()
        alert('Checkout failed: ' + res.status + '\n' + text)
        return
      }

      const data = await res.json()
      if (data.url) {
        // Redirect to Stripe hosted checkout
        window.location.href = data.url
        return
      }

      alert('Unexpected response from payments API')
    } catch (err: any) {
      console.error('Checkout error', err)
      alert('Checkout error: ' + String(err))
    }
  }

  if (itemCount === 0) {
    return (
      <div className="text-center py-16">
        <ShoppingCart className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Your basket is empty</h2>
        <p className="text-muted-foreground text-sm">Browse exams or pricing plans to add items.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ShoppingCart className="w-5 h-5" /> Basket
          <span className="text-sm font-normal text-muted-foreground">({itemCount} item{itemCount !== 1 ? 's' : ''})</span>
        </h2>
        <button onClick={clear} className="text-xs text-muted-foreground hover:text-destructive transition inline-flex items-center gap-1">
          <Trash2 className="w-3 h-3" /> Clear all
        </button>
      </div>

      {/* Smart suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          {suggestions.map((s, i) => (
            <SuggestionBanner key={i} suggestion={s} products={products} />
          ))}
        </div>
      )}

      {/* Items */}
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.product.productId} className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{item.product.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{item.product.description}</div>
            </div>
            <div className="flex items-center gap-3 ml-4 flex-shrink-0">
              {item.product.discountedPriceGBP !== undefined ? (
                <span className="font-semibold">
                  {formatPrice(item.product.discountedPriceGBP)}
                  <span className="text-xs line-through text-muted-foreground ml-1">{formatPrice(item.product.priceGBP)}</span>
                </span>
              ) : (
                <span className="font-semibold">{formatPrice(item.product.priceGBP)}</span>
              )}
              <button
                onClick={() => remove(item.product.productId)}
                className="text-muted-foreground hover:text-destructive transition p-1"
                title="Remove from basket"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Total + checkout */}
      <div className="border-t border-border pt-4 space-y-4">
        <div className="flex items-center justify-between text-lg font-bold">
          <span>Total</span>
          <span>{formatPrice(total)}</span>
        </div>

        {!user ? (
          <div className="text-center space-y-3 py-2">
            <p className="text-sm text-muted-foreground">Log in or create a free account to complete your purchase.</p>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition inline-flex items-center justify-center gap-2"
            >
              Log in / Register to checkout <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            {/* Payment method logos */}
            <div className="flex items-center justify-center gap-3 py-2">
              <Icon icon="logos:visa" className="h-6 w-auto" />
              <Icon icon="logos:mastercard" className="h-6 w-auto" />
              <Icon icon="logos:amex" className="h-6 w-auto" />
              <div className="w-px h-6 bg-border" />
              <Icon icon="logos:apple-pay" className="h-6 w-auto" />
              <Icon icon="logos:google-pay" className="h-6 w-auto" />
            </div>

            <button
              onClick={handleCheckout}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition inline-flex items-center justify-center gap-2"
            >
              Pay by card / Apple Pay / Google Pay <ArrowRight className="w-4 h-4" />
            </button>

            <div className="relative flex items-center py-1">
              <div className="flex-1 border-t border-border" />
              <span className="mx-3 text-xs text-muted-foreground">or pay with</span>
              <div className="flex-1 border-t border-border" />
            </div>

            <Suspense fallback={<div className="h-12 animate-pulse rounded-lg bg-muted" />}>
              <PayPalCheckout />
            </Suspense>

            <p className="text-[11px] text-muted-foreground text-center">
              Payments processed securely via Stripe or PayPal.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function SuggestionBanner({ suggestion, products }: { suggestion: { message: string; suggestedProductId: string; saving: number }; products: CatalogProduct[] }) {
  const { switchTo } = useBasket()
  const suggested = products.find((p) => p.productId === suggestion.suggestedProductId)

  const handleUpgrade = () => {
    if (!suggested) return
    clarityEvent('basket_upgrade_accepted')
    clarityTag('upgrade_to', suggested.productId)
    switchTo(suggested)
  }

  return (
    <div className="p-3 rounded-lg border border-primary/30 bg-primary/5 flex items-start gap-3">
      <Sparkles className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">{suggestion.message}</p>
        {suggestion.saving > 0 && (
          <p className="text-xs text-primary font-medium mt-1">Save {formatPrice(suggestion.saving)}</p>
        )}
        {suggested && (
          <button
            onClick={handleUpgrade}
            className="mt-2 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition"
          >
            Upgrade to {suggested.label}
          </button>
        )}
      </div>
    </div>
  )
}

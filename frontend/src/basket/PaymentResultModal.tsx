/**
 * PaymentResultModal — shown after Stripe/PayPal redirect back to the app.
 *
 * Triggered by `?payment=success` or `?payment=cancel` query params set on checkout
 * success/cancel URLs. Polls /pricing for up to ~20s until the user's new entitlement
 * is active (webhooks are async, so the redirect can beat DynamoDB by a few seconds).
 */

import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { useEntitlements, isPaidTier } from '../hooks/useEntitlements'
import { useBasket } from './BasketContext'
import { trackPurchase } from '../analytics'
import { captureWarning } from '../lib/sentry'

const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 12 // ~24s total

export function PaymentResultModal() {
  const navigate = useNavigate()
  const location = useLocation()
  const { tier, tierConfig, entitlements, products, refresh } = useEntitlements()
  const { clear } = useBasket()
  const [state, setState] = useState<'success' | 'cancel' | null>(null)
  const [polling, setPolling] = useState(false)
  const [purchasedProductId, setPurchasedProductId] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const p = params.get('payment')
    if (p === 'success' || p === 'cancel') {
      setState(p)
      if (p === 'success') {
        setPurchasedProductId(params.get('product'))
        clear()
        setPolling(true)
      }
    } else {
      setState(null)
    }
  }, [location.search]) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll entitlements until the paid tier is detected or we give up.
  useEffect(() => {
    if (!polling) return
    let cancelled = false
    let attempts = 0
    const tick = () => {
      if (cancelled) return
      attempts += 1
      refresh()
      if (attempts >= POLL_MAX_ATTEMPTS) {
        setPolling(false)
        // User paid but entitlement still hasn't arrived after ~24s — webhook is
        // probably delayed or misrouted. High-signal: investigate immediately.
        captureWarning('payment.entitlement_polling_timeout', {
          tags: { 'payment.stage': 'verify' },
          extra: { purchasedProductId, attempts },
          fingerprint: ['payment', 'polling-timeout', purchasedProductId ?? 'unknown'],
        })
      }
    }
    const id = setInterval(tick, POLL_INTERVAL_MS)
    tick()
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [polling]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stop polling once the purchased product's entitlement appears (or any paid tier if unknown).
  // Fire the GA4 purchase event exactly once when the entitlement is confirmed.
  useEffect(() => {
    if (!polling) return
    const granted = purchasedProductId
      ? entitlements.includes(purchasedProductId)
      : isPaidTier(tier)
    if (granted) {
      setPolling(false)
      trackPurchase(purchasedProductId ?? tier, tierConfig?.label)
    }
  }, [polling, tier, entitlements, purchasedProductId])

  if (!state) return null

  const close = () => {
    const params = new URLSearchParams(location.search)
    params.delete('payment')
    const qs = params.toString()
    navigate(location.pathname + (qs ? `?${qs}` : ''), { replace: true })
    setState(null)
  }

  const goToPurchases = () => {
    close()
    navigate('/account?tab=purchases')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-card text-card-foreground rounded-xl shadow-2xl max-w-md w-full p-6 sm:p-8 border border-border">
        {state === 'success' ? (
          <>
            <div className="flex justify-center mb-4">
              {polling && !isPaidTier(tier) ? (
                <Loader2 className="w-14 h-14 text-[#FF6B35] animate-spin" />
              ) : (
                <CheckCircle2 className="w-14 h-14 text-green-500" />
              )}
            </div>
            <h2 className="text-2xl font-bold text-center mb-2">
              {polling && !isPaidTier(tier) ? 'Activating your plan…' : 'Payment complete'}
            </h2>
            <p className="text-center text-muted-foreground mb-5">
              {isPaidTier(tier) ? (
                <>
                  Your <strong className="text-foreground">{purchasedProductId ? (products.find(p => p.productId === purchasedProductId)?.label ?? tierConfig.label) : tierConfig.label}</strong> plan is now
                  active. You have full access to all practice exams and skill labs.
                </>
              ) : polling ? (
                <>
                  Thanks! Your payment was successful. We're activating your plan now — this usually
                  takes a few seconds.
                </>
              ) : (
                <>
                  Your payment was received. If your plan doesn't show as active within a minute,
                  please refresh the page or contact support.
                </>
              )}
            </p>
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground mb-5">
              You can view or cancel your subscription any time from{' '}
              <button
                type="button"
                onClick={goToPurchases}
                className="text-[#FF6B35] font-medium underline-offset-2 hover:underline"
              >
                Account → Purchases
              </button>
              .
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={close}
                className="flex-1 px-4 py-2.5 rounded-md bg-[#FF6B35] text-white font-semibold hover:bg-[#e85a24] transition"
              >
                Start learning
              </button>
              <button
                type="button"
                onClick={goToPurchases}
                className="flex-1 px-4 py-2.5 rounded-md border border-border bg-background hover:bg-muted transition text-sm font-medium"
              >
                View my purchases
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex justify-center mb-4">
              <XCircle className="w-14 h-14 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-bold text-center mb-2">Payment cancelled</h2>
            <p className="text-center text-muted-foreground mb-6">
              No charge was made. Your basket is still here if you'd like to try again.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => {
                  close()
                  navigate('/basket')
                }}
                className="flex-1 px-4 py-2.5 rounded-md bg-[#FF6B35] text-white font-semibold hover:bg-[#e85a24] transition"
              >
                Back to basket
              </button>
              <button
                type="button"
                onClick={close}
                className="flex-1 px-4 py-2.5 rounded-md border border-border bg-background hover:bg-muted transition text-sm font-medium"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

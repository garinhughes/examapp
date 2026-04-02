/**
 * PayPalCheckout - renders PayPal + Apple Pay buttons (via @paypal/react-paypal-js).
 *
 * Apple Pay is automatically shown on Safari/iOS when:
 *  - The device has Apple Pay configured
 *  - The domain is registered with PayPal for Apple Pay
 *
 * For one-time purchases (exams, bundles): uses PayPal Orders API flow.
 * For subscriptions: uses PayPal Subscriptions API flow (vault=true).
 */

import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js'
import { useBasket } from './BasketContext'
import { useAuth } from '../auth/AuthContext'
import { apiUrl } from '../apiBase'
import { clarityEvent, clarityTag } from '../clarity'

const PAYPAL_CLIENT_ID = (import.meta as any).env?.VITE_PAYPAL_CLIENT_ID ?? ''

export default function PayPalCheckout() {
  const { items, clear } = useBasket()
  const { user, login } = useAuth()

  const hasSubscription = items.some((i) => i.product.kind === 'subscription')
  const productIds = items.map((i) => i.product.productId)

  function authHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const token =
      typeof localStorage !== 'undefined' ? localStorage.getItem('examapp_id_token') : null
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
  }

  if (!PAYPAL_CLIENT_ID) return null

  const scriptOptions = hasSubscription
    ? {
        clientId: PAYPAL_CLIENT_ID,
        currency: 'GBP',
        components: 'buttons',
        vault: 'true' as const,
        intent: 'subscription' as const,
      }
    : {
        clientId: PAYPAL_CLIENT_ID,
        currency: 'GBP',
        components: 'buttons',
        intent: 'capture' as const,
      }

  return (
    <PayPalScriptProvider options={scriptOptions}>
      {hasSubscription ? (
        <PayPalButtons
          style={{ layout: 'vertical', shape: 'rect' }}
          createSubscription={async () => {
            if (!user) {
              login()
              throw new Error('Not authenticated')
            }
            clarityEvent('checkout_initiated')
            clarityTag('payment_method', 'paypal_subscription')
            const res = await fetch(apiUrl('/payments/paypal/create-subscription'), {
              method: 'POST',
              headers: authHeaders(),
              body: JSON.stringify({
                productId: productIds[0],
                successUrl: window.location.origin + '/?payment=success',
                cancelUrl: window.location.origin + '/?payment=cancel',
              }),
            })
            if (!res.ok) {
              const text = await res.text()
              throw new Error(`Failed to create subscription: ${text}`)
            }
            const data = await res.json()
            return data.subscriptionId
          }}
          onApprove={async () => {
            clarityEvent('payment_success')
            clarityTag('payment_method', 'paypal_subscription')
            // Subscription activation is confirmed via webhook; navigate immediately
            clear()
            window.location.href = window.location.origin + '/?payment=success'
          }}
          onError={(err) => {
            clarityEvent('payment_error')
            clarityTag('payment_method', 'paypal_subscription')
            console.error('[PayPal] subscription error', err)
            alert('PayPal error: ' + String(err))
          }}
        />
      ) : (
        <PayPalButtons
          style={{ layout: 'vertical', shape: 'rect' }}
          createOrder={async () => {
            if (!user) {
              login()
              throw new Error('Not authenticated')
            }
            clarityEvent('checkout_initiated')
            clarityTag('payment_method', 'paypal_order')
            const res = await fetch(apiUrl('/payments/paypal/create-order'), {
              method: 'POST',
              headers: authHeaders(),
              body: JSON.stringify({
                productIds,
                successUrl: window.location.origin + '/?payment=success',
                cancelUrl: window.location.origin + '/?payment=cancel',
              }),
            })
            if (!res.ok) {
              const text = await res.text()
              throw new Error(`Failed to create order: ${text}`)
            }
            const data = await res.json()
            return data.orderId
          }}
          onApprove={async (data) => {
            const res = await fetch(apiUrl('/payments/paypal/capture-order'), {
              method: 'POST',
              headers: authHeaders(),
              body: JSON.stringify({ orderId: data.orderID }),
            })
            if (!res.ok) {
              const text = await res.text()
              clarityEvent('payment_error')
              clarityTag('payment_method', 'paypal_order')
              alert('Payment capture failed: ' + text)
              return
            }
            clarityEvent('payment_success')
            clarityTag('payment_method', 'paypal_order')
            clear()
            window.location.href = window.location.origin + '/?payment=success'
          }}
          onError={(err) => {
            clarityEvent('payment_error')
            clarityTag('payment_method', 'paypal_order')
            console.error('[PayPal] order error', err)
            alert('PayPal error: ' + String(err))
          }}
        />
      )}
    </PayPalScriptProvider>
  )
}

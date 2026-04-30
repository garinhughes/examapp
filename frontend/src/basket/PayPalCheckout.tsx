/**
 * PayPalCheckout - renders PayPal + Apple Pay buttons (via @paypal/react-paypal-js).
 *
 * Apple Pay is automatically shown on Safari/iOS when:
 *  - The device has Apple Pay configured
 *  - The domain is registered with PayPal for Apple Pay
 *
 * All products are subscriptions (monthly recurring).
 * Uses PayPal Subscriptions API flow (vault=true).
 */

import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js'
import { useNavigate } from 'react-router-dom'
import { useBasket } from './BasketContext'
import { useAuth } from '../auth/AuthContext'
import { apiUrl } from '../apiBase'
import { clarityEvent, clarityTag } from '../clarity'
import { captureError, addBreadcrumb } from '../lib/sentry'

const PAYPAL_CLIENT_ID = (import.meta as any).env?.VITE_PAYPAL_CLIENT_ID ?? ''

export default function PayPalCheckout() {
  const { items, clear } = useBasket()
  const { user } = useAuth()
  const navigate = useNavigate()

  const productIds = items.map((i) => i.product.productId)

  function authHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const token =
      typeof localStorage !== 'undefined' ? localStorage.getItem('examapp_id_token') : null
    if (token) headers['Authorization'] = `Bearer ${token}`
    return headers
  }

  if (!PAYPAL_CLIENT_ID) return null

  return (
    <PayPalScriptProvider
      options={{
        clientId: PAYPAL_CLIENT_ID,
        currency: 'GBP',
        components: 'buttons',
        vault: 'true' as const,
        intent: 'subscription' as const,
      }}
    >
      <PayPalButtons
        style={{ layout: 'vertical', shape: 'rect' }}
        createSubscription={async () => {
          if (!user) {
            navigate('/login')
            throw new Error('Not authenticated')
          }
          clarityEvent('checkout_initiated')
          clarityTag('payment_method', 'paypal_subscription')
          const res = await fetch(apiUrl('/payments/paypal/create-subscription'), {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
              productId: productIds[0],
              successUrl: window.location.origin + '/?payment=success&product=' + encodeURIComponent(productIds[0]),
              cancelUrl: window.location.origin + '/?payment=cancel',
            }),
          })
          if (!res.ok) {
            const text = await res.text()
            const err = new Error(`Failed to create subscription: ${text}`)
            captureError(err, {
              tags: { 'payment.provider': 'paypal', 'payment.stage': 'init', 'http.status': res.status },
              extra: { productId: productIds[0], status: res.status, body: text.slice(0, 500) },
            })
            throw err
          }
          const data = await res.json()
          return data.subscriptionId
        }}
        onApprove={async () => {
          clarityEvent('payment_success')
          clarityTag('payment_method', 'paypal_subscription')
          // Subscription activation is confirmed via webhook; navigate immediately
          clear()
          window.location.href = window.location.origin + '/?payment=success&product=' + encodeURIComponent(productIds[0])
        }}
        onError={(err) => {
          clarityEvent('payment_error')
          clarityTag('payment_method', 'paypal_subscription')
          console.error('[PayPal] subscription error', err)
          captureError(err, {
            tags: { 'payment.provider': 'paypal', 'payment.stage': 'approve' },
            extra: { productId: productIds[0] },
          })
          alert('PayPal error: ' + String(err))
        }}
        onCancel={() => {
          addBreadcrumb('payment', 'paypal cancel', { productId: productIds[0] })
        }}
      />
    </PayPalScriptProvider>
  )
}

/**
 * Stripe routes — Checkout Sessions for one-time and subscription payments.
 *
 * POST /payments/create-checkout  - create a Stripe Checkout Session
 * POST /payments/webhook          - handle Stripe webhook events
 * GET  /payments/success          - post-payment success landing
 * GET  /payments/cancel           - post-payment cancel landing
 *
 * Environment variables:
 *   STRIPE_SECRET_KEY        - Stripe secret key (sk_test_... or sk_live_...)
 *   STRIPE_WEBHOOK_SECRET    - Stripe webhook signing secret (whsec_...)
 *   STRIPE_PRICE_ID_MONTHLY  - Stripe Price ID for All-Access Monthly subscription
 *   STRIPE_PRICE_ID_ANNUAL   - Stripe Price ID for All-Access Annual subscription
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import crypto from 'crypto'
import { getProduct } from '../catalog.js'
import { grantEntitlement, revokeEntitlement } from '../services/entitlements.js'
import { getUserBySub } from '../services/dynamo.js'
import { sendPaymentConfirmedEmail } from '../services/ses.js'
import { logEmailSend } from '../services/emailLogs.js'

const STRIPE_API = 'https://api.stripe.com/v1'

function stripeAuthHeader() {
  return `Bearer ${process.env.STRIPE_SECRET_KEY}`
}

/**
 * Recursively encode an object into Stripe's rack-style form encoding,
 * e.g. line_items[0][price_data][currency]=gbp
 */
function toStripeForm(obj: Record<string, any>, prefix = ''): string {
  const parts: string[] = []
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) continue
    const fullKey = prefix ? `${prefix}[${key}]` : key
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        const item = val[i]
        if (typeof item === 'object' && item !== null) {
          parts.push(toStripeForm(item, `${fullKey}[${i}]`))
        } else {
          parts.push(`${encodeURIComponent(`${fullKey}[${i}]`)}=${encodeURIComponent(String(item))}`)
        }
      }
    } else if (typeof val === 'object') {
      parts.push(toStripeForm(val as Record<string, any>, fullKey))
    } else {
      parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(val))}`)
    }
  }
  return parts.join('&')
}

async function stripePost(path: string, params: Record<string, any>): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: stripeAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: toStripeForm(params),
  })
  const body = (await res.json()) as any
  if (!res.ok) {
    throw Object.assign(new Error(body?.error?.message ?? 'Stripe API error'), {
      status: res.status,
      stripeError: body?.error,
    })
  }
  return body
}

async function stripeGet(path: string): Promise<any> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: { Authorization: stripeAuthHeader() },
  })
  const body = (await res.json()) as any
  if (!res.ok) {
    throw Object.assign(new Error(body?.error?.message ?? 'Stripe API error'), {
      status: res.status,
      stripeError: body?.error,
    })
  }
  return body
}

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  /**
   * Create a Stripe Checkout Session.
   * Returns { url } — the hosted Stripe checkout page to redirect the customer to.
   *
   * One-time items use mode=payment with inline price_data.
   * Subscription items use mode=subscription with pre-created Stripe Price IDs.
   * A basket cannot mix subscription and one-time items (Stripe limitation).
   */
  server.post(
    '/create-checkout',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, // codeql[js/missing-rate-limiting]
    async (request: any, reply) => {
      const { productIds, successUrl, cancelUrl } = request.body as any
      if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return reply.status(400).send({ message: 'productIds array required' })
      }

      const userId = request.user?.sub as string | undefined

      const products = []
      for (const pid of productIds) {
        const prod = getProduct(pid)
        if (!prod) return reply.status(400).send({ message: `Unknown productId ${pid}` })
        products.push(prod)
      }

      const proto = (request.headers['x-forwarded-proto'] as string) || 'http'
      const host = request.headers.host || `localhost:${process.env.PORT || 3000}`
      const base = `${proto}://${host}`
      const successRedirect = successUrl || `${base}/payments/success`
      const cancelRedirect = cancelUrl || `${base}/payments/cancel`

      const hasSubscription = products.some((p) => p.kind === 'subscription')

      try {
        let session: any

        if (hasSubscription) {
          // Subscription mode — requires pre-created Stripe Price IDs
          const subProduct = products.find((p) => p.kind === 'subscription')!
          const priceId =
            subProduct.productId === 'sub:all-access'
              ? process.env.STRIPE_PRICE_ID_MONTHLY
              : process.env.STRIPE_PRICE_ID_ANNUAL

          if (!priceId) {
            return reply.status(503).send({
              message: `Stripe Price ID not configured for ${subProduct.productId}. Set STRIPE_PRICE_ID_MONTHLY or STRIPE_PRICE_ID_ANNUAL.`,
            })
          }

          session = await stripePost('/checkout/sessions', {
            mode: 'subscription',
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: successRedirect,
            cancel_url: cancelRedirect,
            metadata: {
              userId: userId ?? '',
              productIds: JSON.stringify(productIds),
            },
            subscription_data: {
              metadata: {
                userId: userId ?? '',
                productIds: JSON.stringify(productIds),
              },
            },
          })
        } else {
          // One-time payment mode — inline price_data per product
          const lineItems = products.map((prod) => ({
            price_data: {
              currency: 'gbp',
              unit_amount: prod.priceGBP,
              product_data: { name: prod.label },
            },
            quantity: 1,
          }))

          session = await stripePost('/checkout/sessions', {
            mode: 'payment',
            line_items: lineItems,
            success_url: successRedirect,
            cancel_url: cancelRedirect,
            metadata: {
              userId: userId ?? '',
              productIds: JSON.stringify(productIds),
            },
          })
        }

        server.log.info({ sessionId: session.id, userId }, '[stripe] checkout session created')
        return { url: session.url }
      } catch (err: any) {
        server.log.error({ err }, '[stripe] create-checkout error')
        if (err.stripeError) {
          return reply.status(502).send({ message: 'Stripe API error', details: err.stripeError })
        }
        return reply.status(500).send({ message: 'Stripe checkout failed', error: String(err) })
      }
    }
  )

  /**
   * Stripe webhook handler.
   *
   * Signature verification: Stripe sends `Stripe-Signature: t=<timestamp>,v1=<hmac>`
   * where the HMAC is computed over "{timestamp}.{raw_body}" with the webhook secret.
   * Timestamps older than 5 minutes are rejected (replay protection).
   *
   * Event routing:
   *   checkout.session.completed       → grant entitlements (one-time or new subscription)
   *   invoice.payment_succeeded        → renew subscription entitlement (fetches sub metadata)
   *   customer.subscription.deleted    → revoke subscription entitlement
   */
  server.post('/webhook', async (request: any, reply) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    const sigHeader = (request.headers['stripe-signature'] ?? '') as string
    const raw: string = (request as any).rawBody ?? JSON.stringify(request.body ?? {})

    if (secret && sigHeader) {
      // Parse "t=<ts>,v1=<sig>" — split on comma, then first = only
      const parts: Record<string, string> = {}
      for (const segment of sigHeader.split(',')) {
        const idx = segment.indexOf('=')
        if (idx > 0) parts[segment.slice(0, idx)] = segment.slice(idx + 1)
      }
      const timestamp = parts['t']
      const v1 = parts['v1']

      if (!timestamp || !v1) {
        server.log.warn('[stripe] malformed Stripe-Signature header')
        return reply.status(400).send({ message: 'malformed signature header' })
      }

      // Reject stale webhooks (>5 minutes old)
      if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
        server.log.warn('[stripe] webhook timestamp too old — possible replay attack')
        return reply.status(400).send({ message: 'webhook timestamp too old' })
      }

      const expected = crypto
        .createHmac('sha256', secret)
        .update(`${timestamp}.${raw}`)
        .digest('hex')

      const v1Buf = Buffer.from(v1, 'hex')
      const expectedBuf = Buffer.from(expected, 'hex')
      if (v1Buf.length !== expectedBuf.length || !crypto.timingSafeEqual(v1Buf, expectedBuf)) {
        server.log.warn('[stripe] webhook signature mismatch')
        return reply.status(400).send({ message: 'invalid signature' })
      }
    }

    const event = request.body as any
    server.log.info({ type: event.type, id: event.id }, '[stripe] webhook received')

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object
          // Only grant when payment is confirmed (not for unpaid/trial sessions)
          if (session.payment_status !== 'paid') {
            server.log.info({ sessionId: session.id, payment_status: session.payment_status }, '[stripe] skipping grant — payment not yet paid')
            break
          }
          const metadata = session.metadata ?? {}
          const userId: string = metadata.userId
          const productIds: string[] = JSON.parse(metadata.productIds ?? '[]')
          if (userId && productIds.length > 0) {
            for (const pid of productIds) {
              const prod = getProduct(pid)
              await grantEntitlement({
                userId,
                productId: pid,
                kind: prod?.kind ?? 'extra',
                meta: { source: 'stripe.checkout.session.completed', stripeSessionId: session.id },
              })
            }
            server.log.info({ userId, productIds, sessionId: session.id }, '[stripe] entitlements granted')
            // Send payment confirmation email (fire-and-forget)
            try {
              const user = await getUserBySub(userId)
              if (user?.email) {
                const products = productIds.map((pid) => {
                  const p = getProduct(pid)
                  return { label: p?.label ?? pid, priceGBP: p?.priceGBP ?? 0 }
                })
                const totalPence = products.reduce((s, p) => s + p.priceGBP, 0)
                sendPaymentConfirmedEmail({ to: user.email, name: user.name ?? user.email, userId, products, totalPence, source: 'stripe' })
                  .then(() => logEmailSend({ type: 'payment-confirmed', sentBy: 'stripe-webhook', templateId: 'payment-confirmed', recipientCount: 1, subject: 'Your certshack order is confirmed', filters: { productIds } }))
                  .catch((e: any) => server.log.warn({ err: e?.message }, '[stripe] payment confirmed email failed'))
              }
            } catch (e: any) {
              server.log.warn({ err: e?.message }, '[stripe] payment confirmed email lookup failed')
            }
          }
          break
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object
          // Only act on subscription renewal cycles (not the initial invoice — that's covered by checkout.session.completed)
          if (invoice.subscription && invoice.billing_reason === 'subscription_cycle') {
            try {
              const sub = await stripeGet(`/subscriptions/${invoice.subscription}`)
              const metadata = sub.metadata ?? {}
              const userId: string = metadata.userId
              const productIds: string[] = JSON.parse(metadata.productIds ?? '[]')
              if (userId && productIds.length > 0) {
                for (const pid of productIds) {
                  const prod = getProduct(pid)
                  await grantEntitlement({
                    userId,
                    productId: pid,
                    kind: prod?.kind ?? 'subscription',
                    meta: { source: 'stripe.invoice.payment_succeeded', invoiceId: invoice.id },
                  })
                }
                server.log.info({ userId, productIds, invoiceId: invoice.id }, '[stripe] subscription entitlement renewed')
              } else {
                server.log.warn({ subscriptionId: invoice.subscription }, '[stripe] invoice.payment_succeeded — no userId/productIds in subscription metadata')
              }
            } catch (err) {
              server.log.error({ err, subscriptionId: invoice.subscription }, '[stripe] failed to fetch subscription for renewal')
            }
          }
          break
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object
          const metadata = subscription.metadata ?? {}
          const userId: string = metadata.userId
          const productIds: string[] = JSON.parse(metadata.productIds ?? '[]')
          if (userId && productIds.length > 0) {
            for (const pid of productIds) {
              await revokeEntitlement(userId, pid)
            }
            server.log.info({ userId, productIds, subscriptionId: subscription.id }, '[stripe] subscription entitlements revoked')
          } else {
            server.log.warn({ subscriptionId: subscription.id }, '[stripe] subscription.deleted — no userId/productIds in metadata, skipping revocation')
          }
          break
        }

        default:
          server.log.info({ type: event.type }, '[stripe] unhandled event type')
      }
    } catch (err) {
      server.log.error({ err }, '[stripe] webhook processing error')
      // Return 500 so Stripe retries the delivery
      return reply.status(500).send({ message: 'webhook processing failed' })
    }

    return reply.status(200).send({ received: true })
  })

  /** Post-payment landing pages (Stripe redirects here after checkout) */
  server.get('/success', async (_req, reply) => {
    reply.header('Content-Type', 'text/html; charset=utf-8')
    return reply.send(`<!doctype html><html><head><meta charset="utf-8"><title>Payment complete</title></head>
<body style="font-family:sans-serif;text-align:center;padding:4rem">
<h1>Payment complete ✓</h1>
<p>Your purchase has been processed. You can close this window and return to ExamApp.</p>
</body></html>`)
  })

  server.get('/cancel', async (_req, reply) => {
    reply.header('Content-Type', 'text/html; charset=utf-8')
    return reply.send(`<!doctype html><html><head><meta charset="utf-8"><title>Payment cancelled</title></head>
<body style="font-family:sans-serif;text-align:center;padding:4rem">
<h1>Payment cancelled</h1>
<p>No charge was made. You can close this window and return to ExamApp.</p>
</body></html>`)
  })
}

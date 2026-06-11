/**
 * Stripe routes — Checkout Sessions for subscription payments.
 *
 * POST /payments/create-checkout  - create a Stripe Checkout Session
 * POST /payments/webhook          - handle Stripe webhook events
 * GET  /payments/success          - post-payment success landing
 * GET  /payments/cancel           - post-payment cancel landing
 *
 * Environment variables:
 *   STRIPE_SECRET_KEY              - Stripe secret key (sk_test_... or sk_live_...)
 *   STRIPE_WEBHOOK_SECRET          - Stripe webhook signing secret (whsec_...)
 *   STRIPE_PRICE_ID_PRO_MONTHLY    - Stripe Price ID for Pro monthly subscription
 *   STRIPE_PRICE_ID_PRO_PLUS_MONTHLY - Stripe Price ID for Pro Plus monthly subscription
 *   DISCOUNT_ACTIVE                - Set to "true" to apply discount
 *   STRIPE_COUPON_ID_DISCOUNT      - Stripe coupon ID to apply when DISCOUNT_ACTIVE=true
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import crypto from 'crypto'
import { getProduct } from '../catalog.js'
import { grantEntitlement, revokeEntitlement, getUserEntitlements, setEntitlementExpiresAt, mergeEntitlementMeta } from '../services/entitlements.js'
import { getUserBySub } from '../services/dynamo.js'
import { sendPaymentConfirmedEmail, sendInternalAlert, sendRefundedEmail, sendSubscriptionCancelledEmail, sendSubscriptionChangedEmail, sendSubscriptionEndedEmail, sendPaymentFailedEmail } from '../services/ses.js'
import { logEmailSend } from '../services/emailLogs.js'
import { captureWithContext, addBreadcrumb } from '../lib/sentry.js'
import { recordEvent } from '../services/metricsStore.js'

const STRIPE_API = 'https://api.stripe.com/v1'
// Pin API version so schema changes (like basil removing invoice.subscription) can't
// silently break us if the account's default version bumps.
const STRIPE_API_VERSION = '2025-03-31.basil'

function stripeAuthHeader() {
  return `Bearer ${process.env.STRIPE_SECRET_KEY}`
}

/**
 * Resolve a subscription ID from an Invoice object across API versions.
 * basil (2025-03-31+) removed top-level `invoice.subscription`; it now lives at
 * `invoice.parent.subscription_details.subscription`.
 */
function getInvoiceSubscriptionId(invoice: any): string | null {
  return (
    invoice?.parent?.subscription_details?.subscription ??
    invoice?.subscription ??
    invoice?.lines?.data?.[0]?.parent?.subscription_item_details?.subscription ??
    null
  )
}

/**
 * Resolve a subscription's current_period_end across API versions.
 * basil moved this from the Subscription root onto each item.
 */
function getSubscriptionPeriodEnd(sub: any): number | null {
  const fromItem = sub?.items?.data?.[0]?.current_period_end
  if (typeof fromItem === 'number') return fromItem
  if (typeof sub?.current_period_end === 'number') return sub.current_period_end
  return null
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

async function stripePost(path: string, params: Record<string, any>, opts?: { idempotencyKey?: string }): Promise<any> {
  const headers: Record<string, string> = {
    Authorization: stripeAuthHeader(),
    'Content-Type': 'application/x-www-form-urlencoded',
    'Stripe-Version': STRIPE_API_VERSION,
  }
  if (opts?.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers,
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
    headers: { Authorization: stripeAuthHeader(), 'Stripe-Version': STRIPE_API_VERSION },
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
   * Uses mode=subscription with pre-created Stripe Price IDs.
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

      const frontendBase = process.env.FRONTEND_ORIGIN || `http://localhost:${process.env.PORT || 5173}`
      const successRedirect = successUrl || `${frontendBase}/?payment=success`
      const cancelRedirect = cancelUrl || `${frontendBase}/?payment=cancel`

      const subProduct = products.find((p) => p.kind === 'subscription')
      if (!subProduct) {
        return reply.status(400).send({ message: 'Only subscription products are supported' })
      }

      // Block duplicate checkout for the same plan — prevents accidental double-charge.
      // Cross-plan (e.g. pro → pro-plus) is allowed; use /upgrade-subscription for that.
      if (userId) {
        const existing = await getUserEntitlements(userId)
        if (existing.some((e) => e.productId === subProduct.productId && e.status === 'active')) {
          return reply.status(409).send({ message: `You already have an active ${subProduct.label} subscription.` })
        }
      }

      try {
        const discountActive = process.env.DISCOUNT_ACTIVE === 'true'

        const priceId =
          subProduct.productId === 'sub:pro'
            ? process.env.STRIPE_PRICE_ID_PRO_MONTHLY
            : subProduct.productId === 'sub:pro-plus'
            ? process.env.STRIPE_PRICE_ID_PRO_PLUS_MONTHLY
            : undefined

        if (!priceId) {
          return reply.status(503).send({
            message: `Stripe Price ID not configured for ${subProduct.productId}. Set STRIPE_PRICE_ID_PRO_MONTHLY or STRIPE_PRICE_ID_PRO_PLUS_MONTHLY.`,
          })
        }

        const sessionParams: Record<string, any> = {
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
        }

        // Apply discount coupon if enabled
        const couponId = discountActive ? process.env.STRIPE_COUPON_ID_DISCOUNT : undefined
        if (couponId) {
          sessionParams.discounts = [{ coupon: couponId }]
        }

        // Idempotency key: shared across retries within a ~10-minute window for the same
        // user+products, so a dropped-connection retry returns the existing session instead
        // of creating a new one. Bucket coarse enough to absorb retries, fine enough that a
        // genuine re-attempt after a long abandonment gets a fresh session.
        const idemBucket = Math.floor(Date.now() / (10 * 60 * 1000))
        const idempotencyKey = `checkout:${userId ?? 'anon'}:${productIds.join(',')}:${idemBucket}`
        const session = await stripePost('/checkout/sessions', sessionParams, { idempotencyKey })
        server.log.info({ sessionId: session.id, userId }, '[stripe] checkout session created')
        recordEvent('checkout_start', { plan: productIds.join(',') }).catch(() => {})
        return { url: session.url }
      } catch (err: any) {
        server.log.error({ err }, '[stripe] create-checkout error')
        captureWithContext(err, {
          tags: { 'payment.provider': 'stripe', 'payment.stage': 'create-checkout' },
          user: userId ? { id: userId } : undefined,
          extra: { stripeError: err.stripeError },
        })
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
          // For mode=subscription, payment_status is 'no_payment_required' on this event —
          // entitlements and the confirmation email are handled via invoice.payment_succeeded instead.
          // For mode=payment, payment_status must be 'paid' before granting.
          if (session.mode === 'subscription') {
            server.log.info({ sessionId: session.id }, '[stripe] subscription checkout — deferring grant to invoice.payment_succeeded')
            break
          }
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
              // one-off products grant 30 days; subscriptions grant via invoice.payment_succeeded
              const expiresAt = prod?.kind === 'one-off'
                ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                : null
              await grantEntitlement({
                userId,
                productId: pid,
                kind: prod?.kind ?? 'extra',
                expiresAt,
                meta: { source: 'stripe.checkout.session.completed', stripeSessionId: session.id },
              })
            }
            server.log.info({ userId, productIds, sessionId: session.id }, '[stripe] entitlements granted')
            recordEvent('checkout_complete', { plan: productIds.join(',') }).catch(() => {})
            // Send payment confirmation email (fire-and-forget)
            try {
              const user = await getUserBySub(userId)
              if (user?.email) {
                const emailProducts = productIds.map((pid) => {
                  const p = getProduct(pid)
                  return { productId: pid, label: p?.label ?? pid, priceGBP: p?.priceGBP ?? 0 }
                })
                const totalPence = session.amount_total ?? emailProducts.reduce((s, p) => s + p.priceGBP, 0)
                sendPaymentConfirmedEmail({ to: user.email, name: user.name ?? user.email, userId, products: emailProducts, totalPence, source: 'stripe' })
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
          // Handle both initial subscription payment (subscription_create) and renewals (subscription_cycle).
          // For mode=subscription checkouts, payment_status on checkout.session.completed is 'no_payment_required'
          // so we cannot rely on that event — subscription grants and the initial confirmation email are done here.
          const isCreate = invoice.billing_reason === 'subscription_create'
          const isCycle = invoice.billing_reason === 'subscription_cycle'
          const subscriptionId = getInvoiceSubscriptionId(invoice)
          if (subscriptionId && (isCreate || isCycle)) {
            try {
              const sub = await stripeGet(`/subscriptions/${subscriptionId}`)
              const metadata = sub.metadata ?? {}
              const userId: string = metadata.userId
              const productIds: string[] = JSON.parse(metadata.productIds ?? '[]')
              if (userId && productIds.length > 0) {
                for (const pid of productIds) {
                  const prod = getProduct(pid)
                  // Set expiresAt to period_end + 1 day grace so access self-expires if billing stops.
                  // Each successful renewal pushes this forward.
                  const periodEnd = getSubscriptionPeriodEnd(sub) ?? (invoice.period_end as number)
                  const expiresAt = new Date((periodEnd + 86400) * 1000).toISOString()
                  await grantEntitlement({
                    userId,
                    productId: pid,
                    kind: prod?.kind ?? 'subscription',
                    expiresAt,
                    stripeSubscriptionId: subscriptionId,
                    meta: { source: 'stripe.invoice.payment_succeeded', invoiceId: invoice.id, billingReason: invoice.billing_reason },
                  })
                }
                server.log.info({ userId, productIds, invoiceId: invoice.id, billingReason: invoice.billing_reason }, '[stripe] subscription entitlement granted/renewed')
                if (isCreate) recordEvent('checkout_complete', { plan: productIds.join(',') }).catch(() => {})
                // Send confirmation email only on initial purchase, not on renewals
                if (isCreate) {
                  try {
                    const user = await getUserBySub(userId)
                    if (user?.email) {
                      const emailProducts = productIds.map((pid) => {
                        const p = getProduct(pid)
                        return { productId: pid, label: p?.label ?? pid, priceGBP: p?.priceGBP ?? 0 }
                      })
                      const totalPence = invoice.amount_paid ?? emailProducts.reduce((s, p) => s + p.priceGBP, 0)
                      sendPaymentConfirmedEmail({ to: user.email, name: user.name ?? user.email, userId, products: emailProducts, totalPence, source: 'stripe' })
                        .then(() => logEmailSend({ type: 'payment-confirmed', sentBy: 'stripe-webhook', templateId: 'payment-confirmed', recipientCount: 1, subject: 'Your certshack order is confirmed', filters: { productIds } }))
                        .catch((e: any) => server.log.warn({ err: e?.message }, '[stripe] subscription payment confirmed email failed'))
                    }
                  } catch (e: any) {
                    server.log.warn({ err: e?.message }, '[stripe] subscription payment confirmed email lookup failed')
                  }
                }
              } else {
                server.log.warn({ subscriptionId }, '[stripe] invoice.payment_succeeded — no userId/productIds in subscription metadata')
              }
            } catch (err) {
              server.log.error({ err, subscriptionId }, '[stripe] failed to fetch subscription for invoice.payment_succeeded')
            }
          } else {
            server.log.info({ invoiceId: invoice.id, billingReason: invoice.billing_reason, subscriptionId }, '[stripe] invoice.payment_succeeded — skipped (no subscription or non-create/cycle billing reason)')
          }
          break
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object
          const metadata = subscription.metadata ?? {}
          const userId: string | undefined = metadata.userId

          // Only revoke entitlements explicitly linked to this subscription via stripeSubscriptionId.
          // We deliberately do NOT fall back to revoke-by-metadata: if a user has two subscriptions
          // sharing a productId (e.g. mid-upgrade, or a duplicate purchase), the metadata path would
          // wrongly revoke the *other* subscription's active entitlement.
          const revokedPids = new Set<string>()
          if (userId) {
            const allEnts = await getUserEntitlements(userId, true)
            const subEnts = allEnts.filter((e) => e.stripeSubscriptionId === subscription.id)
            for (const ent of subEnts) {
              await revokeEntitlement(userId, ent.productId)
              revokedPids.add(ent.productId)
            }
            if (subEnts.length > 0) {
              server.log.info({ userId, revokedPids: [...revokedPids], subscriptionId: subscription.id }, '[stripe] subscription entitlements revoked')
            } else {
              server.log.info({ userId, subscriptionId: subscription.id }, '[stripe] subscription.deleted — no entitlements linked to this subscriptionId, skipping revocation')
            }
          } else {
            server.log.warn({ subscriptionId: subscription.id }, '[stripe] subscription.deleted — no userId in metadata, skipping revocation')
          }

          // Notify the customer that their subscription has now ended
          if (userId && revokedPids.size > 0) {
            try {
              const user = await getUserBySub(userId)
              if (user?.email) {
                for (const pid of revokedPids) {
                  const prod = getProduct(pid)
                  sendSubscriptionEndedEmail({
                    to: user.email,
                    name: user.name ?? user.email,
                    userId,
                    productLabel: prod?.label ?? pid,
                    productId: pid,
                  }).catch((e: any) => server.log.warn({ err: e?.message }, '[stripe] subscription ended email failed'))
                }
              }
            } catch (e: any) {
              server.log.warn({ err: e?.message }, '[stripe] subscription ended email lookup failed')
            }
          }
          break
        }

        case 'charge.refunded': {
          // Triggered on full or partial refunds. Revoke entitlements linked to the refunded
          // charge's payment_intent → subscription (if it was a subscription) or session (one-off).
          const charge = event.data.object
          const paymentIntentId: string | undefined = charge.payment_intent
          const refundedFully = charge.amount_refunded === charge.amount
          if (!refundedFully) {
            // Partial refunds don't revoke — just log. Manual review via admin.
            server.log.warn({ chargeId: charge.id, amountRefunded: charge.amount_refunded, amount: charge.amount }, '[stripe] partial refund — no entitlement change')
            break
          }
          // Look up subscription associated with this charge via PI (subscription invoices set invoice.subscription)
          let subscriptionId: string | null = null
          let userId: string | null = null
          let productIds: string[] = []
          try {
            if (paymentIntentId) {
              const pi = await stripeGet(`/payment_intents/${paymentIntentId}`)
              const invoiceId = pi?.invoice
              if (invoiceId) {
                const invoice = await stripeGet(`/invoices/${invoiceId}`)
                subscriptionId = getInvoiceSubscriptionId(invoice)
                if (subscriptionId) {
                  const sub = await stripeGet(`/subscriptions/${subscriptionId}`)
                  userId = sub?.metadata?.userId ?? null
                  productIds = JSON.parse(sub?.metadata?.productIds ?? '[]')
                }
              }
              // Fall back to PI metadata for one-offs
              if (!userId) {
                userId = pi?.metadata?.userId ?? null
                productIds = JSON.parse(pi?.metadata?.productIds ?? '[]')
              }
            }
          } catch (e: any) {
            server.log.warn({ err: e?.message, chargeId: charge.id }, '[stripe] refund — PI/invoice lookup failed')
          }
          if (userId && subscriptionId) {
            const ents = await getUserEntitlements(userId, true)
            const toRevoke = ents.filter((e) => e.stripeSubscriptionId === subscriptionId)
            for (const ent of toRevoke) await revokeEntitlement(userId, ent.productId)
            server.log.info({ userId, subscriptionId, productIds: toRevoke.map((e) => e.productId), chargeId: charge.id }, '[stripe] refund — subscription entitlements revoked')
            try {
              const user = await getUserBySub(userId)
              if (user?.email) {
                for (const ent of toRevoke) {
                  const prod = getProduct(ent.productId)
                  sendRefundedEmail({ to: user.email, name: user.name ?? user.email, userId, productLabel: prod?.label ?? ent.productId, productId: ent.productId, source: 'stripe' })
                    .catch((e: any) => server.log.warn({ err: e?.message }, '[stripe] refund email failed'))
                }
              }
            } catch (e: any) { server.log.warn({ err: e?.message }, '[stripe] refund email lookup failed') }
          } else if (userId && productIds.length > 0) {
            for (const pid of productIds) await revokeEntitlement(userId, pid)
            server.log.info({ userId, productIds, chargeId: charge.id }, '[stripe] refund — one-off entitlements revoked')
            try {
              const user = await getUserBySub(userId)
              if (user?.email) {
                for (const pid of productIds) {
                  const prod = getProduct(pid)
                  sendRefundedEmail({ to: user.email, name: user.name ?? user.email, userId, productLabel: prod?.label ?? pid, productId: pid, source: 'stripe' })
                    .catch((e: any) => server.log.warn({ err: e?.message }, '[stripe] refund email failed'))
                }
              }
            } catch (e: any) { server.log.warn({ err: e?.message }, '[stripe] refund email lookup failed') }
          } else {
            server.log.warn({ chargeId: charge.id, paymentIntentId }, '[stripe] refund — could not resolve userId, skipping revocation')
            sendInternalAlert({ subject: '[stripe] refund could not be processed', lines: [`Charge ${charge.id} refunded but userId could not be resolved.`, 'Manual review needed.'] })
          }
          break
        }

        case 'invoice.payment_failed': {
          // Stripe will retry based on dunning settings. We don't revoke immediately — the existing
          // expiresAt (period_end + 1d grace) self-expires access if retries are exhausted.
          // Email the user so they can update their card before access lapses.
          const invoice = event.data.object
          const subscriptionId: string | null = getInvoiceSubscriptionId(invoice)
          let userId: string | null = null
          let productIds: string[] = []
          if (subscriptionId) {
            try {
              const sub = await stripeGet(`/subscriptions/${subscriptionId}`)
              userId = sub?.metadata?.userId ?? null
              productIds = JSON.parse(sub?.metadata?.productIds ?? '[]')
            } catch (e: any) {
              server.log.warn({ err: e?.message, subscriptionId }, '[stripe] payment_failed — subscription lookup failed')
            }
          }
          server.log.warn({ userId, subscriptionId, productIds, invoiceId: invoice.id, attemptCount: invoice.attempt_count, nextAttempt: invoice.next_payment_attempt }, '[stripe] invoice.payment_failed — access will lapse at period_end + 1d grace if not resolved')

          if (userId && productIds.length > 0) {
            try {
              const user = await getUserBySub(userId)
              if (user?.email) {
                const prod = getProduct(productIds[0])
                const nextAttempt = invoice.next_payment_attempt
                  ? new Date(invoice.next_payment_attempt * 1000).toISOString()
                  : null
                const frontend = process.env.FRONTEND_ORIGIN || 'https://certshack.com'
                sendPaymentFailedEmail({
                  to: user.email,
                  name: user.name ?? user.email,
                  userId,
                  productLabel: prod?.label ?? productIds[0],
                  attemptCount: invoice.attempt_count ?? 1,
                  nextAttempt,
                  manageUrl: `${frontend}/account?tab=purchases`,
                })
                  .then(() => logEmailSend({ type: 'payment-failed', sentBy: 'stripe-webhook', templateId: 'payment-failed', recipientCount: 1, subject: 'Payment failed — please update your card', filters: { productIds } }))
                  .catch((e: any) => server.log.warn({ err: e?.message }, '[stripe] payment_failed email send failed'))
              }
            } catch (e: any) {
              server.log.warn({ err: e?.message }, '[stripe] payment_failed email lookup failed')
            }
          }
          break
        }

        case 'customer.subscription.updated': {
          // Plan changes via the Stripe dashboard (not through our /upgrade-subscription endpoint)
          // would leave DynamoDB out of sync. We don't auto-mutate entitlements here — that races
          // our own endpoint — but we alert ops so any drift can be reconciled manually.
          const sub = event.data.object
          const previous = event.data.previous_attributes ?? {}
          const metadata = sub.metadata ?? {}
          const userId: string | undefined = metadata.userId
          const priceChanged = previous.items !== undefined || previous.plan !== undefined
          const cancelFlagChanged = previous.cancel_at_period_end !== undefined
          const statusChanged = previous.status !== undefined
          if (priceChanged || cancelFlagChanged || statusChanged) {
            server.log.info({
              subscriptionId: sub.id,
              userId,
              status: sub.status,
              cancelAtPeriodEnd: sub.cancel_at_period_end,
              priceChanged,
              cancelFlagChanged,
              statusChanged,
            }, '[stripe] subscription.updated — state changed')

            // User cancelled via the Stripe Customer Portal (cancel_at_period_end flipped to true).
            // Skip if the in-app cancel route already sent the email (stamped cancelNotifiedAt).
            if (cancelFlagChanged && sub.cancel_at_period_end === true && userId) {
              try {
                const ents = await getUserEntitlements(userId)
                const subEnt = ents.find((e) => e.stripeSubscriptionId === sub.id)
                if (subEnt && !subEnt.meta?.cancelNotifiedAt) {
                  const user = await getUserBySub(userId)
                  if (user?.email) {
                    const prod = getProduct(subEnt.productId)
                    const periodEnd = getSubscriptionPeriodEnd(sub)
                    const accessUntil = periodEnd ? new Date(periodEnd * 1000).toISOString() : null
                    sendSubscriptionCancelledEmail({
                      to: user.email,
                      name: user.name ?? user.email,
                      userId,
                      productLabel: prod?.label ?? subEnt.productId,
                      productId: subEnt.productId,
                      accessUntil,
                      source: 'stripe',
                    }).catch((e: any) => server.log.warn({ err: e?.message }, '[stripe] portal cancellation email failed'))
                  }
                } else {
                  server.log.info({ subscriptionId: sub.id, userId }, '[stripe] cancellation email already sent by in-app route — skipping')
                }
              } catch (e: any) {
                server.log.warn({ err: e?.message }, '[stripe] portal cancellation email lookup failed')
              }
            }

            // Alert ops on price changes only when the new price isn't a known catalog price —
            // in-app upgrades/downgrades switch to known prices, so those don't need review.
            if (priceChanged) {
              const knownPriceIds = [
                process.env.STRIPE_PRICE_ID_PRO_MONTHLY,
                process.env.STRIPE_PRICE_ID_PRO_PLUS_MONTHLY,
              ].filter(Boolean)
              const newPriceId: string | undefined = sub.items?.data?.[0]?.price?.id
              if (!newPriceId || !knownPriceIds.includes(newPriceId)) {
                sendInternalAlert({
                  subject: '[stripe] subscription price changed to unknown price (review required)',
                  lines: [
                    `Subscription: ${sub.id}`,
                    `User ID:      ${userId ?? '(missing from metadata)'}`,
                    `Status:       ${sub.status}`,
                    `New price:    ${newPriceId ?? '(unknown)'}`,
                    `Previous:     ${JSON.stringify(previous.items ?? previous.plan)}`,
                    `Action:       verify DynamoDB entitlement productId matches Stripe plan`,
                  ],
                })
              }
            }
          }
          break
        }

        default:
          server.log.info({ type: event.type }, '[stripe] unhandled event type')
      }
    } catch (err) {
      server.log.error({ err }, '[stripe] webhook processing error')
      captureWithContext(err, {
        tags: {
          'payment.provider': 'stripe',
          'payment.event_type': event?.type,
          'payment.stage': 'webhook',
        },
        extra: { eventId: event?.id },
        fingerprint: ['stripe', String(event?.type ?? 'unknown')],
      })
      // Return 500 so Stripe retries the delivery
      return reply.status(500).send({ message: 'webhook processing failed' })
    }

    return reply.status(200).send({ received: true })
  })

  /**
   * Cancel the authenticated user's active Stripe subscription.
   * Cancels at period end so the user retains access until the billing cycle ends.
   * The webhook (customer.subscription.deleted) will revoke the entitlement automatically.
   */
  server.post(
    '/cancel-subscription',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request: any, reply) => {
      const userId = request.user?.sub as string
      const ents = await getUserEntitlements(userId)
      const subEnt = ents.find((e) => e.stripeSubscriptionId && e.meta?.source !== 'paypal')
      if (!subEnt?.stripeSubscriptionId) {
        return reply.status(404).send({ message: 'No active Stripe subscription found' })
      }
      sendInternalAlert({
        subject: '[certshack] Subscription cancellation requested (Stripe)',
        lines: [
          `User ID:        ${userId}`,
          `Product:        ${subEnt.productId}`,
          `Subscription:   ${subEnt.stripeSubscriptionId}`,
          `Timestamp:      ${new Date().toISOString()}`,
          `Note:           cancel_at_period_end=true — access retained until billing cycle ends`,
        ],
      })
      try {
        const updatedSub = await stripePost(`/subscriptions/${subEnt.stripeSubscriptionId}`, {
          cancel_at_period_end: 'true',
        })
        const updatedPeriodEnd = getSubscriptionPeriodEnd(updatedSub)
        const accessUntil = updatedPeriodEnd ? new Date(updatedPeriodEnd * 1000).toISOString() : null
        server.log.info({ userId, subscriptionId: subEnt.stripeSubscriptionId, accessUntil }, '[stripe] subscription set to cancel at period end')

        // Send cancellation confirmation to the customer
        try {
          const user = await getUserBySub(userId)
          if (user?.email) {
            const prod = getProduct(subEnt.productId)
            sendSubscriptionCancelledEmail({
              to: user.email,
              name: user.name ?? user.email,
              userId,
              productLabel: prod?.label ?? subEnt.productId,
              productId: subEnt.productId,
              accessUntil,
              source: 'stripe',
            }).catch((e: any) => server.log.warn({ err: e?.message }, '[stripe] cancellation email failed'))
            // Stamp so the subscription.updated webhook doesn't send a duplicate email
            mergeEntitlementMeta(userId, subEnt.productId, { cancelNotifiedAt: new Date().toISOString() })
              .catch((e: any) => server.log.warn({ err: e?.message }, '[stripe] mergeEntitlementMeta cancelNotifiedAt failed'))
          }
        } catch (e: any) {
          server.log.warn({ err: e?.message }, '[stripe] cancellation email lookup failed')
        }

        return { ok: true, cancelAtPeriodEnd: true, accessUntil }
      } catch (err: any) {
        server.log.error({ err }, '[stripe] cancel-subscription error')
        captureWithContext(err, {
          tags: { 'payment.provider': 'stripe', 'payment.stage': 'cancel-subscription' },
          user: { id: userId },
          extra: { subscriptionId: subEnt.stripeSubscriptionId, productId: subEnt.productId },
        })
        return reply.status(502).send({ message: 'Failed to cancel subscription', details: err.stripeError })
      }
    }
  )

  /**
   * Upgrade or downgrade the authenticated user's active Stripe subscription.
   *
   * Upgrade (pro → pro-plus): proration charged immediately, DynamoDB updated now.
   * Downgrade (pro-plus → pro): price change scheduled for next cycle (proration_behavior=none),
   *   expiresAt set on the current entitlement so access continues to period end,
   *   the invoice.payment_succeeded webhook grants sub:pro on the next renewal.
   */
  server.post(
    '/upgrade-subscription',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request: any, reply) => {
      const userId = request.user?.sub as string
      const { targetProductId } = request.body as any

      if (targetProductId !== 'sub:pro' && targetProductId !== 'sub:pro-plus') {
        return reply.status(400).send({ message: 'targetProductId must be sub:pro or sub:pro-plus' })
      }

      const ents = await getUserEntitlements(userId)
      const subEnt = ents.find((e) => e.stripeSubscriptionId && e.meta?.source !== 'paypal')
      if (!subEnt?.stripeSubscriptionId) {
        return reply.status(404).send({ message: 'No active Stripe subscription found' })
      }
      if (subEnt.productId === targetProductId) {
        return reply.status(400).send({ message: 'Already on that plan' })
      }

      const isUpgrade = targetProductId === 'sub:pro-plus'
      const newPriceId = targetProductId === 'sub:pro'
        ? process.env.STRIPE_PRICE_ID_PRO_MONTHLY
        : process.env.STRIPE_PRICE_ID_PRO_PLUS_MONTHLY

      if (!newPriceId) {
        return reply.status(503).send({ message: `Price ID not configured for ${targetProductId}` })
      }

      try {
        // Fetch current subscription to get the item ID and current period end
        const sub = await stripeGet(`/subscriptions/${subEnt.stripeSubscriptionId}`)
        const itemId: string | undefined = sub.items?.data?.[0]?.id
        if (!itemId) {
          return reply.status(502).send({ message: 'Could not determine current subscription item' })
        }
        const periodEndTs = getSubscriptionPeriodEnd(sub)
        if (!periodEndTs) {
          return reply.status(502).send({ message: 'Could not determine current period end from subscription' })
        }
        const periodEnd: string = new Date(periodEndTs * 1000).toISOString()

        // Switch the Stripe plan.
        // Upgrade: `always_invoice` creates the prorated invoice AND immediately charges it,
        //   so the user pays the difference now rather than at next billing.
        // Downgrade: `none` keeps Pro Plus access until period end, then bills sub:pro next cycle.
        await stripePost(`/subscriptions/${subEnt.stripeSubscriptionId}`, {
          items: [{ id: itemId, price: newPriceId }],
          proration_behavior: isUpgrade ? 'always_invoice' : 'none',
          // Update metadata so the deleted/invoice webhooks revoke/grant the right productId
          metadata: { productIds: JSON.stringify([targetProductId]), userId },
        })

        if (isUpgrade) {
          // Grant new tier, revoke old — effective immediately
          const prod = getProduct(targetProductId)
          await grantEntitlement({
            userId,
            productId: targetProductId,
            kind: prod?.kind ?? 'subscription',
            expiresAt: new Date((periodEndTs + 86400) * 1000).toISOString(),
            stripeSubscriptionId: subEnt.stripeSubscriptionId,
            meta: { source: 'stripe.invoice.payment_succeeded', billingReason: 'upgrade' },
          })
          await revokeEntitlement(userId, subEnt.productId)
        } else {
          // Downgrade: stamp period end on current entitlement so it expires naturally.
          // sub:pro will be granted by invoice.payment_succeeded on the next billing cycle.
          await setEntitlementExpiresAt(userId, subEnt.productId, periodEnd)
        }

        sendInternalAlert({
          subject: `[certshack] Subscription ${isUpgrade ? 'upgraded' : 'downgraded'} (Stripe)`,
          lines: [
            `User ID:    ${userId}`,
            `From:       ${subEnt.productId}`,
            `To:         ${targetProductId}`,
            `Timestamp:  ${new Date().toISOString()}`,
            isUpgrade
              ? 'Effect:     immediate, prorated charge applied'
              : `Effect:     downgrade at next cycle (${periodEnd})`,
          ],
        })

        // Send plan change confirmation to the customer
        try {
          const user = await getUserBySub(userId)
          if (user?.email) {
            const fromProd = getProduct(subEnt.productId)
            const toProd = getProduct(targetProductId)
            sendSubscriptionChangedEmail({
              to: user.email,
              name: user.name ?? user.email,
              userId,
              fromLabel: fromProd?.label ?? subEnt.productId,
              fromId: subEnt.productId,
              toLabel: toProd?.label ?? targetProductId,
              toId: targetProductId,
              isUpgrade,
              effectiveDate: isUpgrade ? null : periodEnd,
            }).catch((e: any) => server.log.warn({ err: e?.message }, '[stripe] plan change email failed'))
          }
        } catch (e: any) {
          server.log.warn({ err: e?.message }, '[stripe] plan change email lookup failed')
        }

        server.log.info({ userId, from: subEnt.productId, to: targetProductId, isUpgrade }, '[stripe] subscription plan changed')
        return {
          ok: true,
          isUpgrade,
          accessUntil: isUpgrade ? null : periodEnd,
        }
      } catch (err: any) {
        server.log.error({ err }, '[stripe] upgrade-subscription error')
        captureWithContext(err, {
          tags: { 'payment.provider': 'stripe', 'payment.stage': 'upgrade-subscription' },
          user: { id: userId },
          extra: { subscriptionId: subEnt.stripeSubscriptionId, fromProduct: subEnt.productId, toProduct: targetProductId },
        })
        return reply.status(502).send({ message: 'Failed to change subscription plan', details: err.stripeError })
      }
    }
  )

  /**
   * Create a Stripe Customer Portal session so the user can manage their card,
   * view invoices, and cancel their subscription on Stripe's hosted UI.
   * Returns { url } — the caller redirects to it.
   */
  server.post(
    '/portal-session',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request: any, reply) => {
      const userId = request.user?.sub as string
      const ents = await getUserEntitlements(userId)
      const subEnt = ents.find((e) => e.stripeSubscriptionId && e.meta?.source !== 'paypal')
      if (!subEnt?.stripeSubscriptionId) {
        return reply.status(404).send({ message: 'No active Stripe subscription found' })
      }
      try {
        // Look up customer ID from the subscription; we don't store it in DynamoDB.
        const sub = await stripeGet(`/subscriptions/${subEnt.stripeSubscriptionId}`)
        const customerId: string | undefined = sub?.customer
        if (!customerId) {
          return reply.status(502).send({ message: 'Could not determine Stripe customer' })
        }
        const returnUrl = `${process.env.FRONTEND_ORIGIN || 'https://certshack.com'}/account?tab=purchases`
        const portalSession = await stripePost('/billing_portal/sessions', {
          customer: customerId,
          return_url: returnUrl,
        })
        return { url: portalSession.url }
      } catch (err: any) {
        server.log.error({ err }, '[stripe] portal-session error')
        captureWithContext(err, {
          tags: { 'payment.provider': 'stripe', 'payment.stage': 'portal-session' },
          user: { id: userId },
          extra: { subscriptionId: subEnt.stripeSubscriptionId },
        })
        return reply.status(502).send({ message: 'Failed to create portal session', details: err.stripeError })
      }
    }
  )

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

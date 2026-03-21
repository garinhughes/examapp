/**
 * PayPal routes — Orders API v2 (one-time) and Subscriptions API (recurring).
 *
 * POST /payments/paypal/create-order        - create a PayPal Order (exam/bundle)
 * POST /payments/paypal/create-subscription - create a PayPal Subscription (sub:*)
 * POST /payments/paypal/capture-order       - capture an approved Order and grant entitlements
 * POST /payments/paypal/webhook             - handle PayPal webhook events
 *
 * Environment variables:
 *   PAYPAL_CLIENT_ID         - PayPal app client ID
 *   PAYPAL_CLIENT_SECRET     - PayPal app client secret
 *   PAYPAL_WEBHOOK_ID        - Webhook ID from PayPal dashboard (for signature verification)
 *   PAYPAL_API_BASE          - Override API base (default: https://api-m.paypal.com)
 *   PAYPAL_PLAN_ID_MONTHLY   - Billing Plan ID for sub:all-access (monthly)
 *   PAYPAL_PLAN_ID_ANNUAL    - Billing Plan ID for sub:all-access-annual (annual)
 *   SESSIONS_TABLE           - DynamoDB table for sessions (default: examapp-sessions)
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { getProduct } from '../catalog.js'
import { grantEntitlement, revokeEntitlement } from '../services/entitlements.js'
import { putPaypalSession, getPaypalSession, deletePaypalSession } from '../services/paypalSessions.js'
import { ddb, ENTITLEMENTS_TABLE } from '../services/dynamo.js'

const PP_BASE = process.env.PAYPAL_API_BASE || 'https://api-m.paypal.com'

// Cached OAuth access token
let _ppToken: { token: string; expiresAt: number } | null = null

async function getPaypalToken(): Promise<string> {
  if (_ppToken && Date.now() < _ppToken.expiresAt - 60_000) return _ppToken.token
  const creds = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64')
  const res = await fetch(`${PP_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`PayPal token fetch failed ${res.status}: ${text}`)
  }
  const body = (await res.json()) as any
  _ppToken = { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 }
  return _ppToken.token
}

function ppHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

/** Grant entitlements from a stored session, then delete the session. */
async function _grantFromSession(
  pk: string,
  sk: string,
  server: FastifyInstance
): Promise<void> {
  const sess = await getPaypalSession(pk, sk)
  if (!sess) {
    server.log.warn({ pk, sk }, '[paypal] no session found')
    return
  }
  for (const pid of sess.productIds) {
    const prod = getProduct(pid)
    const isSubscription = prod?.kind === 'subscription'
    await grantEntitlement({
      userId: sess.userId,
      productId: pid,
      kind: prod?.kind ?? 'extra',
      expiresAt: isSubscription
        ? null
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      stripeSubscriptionId: isSubscription ? sk : undefined,
      meta: { source: 'paypal', paypalId: sk },
    })
  }
  server.log.info(
    { pk, sk, userId: sess.userId, productIds: sess.productIds },
    '[paypal] entitlements granted'
  )
  await deletePaypalSession(pk, sk)
}

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  /**
   * Create a PayPal Order for one-time purchases (exams, bundles).
   * Returns { orderId } — the PayPal JS SDK uses this directly to open the checkout modal.
   */
  server.post('/create-order', { preHandler: [server.authenticate], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request: any, reply) => {
    const { productIds, successUrl, cancelUrl } = request.body as any
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return reply.status(400).send({ message: 'productIds array required' })
    }

    let amountPence = 0
    for (const pid of productIds) {
      const prod = getProduct(pid)
      if (!prod) return reply.status(400).send({ message: `Unknown productId: ${pid}` })
      if (prod.kind === 'subscription') {
        return reply.status(400).send({ message: `Use /create-subscription for subscription products` })
      }
      amountPence += prod.priceGBP
    }

    const userId = request.user?.sub
    const amountGBP = (amountPence / 100).toFixed(2)

    try {
      const token = await getPaypalToken()
      const orderRes = await fetch(`${PP_BASE}/v2/checkout/orders`, {
        method: 'POST',
        headers: ppHeaders(token),
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [
            {
              amount: { currency_code: 'GBP', value: amountGBP },
              description: 'ExamApp purchase',
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                brand_name: 'CertShack',
                landing_page: 'NO_PREFERENCE',
                shipping_preference: 'NO_SHIPPING',
                user_action: 'PAY_NOW',
              },
            },
          },
        }),
      })

      if (!orderRes.ok) {
        const text = await orderRes.text()
        server.log.warn({ status: orderRes.status, body: text }, '[paypal] create order failed')
        return reply.status(502).send({ message: 'PayPal create order failed', details: text })
      }

      const order = (await orderRes.json()) as any
      const orderId = order.id

      await putPaypalSession('PAYPAL_ORDER', orderId, {
        userId,
        productIds,
        amountPence,
        successUrl,
        cancelUrl,
      })

      return reply.send({ orderId })
    } catch (err: any) {
      server.log.error({ err }, '[paypal] create-order error')
      return reply.status(500).send({ message: 'Internal error creating PayPal order' })
    }
  })

  /**
   * Create a PayPal Subscription for recurring products (sub:all-access, sub:all-access-annual).
   * Returns { subscriptionId } — the PayPal JS SDK uses this in createSubscription callback.
   */
  server.post('/create-subscription', { preHandler: [server.authenticate], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request: any, reply) => {
    const { productId, successUrl, cancelUrl } = request.body as any
    if (!productId) {
      return reply.status(400).send({ message: 'productId required' })
    }

    const prod = getProduct(productId)
    if (!prod) return reply.status(400).send({ message: `Unknown productId: ${productId}` })
    if (prod.kind !== 'subscription') {
      return reply.status(400).send({ message: 'productId must be a subscription product' })
    }

    const planId =
      prod.billingPeriod === 'annual'
        ? process.env.PAYPAL_PLAN_ID_ANNUAL
        : process.env.PAYPAL_PLAN_ID_MONTHLY

    if (!planId) {
      return reply.status(500).send({
        message: `PayPal plan ID not configured for ${prod.billingPeriod ?? 'monthly'} billing`,
      })
    }

    const userId = request.user?.sub

    try {
      const token = await getPaypalToken()
      const subRes = await fetch(`${PP_BASE}/v1/billing/subscriptions`, {
        method: 'POST',
        headers: ppHeaders(token),
        body: JSON.stringify({
          plan_id: planId,
          application_context: {
            brand_name: 'CertShack',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'SUBSCRIBE_NOW',
            return_url: 'https://certshack.com/?payment=success',
            cancel_url: 'https://certshack.com/?payment=cancel',
          },
        }),
      })

      if (!subRes.ok) {
        const text = await subRes.text()
        server.log.warn({ status: subRes.status, body: text }, '[paypal] create subscription failed')
        return reply.status(502).send({ message: 'PayPal create subscription failed', details: text })
      }

      const sub = (await subRes.json()) as any
      const subscriptionId = sub.id

      await putPaypalSession('PAYPAL_SUB', subscriptionId, {
        userId,
        productIds: [productId],
        amountPence: prod.priceGBP,
        successUrl,
        cancelUrl,
      })

      return reply.send({ subscriptionId })
    } catch (err: any) {
      server.log.error({ err }, '[paypal] create-subscription error')
      return reply.status(500).send({ message: 'Internal error creating PayPal subscription' })
    }
  })

  /**
   * Capture an approved PayPal Order and immediately grant entitlements.
   * Called by the frontend after PayPal's onApprove fires.
   */
  server.post('/capture-order', { preHandler: [server.authenticate], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request: any, reply) => {
    const { orderId } = request.body as any
    if (!orderId) return reply.status(400).send({ message: 'orderId required' })
    if (!/^[A-Z0-9]{1,64}$/i.test(orderId)) return reply.status(400).send({ message: 'Invalid orderId' })

    try {
      const token = await getPaypalToken()
      const captureRes = await fetch(`${PP_BASE}/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: ppHeaders(token),
        body: '{}',
      })

      if (!captureRes.ok) {
        const text = await captureRes.text()
        server.log.warn({ status: captureRes.status, body: text }, '[paypal] capture order failed')
        return reply.status(502).send({ message: 'PayPal capture failed', details: text })
      }

      const captured = (await captureRes.json()) as any
      if (captured.status !== 'COMPLETED') {
        server.log.warn({ orderId, status: captured.status }, '[paypal] capture not COMPLETED')
        return reply.status(400).send({ message: `Order status: ${captured.status}` })
      }

      await _grantFromSession('PAYPAL_ORDER', orderId, server)
      return reply.send({ success: true })
    } catch (err: any) {
      server.log.error({ err }, '[paypal] capture-order error')
      return reply.status(500).send({ message: 'Internal error capturing PayPal order' })
    }
  })

  /**
   * PayPal webhook — belt-and-suspenders entitlement grants and subscription lifecycle.
   * PayPal requires HTTP 200; any other status triggers a retry.
   */
  server.post('/webhook', async (request: any, reply) => {
    // Verify webhook signature via PayPal's verification API
    if (process.env.PAYPAL_WEBHOOK_ID) {
      try {
        const token = await getPaypalToken()
        const verifyRes = await fetch(`${PP_BASE}/v1/notifications/verify-webhook-signature`, {
          method: 'POST',
          headers: ppHeaders(token),
          body: JSON.stringify({
            auth_algo: request.headers['paypal-auth-algo'],
            cert_url: request.headers['paypal-cert-url'],
            transmission_id: request.headers['paypal-transmission-id'],
            transmission_sig: request.headers['paypal-transmission-sig'],
            transmission_time: request.headers['paypal-transmission-time'],
            webhook_id: process.env.PAYPAL_WEBHOOK_ID,
            webhook_event: request.body,
          }),
        })
        const verifyBody = (await verifyRes.json()) as any
        if (verifyBody.verification_status !== 'SUCCESS') {
          server.log.warn({ verifyBody }, '[paypal] webhook signature verification failed')
          return reply.status(200).send({ received: false })
        }
      } catch (err) {
        server.log.error({ err }, '[paypal] webhook verification error')
        // Fall through — still return 200 to avoid PayPal retries flooding logs
      }
    }

    const event = request.body as any
    const eventType: string = event?.event_type ?? ''
    const resource = event?.resource ?? {}

    server.log.info({ eventType }, '[paypal] webhook received')

    try {
      if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
        // Belt-and-suspenders: grant if capture-order endpoint was missed
        const orderId = resource?.supplementary_data?.related_ids?.order_id ?? resource?.id
        if (orderId) await _grantFromSession('PAYPAL_ORDER', orderId, server)
      } else if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
        const subscriptionId = resource?.id
        if (subscriptionId) await _grantFromSession('PAYPAL_SUB', subscriptionId, server)
      } else if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED') {
        const subscriptionId = resource?.id
        if (subscriptionId) {
          await _revokeSubscription(subscriptionId, server)
        }
      }
      // PAYMENT.SALE.COMPLETED — recurring payment collected; entitlements already active, just log
    } catch (err) {
      server.log.error({ err, eventType }, '[paypal] webhook event processing failed')
    }

    return reply.status(200).send({ received: true })
  })
}

/**
 * Find and revoke the entitlement associated with a PayPal subscription ID.
 * Scans the entitlements table by stripeSubscriptionId (re-used for PayPal sub IDs).
 */
async function _revokeSubscription(subscriptionId: string, server: FastifyInstance): Promise<void> {
  try {
    const res = await ddb.send(
      new ScanCommand({
        TableName: ENTITLEMENTS_TABLE,
        FilterExpression: 'stripeSubscriptionId = :sid',
        ExpressionAttributeValues: { ':sid': subscriptionId },
      })
    )
    const items = res.Items ?? []
    if (items.length === 0) {
      server.log.warn({ subscriptionId }, '[paypal] no entitlement found for subscription cancellation')
      return
    }
    for (const item of items) {
      await revokeEntitlement(item.userId, item.productId)
      server.log.info(
        { subscriptionId, userId: item.userId, productId: item.productId },
        '[paypal] subscription entitlement revoked'
      )
    }
  } catch (err) {
    server.log.error({ err, subscriptionId }, '[paypal] revokeSubscription failed')
  }
}

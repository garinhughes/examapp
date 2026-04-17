/**
 * PayPal routes — Subscriptions API (recurring monthly).
 *
 * POST /payments/paypal/create-subscription - create a PayPal Subscription (sub:*)
 * POST /payments/paypal/webhook             - handle PayPal webhook events
 *
 * Environment variables:
 *   PAYPAL_CLIENT_ID         - PayPal app client ID
 *   PAYPAL_CLIENT_SECRET     - PayPal app client secret
 *   PAYPAL_WEBHOOK_ID        - Webhook ID from PayPal dashboard (for signature verification)
 *   PAYPAL_API_BASE          - Override API base (default: https://api-m.paypal.com)
 *   PAYPAL_PLAN_ID_PRO_MONTHLY       - Billing Plan ID for sub:pro (monthly)
 *   PAYPAL_PLAN_ID_PRO_PLUS_MONTHLY  - Billing Plan ID for sub:pro-plus (monthly)
 *   DISCOUNT_ACTIVE                  - Set to "true" to apply discount prices
 *   PAYPAL_PLAN_ID_PRO_DISCOUNT      - Billing Plan ID for discounted sub:pro
 *   PAYPAL_PLAN_ID_PRO_PLUS_DISCOUNT - Billing Plan ID for discounted sub:pro-plus
 *   SESSIONS_TABLE           - DynamoDB table for sessions (default: examapp-sessions)
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { getProduct } from '../catalog.js'
import { grantEntitlement, revokeEntitlement, getUserEntitlements, setEntitlementExpiresAt } from '../services/entitlements.js'
import { sendInternalAlert, sendPaymentConfirmedEmail, sendSubscriptionCancelledEmail } from '../services/ses.js'
import { putPaypalSession, getPaypalSession, deletePaypalSession } from '../services/paypalSessions.js'
import { ddb, ENTITLEMENTS_TABLE, getUserBySub } from '../services/dynamo.js'
import { logEmailSend } from '../services/emailLogs.js'

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
  server: FastifyInstance,
  subscriptionExpiresAt?: string | null
): Promise<void> {
  const sess = await getPaypalSession(pk, sk)
  if (!sess) {
    server.log.warn({ pk, sk }, '[paypal] no session found')
    return
  }
  for (const pid of sess.productIds) {
    const prod = getProduct(pid)
    const isSubscription = prod?.kind === 'subscription'
    // Subscriptions: use expiresAt from billing period end (+ 1 day grace) passed by caller.
    // One-off products: grant 30 days.
    const expiresAt = isSubscription
      ? (subscriptionExpiresAt ?? null)
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    await grantEntitlement({
      userId: sess.userId,
      productId: pid,
      kind: prod?.kind ?? 'extra',
      expiresAt,
      stripeSubscriptionId: isSubscription ? sk : undefined,
      meta: { source: 'paypal', paypalId: sk },
    })
  }
  server.log.info(
    { pk, sk, userId: sess.userId, productIds: sess.productIds },
    '[paypal] entitlements granted'
  )
  // Send payment confirmation email (fire-and-forget)
  try {
    const user = await getUserBySub(sess.userId)
    if (user?.email) {
      const emailProducts = (sess.productIds as string[]).map((pid: string) => {
        const p = getProduct(pid)
        return { productId: pid, label: p?.label ?? pid, priceGBP: p?.priceGBP ?? 0 }
      })
      const totalPence: number = sess.amountPence
      sendPaymentConfirmedEmail({ to: user.email, name: user.name ?? user.email, userId: sess.userId, products: emailProducts, totalPence, source: 'paypal' })
        .then(() => logEmailSend({ type: 'payment-confirmed', sentBy: 'paypal-webhook', templateId: 'payment-confirmed', recipientCount: 1, subject: 'Your certshack order is confirmed', filters: { productIds: sess.productIds } }))
        .catch((e: any) => server.log.warn({ err: e?.message }, '[paypal] payment confirmed email failed'))
    }
  } catch (e: any) {
    server.log.warn({ err: e?.message }, '[paypal] payment confirmed email lookup failed')
  }
  await deletePaypalSession(pk, sk)
}

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  /**
   * Create a PayPal Subscription for recurring monthly products (sub:pro, sub:pro-plus).
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

    const discountActive = process.env.DISCOUNT_ACTIVE === 'true'
    const planId = (() => {
      if (productId === 'sub:pro') {
        return discountActive
          ? process.env.PAYPAL_PLAN_ID_PRO_DISCOUNT
          : process.env.PAYPAL_PLAN_ID_PRO_MONTHLY
      }
      if (productId === 'sub:pro-plus') {
        return discountActive
          ? process.env.PAYPAL_PLAN_ID_PRO_PLUS_DISCOUNT
          : process.env.PAYPAL_PLAN_ID_PRO_PLUS_MONTHLY
      }
      return undefined
    })()

    if (!planId) {
      return reply.status(500).send({
        message: `PayPal plan ID not configured for ${productId}. Set PAYPAL_PLAN_ID_PRO_MONTHLY / PAYPAL_PLAN_ID_PRO_PLUS_MONTHLY.`,
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
            brand_name: 'certshack',
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
        if (subscriptionId) {
          // Extract period end from next_billing_time + 1 day grace
          const nextBillingTime: string | undefined = resource?.billing_info?.next_billing_time
          const expiresAt = nextBillingTime
            ? new Date(new Date(nextBillingTime).getTime() + 86400_000).toISOString()
            : null
          await _grantFromSession('PAYPAL_SUB', subscriptionId, server, expiresAt)
        }
      } else if (eventType === 'PAYMENT.SALE.COMPLETED') {
        // Recurring subscription payment — refresh expiresAt for the next billing cycle.
        // Requires PAYMENT.SALE.COMPLETED to be subscribed in the PayPal webhook dashboard.
        const subscriptionId: string | undefined = resource?.billing_agreement_id
        if (subscriptionId) {
          try {
            const token = await getPaypalToken()
            const subRes = await fetch(`${PP_BASE}/v1/billing/subscriptions/${subscriptionId}`, {
              headers: ppHeaders(token),
            })
            if (subRes.ok) {
              const subData = await subRes.json() as any
              const nextBillingTime: string | undefined = subData?.billing_info?.next_billing_time
              if (nextBillingTime) {
                const expiresAt = new Date(new Date(nextBillingTime).getTime() + 86400_000).toISOString()
                const scan = await ddb.send(new ScanCommand({
                  TableName: ENTITLEMENTS_TABLE,
                  FilterExpression: 'stripeSubscriptionId = :sid',
                  ExpressionAttributeValues: { ':sid': subscriptionId },
                }))
                for (const item of scan.Items ?? []) {
                  await setEntitlementExpiresAt(item.userId, item.productId, expiresAt)
                }
                server.log.info({ subscriptionId, nextBillingTime, count: scan.Items?.length ?? 0 }, '[paypal] renewal — expiresAt extended')
              }
            }
          } catch (err) {
            server.log.error({ err, subscriptionId }, '[paypal] PAYMENT.SALE.COMPLETED handling failed')
          }
        }
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

  /**
   * Cancel the authenticated user's active PayPal subscription.
   * Calls the PayPal Subscriptions API to cancel immediately.
   * PayPal will fire BILLING.SUBSCRIPTION.CANCELLED webhook which revokes the entitlement.
   */
  server.post(
    '/cancel-subscription',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request: any, reply) => {
      const userId = request.user?.sub as string
      const ents = await getUserEntitlements(userId)
      const subEnt = ents.find((e) => e.stripeSubscriptionId && e.meta?.source === 'paypal')
      if (!subEnt?.stripeSubscriptionId) {
        return reply.status(404).send({ message: 'No active PayPal subscription found' })
      }
      sendInternalAlert({
        subject: '[certshack] Subscription cancellation requested (PayPal)',
        lines: [
          `User ID:        ${userId}`,
          `Product:        ${subEnt.productId}`,
          `Subscription:   ${subEnt.stripeSubscriptionId}`,
          `Timestamp:      ${new Date().toISOString()}`,
          `Note:           will fetch period end and cancel via PayPal API`,
        ],
      })
      try {
        const token = await getPaypalToken()

        // Fetch the subscription to find the current period end so we can retain access until then
        const subRes = await fetch(`${PP_BASE}/v1/billing/subscriptions/${subEnt.stripeSubscriptionId}`, {
          headers: ppHeaders(token),
        })
        let periodEnd: string | null = null
        if (subRes.ok) {
          const subData = await subRes.json() as any
          periodEnd = subData?.billing_info?.next_billing_time ?? null
        }

        // Stamp the period end on the entitlement before cancelling so access is retained until then.
        // When the BILLING.SUBSCRIPTION.CANCELLED webhook fires (immediately), it sets status='cancelled'
        // but the future expiresAt means getUserEntitlements still returns the entitlement.
        if (periodEnd) {
          await ddb.send(new UpdateCommand({
            TableName: ENTITLEMENTS_TABLE,
            Key: { userId: subEnt.userId, productId: subEnt.productId },
            UpdateExpression: 'SET expiresAt = :exp',
            ExpressionAttributeValues: { ':exp': periodEnd },
          }))
          server.log.info({ userId, periodEnd }, '[paypal] stamped period end on entitlement before cancel')
        }

        const res = await fetch(`${PP_BASE}/v1/billing/subscriptions/${subEnt.stripeSubscriptionId}/cancel`, {
          method: 'POST',
          headers: ppHeaders(token),
          body: JSON.stringify({ reason: 'Customer requested cancellation' }),
        })
        if (!res.ok && res.status !== 204) {
          const text = await res.text()
          server.log.error({ status: res.status, body: text }, '[paypal] cancel-subscription API error')
          return reply.status(502).send({ message: 'PayPal API error' })
        }
        server.log.info({ userId, subscriptionId: subEnt.stripeSubscriptionId, periodEnd }, '[paypal] subscription cancellation requested')

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
              accessUntil: periodEnd,
              source: 'paypal',
            }).catch((e: any) => server.log.warn({ err: e?.message }, '[paypal] cancellation email failed'))
          }
        } catch (e: any) {
          server.log.warn({ err: e?.message }, '[paypal] cancellation email lookup failed')
        }

        return { ok: true, accessUntil: periodEnd }
      } catch (err: any) {
        server.log.error({ err }, '[paypal] cancel-subscription error')
        return reply.status(500).send({ message: 'Failed to cancel subscription' })
      }
    }
  )
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

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
import { grantEntitlement, revokeEntitlement, getUserEntitlements, setEntitlementExpiresAt, mergeEntitlementMeta } from '../services/entitlements.js'
import { sendInternalAlert, sendPaymentConfirmedEmail, sendRefundedEmail, sendSubscriptionCancelledEmail, sendSubscriptionEndedEmail, sendPaymentFailedEmail, sendSubscriptionChangedEmail } from '../services/ses.js'
import { putPaypalSession, getPaypalSession, deletePaypalSession } from '../services/paypalSessions.js'
import { ddb, ENTITLEMENTS_TABLE, getUserBySub } from '../services/dynamo.js'
import { logEmailSend } from '../services/emailLogs.js'
import { captureWithContext, captureWarning, addBreadcrumb } from '../lib/sentry.js'

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

/** Map a PayPal plan ID back to our internal productId, checking all known plan env vars. */
function planIdToProductId(planId: string): string | null {
  const candidates: Record<string, string> = {}
  if (process.env.PAYPAL_PLAN_ID_PRO_MONTHLY) candidates[process.env.PAYPAL_PLAN_ID_PRO_MONTHLY] = 'sub:pro'
  if (process.env.PAYPAL_PLAN_ID_PRO_DISCOUNT) candidates[process.env.PAYPAL_PLAN_ID_PRO_DISCOUNT] = 'sub:pro'
  if (process.env.PAYPAL_PLAN_ID_PRO_PLUS_MONTHLY) candidates[process.env.PAYPAL_PLAN_ID_PRO_PLUS_MONTHLY] = 'sub:pro-plus'
  if (process.env.PAYPAL_PLAN_ID_PRO_PLUS_DISCOUNT) candidates[process.env.PAYPAL_PLAN_ID_PRO_PLUS_DISCOUNT] = 'sub:pro-plus'
  return candidates[planId] ?? null
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
    // This is load-bearing: session TTL is 24h. If a user activates a subscription after
    // the session expired, we silently drop the grant. Elevate to error so it's alertable.
    server.log.error({ pk, sk }, '[paypal] no session found — entitlement NOT granted (session likely expired)')
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
  // Alert if the user now holds multiple active subscription tiers — indicates a cancelled-then-upgraded
  // scenario where both entitlements are valid concurrently (expected but worth monitoring).
  if (sess.productIds.some((pid: string) => getProduct(pid)?.kind === 'subscription')) {
    const allEnts = await getUserEntitlements(sess.userId)
    const activeSubs = allEnts.filter((e) => getProduct(e.productId)?.kind === 'subscription')
    if (activeSubs.length > 1) {
      sendInternalAlert({
        subject: '[certshack] User has multiple active PayPal subscriptions (review)',
        lines: [
          `User ID:      ${sess.userId}`,
          `Products:     ${activeSubs.map((e) => `${e.productId} (${e.status}, expires ${e.expiresAt ?? 'never'})`).join(' | ')}`,
          `Timestamp:    ${new Date().toISOString()}`,
          'Note: likely a cancel-then-upgrade — verify both expiresAt dates are correct.',
        ],
      })
      captureWarning('paypal.multiple_active_subs', {
        user: { id: sess.userId },
        tags: { 'payment.provider': 'paypal' },
        extra: { activeSubs: activeSubs.map((e) => ({ productId: e.productId, status: e.status, expiresAt: e.expiresAt })) },
        fingerprint: ['paypal', 'multi-active', sess.userId],
      })
    }
  }
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

    // Block duplicate subscription for the same plan — mirrors the Stripe checkout 409.
    if (userId) {
      const existing = await getUserEntitlements(userId)
      if (existing.some((e) => e.productId === productId && e.status === 'active')) {
        return reply.status(409).send({ message: `You already have an active ${prod.label} subscription.` })
      }
    }

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
            return_url: `${process.env.FRONTEND_ORIGIN || 'https://certshack.com'}/?payment=success`,
            cancel_url: `${process.env.FRONTEND_ORIGIN || 'https://certshack.com'}/?payment=cancel`,
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

      const discountedPrice = discountActive ? (
        productId === 'sub:pro' ? 500 : productId === 'sub:pro-plus' ? 700 : prod.priceGBP
      ) : prod.priceGBP
      await putPaypalSession('PAYPAL_SUB', subscriptionId, {
        userId,
        productIds: [productId],
        amountPence: discountedPrice,
        successUrl,
        cancelUrl,
      })

      return reply.send({ subscriptionId })
    } catch (err: any) {
      server.log.error({ err }, '[paypal] create-subscription error')
      captureWithContext(err, {
        tags: { 'payment.provider': 'paypal', 'payment.stage': 'create-subscription' },
        user: userId ? { id: userId } : undefined,
        extra: { productId, planId },
      })
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
        captureWithContext(err, {
          tags: { 'payment.provider': 'paypal', 'payment.stage': 'webhook-verify' },
        })
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
          sendInternalAlert({
            subject: '[certshack] PayPal subscription activated',
            lines: [
              `Subscription: ${subscriptionId}`,
              `Plan ID:      ${resource?.plan_id ?? 'unknown'}`,
              `Expires at:   ${expiresAt ?? 'unknown'}`,
              `Timestamp:    ${new Date().toISOString()}`,
            ],
          })
        }
      } else if (eventType === 'PAYMENT.SALE.COMPLETED') {
        // Recurring subscription payment — refresh expiresAt for the next billing cycle
        // AND re-grant so status flips back to 'active' if a prior failed payment had lapsed it.
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
                  const prod = getProduct(item.productId)
                  await grantEntitlement({
                    userId: item.userId,
                    productId: item.productId,
                    kind: prod?.kind ?? 'subscription',
                    expiresAt,
                    stripeSubscriptionId: subscriptionId,
                    meta: { source: 'paypal', paypalId: subscriptionId, billingReason: 'renewal' },
                  })
                }
                server.log.info({ subscriptionId, nextBillingTime, count: scan.Items?.length ?? 0 }, '[paypal] renewal — entitlement refreshed')
                sendInternalAlert({
                  subject: '[certshack] PayPal subscription renewed',
                  lines: [
                    `Subscription:     ${subscriptionId}`,
                    `Entitlements:     ${scan.Items?.map((i) => i.productId).join(', ') ?? 'none'}`,
                    `Next billing:     ${nextBillingTime}`,
                    `New expires at:   ${expiresAt}`,
                    `Timestamp:        ${new Date().toISOString()}`,
                  ],
                })
              }
            }
          } catch (err) {
            server.log.error({ err, subscriptionId }, '[paypal] PAYMENT.SALE.COMPLETED handling failed')
          }
        }
      } else if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED' || eventType === 'BILLING.SUBSCRIPTION.EXPIRED') {
        // CANCELLED fires on user/merchant cancel; EXPIRED fires after dunning exhausts retries.
        // Both terminate the sub — revoke any entitlement whose expiresAt has already passed,
        // and leave future-dated ones alone (cancel-at-period-end stamps a future expiresAt).
        const subscriptionId = resource?.id
        if (subscriptionId) {
          await _revokeSubscription(subscriptionId, server, eventType)
        }
      } else if (eventType === 'BILLING.SUBSCRIPTION.SUSPENDED') {
        // User suspended the sub via PayPal dashboard. No immediate revocation — access lapses
        // at period_end grace. Alert ops so the customer can be contacted.
        const subscriptionId: string | undefined = resource?.id
        server.log.warn({ subscriptionId }, '[paypal] subscription suspended — access will lapse at period_end + 1d grace if not reactivated')
      } else if (eventType === 'BILLING.SUBSCRIPTION.UPDATED') {
        // Fires when a subscription revision is approved by the user on PayPal.
        // Only act when status=ACTIVE — pending revisions also fire this event.
        const subscriptionId: string | undefined = resource?.id
        const newPlanId: string | undefined = resource?.plan_id
        const status: string | undefined = resource?.status

        if (subscriptionId && newPlanId) {
          const newProductId = planIdToProductId(newPlanId)
          if (!newProductId) {
            // Plan ID we don't recognise — could be a manual change via PayPal dashboard.
            sendInternalAlert({
              subject: '[paypal] subscription plan changed to unknown plan (review required)',
              lines: [
                `Subscription: ${subscriptionId}`,
                `New plan ID:  ${newPlanId}`,
                `Status:       ${status ?? 'unknown'}`,
                'Action:       verify DynamoDB entitlement productId matches PayPal plan',
              ],
            })
          } else if (status === 'ACTIVE') {
            try {
              const scan = await ddb.send(new ScanCommand({
                TableName: ENTITLEMENTS_TABLE,
                FilterExpression: 'stripeSubscriptionId = :sid',
                ExpressionAttributeValues: { ':sid': subscriptionId },
              }))
              const nextBillingTime: string | undefined = resource?.billing_info?.next_billing_time
              const expiresAt = nextBillingTime
                ? new Date(new Date(nextBillingTime).getTime() + 86400_000).toISOString()
                : null

              for (const item of scan.Items ?? []) {
                if (item.productId === newProductId) {
                  // Same plan — refresh expiresAt (revision with no tier change)
                  if (expiresAt) await setEntitlementExpiresAt(item.userId, item.productId, expiresAt)
                  server.log.info({ subscriptionId, userId: item.userId, productId: item.productId }, '[paypal] subscription.updated — same plan, expiresAt refreshed')
                } else {
                  const isUpgrade = newProductId === 'sub:pro-plus'
                  if (isUpgrade) {
                    // Grant new tier immediately, revoke old
                    const prod = getProduct(newProductId)
                    await grantEntitlement({ userId: item.userId, productId: newProductId, kind: prod?.kind ?? 'subscription', expiresAt, stripeSubscriptionId: subscriptionId, meta: { source: 'paypal', paypalId: subscriptionId, billingReason: 'upgrade' } })
                    await revokeEntitlement(item.userId, item.productId)
                  } else {
                    // Downgrade: stamp period end on current plan so access continues naturally,
                    // grant new (lower) tier immediately. Old plan expires at period end.
                    if (expiresAt) await setEntitlementExpiresAt(item.userId, item.productId, expiresAt)
                    const prod = getProduct(newProductId)
                    await grantEntitlement({ userId: item.userId, productId: newProductId, kind: prod?.kind ?? 'subscription', expiresAt, stripeSubscriptionId: subscriptionId, meta: { source: 'paypal', paypalId: subscriptionId, billingReason: 'downgrade' } })
                  }
                  server.log.info({ subscriptionId, userId: item.userId, from: item.productId, to: newProductId, isUpgrade }, '[paypal] subscription.updated — plan changed, entitlements updated')

                  // Plan change email
                  try {
                    const user = await getUserBySub(item.userId)
                    if (user?.email) {
                      const fromProd = getProduct(item.productId)
                      const toProd = getProduct(newProductId)
                      sendSubscriptionChangedEmail({
                        to: user.email,
                        name: user.name ?? user.email,
                        userId: item.userId,
                        fromLabel: fromProd?.label ?? item.productId,
                        fromId: item.productId,
                        toLabel: toProd?.label ?? newProductId,
                        toId: newProductId,
                        isUpgrade: newProductId === 'sub:pro-plus',
                        effectiveDate: isUpgrade ? null : expiresAt,
                      }).catch((e: any) => server.log.warn({ err: e?.message }, '[paypal] plan change email failed'))
                    }
                  } catch (e: any) {
                    server.log.warn({ err: e?.message }, '[paypal] plan change email lookup failed')
                  }
                  sendInternalAlert({
                    subject: `[certshack] Subscription ${newProductId === 'sub:pro-plus' ? 'upgraded' : 'downgraded'} (PayPal)`,
                    lines: [
                      `User ID:    ${item.userId}`,
                      `From:       ${item.productId}`,
                      `To:         ${newProductId}`,
                      `Sub:        ${subscriptionId}`,
                      `Timestamp:  ${new Date().toISOString()}`,
                    ],
                  })
                }
              }
            } catch (err) {
              server.log.error({ err, subscriptionId }, '[paypal] BILLING.SUBSCRIPTION.UPDATED handling failed')
            }
          } else {
            server.log.info({ subscriptionId, status, newPlanId }, '[paypal] subscription.updated — non-ACTIVE, skipping entitlement update')
          }
        }
      } else if (eventType === 'PAYMENT.SALE.REFUNDED') {
        // Refund on a subscription sale. Fetch the original sale to distinguish full vs partial.
        // Only full refunds revoke entitlement — partial refunds log for manual review (same as Stripe).
        const subscriptionId: string | undefined = resource?.billing_agreement_id
        if (subscriptionId) {
          try {
            // Check if this is a partial refund by comparing refunded amount to original sale amount.
            const refundedAmount = parseFloat(resource?.amount?.total ?? '0')
            const saleId: string | undefined = resource?.sale_id
            let isFullRefund = true
            if (saleId) {
              try {
                const token = await getPaypalToken()
                const saleRes = await fetch(`${PP_BASE}/v1/payments/sale/${saleId}`, { headers: ppHeaders(token) })
                if (saleRes.ok) {
                  const saleData = await saleRes.json() as any
                  const saleAmount = parseFloat(saleData?.amount?.total ?? '0')
                  if (saleAmount > 0 && refundedAmount < saleAmount) {
                    isFullRefund = false
                    server.log.warn({ subscriptionId, saleId, refundedAmount, saleAmount }, '[paypal] partial refund — no entitlement change')
                  }
                }
              } catch (e: any) {
                server.log.warn({ err: e?.message, saleId }, '[paypal] refund — could not fetch original sale; treating as full')
              }
            }

            if (!isFullRefund) {
              // Partial refund — no revocation, just log
            } else {
            const scan = await ddb.send(new ScanCommand({
              TableName: ENTITLEMENTS_TABLE,
              FilterExpression: 'stripeSubscriptionId = :sid',
              ExpressionAttributeValues: { ':sid': subscriptionId },
            }))
            const items = scan.Items ?? []
            for (const item of items) {
              await revokeEntitlement(item.userId, item.productId)
            }
            server.log.info({ subscriptionId, saleId: resource?.id, revokedCount: items.length }, '[paypal] refund — entitlements revoked')
            if (items.length === 0) {
              server.log.warn({ subscriptionId, saleId: resource?.id }, '[paypal] refund — no entitlements found for subscription')
            }
            // Email each affected user
            const notified = new Set<string>()
            for (const item of items) {
              if (notified.has(item.userId)) continue
              notified.add(item.userId)
              try {
                const user = await getUserBySub(item.userId)
                if (user?.email) {
                  const prod = getProduct(item.productId)
                  sendRefundedEmail({ to: user.email, name: user.name ?? user.email, userId: item.userId, productLabel: prod?.label ?? item.productId, productId: item.productId, source: 'paypal' })
                    .catch((e: any) => server.log.warn({ err: e?.message }, '[paypal] refund email failed'))
                }
              } catch (e: any) { server.log.warn({ err: e?.message }, '[paypal] refund email lookup failed') }
            }
            } // end full-refund block
          } catch (err) {
            server.log.error({ err, subscriptionId }, '[paypal] PAYMENT.SALE.REFUNDED handling failed')
          }
        } else {
          server.log.warn({ saleId: resource?.id }, '[paypal] refund — no billing_agreement_id; manual review needed (likely one-off order refund)')
          sendInternalAlert({
            subject: '[paypal] one-off refund received — manual review',
            lines: [`Sale ${resource?.id} refunded but no subscription link.`, 'Find the related order and revoke entitlement manually.'],
          })
        }
      } else if (eventType === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED') {
        // PayPal will retry per dunning config. Don't revoke here — expiresAt grace handles
        // eventual access loss if retries are exhausted. Email the user so they can update
        // their funding source before access lapses.
        const subscriptionId: string | undefined = resource?.id
        const retries = Number(resource?.billing_info?.failed_payments_count ?? 1)
        server.log.warn({ subscriptionId, retries }, '[paypal] subscription payment failed — access will lapse at period_end + 1d grace if not resolved')
        if (subscriptionId) {
          try {
            const scan = await ddb.send(new ScanCommand({
              TableName: ENTITLEMENTS_TABLE,
              FilterExpression: 'stripeSubscriptionId = :sid',
              ExpressionAttributeValues: { ':sid': subscriptionId },
            }))
            const notified = new Set<string>()
            for (const item of scan.Items ?? []) {
              if (notified.has(item.userId)) continue
              notified.add(item.userId)
              const user = await getUserBySub(item.userId)
              if (user?.email) {
                const prod = getProduct(item.productId)
                const nextAttempt: string | null = resource?.billing_info?.next_billing_time ?? null
                const frontend = process.env.FRONTEND_ORIGIN || 'https://certshack.com'
                sendPaymentFailedEmail({
                  to: user.email,
                  name: user.name ?? user.email,
                  userId: item.userId,
                  productLabel: prod?.label ?? item.productId,
                  attemptCount: retries,
                  nextAttempt,
                  manageUrl: `${frontend}/account?tab=purchases`,
                })
                  .then(() => logEmailSend({ type: 'payment-failed', sentBy: 'paypal-webhook', templateId: 'payment-failed', recipientCount: 1, subject: 'Payment failed — please update your card', filters: { productIds: [item.productId] } }))
                  .catch((e: any) => server.log.warn({ err: e?.message }, '[paypal] payment_failed email send failed'))
              }
            }
          } catch (e: any) {
            server.log.warn({ err: e?.message, subscriptionId }, '[paypal] payment_failed email lookup failed')
          }
        }
      }
    } catch (err) {
      server.log.error({ err, eventType }, '[paypal] webhook event processing failed')
      captureWithContext(err, {
        tags: {
          'payment.provider': 'paypal',
          'payment.event_type': eventType,
          'payment.stage': 'webhook',
        },
        extra: { eventId: (request.body as any)?.id },
        fingerprint: ['paypal', String(eventType ?? 'unknown')],
      })
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
            // Stamp so the subscription.cancelled webhook doesn't double-email if it fires
            // before periodEnd (immediate cancels do — PayPal cancels straight away).
            mergeEntitlementMeta(userId, subEnt.productId, { cancelNotifiedAt: new Date().toISOString() })
              .catch((e: any) => server.log.warn({ err: e?.message }, '[paypal] mergeEntitlementMeta cancelNotifiedAt failed'))
          }
        } catch (e: any) {
          server.log.warn({ err: e?.message }, '[paypal] cancellation email lookup failed')
        }

        return { ok: true, accessUntil: periodEnd }
      } catch (err: any) {
        server.log.error({ err }, '[paypal] cancel-subscription error')
        captureWithContext(err, {
          tags: { 'payment.provider': 'paypal', 'payment.stage': 'cancel-subscription' },
          user: { id: userId },
          extra: { subscriptionId: subEnt.stripeSubscriptionId, productId: subEnt.productId },
        })
        return reply.status(500).send({ message: 'Failed to cancel subscription' })
      }
    }
  )

  /**
   * Revise (upgrade/downgrade) the authenticated user's active PayPal subscription.
   * Calls PayPal's revision API and returns an approvalUrl the frontend must redirect to.
   * The BILLING.SUBSCRIPTION.UPDATED webhook handles the entitlement update once approved.
   */
  server.post(
    '/revise-subscription',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request: any, reply) => {
      const userId = request.user?.sub as string
      const { targetProductId } = request.body as any

      if (targetProductId !== 'sub:pro' && targetProductId !== 'sub:pro-plus') {
        return reply.status(400).send({ message: 'targetProductId must be sub:pro or sub:pro-plus' })
      }

      const ents = await getUserEntitlements(userId)
      const subEnt = ents.find((e) => e.stripeSubscriptionId && e.meta?.source === 'paypal')
      if (!subEnt?.stripeSubscriptionId) {
        return reply.status(404).send({ message: 'No active PayPal subscription found' })
      }
      if (subEnt.productId === targetProductId) {
        return reply.status(400).send({ message: 'Already on that plan' })
      }

      const discountActive = process.env.DISCOUNT_ACTIVE === 'true'
      const newPlanId = (() => {
        if (targetProductId === 'sub:pro') return discountActive ? process.env.PAYPAL_PLAN_ID_PRO_DISCOUNT : process.env.PAYPAL_PLAN_ID_PRO_MONTHLY
        if (targetProductId === 'sub:pro-plus') return discountActive ? process.env.PAYPAL_PLAN_ID_PRO_PLUS_DISCOUNT : process.env.PAYPAL_PLAN_ID_PRO_PLUS_MONTHLY
      })()

      if (!newPlanId) {
        return reply.status(503).send({ message: `PayPal plan ID not configured for ${targetProductId}` })
      }

      try {
        const token = await getPaypalToken()

        // Check current subscription status — PayPal rejects revisions on cancelled subscriptions.
        const statusRes = await fetch(`${PP_BASE}/v1/billing/subscriptions/${subEnt.stripeSubscriptionId}`, {
          headers: ppHeaders(token),
        })
        if (statusRes.ok) {
          const statusData = await statusRes.json() as any
          if (statusData?.status === 'CANCELLED') {
            return reply.status(409).send({ message: 'subscription_cancelled', hint: 'Your current subscription is cancelled — please purchase a new subscription.' })
          }
        }

        const frontend = process.env.FRONTEND_ORIGIN || 'https://certshack.com'
        const reviseRes = await fetch(`${PP_BASE}/v1/billing/subscriptions/${subEnt.stripeSubscriptionId}/revise`, {
          method: 'POST',
          headers: ppHeaders(token),
          body: JSON.stringify({
            plan_id: newPlanId,
            application_context: {
              brand_name: 'certshack',
              return_url: `${frontend}/?payment=success`,
              cancel_url: `${frontend}/account?tab=purchases`,
            },
          }),
        })
        if (!reviseRes.ok) {
          const text = await reviseRes.text()
          server.log.error({ status: reviseRes.status, body: text }, '[paypal] revise-subscription API error')
          return reply.status(502).send({ message: 'PayPal API error' })
        }
        const reviseData = await reviseRes.json() as any
        const approvalLink = (reviseData?.links as any[])?.find((l: any) => l.rel === 'approve')?.href
        if (!approvalLink) {
          server.log.error({ reviseData }, '[paypal] revise-subscription — no approval link in response')
          return reply.status(502).send({ message: 'No approval URL returned from PayPal' })
        }
        server.log.info({ userId, from: subEnt.productId, to: targetProductId, subscriptionId: subEnt.stripeSubscriptionId }, '[paypal] subscription revision initiated — awaiting user approval')
        return { approvalUrl: approvalLink }
      } catch (err: any) {
        server.log.error({ err }, '[paypal] revise-subscription error')
        captureWithContext(err, {
          tags: { 'payment.provider': 'paypal', 'payment.stage': 'revise-subscription' },
          user: { id: userId },
          extra: { subscriptionId: subEnt.stripeSubscriptionId, fromProduct: subEnt.productId, toProduct: targetProductId },
        })
        return reply.status(500).send({ message: 'Failed to initiate subscription revision' })
      }
    }
  )

  /**
   * Returns the PayPal subscription management URL so the frontend can open it
   * in a consistent pattern with the Stripe portal-session endpoint.
   * PayPal has no hosted portal — the user manages autopay directly at paypal.com.
   */
  server.post(
    '/portal-session',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request: any, reply) => {
      const userId = request.user?.sub as string
      const ents = await getUserEntitlements(userId)
      const subEnt = ents.find((e) => e.stripeSubscriptionId && e.meta?.source === 'paypal')
      if (!subEnt?.stripeSubscriptionId) {
        return reply.status(404).send({ message: 'No active PayPal subscription found' })
      }
      return { url: 'https://www.paypal.com/myaccount/autopay' }
    }
  )
}

/**
 * Find and revoke the entitlement associated with a PayPal subscription ID.
 * Scans the entitlements table by stripeSubscriptionId (re-used for PayPal sub IDs).
 */
async function _revokeSubscription(subscriptionId: string, server: FastifyInstance, eventType: string = 'BILLING.SUBSCRIPTION.CANCELLED'): Promise<void> {
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
      server.log.warn({ subscriptionId, eventType }, '[paypal] no entitlement found for subscription end')
      return
    }
    // For cancel-at-period-end flows we stamp a future expiresAt before cancelling, so keep
    // access until then — status stays 'active' with the future expiresAt. Immediate cancels
    // (no future expiresAt stamped) and EXPIRED (dunning exhausted) revoke now.
    const now = Date.now()
    const revoked: Array<{ userId: string; productId: string }> = []
    for (const item of items) {
      const expAt = item.expiresAt ? new Date(item.expiresAt).getTime() : 0
      if (expAt > now && eventType !== 'BILLING.SUBSCRIPTION.EXPIRED') {
        server.log.info({ subscriptionId, userId: item.userId, productId: item.productId, expiresAt: item.expiresAt }, '[paypal] cancel acknowledged — access retained until expiresAt')
        // Portal cancel (no in-app route ran) — send cancellation email if not already notified
        if (!item.meta?.cancelNotifiedAt) {
          try {
            const user = await getUserBySub(item.userId)
            if (user?.email) {
              const prod = getProduct(item.productId)
              sendSubscriptionCancelledEmail({
                to: user.email,
                name: user.name ?? user.email,
                userId: item.userId,
                productLabel: prod?.label ?? item.productId,
                productId: item.productId,
                accessUntil: item.expiresAt ?? null,
                source: 'paypal',
              }).catch((e: any) => server.log.warn({ err: e?.message }, '[paypal] portal cancellation email failed'))
              mergeEntitlementMeta(item.userId, item.productId, { cancelNotifiedAt: new Date().toISOString() })
                .catch((e: any) => server.log.warn({ err: e?.message }, '[paypal] mergeEntitlementMeta cancelNotifiedAt failed'))
            }
          } catch (e: any) {
            server.log.warn({ err: e?.message }, '[paypal] portal cancellation email lookup failed')
          }
        }
        continue
      }
      await revokeEntitlement(item.userId, item.productId)
      revoked.push({ userId: item.userId, productId: item.productId })
      server.log.info({ subscriptionId, userId: item.userId, productId: item.productId, eventType }, '[paypal] subscription entitlement revoked')
    }
    // Email each affected user once that access has now ended — skip anyone already notified
    // by the in-app cancel route (stamped cancelNotifiedAt).
    const notified = new Set<string>()
    for (const { userId, productId } of revoked) {
      if (notified.has(userId)) continue
      notified.add(userId)
      try {
        const ent = items.find((i) => i.userId === userId && i.productId === productId)
        if (ent?.meta?.cancelNotifiedAt && eventType === 'BILLING.SUBSCRIPTION.CANCELLED') {
          server.log.info({ subscriptionId, userId }, '[paypal] cancellation email already sent by in-app route — skipping ended email')
          continue
        }
        const user = await getUserBySub(userId)
        if (user?.email) {
          const prod = getProduct(productId)
          sendSubscriptionEndedEmail({
            to: user.email,
            name: user.name ?? user.email,
            userId,
            productLabel: prod?.label ?? productId,
            productId,
          }).catch((e: any) => server.log.warn({ err: e?.message }, '[paypal] subscription ended email failed'))
        }
      } catch (e: any) {
        server.log.warn({ err: e?.message }, '[paypal] subscription ended email lookup failed')
      }
    }
  } catch (err) {
    server.log.error({ err, subscriptionId }, '[paypal] revokeSubscription failed')
    captureWithContext(err, {
      tags: { 'payment.provider': 'paypal', 'payment.stage': 'revoke-subscription' },
      extra: { subscriptionId, eventType },
    })
  }
}

/**
 * GoCardless routes — billing request flow for one-off payments.
 *
 * Real GoCardless sandbox API is used when GOCARDLESS_ACCESS_TOKEN and
 * GOCARDLESS_ENABLE_REAL=1 are set. Falls back to a local simulator otherwise.
 *
 * POST /payments/create-checkout  - create a GoCardless billing request flow
 * POST /payments/webhook          - handle GoCardless webhook events
 * GET  /payments/success          - post-payment success landing
 * GET  /payments/cancel           - post-payment cancel landing
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import crypto from 'crypto'
import { getProduct } from '../catalog.js'
import { grantEntitlement } from '../services/entitlements.js'

const GC_CONFIGURED = !!process.env.GOCARDLESS_ACCESS_TOKEN
const ENABLE_REAL_GOCARDLESS = process.env.GOCARDLESS_ENABLE_REAL === '1'
const GC_VERSION = '2015-07-06'

type CheckoutSession = {
  userId?: string
  productIds: string[]
  amountPence: number
  successUrl?: string
  cancelUrl?: string
}

// In-memory sessions: billingRequestId (or simulator sessionId) → session data.
// Production should use a persistent store (DynamoDB).
const SESSIONS = new Map<string, CheckoutSession>()

function getBaseUrl(request: any) {
  const proto = (request.headers['x-forwarded-proto'] as string) || (request.headers['x-forwarded-protocol'] as string) || 'http'
  const host = request.headers.host || `localhost:${process.env.PORT || 3000}`
  return `${proto}://${host}`
}

/** Standard headers required by every GoCardless API call */
function gcHeaders() {
  return {
    Authorization: `Bearer ${process.env.GOCARDLESS_ACCESS_TOKEN}`,
    'GoCardless-Version': GC_VERSION,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  /**
   * Create a billing request + billing request flow.
   * Returns a `url` the frontend should redirect the customer to.
   * Falls back to a local simulator when GOCARDLESS_ENABLE_REAL is not set.
   */
  server.post(
    '/create-checkout',
    { preHandler: [server.authenticate] },
    async (request: any, reply) => {
      const { productIds, successUrl, cancelUrl } = request.body as any
      if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return reply.status(400).send({ message: 'productIds array required' })
      }

      const userId = request.user?.sub

      // Compute total amount (priceGBP is stored in pence in the catalog)
      let amountPence = 0
      for (const pid of productIds) {
        const prod = getProduct(pid)
        if (!prod) return reply.status(400).send({ message: `Unknown productId ${pid}` })
        amountPence += prod.priceGBP
      }

      // Real GoCardless sandbox flow
      if (GC_CONFIGURED && ENABLE_REAL_GOCARDLESS) {
        try {
          const apiBase = process.env.GOCARDLESS_API_BASE || 'https://api-sandbox.gocardless.com'
          const base = getBaseUrl(request)

          // Step 1: Create a billing request with the payment details encoded in metadata
          const brPayload = {
            billing_requests: {
              payment_request: {
                amount: amountPence,
                currency: 'GBP',
                description: `ExamApp purchase`,
                metadata: {
                  userId: userId ?? '',
                  productIds: JSON.stringify(productIds),
                },
              },
            },
          }

          const brRes = await fetch(`${apiBase}/billing_requests`, {
            method: 'POST',
            headers: gcHeaders(),
            body: JSON.stringify(brPayload),
          })

          if (!brRes.ok) {
            const text = await brRes.text()
            server.log.warn({ status: brRes.status, body: text }, '[gocardless] billing_requests create failed')
            return reply.status(502).send({ message: 'GoCardless billing_requests error', details: text })
          }

          const brBody = await brRes.json() as any
          const billingRequestId = brBody?.billing_requests?.id
          if (!billingRequestId) {
            return reply.status(502).send({ message: 'Unexpected billing_requests response', body: brBody })
          }

          // Store session keyed by billingRequestId so webhook can look it up
          SESSIONS.set(billingRequestId, { userId, productIds, amountPence, successUrl, cancelUrl })

          // Step 2: Create a billing request flow to get the hosted checkout URL
          const bfPayload = {
            billing_request_flows: {
              redirect_uri: successUrl || `${base}/payments/success`,
              exit_uri: cancelUrl || `${base}/payments/cancel`,
              links: { billing_request: billingRequestId },
            },
          }

          const bfRes = await fetch(`${apiBase}/billing_request_flows`, {
            method: 'POST',
            headers: gcHeaders(),
            body: JSON.stringify(bfPayload),
          })

          if (!bfRes.ok) {
            const text = await bfRes.text()
            server.log.warn({ status: bfRes.status, body: text }, '[gocardless] billing_request_flows create failed')
            return reply.status(502).send({ message: 'GoCardless billing_request_flows error', details: text })
          }

          const bfBody = await bfRes.json() as any
          const authorisationUrl = bfBody?.billing_request_flows?.authorisation_url
          if (!authorisationUrl) {
            return reply.status(502).send({ message: 'Unexpected billing_request_flows response', body: bfBody })
          }

          server.log.info({ billingRequestId, userId }, '[gocardless] billing request flow created')
          return { url: authorisationUrl, billingRequestId }
        } catch (err: any) {
          server.log.error({ err }, '[gocardless] create-checkout error')
          return reply.status(500).send({ message: 'GoCardless create failed', error: String(err) })
        }
      }

      // Simulator mode — create a short-lived session and return a local URL
      const sessionId = crypto.randomUUID()
      SESSIONS.set(sessionId, { userId, productIds, amountPence, successUrl, cancelUrl })

      const base = getBaseUrl(request)
      const url = `${base}/payments/checkout-simulator?session=${sessionId}`
      return { url, sessionId, simulator: true }
    }
  )

  /**
   * Local checkout simulator: a tiny HTML page with buttons to simulate
   * success/failure. This lets developers test the full webhook/entitlement
   * flow without touching GoCardless or any payment rails.
   */
  server.get('/checkout-simulator', async (request: any, reply) => {
    const sessionId = String(request.query.session || '')
    const sess = SESSIONS.get(sessionId)
    if (!sess) return reply.status(404).send('Session not found')

    const amountGBP = (sess.amountPence / 100).toFixed(2)
    const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Checkout Simulator</title></head>
<body>
  <h1>ExamApp Checkout Simulator</h1>
  <p>Products: ${sess.productIds.join(', ')}</p>
  <p>Amount: £${amountGBP}</p>
  <button id="success">Simulate success</button>
  <button id="fail">Simulate failure</button>
  <script>
    async function postEvent(action) {
      const body = { events: [ { id: 'evt-' + Math.random().toString(36).slice(2), resource_type: 'payments', action, metadata: { sessionId: '${sessionId}' } } ] }
      await fetch('/payments/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      alert('Posted event: ' + action + '\nYou can now close this window or follow redirects if configured.')
      if (action === 'confirmed' && ${!!sess.successUrl}) {
        window.location.href = '${sess.successUrl ?? ''}'
      }
    }
    document.getElementById('success').addEventListener('click', () => postEvent('confirmed'))
    document.getElementById('fail').addEventListener('click', () => postEvent('failed'))
  </script>
</body>
</html>`

    reply.header('Content-Type', 'text/html; charset=utf-8')
    return reply.send(html)
  })

  /**
   * GoCardless webhook handler.
   *
   * Signature verification: GoCardless signs the raw body with HMAC-SHA256
   * and sends the hex digest in the `Webhook-Signature` header.
   *
   * Event routing:
   *   billing_requests.fulfilled   → customer completed hosted checkout flow
   *   payments.confirmed           → payment collected (belt-and-suspenders; grants if BR session found)
   *   payments.failed              → log
   *   subscriptions.cancelled      → log (revocation TODO)
   */
  server.post('/webhook', async (request: any, reply) => {
    const secret = process.env.GOCARDLESS_WEBHOOK_SECRET
    // Fastify buffers the raw body in request.rawBody when addContentTypeParser is used.
    // Fall back to re-serialising the parsed body — fine for sandbox testing.
    const raw: string = (request as any).rawBody ?? JSON.stringify(request.body ?? {})
    const sigHeader = (request.headers['webhook-signature'] ?? '') as string

    if (secret && sigHeader) {
      const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex')
      if (sigHeader !== expected) {
        server.log.warn({ sigHeader, expected }, '[gocardless] webhook signature mismatch')
        return reply.status(498).send({ message: 'invalid signature' })
      }
    }

    const body = request.body || {}
    const events: any[] = Array.isArray(body.events) ? body.events : []
    server.log.info({ count: events.length }, '[gocardless] webhook received')

    for (const event of events) {
      server.log.info({ resource_type: event.resource_type, action: event.action, id: event.id }, '[gocardless] event')
      try {
        // ── billing_requests.fulfilled ────────────────────────────────────────
        // Fired when the customer completes the GoCardless hosted checkout.
        // The billing request ID is in event.links.billing_request.
        if (event.resource_type === 'billing_requests' && event.action === 'fulfilled') {
          const brId = event.links?.billing_request
          await _grantFromSession(brId, 'billing_requests.fulfilled', server)
        }

        // ── payments.confirmed ────────────────────────────────────────────────
        // Belt-and-suspenders: also grant when the payment is actually collected.
        // The billing request ID is in event.links.billing_request (if present).
        if (event.resource_type === 'payments' && event.action === 'confirmed') {
          // simulator path: sessionId in event.metadata
          const simSessionId = event.metadata?.sessionId || event.metadata?.session
          if (simSessionId) {
            await _grantFromSession(simSessionId, 'simulator.confirmed', server)
          } else {
            const brId = event.links?.billing_request
            await _grantFromSession(brId, 'payments.confirmed', server)
          }
        }

        if (event.resource_type === 'payments' && event.action === 'failed') {
          server.log.info({ event }, '[gocardless] payment failed')
        }

        if (event.resource_type === 'subscriptions' && event.action === 'cancelled') {
          server.log.info({ event }, '[gocardless] subscription cancelled — revocation TODO')
        }
      } catch (err) {
        server.log.error({ err }, '[gocardless] processing event failed')
      }
    }

    // GoCardless requires a 200 response; any other status triggers a retry.
    return reply.status(200).send({ received: true })
  })

  /** Simple post-payment landing pages */
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

/** Grant entitlements for a session looked up by billingRequestId / sessionId */
async function _grantFromSession(sessionKey: string | undefined | null, source: string, server: FastifyInstance) {
  if (!sessionKey) return
  const sess = SESSIONS.get(sessionKey)
  if (!sess) {
    server.log.warn({ sessionKey }, '[gocardless] no session found for key')
    return
  }
  for (const pid of sess.productIds) {
    const prod = getProduct(pid)
    await grantEntitlement({
      userId: sess.userId ?? 'unknown',
      productId: pid,
      kind: prod?.kind ?? 'extra',
      meta: { source, sessionKey },
    })
  }
  server.log.info({ sessionKey, userId: sess.userId, productIds: sess.productIds }, '[gocardless] entitlements granted')
  SESSIONS.delete(sessionKey)
}

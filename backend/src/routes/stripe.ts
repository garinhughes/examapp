/**
 * Stripe routes — scaffold for Stripe Checkout + Webhooks.
 *
 * Stripe will be tested later. These routes are non-functional stubs
 * that return placeholder responses until stripe is configured.
 *
 * POST /stripe/create-checkout  — create a Stripe Checkout session
 * POST /stripe/webhook          — handle Stripe webhook events
 * POST /stripe/portal           — create Stripe Customer Portal session
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify'
// import Stripe from 'stripe'  // uncomment when adding stripe dependency

const STRIPE_CONFIGURED = !!process.env.STRIPE_SECRET_KEY

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  /**
   * Create a Stripe Checkout session.
   * Frontend redirects the user to session.url to complete payment.
   */
  server.post(
    '/create-checkout',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      if (!STRIPE_CONFIGURED) {
        return reply.status(503).send({
          message: 'Stripe is not configured yet. Set STRIPE_SECRET_KEY to enable payments.',
          stub: true,
        })
      }

      const { productId, successUrl, cancelUrl } = request.body as any
      if (!productId) return reply.status(400).send({ message: 'productId required' })

      // TODO: look up product in catalog, find Stripe Price ID, create session
      // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
      // const session = await stripe.checkout.sessions.create({ ... })
      // return { sessionId: session.id, url: session.url }

      return reply.status(503).send({ message: 'Stripe checkout not wired yet', stub: true })
    }
  )

  /**
   * Stripe webhook handler.
   * Processes checkout.session.completed, invoice.payment_failed,
   * customer.subscription.deleted, etc.
   */
  server.post('/webhook', async (request, reply) => {
    if (!STRIPE_CONFIGURED) {
      return reply.status(200).send({ received: true, stub: true })
    }

    // TODO: verify Stripe signature using STRIPE_WEBHOOK_SECRET
    // const sig = request.headers['stripe-signature']
    // const event = stripe.webhooks.constructEvent(request.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!)

    // switch (event.type) {
    //   case 'checkout.session.completed':
    //     // grant entitlement
    //     break
    //   case 'invoice.payment_failed':
    //     // notify user, maybe revoke after grace period
    //     break
    //   case 'customer.subscription.deleted':
    //     // revoke entitlement
    //     break
    // }

    return reply.status(200).send({ received: true, stub: true })
  })

  /**
   * Create a Stripe Customer Portal session (manage subscription / billing).
   */
  server.post(
    '/portal',
    { preHandler: [server.authenticate] },
    async (request, reply) => {
      if (!STRIPE_CONFIGURED) {
        return reply.status(503).send({
          message: 'Stripe is not configured yet.',
          stub: true,
        })
      }

      // TODO: look up Stripe customer by user sub, create portal session
      // const session = await stripe.billingPortal.sessions.create({ customer: stripeCustomerId, return_url: ... })
      // return { url: session.url }

      return reply.status(503).send({ message: 'Stripe portal not wired yet', stub: true })
    }
  )
}

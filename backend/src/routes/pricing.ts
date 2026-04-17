/**
 * Pricing routes — public endpoint that returns the product catalog
 * and the user's current tier/entitlements (if authenticated).
 *
 * GET /pricing          — returns catalog + tier info + discount status
 * GET /pricing/my-tier  — returns current user's tier + entitlements (authed)
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { PRODUCTS, TIERS, resolveUserTier, type Tier } from '../catalog.js'
import { getUserEntitlements } from '../services/entitlements.js'

/** Returns discounted price in pence when DISCOUNT_ACTIVE=true, otherwise undefined. */
function getDiscountedPrice(productId: string): number | undefined {
  if (process.env.DISCOUNT_ACTIVE !== 'true') return undefined
  if (productId === 'sub:pro') return 500           // £5/mo (£2 off £7)
  if (productId === 'sub:pro-plus') return 700      // £7/mo (£2 off £9)
  return undefined
}

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  /** Public: return the full product catalog */
  server.get('/', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request) => { // codeql[js/missing-rate-limiting]
    await server.optionalAuth(request, {} as any)

    const isAuthenticated = !!request.user
    let ownedEntitlements: Awaited<ReturnType<typeof getUserEntitlements>> = []
    if (isAuthenticated && request.user) {
      try {
        ownedEntitlements = await getUserEntitlements(request.user.sub)
      } catch { /* ignore */ }
    }

    const ownedProductIds = ownedEntitlements.map((e) => e.productId)
    const tier: Tier = resolveUserTier({ isAuthenticated, ownedProductIds })
    const discountActive = process.env.DISCOUNT_ACTIVE === 'true'

    return {
      tier,
      tierConfig: TIERS[tier],
      entitlements: ownedProductIds,
      entitlementDetails: ownedEntitlements.map((e) => ({
        productId: e.productId,
        kind: e.kind,
        purchasedAt: e.purchasedAt,
        expiresAt: e.expiresAt,
        status: e.status,
        source: e.meta?.source?.startsWith('paypal') ? 'paypal' : e.meta?.grantedByAdmin ? 'admin' : 'stripe',
      })),
      products: PRODUCTS.map((p) => ({
        productId: p.productId,
        kind: p.kind,
        label: p.label,
        description: p.description,
        priceGBP: p.priceGBP,
        discountedPriceGBP: getDiscountedPrice(p.productId),
        billingPeriod: p.billingPeriod,
        owned: ownedProductIds.includes(p.productId),
      })),
      tiers: Object.values(TIERS),
      discountActive,
    }
  })

  /** Authed: return user's tier + entitlements */
  server.get(
    '/my-tier',
    { preHandler: [server.authenticate], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, // codeql[js/missing-rate-limiting]
    async (request) => {
      const userId = request.user!.sub
      const ownedEntitlements = await getUserEntitlements(userId)
      const ownedProductIds = ownedEntitlements.map((e) => e.productId)
      const tier = resolveUserTier({ isAuthenticated: true, ownedProductIds })

      return {
        tier,
        tierConfig: TIERS[tier],
        entitlements: ownedProductIds,
      }
    }
  )
}

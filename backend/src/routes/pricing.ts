/**
 * Pricing routes — public endpoint that returns the product catalog
 * and the user's current tier/entitlements (if authenticated).
 *
 * GET /pricing          — returns catalog + tier info
 * GET /pricing/my-tier  — returns current user's tier + entitlements (authed)
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { PRODUCTS, TIERS, resolveUserTier, type Tier } from '../catalog.js'
import { getActiveProductIds } from '../services/entitlements.js'

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  /** Public: return the full product catalog */
  server.get('/', async (request) => {
    // optionalAuth + resolveEntitlements are registered globally or per-route
    await server.optionalAuth(request, {} as any)

    const isAuthenticated = !!request.user
    let ownedProductIds: string[] = []
    if (isAuthenticated && request.user) {
      try {
        ownedProductIds = await getActiveProductIds(request.user.sub)
      } catch { /* ignore */ }
    }

    const tier: Tier = resolveUserTier({ isAuthenticated, ownedProductIds })

    return {
      tier,
      tierConfig: TIERS[tier],
      entitlements: ownedProductIds,
      products: PRODUCTS.map((p) => ({
        productId: p.productId,
        kind: p.kind,
        label: p.label,
        description: p.description,
        priceGBP: p.priceGBP,
        billingPeriod: p.billingPeriod,
        examCodes: p.examCodes,
        owned: ownedProductIds.includes(p.productId),
      })),
      tiers: Object.values(TIERS),
    }
  })

  /** Authed: return user's tier + entitlements */
  server.get(
    '/my-tier',
    { preHandler: [server.authenticate] },
    async (request) => {
      const userId = request.user!.sub
      const ownedProductIds = await getActiveProductIds(userId)
      const tier = resolveUserTier({ isAuthenticated: true, ownedProductIds })

      return {
        tier,
        tierConfig: TIERS[tier],
        entitlements: ownedProductIds,
      }
    }
  )
}

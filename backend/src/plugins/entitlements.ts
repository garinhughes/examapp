/**
 * Entitlement middleware — attaches tier info and entitlements to the request.
 *
 * After this plugin:
 *   request.tier       — 'visitor' | 'registered' | 'paying'
 *   request.tierConfig — full TierConfig object
 *   request.entitlements — list of active product IDs
 *
 * Usage in routes: add server.resolveEntitlements as a preHandler
 * then read request.tier / request.tierConfig to gate features.
 */

import fp from 'fastify-plugin'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getActiveProductIds } from '../services/entitlements.js'
import { resolveUserTier, TIERS, type Tier, type TierConfig } from '../catalog.js'

declare module 'fastify' {
  interface FastifyRequest {
    tier: Tier
    tierConfig: TierConfig
    entitlements: string[]
  }
}

async function entitlementPlugin(server: FastifyInstance) {
  server.decorateRequest('tier', 'visitor')
  server.decorateRequest('tierConfig', TIERS.visitor)
  server.decorateRequest('entitlements', [])

  /**
   * preHandler hook — resolves entitlements from DynamoDB (when authenticated)
   * and sets request.tier / request.tierConfig.
   *
   * Register per-route:  { preHandler: [server.optionalAuth, server.resolveEntitlements] }
   * Or register as a global onRequest hook if you prefer.
   */
  server.decorate(
    'resolveEntitlements',
    async function resolveEntitlements(request: FastifyRequest, _reply: FastifyReply) {
      const isAuthenticated = !!request.user
      let ownedProductIds: string[] = []

      if (isAuthenticated && request.user) {
        try {
          ownedProductIds = await getActiveProductIds(request.user.sub)
        } catch {
          // fail open — treat as registered with no purchases
        }
      }

      request.entitlements = ownedProductIds

      // examCode may be in params or query (set by route if needed)
      const examCode = (request.params as any)?.examCode || (request.query as any)?.examCode

      const tier = resolveUserTier({ isAuthenticated, ownedProductIds, examCode })
      request.tier = tier
      request.tierConfig = TIERS[tier]
    }
  )
}

declare module 'fastify' {
  interface FastifyInstance {
    resolveEntitlements: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export default fp(entitlementPlugin, { name: 'entitlements', dependencies: ['auth'] })

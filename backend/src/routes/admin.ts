import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { getUserBySub, listUsers, recordAdminAudit, updateUserFields } from '../services/dynamo.js'
import { getUserEntitlements, adminGrantEntitlement, revokeEntitlement } from '../services/entitlements.js'
import { PRODUCTS } from '../catalog.js'

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  // Require auth and admin flag
  server.addHook('preHandler', async (request, reply) => {
    // only apply to admin routes
    if (!request.routerPath?.startsWith('/admin')) return
    await server.authenticate(request, reply)
    if (!request.user) return reply.code(401).send({ message: 'Unauthorized' })
    const local = await getUserBySub(request.user.sub)
    if (!local || !local.isAdmin) return reply.code(403).send({ message: 'Forbidden' })
  })

  // List users (simple scan with pagination)
  server.get('/users', async (request, reply) => {
    const q = request.query as any
    const limit = Math.min(Number(q.limit || 50), 200)
    const res = await listUsers(limit, q.lastKey)
    return { users: res.Items ?? [], lastKey: (res as any).LastEvaluatedKey ?? null }
  })

  // Get single user by sub
  server.get('/users/:sub', async (request, reply) => {
    const { sub } = request.params as any
    const user = await getUserBySub(sub)
    if (!user) return reply.code(404).send({ message: 'user not found' })
    return user
  })

  // Toggle isAdmin or isActive
  server.patch('/users/:sub', async (request, reply) => {
    const { sub } = request.params as any
    const body = request.body as any
    // minimal validation: only allow isAdmin, isActive
    const updates: any = {}
    if (typeof body.isAdmin === 'boolean') updates.isAdmin = body.isAdmin
    if (typeof body.isActive === 'boolean') updates.isActive = body.isActive
    if (Object.keys(updates).length === 0) return reply.code(400).send({ message: 'no updatable fields' })

    // perform update via DynamoDB UpdateCommand directly (reuse service would be nicer)
    try {
      if (!request.user) return reply.code(401).send({ message: 'Unauthorized' })
      await server.log?.debug?.(`admin update ${sub} ${JSON.stringify(updates)}`)
      await updateUserFields(sub, updates)
      await recordAdminAudit((request.user as any).sub, sub, 'update_user', { updates })
      return { ok: true }
    } catch (err: any) {
      request.log?.error?.('admin update failed', err)
      return reply.code(500).send({ message: 'update failed' })
    }
  })

  // ── Entitlements ──

  /** List all products from catalog */
  server.get('/products', async (_request, reply) => {
    return { products: PRODUCTS }
  })

  /** Get all entitlements for a specific user (including expired/cancelled) */
  server.get('/users/:sub/entitlements', async (request, reply) => {
    const { sub } = request.params as any
    const entitlements = await getUserEntitlements(sub, true)
    return { entitlements }
  })

  /** Grant an entitlement to a user */
  server.post('/users/:sub/entitlements', async (request, reply) => {
    const { sub } = request.params as any
    const body = request.body as any

    if (!body?.productId || typeof body.productId !== 'string') {
      return reply.code(400).send({ message: 'productId is required' })
    }

    // Validate the product exists in catalog
    const product = PRODUCTS.find((p) => p.productId === body.productId)
    if (!product) {
      return reply.code(400).send({ message: `Unknown product: ${body.productId}` })
    }

    // Validate the target user exists
    const targetUser = await getUserBySub(sub)
    if (!targetUser) {
      return reply.code(404).send({ message: 'User not found' })
    }

    try {
      const ent = await adminGrantEntitlement(sub, body.productId, product.kind)
      await recordAdminAudit((request.user as any).sub, sub, 'grant_entitlement', {
        productId: body.productId,
        kind: product.kind,
      })
      return { ok: true, entitlement: ent }
    } catch (err: any) {
      request.log?.error?.('admin grant entitlement failed', err)
      return reply.code(500).send({ message: 'grant failed' })
    }
  })

  /** Revoke an entitlement from a user */
  server.delete('/users/:sub/entitlements/:productId', async (request, reply) => {
    const { sub, productId } = request.params as any

    try {
      await revokeEntitlement(sub, decodeURIComponent(productId))
      await recordAdminAudit((request.user as any).sub, sub, 'revoke_entitlement', {
        productId: decodeURIComponent(productId),
      })
      return { ok: true }
    } catch (err: any) {
      request.log?.error?.('admin revoke entitlement failed', err)
      return reply.code(500).send({ message: 'revoke failed' })
    }
  })
}

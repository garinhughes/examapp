import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { getUserBySub, listUsers, recordAdminAudit, updateUserFields, listIssueReports, resolveIssueReport, countNewIssueReports } from '../services/dynamo.js'
import {
  listAllRatings, countNewRatings,
  createPoll, getPollDef, listPollDefs, listPollVotes, updatePollDef, deletePollDef, deactivateAllPolls, countNewPollVotes,
} from '../services/interactions.js'
import { getUserEntitlements, adminGrantEntitlement, revokeEntitlement, findUsersWithActiveEntitlement } from '../services/entitlements.js'
import { PRODUCTS } from '../catalog.js'
import { loadAllExams } from '../examLoader.js'

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  // Require auth and admin flag
  // lgtm[js/missing-rate-limiting] — rate limiting applied per-route via @fastify/rate-limit config
  server.addHook('preHandler', async (request, reply) => {
    // only apply to admin routes
    if (!request.routerPath?.startsWith('/admin')) return
    await server.authenticate(request, reply)
    if (!request.user) return reply.code(401).send({ message: 'Unauthorized' })
    const local = await getUserBySub(request.user.sub)
    if (!local || !local.isAdmin) return reply.code(403).send({ message: 'Forbidden' })
  })

  // List users (simple scan with pagination)
  server.get('/users', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const q = request.query as any
    const limit = Math.min(Number(q.limit || 50), 200)
    const res = await listUsers(limit, q.lastKey)
    return { users: res.Items ?? [], lastKey: (res as any).LastEvaluatedKey ?? null }
  })

  // Get single user by sub
  server.get('/users/:sub', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { sub } = request.params as any
    const user = await getUserBySub(sub)
    if (!user) return reply.code(404).send({ message: 'user not found' })
    return user
  })

  // Toggle isAdmin or isActive
  server.patch('/users/:sub', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
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

  /** List all products from catalog — annotate exam products with availability */
  server.get('/products', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (_request, reply) => {
    // Load available exam codes so we can flag which exam products exist
    const availableExams = await loadAllExams()
    const availableCodes = new Set(availableExams.map((e) => e.code))

    const products = PRODUCTS.map((p) => {
      if (p.kind === 'exam') {
        const code = p.productId.replace('exam:', '')
        return { ...p, available: availableCodes.has(code) }
      }
      return { ...p, available: true }
    })

    return { products }
  })

  /** List all exams available in the exam source (S3 or local) */
  server.get('/exams', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (_request, _reply) => {
    const exams = await loadAllExams()
    return {
      exams: exams.map((e) => ({ code: e.code, title: e.title, provider: e.provider ?? null })),
    }
  })

  /** Get all entitlements for a specific user (including expired/cancelled) */
  server.get('/users/:sub/entitlements', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { sub } = request.params as any
    const entitlements = await getUserEntitlements(sub, true)
    return { entitlements }
  })

  /** Grant an entitlement to a user */
  server.post('/users/:sub/entitlements', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
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

  /** Bulk migrate entitlements from one exam product to another */
  server.post('/bulk-migrate-entitlements', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = request.body as any
    const { fromProductId, toProductId, dryRun = false } = body ?? {}

    if (!fromProductId || typeof fromProductId !== 'string') {
      return reply.code(400).send({ message: 'fromProductId is required' })
    }
    if (!toProductId || typeof toProductId !== 'string') {
      return reply.code(400).send({ message: 'toProductId is required' })
    }
    if (fromProductId === toProductId) {
      return reply.code(400).send({ message: 'fromProductId and toProductId must be different' })
    }

    // Both productIds must be exam-type (exam:<CODE>)
    if (!fromProductId.startsWith('exam:') || !toProductId.startsWith('exam:')) {
      return reply.code(400).send({ message: 'Only exam products are supported for bulk migration' })
    }

    // Validate that both exam codes exist in the exam source (S3 / local)
    const availableExams = await loadAllExams()
    const availableCodes = new Set(availableExams.map((e) => e.code))
    const fromCode = fromProductId.replace('exam:', '')
    const toCode = toProductId.replace('exam:', '')
    if (!availableCodes.has(fromCode)) {
      return reply.code(400).send({ message: `Exam not found in exam source: ${fromCode}` })
    }
    if (!availableCodes.has(toCode)) {
      return reply.code(400).send({ message: `Exam not found in exam source: ${toCode}` })
    }
    const toProduct = { kind: 'exam' as const }

    try {
      const affected = await findUsersWithActiveEntitlement(fromProductId)

      const userResults: { userId: string; status: 'granted' | 'skipped' }[] = []

      for (const ent of affected) {
        const existing = await getUserEntitlements(ent.userId)
        const alreadyHas = existing.some((e) => e.productId === toProductId && e.status === 'active')
        if (alreadyHas) {
          userResults.push({ userId: ent.userId, status: 'skipped' })
          continue
        }
        if (!dryRun) {
          await adminGrantEntitlement(ent.userId, toProductId, toProduct.kind)
        }
        userResults.push({ userId: ent.userId, status: 'granted' })
      }

      const grantedCount = userResults.filter((u) => u.status === 'granted').length
      const skippedCount = userResults.filter((u) => u.status === 'skipped').length

      if (!dryRun) {
        await recordAdminAudit((request.user as any).sub, null, 'bulk_migrate_entitlements', {
          fromProductId,
          toProductId,
          grantedCount,
          skippedCount,
        })
      }

      return { grantedCount, skippedCount, dryRun, users: userResults }
    } catch (err: any) {
      request.log?.error?.('bulk migrate entitlements failed', err)
      return reply.code(500).send({ message: 'bulk migrate failed' })
    }
  })

  /** Revoke an entitlement from a user */
  server.delete('/users/:sub/entitlements/:productId', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
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

  // GET /admin/feedback?tab=ratings|issues|polls&limit=50&lastKey=...&pollId=...
  server.get('/feedback', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const q = request.query as any
    const tab = q.tab === 'ratings' ? 'ratings' : q.tab === 'polls' ? 'polls' : 'issues'
    const limit = Math.min(Number(q.limit || 50), 200)
    const lastKey = q.lastKey ? JSON.parse(decodeURIComponent(q.lastKey)) : undefined

    if (tab === 'ratings') {
      const { items, lastKey: nextKey } = await listAllRatings(limit, lastKey)
      return { items, lastKey: nextKey ?? null }
    } else if (tab === 'polls') {
      const pollId = q.pollId
      if (!pollId) return reply.code(400).send({ message: 'pollId is required for polls tab' })
      const { items, lastKey: nextKey } = await listPollVotes(pollId, limit, lastKey)
      return { items, lastKey: nextKey ?? null }
    } else {
      const res = await listIssueReports(limit, lastKey)
      return { items: res.Items ?? [], lastKey: (res as any).LastEvaluatedKey ?? null }
    }
  })

  // GET /admin/feedback/count?since=<ISO>
  server.get('/feedback/count', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const q = request.query as any
    const since = q.since || new Date(0).toISOString()
    const [ratings, issues, polls] = await Promise.all([
      countNewRatings(since),
      countNewIssueReports(since),
      countNewPollVotes(since),
    ])
    return { total: ratings + issues + polls, ratings, issues, polls }
  })

  // ── Poll management ──

  // GET /admin/polls — list all poll definitions
  server.get('/polls', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (_request, _reply) => {
    const { items, lastKey } = await listPollDefs(100)
    return { items, lastKey: lastKey ?? null }
  })

  // POST /admin/polls — create a new poll
  server.post('/polls', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = request.body as any
    const { question, options, active = false } = body ?? {}

    if (!question || typeof question !== 'string') {
      return reply.code(400).send({ message: 'question is required' })
    }
    if (!Array.isArray(options) || options.length < 2) {
      return reply.code(400).send({ message: 'at least 2 options are required' })
    }
    if (options.some((o: any) => !o.id || !o.label)) {
      return reply.code(400).send({ message: 'each option must have id and label' })
    }

    if (active) await deactivateAllPolls()

    const def = await createPoll(question, options, (request.user as any).sub, active ?? false)
    return { ok: true, poll: def }
  })

  // PATCH /admin/polls/:pollId — update question/options or toggle active
  server.patch('/polls/:pollId', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { pollId } = request.params as any
    const body = request.body as any

    const existing = await getPollDef(pollId)
    if (!existing) return reply.code(404).send({ message: 'Poll not found' })

    const updates: any = {}
    if (body.question !== undefined) updates.question = body.question
    if (body.options !== undefined) updates.options = body.options
    if (body.visible !== undefined) {
      updates.visible = body.visible
      if (body.visible === true) await deactivateAllPolls()
    }

    if (Object.keys(updates).length === 0) {
      return reply.code(400).send({ message: 'no updatable fields' })
    }

    await updatePollDef(pollId, updates)
    return { ok: true }
  })

  // DELETE /admin/polls/:pollId
  server.delete('/polls/:pollId', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { pollId } = request.params as any
    const existing = await getPollDef(pollId)
    if (!existing) return reply.code(404).send({ message: 'Poll not found' })
    await deletePollDef(pollId)
    return { ok: true }
  })

  // PATCH /admin/issues/:reportId
  server.patch('/issues/:reportId', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { reportId } = request.params as any
    const body = request.body as any
    if (body?.status !== 'resolved') {
      return reply.code(400).send({ message: 'Only status "resolved" is supported' })
    }
    await resolveIssueReport(reportId)
    return { ok: true }
  })
}

import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { randomUUID, createSecretKey } from 'crypto'
import { SignJWT } from 'jose'
import { getUserBySub, listUsers, recordAdminAudit, updateUserFields, listIssueReports, resolveIssueReport, countNewIssueReports, getUsersWithEmailOptIn } from '../services/dynamo.js'
import { previewErasure, dryRunErasure, executeErasure } from '../services/erasureService.js'
import { sendErasureReceiptEmail, sendMarketingEmail } from '../services/ses.js'
import {
  listAllRatings, countNewRatings,
  createPoll, getPollDef, listPollDefs, listPollVotes, updatePollDef, deletePollDef, deactivateAllPolls, countNewPollVotes,
} from '../services/interactions.js'
import { getUserEntitlements, adminGrantEntitlement, revokeEntitlement, findUsersWithActiveEntitlement, countPromoGrants } from '../services/entitlements.js'
import { PRODUCTS } from '../catalog.js'
import { loadAllExams } from '../examLoader.js'
import { listCognitoUsers, getCognitoUser, deleteCognitoUser, resendUserConfirmation } from '../services/cognitoAdmin.js'
import { getCarouselSlides, saveCarouselSlides, getUploadPresignedUrl } from '../services/carouselStore.js'
import { getTemplate, listTemplates, upsertTemplate, deleteTemplate } from '../services/emailTemplates.js'
import { logEmailSend, listEmailLogs } from '../services/emailLogs.js'

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  // Require auth and admin flag
  // codeql[js/missing-rate-limiting] — rate limiting applied per-route via @fastify/rate-limit config
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

  // ── Delete user ──

  server.delete('/users/:sub', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { sub } = request.params as any
    if (!request.user) return reply.code(401).send({ message: 'Unauthorized' })
    // Prevent self-deletion
    if (sub === (request.user as any).sub) {
      return reply.code(403).send({ message: 'Cannot delete your own account' })
    }
    const targetUser = await getUserBySub(sub)
    if (!targetUser) return reply.code(404).send({ message: 'User not found' })

    try {
      const receipt = await executeErasure(sub, (request.user as any).sub)
      // Do NOT call sendErasureReceiptEmail — this is admin-initiated, not a GDPR self-request
      if (receipt.allOk) return { ok: true }
      // Partial success (e.g. Cognito user already gone) — 207 is in 200–299 so res.ok is still true
      return reply.code(207).send({ ok: false, steps: receipt.steps, message: 'Partial deletion — some steps failed' })
    } catch (err: any) {
      request.log?.error?.({ err: err.message }, 'admin delete user failed')
      return reply.code(500).send({ message: 'Delete failed', detail: err.message })
    }
  })

  // ── Impersonation ──

  /**
   * POST /admin/impersonate/:sub
   * Returns a short-lived (1h) signed token that lets the admin browse as
   * the target user.  Blocked for admins and self.  Audited.
   */
  server.post('/impersonate/:sub', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ message: 'Unauthorized' })

    const { sub } = request.params as any
    const adminSub = (request.user as any).sub

    if (sub === adminSub) {
      return reply.code(400).send({ message: 'Cannot impersonate yourself' })
    }

    const targetUser = await getUserBySub(sub)
    if (!targetUser) return reply.code(404).send({ message: 'User not found' })

    if (targetUser.isAdmin) {
      return reply.code(403).send({ message: 'Cannot impersonate another admin' })
    }

    const secret = process.env.CRON_SECRET
    if (!secret) {
      request.log.error('CRON_SECRET env var is not set')
      return reply.code(503).send({ message: 'Impersonation is not configured on this server' })
    }

    const secretKey = createSecretKey(Buffer.from(secret, 'utf-8'))
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    const token = await new SignJWT({
      sub: targetUser.userId,
      email: targetUser.email || '',
      name: targetUser.name || '',
      type: 'impersonation',
      impersonatedBy: adminSub,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secretKey)

    await recordAdminAudit(adminSub, sub, 'impersonate_user', {
      targetEmail: targetUser.email,
      targetName: targetUser.name,
    })

    return {
      token,
      expiresAt: expiresAt.toISOString(),
      user: {
        sub: targetUser.userId,
        email: targetUser.email || '',
        name: targetUser.name || '',
      },
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

  /** Bulk grant or revoke an entitlement for multiple users (promo tool) */
  server.post('/bulk-entitlements', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = request.body as any
    const { action, userIds, productId, expiresAt } = body ?? {}

    if (action !== 'grant' && action !== 'revoke') {
      return reply.code(400).send({ message: 'action must be "grant" or "revoke"' })
    }
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return reply.code(400).send({ message: 'userIds must be a non-empty array' })
    }
    if (!productId || typeof productId !== 'string') {
      return reply.code(400).send({ message: 'productId is required' })
    }
    if (action === 'grant' && (!expiresAt || typeof expiresAt !== 'string')) {
      return reply.code(400).send({ message: 'expiresAt is required for grant' })
    }

    const product = PRODUCTS.find((p) => p.productId === productId)
    if (!product) {
      return reply.code(400).send({ message: `Unknown product: ${productId}` })
    }

    let granted = 0
    let skipped = 0
    const errors: string[] = []

    for (const userId of userIds) {
      try {
        if (action === 'grant') {
          const existing = await getUserEntitlements(userId)
          const alreadyHas = existing.some((e) => e.productId === productId)
          if (alreadyHas) {
            skipped++
            continue
          }
          await adminGrantEntitlement(userId, productId, product.kind, expiresAt, { promoGrant: true })
          granted++
        } else {
          await revokeEntitlement(userId, productId)
          granted++ // reuse "granted" as "affected" count for revoke
        }
      } catch (err: any) {
        errors.push(`${userId}: ${err.message ?? 'unknown error'}`)
      }
    }

    await recordAdminAudit((request.user as any).sub, null, `bulk_${action}_entitlements`, {
      productId,
      expiresAt: expiresAt ?? null,
      granted,
      skipped,
      userCount: userIds.length,
    })

    return { granted, skipped, errors }
  })

  /** Get count of active promo grant slots used */
  server.get('/promo-stats', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (_request, _reply) => {
    const count = await countPromoGrants()
    return { count, limit: 30 }
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
    const { question, options, active = false, allowComment = false } = body ?? {}

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

    const def = await createPoll(question, options, (request.user as any).sub, active ?? false, allowComment ?? false)
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
    if (body.allowComment !== undefined) updates.allowComment = body.allowComment
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

  // ── GDPR Erasure ──

  // GET /admin/users/:sub/erasure-preview — count data per category, no writes
  server.get('/users/:sub/erasure-preview', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { sub } = request.params as any
    const preview = await previewErasure(sub)
    if (!preview) return reply.code(404).send({ message: 'User not found' })
    return preview
  })

  // POST /admin/users/:sub/gdpr-erase-dryrun — read-only preflight checks, no data deleted
  server.post('/users/:sub/gdpr-erase-dryrun', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { sub } = request.params as any
    if (!request.user) return reply.code(401).send({ message: 'Unauthorized' })
    const result = await dryRunErasure(sub)
    if (!result) return reply.code(404).send({ message: 'User not found' })
    return result
  })

  // POST /admin/users/:sub/gdpr-erase — execute full erasure; requires dry run to have passed
  server.post('/users/:sub/gdpr-erase', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { sub } = request.params as any
    if (!request.user) return reply.code(401).send({ message: 'Unauthorized' })
    // Safety: re-run dry run before executing to ensure all services are reachable
    const preflight = await dryRunErasure(sub)
    if (!preflight) return reply.code(404).send({ message: 'User not found' })
    if (!preflight.allOk) {
      return reply.code(409).send({
        message: 'Dry run failed — erasure aborted. No data has been deleted.',
        steps: preflight.steps,
      })
    }
    try {
      const receipt = await executeErasure(sub, (request.user as any).sub)
      if (receipt.allOk) {
        sendErasureReceiptEmail(receipt).catch((e) =>
          request.log?.warn?.({ err: e.message }, 'gdpr-erase: receipt email failed (non-fatal)')
        )
      } else {
        request.log?.warn?.({ receiptId: receipt.receiptId }, 'gdpr-erase: one or more steps failed — receipt email suppressed')
      }
      return receipt
    } catch (err: any) {
      request.log?.error?.({ err: err.message }, 'gdpr-erase failed')
      return reply.code(500).send({ message: 'Erasure failed', detail: err.message })
    }
  })

  // ── Cognito user management ──

  // GET /admin/cognito/users?status=UNCONFIRMED&limit=60&paginationToken=...
  server.get('/cognito/users', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const q = request.query as any
    try {
      const res = await listCognitoUsers({
        status: q.status || undefined,
        limit: q.limit ? Math.min(Number(q.limit), 60) : 60,
        paginationToken: q.paginationToken || undefined,
      })
      return res
    } catch (err: any) {
      request.log?.error?.({ err: err.message }, 'listCognitoUsers failed')
      return reply.code(502).send({ message: 'Failed to list Cognito users', detail: err.message })
    }
  })

  // GET /admin/cognito/users/:username
  server.get('/cognito/users/:username', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { username } = request.params as any
    try {
      const user = await getCognitoUser(decodeURIComponent(username))
      if (!user) return reply.code(404).send({ message: 'User not found in Cognito' })
      return user
    } catch (err: any) {
      request.log?.error?.({ err: err.message }, 'getCognitoUser failed')
      return reply.code(502).send({ message: 'Failed to get Cognito user', detail: err.message })
    }
  })

  // DELETE /admin/cognito/users/:username
  server.delete('/cognito/users/:username', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { username } = request.params as any
    const decoded = decodeURIComponent(username)
    try {
      await deleteCognitoUser(decoded)
      await recordAdminAudit((request.user as any).sub, decoded, 'delete_cognito_user', { username: decoded })
      return { ok: true }
    } catch (err: any) {
      request.log?.error?.({ err: err.message }, 'deleteCognitoUser failed')
      return reply.code(502).send({ message: 'Failed to delete Cognito user', detail: err.message })
    }
  })

  // POST /admin/cognito/users/:username/resend
  server.post('/cognito/users/:username/resend', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { username } = request.params as any
    const decoded = decodeURIComponent(username)
    try {
      await resendUserConfirmation(decoded)
      return { ok: true, message: 'Confirmation code resent' }
    } catch (err: any) {
      request.log?.error?.({ err: err.message }, 'resendUserConfirmation failed')
      return reply.code(502).send({ message: 'Failed to resend confirmation', detail: err.message })
    }
  })

  /* ------------------------------------------------------------------ */
  /*  Carousel management                                                */
  /* ------------------------------------------------------------------ */

  // GET /admin/carousel — list slides
  server.get('/carousel', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (_request, reply) => {
    try {
      const slides = await getCarouselSlides()
      return { slides }
    } catch (err: any) {
      return reply.code(502).send({ message: 'Failed to load carousel config', detail: err.message })
    }
  })

  // PUT /admin/carousel — save full slides config
  server.put('/carousel', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = request.body as any
    if (!Array.isArray(body?.slides)) return reply.code(400).send({ message: 'slides array required' })
    for (const s of body.slides) {
      if (!s.id || typeof s.key !== 'string' || typeof s.alt !== 'string' || typeof s.order !== 'number') {
        return reply.code(400).send({ message: 'each slide requires id, key (string), alt (string), order (number)' })
      }
      if (!s.key.startsWith('carousel/') || s.key.includes('..') || /[\x00-\x1f]/.test(s.key)) {
        return reply.code(400).send({ message: `invalid key: ${s.key}` })
      }
    }
    try {
      await saveCarouselSlides(body.slides)
      await recordAdminAudit((request.user as any).sub, 'carousel', 'update_carousel', { count: body.slides.length })
      return { ok: true }
    } catch (err: any) {
      return reply.code(502).send({ message: 'Failed to save carousel config', detail: err.message })
    }
  })

  // POST /admin/carousel/upload-url — presigned PUT URL for direct S3 upload
  server.post('/carousel/upload-url', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = request.body as any
    const filename = body?.filename
    if (!filename || typeof filename !== 'string') {
      return reply.code(400).send({ message: 'filename required' })
    }
    const ext = filename.split('.').pop()?.toLowerCase()
    if (!ext || !['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
      return reply.code(400).send({ message: 'image files only (jpg, jpeg, png, webp, gif)' })
    }
    if (!/^[\w\-. ]+$/.test(filename)) {
      return reply.code(400).send({ message: 'invalid filename' })
    }
    const id = randomUUID()
    const key = `carousel/${id}.${ext}`
    try {
      const uploadUrl = await getUploadPresignedUrl(key)
      return { uploadUrl, key, id }
    } catch (err: any) {
      return reply.code(502).send({ message: 'Failed to generate upload URL', detail: err.message })
    }
  })

  // ── Email templates ──────────────────────────────────────────────────────

  server.get('/email-templates', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async () => {
    return { templates: await listTemplates() }
  })

  server.get('/email-templates/:templateId', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { templateId } = request.params as any
    const t = await getTemplate(templateId)
    if (!t) return reply.code(404).send({ message: 'template not found' })
    return t
  })

  server.post('/email-templates', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = request.body as any
    const { name, subject, htmlBody, textBody } = body ?? {}
    if (!name || !subject || !htmlBody) {
      return reply.code(400).send({ message: 'name, subject and htmlBody are required' })
    }
    const templateId = body.templateId || name.toLowerCase().replace(/\s+/g, '-')
    const template = { templateId, name, subject, htmlBody, textBody: textBody ?? '', updatedAt: new Date().toISOString(), updatedBy: (request.user as any).sub }
    await upsertTemplate(template)
    await recordAdminAudit((request.user as any).sub, null, 'create_email_template', { templateId })
    return { ok: true, template }
  })

  server.put('/email-templates/:templateId', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { templateId } = request.params as any
    const body = request.body as any
    const existing = await getTemplate(templateId)
    if (!existing) return reply.code(404).send({ message: 'template not found' })
    const updated = {
      ...existing,
      name: body.name ?? existing.name,
      subject: body.subject ?? existing.subject,
      htmlBody: body.htmlBody ?? existing.htmlBody,
      textBody: body.textBody ?? existing.textBody,
      updatedAt: new Date().toISOString(),
      updatedBy: (request.user as any).sub,
    }
    await upsertTemplate(updated)
    await recordAdminAudit((request.user as any).sub, null, 'update_email_template', { templateId })
    return { ok: true, template: updated }
  })

  server.delete('/email-templates/:templateId', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const { templateId } = request.params as any
    await deleteTemplate(templateId)
    await recordAdminAudit((request.user as any).sub, null, 'delete_email_template', { templateId })
    return { ok: true }
  })

  // ── Email actions ────────────────────────────────────────────────────────

  /** Send a test email to the requesting admin's own address */
  server.post('/email/test-send', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { templateId } = request.body as any
    if (!templateId) return reply.code(400).send({ message: 'templateId required' })
    const template = await getTemplate(templateId)
    if (!template) return reply.code(404).send({ message: 'template not found' })

    const adminProfile = await getUserBySub((request.user as any).sub)
    if (!adminProfile?.email) return reply.code(400).send({ message: 'admin email not found' })

    await sendMarketingEmail({
      to: adminProfile.email,
      userId: (request.user as any).sub,
      name: (adminProfile as any).name || (adminProfile as any).given_name,
      subject: `[TEST] ${template.subject}`,
      htmlBody: template.htmlBody,
    })
    return { ok: true, sentTo: adminProfile.email }
  })

  /**
   * Shared helper — applies AND-combined filters to a list of opted-in users.
   * Filters: provider, examProductId (exact entitlement match), monthlyOnly.
   * Each active filter must match; unset filters are skipped.
   */
  async function filterEmailRecipients(
    users: any[],
    filters: { provider?: string; examProductId?: string; monthlyOnly?: boolean }
  ): Promise<any[]> {
    const { provider, examProductId, monthlyOnly } = filters
    if (!provider && !examProductId && !monthlyOnly) return users

    const results = await Promise.all(
      users.map(async (u) => {
        const ents = await getUserEntitlements(u.userId)
        const productIds = ents.map((e: any) => e.productId)

        if (provider) {
          const providerProductIds = PRODUCTS
            .filter((p) => p.provider?.toLowerCase() === provider.toLowerCase())
            .map((p) => p.productId)
          if (!productIds.some((pid: string) => providerProductIds.includes(pid))) return null
        }

        if (examProductId) {
          if (!productIds.includes(examProductId)) return null
        }

        if (monthlyOnly) {
          if (!productIds.includes('sub:all-access')) return null
        }

        return u
      })
    )

    return results.filter(Boolean) as any[]
  }

  /** Preview the number of recipients for given filters (NO email is sent) */
  server.post('/email/preview-recipients', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request) => {
    const { provider, examProductId, monthlyOnly } = request.body as any
    const users = await getUsersWithEmailOptIn()
    const filtered = await filterEmailRecipients(users, { provider, examProductId, monthlyOnly })
    const sample = filtered
      .filter((u: any) => u.email)
      .slice(0, 10)
      .map((u: any) => ({ email: u.email, name: u.name || u.given_name || '' }))
    return { count: filtered.length, sample }
  })

  /** Bulk marketing send — batched with 200ms delay between batches of 50 */
  server.post('/email/send-marketing', { config: { rateLimit: { max: 5, timeWindow: '5 minutes' } } }, async (request, reply) => {
    const { templateId, provider, examProductId, monthlyOnly } = request.body as any
    if (!templateId) return reply.code(400).send({ message: 'templateId required' })

    const template = await getTemplate(templateId)
    if (!template) return reply.code(404).send({ message: 'template not found' })

    const users = await getUsersWithEmailOptIn()
    const targets = await filterEmailRecipients(users, { provider, examProductId, monthlyOnly })

    let sent = 0
    const errors: string[] = []
    const BATCH = 50

    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH)
      await Promise.allSettled(
        batch.map(async (u: any) => {
          if (!u.email) return
          try {
            await sendMarketingEmail({ to: u.email, userId: u.userId, name: u.name || u.given_name, subject: template.subject, htmlBody: template.htmlBody })
            sent++
          } catch (e: any) {
            errors.push(`${u.userId}: ${e.message ?? String(e)}`)
          }
        })
      )
      if (i + BATCH < targets.length) await new Promise((r) => setTimeout(r, 200))
    }

    await logEmailSend({
      type: 'marketing',
      sentBy: (request.user as any).sub,
      templateId,
      recipientCount: sent,
      subject: template.subject,
      filters: { provider: provider ?? 'all', examProductId: examProductId ?? 'all', monthlyOnly: monthlyOnly ?? false },
    })
    await recordAdminAudit((request.user as any).sub, null, 'send_marketing_email', { templateId, sent, errors: errors.length, provider, examProductId, monthlyOnly })

    return { sent, errors: errors.length > 0 ? errors : undefined }
  })

  // ── Email logs ───────────────────────────────────────────────────────────

  server.get('/email-logs', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request) => {
    const q = request.query as any
    const limit = Math.min(Number(q.limit || 50), 200)
    const result = await listEmailLogs(limit, q.lastKey)
    return { logs: result.items, lastKey: result.lastKey }
  })
}

import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import { readFileSync } from 'fs'
import path from 'path'
import { skillLabAttemptsStore } from '../services/skillLabAttemptsStore.js'
import {
  getLabFromS3,
  getLabIndex,
  listLabIndex,
} from '../services/skillLabStore.js'
import { updateMetricsOnLabAttempt } from '../services/metricsStore.js'
import { touchUserActivity } from '../services/dynamo.js'
import { TIERS, type Tier } from '../catalog.js'
import { captureWithContext } from '../lib/sentry.js'

const LABS_DIR = path.join(process.cwd(), 'data', 'skill-labs')

const PROVIDER_SHOWCASE: Map<string, string[]> = new Map(
  Object.entries(
    JSON.parse(readFileSync(path.join(LABS_DIR, 'providers.json'), 'utf-8')) as Record<string, string[]>
  )
)
const PROVIDER_RANK = new Map([...PROVIDER_SHOWCASE.keys()].map((p, i) => [p, i]))
const N_PROVIDERS = PROVIDER_SHOWCASE.size

/**
 * Skill lab source switch — mirrors EXAM_SOURCE pattern.
 *   'local' = filesystem (default for dev)
 *   's3'    = S3 + DynamoDB index (production)
 */
const SKILL_LAB_SOURCE: 'local' | 's3' =
  (process.env.SKILL_LAB_SOURCE ?? 'local') as any
const USE_S3 = SKILL_LAB_SOURCE === 's3'

/** Strip sensitive lab content, returning metadata-only shape. */
function labMetadataOnly(lab: any) {
  const { tasks: _t, scenario: _s, initialPolicy: _i, solution: _sol, hints: _h, validations: _v, ...meta } = lab
  return meta
}

/* ------------------------------------------------------------------ */
/*  Local-file helpers (dev only)                                      */
/* ------------------------------------------------------------------ */

async function loadLabsLocal(): Promise<any[]> {
  try {
    const files = await fs.readdir(LABS_DIR)
    const arrays = await Promise.all(
      files.filter((f) => f.endsWith('.json') && f !== 'providers.json').map(async (f) => {
        const raw = await fs.readFile(path.join(LABS_DIR, f), 'utf-8')
        return JSON.parse(raw) as any[]
      })
    )
    return arrays.flat()
  } catch (err) {
    console.error('[skill-labs] Failed to load labs data from disk', err)
    captureWithContext(err, { tags: { surface: 'skill-lab', source: 'local', stage: 'list' } })
    return []
  }
}

async function findLabLocal(id: string): Promise<any | null> {
  const labs = await loadLabsLocal()
  return labs.find((l) => l.id === id) ?? null
}

/* ------------------------------------------------------------------ */
/*  S3 helpers (production)                                            */
/* ------------------------------------------------------------------ */

async function loadLabsS3Summary(): Promise<any[]> {
  try {
    const entries = await listLabIndex()
    return entries.map((e) => ({
      id: e.labId,
      title: e.title ?? e.labId,
      description: e.description ?? '',
      type: e.type,
      platform: e.platform ?? 'AWS',
      category: e.category ?? 'General',
      difficulty: e.difficulty ?? 'beginner',
      technologies: (e as any).technologies ?? [],
      labCategory: (e as any).labCategory ?? 'Troubleshoot',
      showcase: e.showcase ?? false,
      showcaseOrder: e.showcaseOrder ?? 99,
      ...((e as any).learningOutcomes ? { learningOutcomes: (e as any).learningOutcomes } : {}),
      ...((e as any).realWorldValue ? { realWorldValue: (e as any).realWorldValue } : {}),
      ...((e as any).relatedExamCodes ? { relatedExamCodes: (e as any).relatedExamCodes } : {}),
    }))
  } catch (err) {
    console.error('[skill-labs] Failed to scan DynamoDB index', err)
    captureWithContext(err, { tags: { surface: 'skill-lab', source: 's3', stage: 'list-index' } })
    return []
  }
}

async function findLabS3(id: string): Promise<any | null> {
  try {
    const idx = await getLabIndex(id)
    if (!idx) return null
    const { body } = await getLabFromS3(idx.labId, idx.s3VersionId)
    return { ...JSON.parse(body), s3VersionId: idx.s3VersionId }
  } catch (err) {
    console.error('[skill-labs] S3 load failed for id:', id, err)
    captureWithContext(err, { tags: { surface: 'skill-lab', source: 's3', stage: 'load' }, extra: { labId: id } })
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Tier helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * How many showcase labs this tier can access **per provider/platform**.
 * null = all labs (pro_plus).
 */
function effectiveLabShowcaseCount(tier: Tier): number | null {
  if (tier === 'pro_plus') return null
  if (tier === 'pro') return 12
  if (tier === 'registered') return TIERS.registered.labShowcaseCount ?? 6
  return TIERS.visitor.labShowcaseCount ?? 6
}

/**
 * Overlay showcase: true / showcaseOrder from providers.json onto each lab,
 * overriding any fields already present on the lab object.
 */
function withShowcaseFields(labs: any[]): any[] {
  return labs.map((lab) => {
    const platform = (lab.platform ?? 'Other').toString().trim() || 'Other'
    const ids = PROVIDER_SHOWCASE.get(platform) ?? []
    const idx = ids.indexOf(lab.id)
    if (idx === -1) return { ...lab, showcase: false, showcaseOrder: 9999 }
    // Interleave providers: slot = withinProviderIndex * N_PROVIDERS + platformRank
    // e.g. AWS#0=0, CompTIA#0=1, Anthropic#0=2, RedHat#0=3, AWS#1=4, ...
    const platformRank = PROVIDER_RANK.get(platform) ?? 0
    return { ...lab, showcase: true, showcaseOrder: idx * N_PROVIDERS + platformRank }
  })
}

/**
 * Build the set of unlocked lab IDs by picking the top `count` showcase labs
 * per platform/provider (ordered by showcaseOrder), rather than globally.
 */
function unlockedShowcaseIds(allLabs: any[], count: number): Set<string> {
  // Group showcase labs by platform
  const byPlatform = new Map<string, any[]>()
  for (const lab of allLabs) {
    if (!lab.showcase) continue
    const platform = (lab.platform ?? 'Other').toString().trim() || 'Other'
    if (!byPlatform.has(platform)) byPlatform.set(platform, [])
    byPlatform.get(platform)!.push(lab)
  }
  const ids = new Set<string>()
  for (const platformLabs of byPlatform.values()) {
    platformLabs
      .sort((a: any, b: any) => (a.showcaseOrder ?? 99) - (b.showcaseOrder ?? 99))
      .slice(0, count)
      .forEach((l: any) => ids.add(l.id))
  }
  return ids
}

/** Attach a `locked` boolean to each lab based on which IDs are unlocked. */
function withLocked(labs: any[], unlockedIds: Set<string> | null): any[] {
  return labs.map((lab) => ({
    ...lab,
    locked: unlockedIds !== null && !unlockedIds.has(lab.id),
  }))
}

/**
 * For a single lab access check: load the full lab list and compute the
 * per-provider unlocked IDs for the given showcase count.
 */
async function buildUnlockedIdsForLab(lab: any, count: number): Promise<Set<string>> {
  const allLabs = USE_S3 ? await loadLabsS3Summary() : (await loadLabsLocal()).map((l) => ({
    id: l.id,
    showcase: l.showcase ?? false,
    showcaseOrder: l.showcaseOrder ?? 99,
    platform: l.platform ?? 'AWS',
  }))
  return unlockedShowcaseIds(withShowcaseFields(allLabs), count)
}

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /skill-labs — list all labs; locked:true on labs the user cannot access
  server.get('/', { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
    await server.optionalAuth(request, reply)

    const allLabs = USE_S3
      ? await loadLabsS3Summary()
      : (await loadLabsLocal()).map((lab) => ({
          id: lab.id,
          title: lab.title,
          description: lab.description,
          type: lab.type,
          difficulty: lab.difficulty || 'beginner',
          platform: lab.platform || 'AWS',
          category: lab.category || 'General',
          technologies: lab.technologies || [],
          labCategory: lab.labCategory || 'Troubleshoot',
          showcase: lab.showcase ?? false,
          showcaseOrder: lab.showcaseOrder ?? 99,
          ...(lab.learningOutcomes ? { learningOutcomes: lab.learningOutcomes } : {}),
          ...(lab.realWorldValue ? { realWorldValue: lab.realWorldValue } : {}),
          ...(lab.relatedExamCodes ? { relatedExamCodes: lab.relatedExamCodes } : {}),
        }))

    const enrichedLabs = withShowcaseFields(allLabs)

    if (request.user) {
      const userId = request.user.sub
      const { getActiveProductIds } = await import('../services/entitlements.js')
      const { resolveUserTier } = await import('../catalog.js')
      let ownedProductIds: string[] = []
      try { ownedProductIds = await getActiveProductIds(userId) } catch { /* ignore */ }
      const tier = resolveUserTier({ isAuthenticated: true, ownedProductIds })

      const showcaseCount = effectiveLabShowcaseCount(tier)
      if (showcaseCount === null) {
        // pro_plus: all labs unlocked
        return reply.send(withLocked(enrichedLabs, null))
      }
      return reply.send(withLocked(enrichedLabs, unlockedShowcaseIds(enrichedLabs, showcaseCount)))
    }

    // Unauthenticated: visitor showcase unlocked (per provider)
    const count = effectiveLabShowcaseCount('visitor') ?? 6
    return reply.send(withLocked(enrichedLabs, unlockedShowcaseIds(enrichedLabs, count)))
  })

  // GET /skill-labs/my-attempts — get current user's lab attempts.
  // Filters out in_progress / abandoned rows so the UI's "completed" list is honest
  // (dev-guide §15 / 14.2 — legacy rows have no status, treat as completed).
  server.get('/my-attempts', { preHandler: [server.authenticate], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
    const userId = request.user?.sub
    if (!userId) return reply.status(401).send({ message: 'Unauthorized' })
    const attempts = await skillLabAttemptsStore.listByUser(userId)
    const completedLabIds = [...new Set(
      attempts
        .filter((a) => a.status === undefined || a.status === 'completed')
        .map((a) => a.labId)
    )]
    return reply.send({ completedLabIds })
  })

  // GET /skill-labs/:id — full lab definition
  server.get('/:id', { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
    const { id } = request.params as { id: string }
    const lab = USE_S3 ? await findLabS3(id) : await findLabLocal(id)
    if (!lab) return reply.status(404).send({ message: 'Lab not found' })

    await server.optionalAuth(request, reply)

    if (request.user) {
      const userId = request.user.sub
      const { getActiveProductIds } = await import('../services/entitlements.js')
      const { resolveUserTier } = await import('../catalog.js')
      let ownedProductIds: string[] = []
      try { ownedProductIds = await getActiveProductIds(userId) } catch { /* ignore */ }
      const tier = resolveUserTier({ isAuthenticated: true, ownedProductIds })

      const showCount = effectiveLabShowcaseCount(tier)
      if (showCount === null) return reply.send(lab)

      const registeredUnlocked = await buildUnlockedIdsForLab(lab, showCount)

      if (!registeredUnlocked.has(lab.id)) {
        return reply.status(403).send({ message: 'Upgrade to access more labs.' })
      }
      return reply.send(lab)
    }

    // Unauthenticated visitor: must be in visitor showcase (per provider)
    const visitorCount = effectiveLabShowcaseCount('visitor') ?? 6
    const visitorUnlocked = await buildUnlockedIdsForLab(lab, visitorCount)

    if (!visitorUnlocked.has(lab.id)) {
      return reply.status(403).send({ message: 'Sign in to access more labs.' })
    }
    return reply.send(lab)
  })

  // POST /skill-labs/:id/validate-policy — validate policy-fix lab submission
  server.post('/:id/validate-policy', async (request, reply) => {
    const { id: labId } = request.params as { id: string }
    const lab = USE_S3 ? await findLabS3(labId) : await findLabLocal(labId)
    if (!lab) return reply.status(404).send({ message: 'Lab not found' })
    if (lab.type !== 'policy-fix') return reply.status(400).send({ message: 'Not a policy-fix lab' })

    const body = request.body as any
    const { policy } = body || {}
    if (typeof policy !== 'string') {
      return reply.status(400).send({ message: 'policy (string) is required' })
    }

    // Parse JSON safely
    let parsed: any
    try {
      parsed = JSON.parse(policy)
    } catch {
      return reply.send({ success: false, errors: ['Invalid JSON — could not parse the policy.'] })
    }

    const errors: string[] = []

    // AWS IAM policy: validate against Statement array
    const statements = parsed?.Statement
    if (Array.isArray(statements) && statements.length > 0) {
      for (const v of lab.validations) {
        const found = statements.some((s: any) => {
          const fieldValue = s[v.field]
          if (Array.isArray(fieldValue)) return fieldValue.includes(v.expected)
          return fieldValue === v.expected
        })
        if (!found) {
          errors.push(`Expected ${v.field} to include "${v.expected}"`)
        }
      }
      return reply.send({ success: errors.length === 0, errors })
    }

    // Generic JSON policy (e.g. AgentDefinition): validate each field by name.
    // expected may be stored as a JSON-quoted string literal (e.g. `"Task"`) —
    // unwrap it so array-order differences don't cause false failures.
    function unwrapExpected(expected: string): string {
      if (expected.startsWith('"') && expected.endsWith('"')) {
        try { return JSON.parse(expected) } catch { /* fall through */ }
      }
      return expected
    }

    function fieldContains(fieldValue: any, needle: string): boolean {
      if (fieldValue === null || fieldValue === undefined) return false
      if (Array.isArray(fieldValue)) return fieldValue.some((item: any) => String(item) === needle)
      if (typeof fieldValue === 'string') return fieldValue === needle
      return String(fieldValue) === needle
    }

    for (const v of lab.validations) {
      const needle = unwrapExpected(v.expected)
      const fieldValue = parsed?.[v.field]
      if (!fieldContains(fieldValue, needle)) {
        errors.push(`Expected ${v.field} to include "${needle}"`)
      }
    }

    return reply.send({ success: errors.length === 0, errors })
  })

  // POST /skill-labs/:id/validate-code — validate code-fix lab submission
  server.post('/:id/validate-code', async (request, reply) => {
    const { id: labId } = request.params as { id: string }
    const lab = USE_S3 ? await findLabS3(labId) : await findLabLocal(labId)
    if (!lab) return reply.status(404).send({ message: 'Lab not found' })
    if (lab.type !== 'code-fix') return reply.status(400).send({ message: 'Not a code-fix lab' })

    const body = request.body as any
    const { code } = body || {}
    if (typeof code !== 'string') {
      return reply.status(400).send({ message: 'code (string) is required' })
    }

    const errors: string[] = []
    const normalised = code.replace(/\r\n/g, '\n').trim()

    for (const v of (lab as any).validations) {
      // Check if the expected value appears in the submitted code
      if (!normalised.includes(v.expected)) {
        errors.push(`Expected ${v.field} to be "${v.expected}"`)
      }
    }

    return reply.send({ success: errors.length === 0, errors })
  })

  // POST /skill-labs/:id/attempt — start a new attempt OR (legacy one-shot) finalise.
  //
  // Lifecycle redesign (dev-guide §15 / 14.3-4):
  //   * Body with no `correct`           → start an in_progress attempt; returns { attemptId, status, startedAt }
  //   * Body with `correct` (legacy)     → write a completed row immediately; preserves
  //                                        backward-compat for any client still on the one-shot flow
  server.post('/:id/attempt', { preHandler: [server.authenticate], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
    const { id: labId } = request.params as { id: string }
    const userId = request.user?.sub
    if (!userId) return reply.status(401).send({ message: 'Unauthorized' })

    const body = (request.body as any) ?? {}
    const { selectedAnswer, correct, timeTaken, labType, progressState } = body
    const timed = typeof body.timed === 'boolean' ? body.timed : false
    const isLegacyOneShot = typeof correct === 'boolean' && typeof timeTaken === 'number'

    const now = new Date().toISOString()
    const attemptId = randomUUID()

    if (isLegacyOneShot) {
      const attempt = {
        userId,
        attemptId,
        labId,
        labType: labType || 'unknown',
        selectedAnswer: selectedAnswer || '',
        correct,
        timeTaken,
        createdAt: now,
        status: 'completed' as const,
        startedAt: now,
        completedAt: now,
      }
      await skillLabAttemptsStore.put(attempt)
      void touchUserActivity(userId)
      updateMetricsOnLabAttempt({ labId, labType: attempt.labType, correct, timeTaken })
        .catch((err) => {
          console.error('[metrics] updateMetricsOnLabAttempt failed', err)
          captureWithContext(err, { tags: { surface: 'skill-lab', stage: 'metrics-update' }, user: { id: userId }, extra: { labId } })
        })
      return reply.status(201).send(attempt)
    }

    // Idempotent start: if there's already an active in_progress for this user+lab, return it.
    const existing = await skillLabAttemptsStore.findActiveForLab(userId, labId)
    if (existing) {
      return reply.status(200).send({ attemptId: existing.attemptId, status: existing.status, startedAt: existing.startedAt, timed: existing.timed ?? false, resumed: true })
    }

    // Enforce one in-progress lab per account: if another lab is active, refuse.
    const otherActive = await skillLabAttemptsStore.findAnyActive(userId)
    if (otherActive && otherActive.labId !== labId) {
      return reply.status(409).send({ message: 'another lab in progress', activeLabId: otherActive.labId })
    }

    const attempt = {
      userId,
      attemptId,
      labId,
      labType: labType || 'unknown',
      selectedAnswer: '',
      correct: false,
      timeTaken: 0,
      createdAt: now,
      status: 'in_progress' as const,
      startedAt: now,
      lastSavedAt: now,
      progressState: progressState ?? null,
      timed,
    }
    await skillLabAttemptsStore.put(attempt)
    void touchUserActivity(userId)
    request.log.info({ userId, labId, attemptId }, '[skill-labs] attempt started')
    return reply.status(201).send({ attemptId, status: attempt.status, startedAt: now, timed })
  })

  // PATCH /skill-labs/:id/attempt/:attemptId — save progress (debounced ~5s client-side).
  server.patch('/:id/attempt/:attemptId', { preHandler: [server.authenticate], config: { rateLimit: { max: 240, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
    const { id: labId, attemptId } = request.params as { id: string; attemptId: string }
    const userId = request.user?.sub
    if (!userId) return reply.status(401).send({ message: 'Unauthorized' })
    const attempt = await skillLabAttemptsStore.get(userId, attemptId)
    if (!attempt) return reply.status(404).send({ message: 'attempt not found' })
    if (attempt.userId !== userId || attempt.labId !== labId) return reply.status(403).send({ message: 'forbidden' })
    if (attempt.status && attempt.status !== 'in_progress') return reply.status(400).send({ message: 'attempt is no longer in progress' })

    const body = (request.body as any) ?? {}
    const fields: Record<string, any> = { lastSavedAt: new Date().toISOString() }
    if (body.progressState !== undefined) fields.progressState = body.progressState
    if (!attempt.status) fields.status = 'in_progress'
    await skillLabAttemptsStore.update(userId, attemptId, fields)
    return { updated: true, lastSavedAt: fields.lastSavedAt }
  })

  // POST /skill-labs/:id/attempt/:attemptId/complete — finalise attempt.
  server.post('/:id/attempt/:attemptId/complete', { preHandler: [server.authenticate], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
    const { id: labId, attemptId } = request.params as { id: string; attemptId: string }
    const userId = request.user?.sub
    if (!userId) return reply.status(401).send({ message: 'Unauthorized' })
    const attempt = await skillLabAttemptsStore.get(userId, attemptId)
    if (!attempt) return reply.status(404).send({ message: 'attempt not found' })
    if (attempt.userId !== userId || attempt.labId !== labId) return reply.status(403).send({ message: 'forbidden' })
    if (attempt.status === 'completed') return { completed: true, alreadyCompleted: true, attemptId }
    if (attempt.status === 'abandoned') return reply.status(400).send({ message: 'attempt was abandoned' })

    const body = (request.body as any) ?? {}
    const correct = !!body.correct
    const timeTaken = typeof body.timeTaken === 'number' ? body.timeTaken : 0
    const selectedAnswer = typeof body.selectedAnswer === 'string' ? body.selectedAnswer : ''
    const labType = typeof body.labType === 'string' && body.labType ? body.labType : (attempt.labType || 'unknown')
    const now = new Date().toISOString()

    await skillLabAttemptsStore.update(userId, attemptId, {
      status: 'completed',
      correct,
      timeTaken,
      selectedAnswer,
      labType,
      completedAt: now,
      lastSavedAt: now,
    })
    void touchUserActivity(userId)
    updateMetricsOnLabAttempt({ labId, labType, correct, timeTaken })
      .catch((err) => {
        console.error('[metrics] updateMetricsOnLabAttempt failed', err)
        captureWithContext(err, { tags: { surface: 'skill-lab', stage: 'metrics-update' }, user: { id: userId }, extra: { labId, attemptId } })
      })

    request.log.info({ userId, labId, attemptId, correct, timeTaken }, '[skill-labs] attempt completed')
    return { completed: true, attemptId, completedAt: now, correct }
  })

  // POST /skill-labs/:id/attempt/:attemptId/cancel — soft-abandon.
  server.post('/:id/attempt/:attemptId/cancel', { preHandler: [server.authenticate], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
    const { id: labId, attemptId } = request.params as { id: string; attemptId: string }
    const userId = request.user?.sub
    if (!userId) return reply.status(401).send({ message: 'Unauthorized' })
    const attempt = await skillLabAttemptsStore.get(userId, attemptId)
    if (!attempt) return reply.status(404).send({ message: 'attempt not found' })
    if (attempt.userId !== userId || attempt.labId !== labId) return reply.status(403).send({ message: 'forbidden' })
    if (attempt.status === 'abandoned') return { abandoned: true, alreadyAbandoned: true, attemptId }
    if (attempt.status === 'completed') return reply.status(400).send({ message: 'attempt already completed' })

    const now = new Date().toISOString()
    await skillLabAttemptsStore.update(userId, attemptId, {
      status: 'abandoned',
      abandonedAt: now,
      lastSavedAt: now,
    })
    request.log.info({ userId, labId, attemptId }, '[skill-labs] attempt abandoned')
    return { abandoned: true, attemptId, abandonedAt: now }
  })

  // GET /skill-labs/:id/attempt/active — hydrate latest in_progress attempt for this user+lab.
  server.get('/:id/attempt/active', { preHandler: [server.authenticate], config: { rateLimit: { max: 240, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
    const { id: labId } = request.params as { id: string }
    const userId = request.user?.sub
    if (!userId) return reply.status(401).send({ message: 'Unauthorized' })
    const active = await skillLabAttemptsStore.findActiveForLab(userId, labId)
    if (!active) return { active: null }
    return {
      active: {
        attemptId: active.attemptId,
        startedAt: active.startedAt,
        lastSavedAt: active.lastSavedAt,
        progressState: active.progressState ?? null,
        timed: active.timed ?? false,
      },
    }
  })

  // GET /skill-labs/my-active-attempt — returns the first in_progress attempt across all labs.
  server.get('/my-active-attempt', { preHandler: [server.authenticate], config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
    const userId = request.user?.sub
    if (!userId) return reply.status(401).send({ message: 'Unauthorized' })
    const active = await skillLabAttemptsStore.findAnyActive(userId)
    return { active: active ?? null }
  })

  // POST /skill-labs/:id/attempt/cancel-active — cancel the active in_progress attempt for this user+lab.
  server.post('/:id/attempt/cancel-active', { preHandler: [server.authenticate], config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
    const { id: labId } = request.params as { id: string }
    const userId = request.user?.sub
    if (!userId) return reply.status(401).send({ message: 'Unauthorized' })
    const active = await skillLabAttemptsStore.findActiveForLab(userId, labId)
    if (!active) return reply.status(204).send()
    const now = new Date().toISOString()
    await skillLabAttemptsStore.update(userId, active.attemptId, {
      status: 'cancelled' as any,
      abandonedAt: now,
      lastSavedAt: now,
    })
    request.log.info({ userId, labId, attemptId: active.attemptId }, '[skill-labs] attempt cancel-active')
    return { cancelled: true, attemptId: active.attemptId }
  })
}

import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
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

const LABS_DIR = path.join(process.cwd(), 'data', 'skill-labs')

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
      files.filter((f) => f.endsWith('.json')).map(async (f) => {
        const raw = await fs.readFile(path.join(LABS_DIR, f), 'utf-8')
        return JSON.parse(raw) as any[]
      })
    )
    return arrays.flat()
  } catch (err) {
    console.error('[skill-labs] Failed to load labs data from disk', err)
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
  return unlockedShowcaseIds(allLabs, count)
}

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /skill-labs — list all labs; locked:true on labs the user cannot access
  server.get('/', async (request, reply) => {
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
        return reply.send(withLocked(allLabs, null))
      }
      return reply.send(withLocked(allLabs, unlockedShowcaseIds(allLabs, showcaseCount)))
    }

    // Unauthenticated: visitor showcase unlocked (per provider)
    const count = effectiveLabShowcaseCount('visitor') ?? 6
    return reply.send(withLocked(allLabs, unlockedShowcaseIds(allLabs, count)))
  })

  // GET /skill-labs/my-attempts — get current user's lab attempts
  server.get('/my-attempts', { preHandler: [server.authenticate], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
    const userId = request.user?.sub
    if (!userId) return reply.status(401).send({ message: 'Unauthorized' })
    const attempts = await skillLabAttemptsStore.listByUser(userId)
    const completedLabIds = [...new Set(attempts.map((a) => a.labId))]
    return reply.send({ completedLabIds })
  })

  // GET /skill-labs/:id — full lab definition
  server.get('/:id', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
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

      if (!lab.showcase || !registeredUnlocked.has(lab.id)) {
        return reply.status(403).send({ message: 'Upgrade to access more labs.' })
      }
      return reply.send(lab)
    }

    // Unauthenticated visitor: must be in visitor showcase (per provider)
    const visitorCount = effectiveLabShowcaseCount('visitor') ?? 6
    const visitorUnlocked = await buildUnlockedIdsForLab(lab, visitorCount)

    if (!lab.showcase || !visitorUnlocked.has(lab.id)) {
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

    // Generic JSON policy (e.g. AgentDefinition): check that each expected value
    // appears somewhere in the parsed object (deep value search)
    function deepIncludes(obj: any, expected: string): boolean {
      if (obj === null || obj === undefined) return false
      if (typeof obj === 'string') return obj === expected || obj.includes(expected)
      if (Array.isArray(obj)) return obj.some((item) => deepIncludes(item, expected))
      if (typeof obj === 'object') return Object.values(obj).some((v) => deepIncludes(v, expected))
      return String(obj) === expected
    }

    for (const v of lab.validations) {
      if (!deepIncludes(parsed, v.expected)) {
        errors.push(`Expected ${v.field} to include "${v.expected}"`)
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

  // POST /skill-labs/:id/attempt — store result
  server.post('/:id/attempt', { preHandler: [server.authenticate], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
    const { id: labId } = request.params as { id: string }
    const userId = request.user?.sub
    if (!userId) return reply.status(401).send({ message: 'Unauthorized' })

    const body = request.body as any
    const { selectedAnswer, correct, timeTaken, labType } = body || {}

    if (typeof correct !== 'boolean' || typeof timeTaken !== 'number') {
      return reply.status(400).send({ message: 'correct (boolean) and timeTaken (number) are required' })
    }

    const attempt = {
      userId,
      attemptId: randomUUID(),
      labId,
      labType: labType || 'unknown',
      selectedAnswer: selectedAnswer || '',
      correct,
      timeTaken,
      createdAt: new Date().toISOString(),
    }

    await skillLabAttemptsStore.put(attempt)
    void touchUserActivity(userId)

    updateMetricsOnLabAttempt({ labId, labType: attempt.labType, correct, timeTaken })
      .catch((err) => console.error('[metrics] updateMetricsOnLabAttempt failed', err))

    return reply.status(201).send(attempt)
  })
}

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
import { getVisitorLabSession, recordVisitorLabAccess } from '../services/dynamo.js'
import { TIERS } from '../catalog.js'

const VISITOR_LAB_LIMIT = TIERS.visitor.skillLabVisitorLimit ?? 3
const SESSION_COOKIE = 'sid'
const SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

/** Strip sensitive lab content, returning metadata-only shape. */
function labMetadataOnly(lab: any) {
  const { tasks: _t, scenario: _s, initialPolicy: _i, solution: _sol, hints: _h, validations: _v, ...meta } = lab
  return meta
}

const LABS_FILE = path.join(process.cwd(), 'data', 'skill-labs.json')

/**
 * Skill lab source switch — mirrors EXAM_SOURCE pattern.
 *   'local' = filesystem (default for dev)
 *   's3'    = S3 + DynamoDB index (production)
 */
const SKILL_LAB_SOURCE: 'local' | 's3' =
  (process.env.SKILL_LAB_SOURCE ?? 'local') as any
const USE_S3 = SKILL_LAB_SOURCE === 's3'

/* ------------------------------------------------------------------ */
/*  Local-file helpers (dev only)                                      */
/* ------------------------------------------------------------------ */

async function loadLabsLocal(): Promise<any[]> {
  try {
    const raw = await fs.readFile(LABS_FILE, 'utf-8')
    return JSON.parse(raw)
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
      type: e.type,
      platform: e.platform ?? 'AWS',
      category: e.category ?? 'General',
      difficulty: e.difficulty ?? 'beginner',
      timeLimit: (e as any).timeLimit ?? 0,
      technologies: (e as any).technologies ?? [],
      labCategory: (e as any).labCategory ?? 'Troubleshoot',
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
    return JSON.parse(body)
  } catch (err) {
    console.error('[skill-labs] S3 load failed for id:', id, err)
    return null
  }
}

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /skill-labs — list available labs (public metadata only)
  server.get('/', async (_request, reply) => {
    if (USE_S3) {
      const list = await loadLabsS3Summary()
      return reply.send(list)
    }

    const labs = await loadLabsLocal()
    const list = labs.map((lab) => ({
      id: lab.id,
      title: lab.title,
      description: lab.description,
      type: lab.type,
      timeLimit: lab.timeLimit,
      difficulty: lab.difficulty || 'beginner',
      platform: lab.platform || 'AWS',
      category: lab.category || 'General',
      technologies: lab.technologies || [],
      labCategory: lab.labCategory || 'Troubleshoot',
    }))
    return reply.send(list)
  })

  // GET /skill-labs/my-attempts — get current user's lab attempts
  server.get('/my-attempts', { preHandler: [server.authenticate] }, async (request, reply) => {
    const userId = request.user?.sub
    if (!userId) return reply.status(401).send({ message: 'Unauthorized' })
    const attempts = await skillLabAttemptsStore.listByUser(userId)
    const completedLabIds = [...new Set(attempts.map((a) => a.labId))]
    return reply.send({ completedLabIds })
  })

  // GET /skill-labs/:id — full lab definition (visitors limited to 3 labs)
  server.get('/:id', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => { // lgtm[js/missing-rate-limiting]
    const { id } = request.params as { id: string }
    const lab = USE_S3 ? await findLabS3(id) : await findLabLocal(id)
    if (!lab) return reply.status(404).send({ message: 'Lab not found' })

    // Authenticated users get full content
    await server.optionalAuth(request, reply)
    if (request.user) {
      return reply.send(lab)
    }

    // Unauthenticated visitors: enforce per-session lab limit
    let sessionId = request.cookies?.[SESSION_COOKIE]
    if (!sessionId) {
      sessionId = randomUUID()
      reply.setCookie(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: SESSION_COOKIE_MAX_AGE,
        path: '/',
      })
    }

    const accessedLabs = await getVisitorLabSession(sessionId)

    if (accessedLabs.has(id) || accessedLabs.size < VISITOR_LAB_LIMIT) {
      // Within limit or already accessed this lab — return full content
      await recordVisitorLabAccess(sessionId, id, accessedLabs)
      return reply.send(lab)
    }

    // Over limit — return metadata only
    return reply.send({ ...labMetadataOnly(lab), _limited: true })
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
    const statements = parsed?.Statement
    if (!Array.isArray(statements) || statements.length === 0) {
      return reply.send({ success: false, errors: ['Policy must contain at least one Statement.'] })
    }

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
  })

  // POST /skill-labs/:id/attempt — store result
  server.post('/:id/attempt', { preHandler: [server.authenticate] }, async (request, reply) => {
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
      labType: labType || 'diagnose',
      selectedAnswer: selectedAnswer || '',
      correct,
      timeTaken,
      createdAt: new Date().toISOString(),
    }

    await skillLabAttemptsStore.put(attempt)

    updateMetricsOnLabAttempt({ labId, labType: attempt.labType, correct, timeTaken })
      .catch((err) => console.error('[metrics] updateMetricsOnLabAttempt failed', err))

    return reply.status(201).send(attempt)
  })
}

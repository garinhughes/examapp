import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import fs from 'fs/promises'
import { getActiveProductIds } from '../services/entitlements.js'
import { resolveUserTier, TIERS, hasExamAccess } from '../catalog.js'
import { computeDomainWeights, selectWeakestLinkQuestions, type DomainStats } from '../services/weakestLink.js'
import { loadAllExams, loadExam, shuffleQuestions } from '../examLoader.js'

const attemptsFile = new URL('../../data/attempts.json', import.meta.url)

async function loadAttempts() {
  const raw = await fs.readFile(attemptsFile)
  return JSON.parse(raw.toString())
}

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  server.get('/', async (request, reply) => {
    const allExams = await loadAllExams()

    // Resolve auth state to filter visitor-only exams
    await server.optionalAuth(request, reply)
    const isAuthenticated = !!request.user

    const filteredExams = allExams.filter((e: any) => {
      // The 'SAMPLE-10Q' exam is only visible to visitors (unauthenticated users)
      if (String(e.code).toLowerCase() === 'sample-10q' && isAuthenticated) return false
      return true
    })

    // expose useful exam metadata so frontend can show defaults (question count, duration, provider)
    return filteredExams.map((e: any) => ({
      code: e.code,
      title: e.title,
      provider: e.provider,
      logo: e.logo,
      logoHref: e.logoHref,
      passMark: typeof e.passMark === 'number' ? e.passMark : 70,
      defaultQuestions: e.defaultQuestions,
      defaultDuration: e.defaultDuration,
      // include level where present so frontend can render badges
      level: e.level
    }))
  })

  /**
   * Questions endpoint — applies tier-based question limits.
   *
   * visitor  → 10 questions (sample)
   * registered → 25 questions
   * paying (owns exam / bundle / subscription) → full bank
   */
  server.get('/:examCode/questions', async (request, reply) => {
    const { examCode } = request.params as any
    const lc = String(examCode || '').toLowerCase()
    const exam = await loadExam(lc)
    if (!exam) {
      return reply.status(404).send({ message: 'exam not found' })
    }

    // Resolve user tier for this exam
    await server.optionalAuth(request, reply)
    const isAuthenticated = !!request.user

    // The sample exam is visitor-only; authenticated users cannot access it
    if (lc === 'sample-10q' && isAuthenticated) {
      return reply.status(403).send({ message: 'sample exam is only available to visitors' })
    }

    let ownedProductIds: string[] = []
    if (isAuthenticated && request.user) {
      try { ownedProductIds = await getActiveProductIds(request.user.sub) } catch { /* ignore */ }
    }
    const tier = resolveUserTier({ isAuthenticated, ownedProductIds, examCode: exam.code })
    const tierConfig = TIERS[tier]

    const allQuestions = exam.questions as any[]
    const limit = tierConfig.questionLimit
    const pool = limit != null ? allQuestions.slice(0, limit) : allQuestions
    const questions = shuffleQuestions(pool)

    return {
      questions,
      tier,
      totalAvailable: allQuestions.length,
      limited: limit != null && allQuestions.length > limit,
    }
  })

  // Return all unique services referenced in an exam's questions
  server.get('/:examCode/services', async (request, reply) => {
    const { examCode } = request.params as any
    const lc = String(examCode || '').toLowerCase()
    const exam = await loadExam(lc)
    if (!exam) {
      return reply.status(404).send({ message: 'exam not found' })
    }
    const set = new Set<string>()
    for (const q of exam.questions) {
      if (Array.isArray(q.services)) {
        for (const s of q.services) set.add(String(s))
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  })

  /**
   * Weakest-link question selection.
   *
   * Returns a question set weighted toward the user's historically weakest
   * domains and previously-wrong questions.
   *
   * Query params:
   *  - count (number, default exam.defaultQuestions): how many questions
   */
  server.get('/:examCode/weakest-link', { preHandler: [server.authenticate] }, async (request, reply) => {
    const { examCode } = request.params as any
    const query = request.query as any
    const lc = String(examCode || '').toLowerCase()
    const exam = await loadExam(lc)
    if (!exam) {
      return reply.status(404).send({ message: 'exam not found' })
    }

    const userId = request.user?.sub
    if (!userId) {
      return reply.status(401).send({ message: 'authentication required for weakest-link mode' })
    }

    // ── Resolve tier (enforce question limits) ──
    let ownedProductIds: string[] = []
    try { ownedProductIds = await getActiveProductIds(userId) } catch { /* ignore */ }
    const tier = resolveUserTier({ isAuthenticated: true, ownedProductIds, examCode: exam.code })
    const tierConfig = TIERS[tier]
    const allQuestions = exam.questions as any[]
    const limit = tierConfig.questionLimit
    const accessibleQuestions = limit != null ? allQuestions.slice(0, limit) : allQuestions

    // ── Load user's historical attempts for this exam ──
    const attemptsDb = await loadAttempts()
    const userAttempts = (attemptsDb.attempts || []).filter(
      (a: any) => String(a.examCode || '').toLowerCase() === lc && a.userId === userId && a.finishedAt
    )

    // ── Build per-domain stats (same logic as analytics route) ──
    const domainAgg: Record<string, { total: number; correct: number; attempts: number }> = {}
    for (const a of userAttempts) {
      if (!a.perDomain || typeof a.perDomain !== 'object') continue
      for (const [domain, vals] of Object.entries(a.perDomain) as [string, any][]) {
        if (!domainAgg[domain]) domainAgg[domain] = { total: 0, correct: 0, attempts: 0 }
        domainAgg[domain].total += Number(vals?.total) || 0
        domainAgg[domain].correct += Number(vals?.correct) || 0
        domainAgg[domain].attempts += 1
      }
    }
    const domainStats: Record<string, DomainStats> = {}
    for (const [domain, agg] of Object.entries(domainAgg)) {
      domainStats[domain] = {
        total: agg.total,
        correct: agg.correct,
        avgScore: agg.total > 0 ? Math.round((agg.correct / agg.total) * 100) : 0,
        attemptCount: agg.attempts,
      }
    }

    // ── Collect all unique domains from the question bank ──
    const allDomains = Array.from(new Set(accessibleQuestions.map((q: any) => q.domain ?? 'General')))

    // ── Collect wrong question IDs across all finished attempts ──
    const wrongIds = new Set<number>()
    for (const a of userAttempts) {
      if (!Array.isArray(a.answers)) continue
      // build latest answer per questionId
      const latestByQ = new Map<number, any>()
      for (const ans of a.answers) {
        const qid = Number(ans?.questionId)
        if (!Number.isFinite(qid)) continue
        const prev = latestByQ.get(qid)
        const prevT = prev?.createdAt ? String(prev.createdAt) : ''
        const currT = ans?.createdAt ? String(ans.createdAt) : ''
        if (!prev || currT >= prevT) latestByQ.set(qid, ans)
      }
      for (const [qid, ans] of latestByQ) {
        if (!ans.correct) wrongIds.add(qid)
      }
    }

    // ── Compute weights & select questions ──
    const domainWeights = computeDomainWeights(domainStats, allDomains)
    const requestedCount = typeof query?.count === 'string' ? parseInt(query.count, 10) : null
    const count = (requestedCount && requestedCount > 0)
      ? Math.min(requestedCount, accessibleQuestions.length)
      : Math.min(exam.defaultQuestions ?? accessibleQuestions.length, accessibleQuestions.length)

    const questions = selectWeakestLinkQuestions(accessibleQuestions, domainWeights, wrongIds, count)

    return {
      questions: shuffleQuestions(questions as any),
      domainWeights,
      domainStats,
      wrongQuestionCount: wrongIds.size,
      totalAvailable: accessibleQuestions.length,
      tier,
    }
  })
}


import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import fs from 'fs/promises'
import { getActiveProductIds } from '../services/entitlements.js'
import { resolveUserTier, TIERS, isPaidTier } from '../catalog.js'
import { computeDomainWeights, selectWeakestLinkQuestions, type DomainStats } from '../services/weakestLink.js'
import { loadAllExams, loadExam, shuffleQuestions, getShowcaseQuestions, getDomainBalancedQuestions } from '../examLoader.js'
import { listLabIndex } from '../services/skillLabStore.js'

const attemptsFile = new URL('../../data/attempts.json', import.meta.url)

async function loadAttempts() {
  const raw = await fs.readFile(attemptsFile)
  return JSON.parse(raw.toString())
}

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  server.get('/', { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
    const allExams = await loadAllExams()

    // Resolve auth state to filter visitor-only exams
    await server.optionalAuth(request, reply)
    const isAuthenticated = !!request.user

    const filteredExams = allExams.filter((e: any) => {
      // Retired exams are excluded from public listings (direct URL access still works)
      if (e.retired === true) return false
      // The 'SAMPLE-10Q' exam is only visible to visitors (unauthenticated users)
      if (String(e.code).toLowerCase() === 'sample-20q' && isAuthenticated) return false
      return true
    })

    // expose useful exam metadata so frontend can show defaults (question count, duration, provider)
    return filteredExams.map((e: any) => ({
      code: e.code,
      title: e.title,
      provider: e.provider,
      passMark: typeof e.passMark === 'number' ? e.passMark : 70,
      defaultQuestions: e.defaultQuestions,
      defaultDuration: e.defaultDuration,
      questionCount: Array.isArray(e.questions) ? e.questions.length : 0,
      // include level where present so frontend can render badges
      level: e.level,
      predecessorCode: e.predecessorCode ?? undefined,
    }))
  })

  /**
   * Questions endpoint — applies tier-based question limits.
   *
   * visitor    → 20 questions (showcase)
   * registered → 40 questions (showcase)
   * pro / pro_plus → full bank
   */
  server.get('/:examCode/questions', { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
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
    if (lc === 'sample-20q' && isAuthenticated) {
      return reply.status(403).send({ message: 'sample exam is only available to visitors' })
    }

    let ownedProductIds: string[] = []
    if (isAuthenticated && request.user) {
      try { ownedProductIds = await getActiveProductIds(request.user.sub) } catch { /* ignore */ }
    }
    const tier = resolveUserTier({ isAuthenticated, ownedProductIds, examCode: exam.code })
    const tierConfig = TIERS[tier]

    const allQuestions = exam.questions as any[]

    if (!isPaidTier(tier)) {
      const showcaseCount = tierConfig.questionLimit ?? 20
      const showcase = getShowcaseQuestions(exam, showcaseCount)
      if (showcase) {
        return {
          questions: showcase,
          tier,
          totalAvailable: allQuestions.length,
          limited: true,
          showcase: true,
        }
      }
      // fallback: domain-balanced selection so visitors/free users see variety across all domains
      const pool = getDomainBalancedQuestions(allQuestions, showcaseCount)
      return {
        questions: shuffleQuestions(pool),
        tier,
        totalAvailable: allQuestions.length,
        limited: allQuestions.length > showcaseCount,
        showcase: false,
      }
    }

    // pro / pro_plus: full shuffled bank
    const questions = shuffleQuestions(allQuestions)
    return {
      questions,
      tier,
      totalAvailable: allQuestions.length,
      limited: false,
    }
  })

  // Public overview: domains, skills, and related labs — no auth, no DynamoDB per-user hits.
  server.get('/:examCode/overview', { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { examCode } = request.params as { examCode: string }
    const exam = await loadExam(String(examCode || '').toLowerCase())
    if (!exam) return reply.status(404).send({ message: 'exam not found' })

    const questions: any[] = Array.isArray(exam.questions) ? exam.questions : []

    const domainsSet = new Set<string>()
    const skillsByDomain = new Map<string, Set<string>>()
    for (const q of questions) {
      const d: string = q.domain ?? 'General'
      domainsSet.add(d)
      if (!skillsByDomain.has(d)) skillsByDomain.set(d, new Set())
      for (const s of (Array.isArray(q.skills) ? q.skills : [])) {
        skillsByDomain.get(d)!.add(String(s))
      }
    }

    const domains = [...domainsSet].map(d => ({
      name: d,
      skills: [...(skillsByDomain.get(d) ?? [])],
    }))

    const lc = String(examCode).toLowerCase()
    const allLabs = await listLabIndex()
    const labMap = new Map(allLabs.map(l => [l.labId, l]))
    const featuredLabIds = exam.featuredLabIds
    let relatedLabs
    const toLabShape = (l: { labId: string; title?: string; difficulty?: string; category?: string; platform?: string }) =>
      ({ id: l.labId, title: l.title, difficulty: l.difficulty, labCategory: l.category, platform: l.platform })

    const diffOrder: Record<string, number> = { beginner: 0, intermediate: 1, advanced: 2 }
    const sortByDifficulty = (labs: ReturnType<typeof toLabShape>[]) =>
      labs.sort((a, b) => (diffOrder[a.difficulty ?? ''] ?? 99) - (diffOrder[b.difficulty ?? ''] ?? 99))

    if (Array.isArray(featuredLabIds) && featuredLabIds.length > 0) {
      relatedLabs = sortByDifficulty(
        featuredLabIds.slice(0, 4).map(id => labMap.get(id)).filter(Boolean).map(l => toLabShape(l!))
      )
    } else {
      relatedLabs = sortByDifficulty(
        allLabs.filter(l => l.relatedExamCodes?.some(c => c.toLowerCase() === lc)).slice(0, 4).map(toLabShape)
      )
    }

    return {
      totalQuestions: questions.length,
      domains,
      relatedLabs,
      realWorldValue: exam.realWorldValue ?? null,
      jobRoles: exam.jobRoles ?? [],
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
  server.get('/:examCode/weakest-link', { preHandler: [server.authenticate], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
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


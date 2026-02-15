import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import fs from 'fs/promises'
import { getActiveProductIds } from '../services/entitlements.js'
import { resolveUserTier, TIERS, hasExamAccess } from '../catalog.js'

const dataFile = new URL('../../data/questions.json', import.meta.url)

async function loadDb() {
  const raw = await fs.readFile(dataFile)
  return JSON.parse(raw.toString())
}

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  server.get('/', async (request, reply) => {
    const db = await loadDb()

    // Resolve auth state to filter visitor-only exams
    await server.optionalAuth(request, reply)
    const isAuthenticated = !!request.user

    const filteredExams = db.exams.filter((e: any) => {
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
      defaultQuestions: e.defaultQuestions ?? e.defaultQuestionCount,
      defaultDuration: e.defaultDuration
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
    const db = await loadDb()
    const lc = String(examCode || '').toLowerCase()
    const exam = db.exams.find((e: any) => String(e.code || '').toLowerCase() === lc)
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
    const questions = limit != null ? allQuestions.slice(0, limit) : allQuestions

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
    const db = await loadDb()
    const lc = String(examCode || '').toLowerCase()
    const exam = db.exams.find((e: any) => String(e.code || '').toLowerCase() === lc)
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
}


import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import fs from 'fs/promises'
import { randomUUID } from 'crypto'

const attemptsFile = new URL('../../data/attempts.json', import.meta.url)
const questionsFile = new URL('../../data/questions.json', import.meta.url)

async function loadAttempts() {
  const raw = await fs.readFile(attemptsFile)
  return JSON.parse(raw.toString())
}

async function saveAttempts(obj: any) {
  await fs.writeFile(attemptsFile, JSON.stringify(obj, null, 2))
}

async function loadQuestionsDb() {
  const raw = await fs.readFile(questionsFile)
  return JSON.parse(raw.toString())
}

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  // Start an attempt
  server.post('/', { preHandler: [server.authenticate] }, async (request, reply) => {
    const body = request.body as any
    const examCode = body?.examCode
    if (!examCode) return reply.status(400).send({ message: 'examCode required' })

    const attemptsDb = await loadAttempts()
    const id = randomUUID()
    const now = new Date().toISOString()
    // build per-attempt question set if metadata.filterKeywords provided
    const qdb = await loadQuestionsDb()
    const lc = String(examCode || '').toLowerCase()
    const exam = qdb.exams.find((e: any) => String(e.code || '').toLowerCase() === lc)
    if (!exam) return reply.status(400).send({ message: 'exam not found' })

    let filteredQuestions = exam.questions.slice()
    const keywords: string[] = Array.isArray(body?.metadata?.serviceKeywords)
      ? body.metadata.serviceKeywords.map((k: string) => String(k).trim().toLowerCase()).filter(Boolean)
      : []
    const domains: string[] = Array.isArray(body?.metadata?.domains)
      ? body.metadata.domains.map((d: string) => String(d))
      : []
    const services: string[] = Array.isArray(body?.metadata?.services)
      ? body.metadata.services.map((s: string) => String(s).toLowerCase()).filter(Boolean)
      : []

    // apply service filtering when provided (match question.services array)
    if (services.length > 0) {
      filteredQuestions = filteredQuestions.filter((q: any) => {
        if (!Array.isArray(q.services)) return false
        return q.services.some((s: string) => services.includes(String(s).toLowerCase()))
      })
    }

    // apply keyword filtering when provided (text search in question + choices)
    if (keywords.length > 0) {
      filteredQuestions = filteredQuestions.filter((q: any) => {
        const text = String(q.question || '').toLowerCase()
        if (keywords.some((kw) => text.includes(kw))) return true
        // check choices for any keyword
        if (Array.isArray(q.choices)) {
          for (const c of q.choices) {
            if (keywords.some((kw) => String(c || '').toLowerCase().includes(kw))) return true
          }
        }
        return false
      })
    }

    // apply domain filtering when provided (ignore 'All')
    const domainFilter = domains && domains.length > 0 && !domains.includes('All') ? domains : []
    if (domainFilter.length > 0) {
      filteredQuestions = filteredQuestions.filter((q: any) => domainFilter.includes(q.domain))
    }

    // respect requested numQuestions if provided
    const numQuestionsRequested = typeof body?.numQuestions === 'number' && body.numQuestions > 0 ? body.numQuestions : null
    if (numQuestionsRequested) filteredQuestions = filteredQuestions.slice(0, numQuestionsRequested)

    // If filtering produced no questions, return a clear error (don't create empty attempts)
    if (!filteredQuestions || filteredQuestions.length === 0) {
      return reply.status(400).send({ message: 'No questions match the requested filters (service keywords + domains)' })
    }

    const attempt = {
      attemptId: id,
      userId: request.user?.sub ?? null,
      examCode,
      startedAt: now,
      finishedAt: null,
      score: null,
      answers: [] as any[],
      metadata: body?.metadata ?? null,
      // store the concrete question objects for this attempt so scoring and resume work on the filtered set
      questions: filteredQuestions
    }

    attemptsDb.attempts.push(attempt)
    await saveAttempts(attemptsDb)

    return { attemptId: id, startedAt: now }
  })

  // List all attempts (filtered to current user)
  server.get('/', { preHandler: [server.authenticate] }, async (request, reply) => {
    const attemptsDb = await loadAttempts()
    const userId = request.user?.sub
    const userAttempts = userId
      ? attemptsDb.attempts.filter((a: any) => a.userId === userId)
      : attemptsDb.attempts
    return { attempts: userAttempts }
  })

  // Delete all attempts for current user
  server.delete('/all', { preHandler: [server.authenticate] }, async (request, reply) => {
    const attemptsDb = await loadAttempts()
    const userId = request.user?.sub
    const before = attemptsDb.attempts.length
    attemptsDb.attempts = attemptsDb.attempts.filter((a: any) => a.userId !== userId)
    const count = before - attemptsDb.attempts.length
    await saveAttempts(attemptsDb)
    return { deleted: count }
  })

  // Delete an attempt (only allowed when it has 0 answers, owned by user)
  server.delete('/:id', { preHandler: [server.authenticate] }, async (request, reply) => {
    const { id } = request.params as any
    const attemptsDb = await loadAttempts()
    const idx = attemptsDb.attempts.findIndex((a: any) => a.attemptId === id)
    if (idx < 0) return reply.status(404).send({ message: 'attempt not found' })
    if (attemptsDb.attempts[idx].userId !== request.user?.sub) return reply.status(403).send({ message: 'forbidden' })
    const attempt = attemptsDb.attempts[idx]
    const answersCount = Array.isArray(attempt.answers) ? attempt.answers.length : 0
    if (answersCount > 0) {
      return reply.status(400).send({ message: 'Only attempts with 0 answers can be deleted' })
    }
    attemptsDb.attempts.splice(idx, 1)
    await saveAttempts(attemptsDb)
    return { deleted: true, attemptId: id }
  })

  // Submit an answer for an attempt
  server.post('/:id/answer', { preHandler: [server.authenticate] }, async (request, reply) => {
    const { id } = request.params as any
    const body = request.body as any
    if (!body?.questionId) return reply.status(400).send({ message: 'questionId required' })

    const attemptsDb = await loadAttempts()
    const attempt = attemptsDb.attempts.find((a: any) => a.attemptId === id)
    if (!attempt) return reply.status(404).send({ message: 'attempt not found' })
    if (attempt.userId !== request.user?.sub) return reply.status(403).send({ message: 'forbidden' })
    if (attempt.finishedAt) return reply.status(400).send({ message: 'attempt already finished' })

    // validate question exists in the attempt's question set if present, else fallback to exam questions
    let question = undefined
    if (Array.isArray(attempt.questions) && attempt.questions.length > 0) {
      question = attempt.questions.find((q: any) => q.id === body.questionId)
    }
    if (!question) {
      const qdb = await loadQuestionsDb()
      const exam = qdb.exams.find((e: any) => e.code === attempt.examCode)
      if (!exam) return reply.status(400).send({ message: 'exam not found' })
      question = exam.questions.find((q: any) => q.id === body.questionId)
    }
    if (!question) return reply.status(400).send({ message: 'question not found' })

    const selectedIndex = body.selectedIndex
    const selectedIndices: number[] | null = Array.isArray(body.selectedIndices) ? body.selectedIndices : null
    const timeMs = body.timeMs ?? null
    const showTip = !!body.showTip

    // Multi-select scoring: if question has answerIndices (array), compare sets
    let isCorrect: boolean
    if (Array.isArray(question.answerIndices) && question.answerIndices.length > 0) {
      // multi-select question
      const expected = new Set(question.answerIndices as number[])
      const actual = new Set(selectedIndices ?? (typeof selectedIndex === 'number' ? [selectedIndex] : []))
      isCorrect = expected.size === actual.size && [...expected].every((v) => actual.has(v))
    } else {
      // single-select question
      isCorrect = typeof question.answerIndex === 'number' && question.answerIndex === selectedIndex
    }

    const answerRecord = {
      questionId: question.id,
      selectedIndex: selectedIndex ?? null,
      selectedIndices: selectedIndices ?? null,
      correct: !!isCorrect,
      timeMs,
      showTip,
      createdAt: new Date().toISOString()
    }

    // replace existing answer for same questionId if present
    const existingIndex = attempt.answers.findIndex((a: any) => a.questionId === question.id)
    if (existingIndex >= 0) {
      attempt.answers[existingIndex] = answerRecord
    } else {
      attempt.answers.push(answerRecord)
    }
    await saveAttempts(attemptsDb)

    return { answer: answerRecord, correct: !!isCorrect }
  })

  // Finish attempt and compute score
  server.patch('/:id/finish', { preHandler: [server.authenticate] }, async (request, reply) => {
    const { id } = request.params as any
    const attemptsDb = await loadAttempts()
    const attempt = attemptsDb.attempts.find((a: any) => a.attemptId === id)
    if (!attempt) return reply.status(404).send({ message: 'attempt not found' })
    if (attempt.userId !== request.user?.sub) return reply.status(403).send({ message: 'forbidden' })
    if (attempt.finishedAt) return reply.send({ message: 'already finished', attempt })

    // prefer per-attempt question set when computing totals
    const qSet = Array.isArray(attempt.questions) && attempt.questions.length > 0
      ? attempt.questions
      : (await loadQuestionsDb()).exams.find((e: any) => e.code === attempt.examCode)?.questions ?? []

    const total = qSet.length

    // Build latest answer per question (use createdAt to pick the latest)
    const latestByQ = new Map<number, any>()
    if (Array.isArray(attempt.answers)) {
      for (const ans of attempt.answers) {
        const qid = Number(ans?.questionId)
        if (!Number.isFinite(qid)) continue
        const prev = latestByQ.get(qid)
        const prevT = prev?.createdAt ? String(prev.createdAt) : ''
        const currT = ans?.createdAt ? String(ans.createdAt) : ''
        if (!prev || currT >= prevT) latestByQ.set(qid, ans)
      }
    }

    // Count correct answers from the latest answer per question
    let correctCount = 0
    for (const q of qSet) {
      const ans = latestByQ.get(q.id)
      if (ans && ans.correct) correctCount += 1
    }

    const score = total > 0 ? Math.round((correctCount / total) * 100) : 0

    // compute per-domain breakdown using latest answers
    const perDomain: Record<string, { total: number; correct: number; score: number }> = {}
    for (const q of qSet) {
      const domain = q.domain ?? 'General'
      if (!perDomain[domain]) perDomain[domain] = { total: 0, correct: 0, score: 0 }
      perDomain[domain].total += 1
      const latestAns = latestByQ.get(q.id)
      if (latestAns && latestAns.correct) perDomain[domain].correct += 1
    }
    for (const k of Object.keys(perDomain)) {
      const entry = perDomain[k]
      entry.score = entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : 0
    }

    attempt.finishedAt = new Date().toISOString()
    attempt.score = score
    attempt.perDomain = perDomain

    await saveAttempts(attemptsDb)

    return { attemptId: attempt.attemptId, score, correctCount, total, perDomain }
  })

  // Get attempt (user must own it)
  server.get('/:id', { preHandler: [server.authenticate] }, async (request, reply) => {
    const { id } = request.params as any
    const attemptsDb = await loadAttempts()
    const attempt = attemptsDb.attempts.find((a: any) => a.attemptId === id)
    if (!attempt) return reply.status(404).send({ message: 'attempt not found' })
    if (attempt.userId !== request.user?.sub) return reply.status(403).send({ message: 'forbidden' })
    return attempt
  })

  // List attempts for a user (legacy — redirects to own attempts only)
  server.get('/user/:userId', { preHandler: [server.authenticate] }, async (request, reply) => {
    const attemptsDb = await loadAttempts()
    const userId = request.user?.sub
    const list = attemptsDb.attempts.filter((a: any) => a.userId === userId)
    return { attempts: list }
  })
}

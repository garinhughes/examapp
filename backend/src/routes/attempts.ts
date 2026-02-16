import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import fs from 'fs/promises'
import { randomUUID } from 'crypto'
import { loadExam, shuffleQuestions, normaliseQuestion } from '../examLoader.js'

const attemptsFile = new URL('../../data/attempts.json', import.meta.url)

async function loadAttempts() {
  const raw = await fs.readFile(attemptsFile)
  return JSON.parse(raw.toString())
}

async function saveAttempts(obj: any) {
  await fs.writeFile(attemptsFile, JSON.stringify(obj, null, 2))
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
    const lc = String(examCode || '').toLowerCase()
    const exam = await loadExam(lc)
    if (!exam) return reply.status(400).send({ message: 'exam not found' })

    let filteredQuestions = exam.questions.slice()

    // ── Pre-selected questions (used by weakest-link mode) ──
    // When body.questions is provided (full question objects from the weakest-link
    // endpoint), use them directly. This guarantees the server-side attempt stores
    // exactly the questions the user sees.
    // Fallback: body.questionIds (array of IDs) for backwards compatibility.
    const inlineQuestions: any[] | null = Array.isArray(body?.questions) && body.questions.length > 0
      ? body.questions
      : null
    const questionIds: number[] | null = !inlineQuestions && Array.isArray(body?.questionIds) && body.questionIds.length > 0
      ? body.questionIds.map((id: any) => Number(id)).filter((id: number) => Number.isFinite(id))
      : null

    if (inlineQuestions) {
      // Validate that every supplied question exists in the exam bank
      const validIds = new Set(exam.questions.map((q: any) => q.id))
      filteredQuestions = inlineQuestions.filter((q: any) => validIds.has(q.id))
    } else if (questionIds && questionIds.length > 0) {
      const byId = new Map(exam.questions.map((q: any) => [q.id, q]))
      // preserve the requested order
      filteredQuestions = questionIds.map((id: number) => byId.get(id)).filter(Boolean)
    } else {
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
            const choiceText = typeof c === 'string' ? c : (c?.text ?? '')
            if (keywords.some((kw) => String(choiceText).toLowerCase().includes(kw))) return true
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
    } // end else (non-questionIds path)

    // If filtering produced no questions, return a clear error (don't create empty attempts)
    if (!filteredQuestions || filteredQuestions.length === 0) {
      return reply.status(400).send({ message: 'No questions match the requested filters (service keywords + domains)' })
    }

    // Shuffle choices for this attempt so answer positions vary
    const shuffled = shuffleQuestions(filteredQuestions)

    const attempt = {
      attemptId: id,
      userId: request.user?.sub ?? null,
      examCode,
      // Snapshot the exam version at time of attempt creation so edits to the
      // canonical exam file do not affect scoring/resume for this attempt.
      examVersion: (exam as any)?.version ?? null,
      attemptSchemaVersion: 1,
      startedAt: now,
      finishedAt: null,
      score: null,
      answers: [] as any[],
      metadata: body?.metadata ?? null,
      // store the concrete question objects for this attempt so scoring and resume work on the filtered set
      questions: shuffled
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
    let question: any = undefined
    if (Array.isArray(attempt.questions) && attempt.questions.length > 0) {
      question = attempt.questions.find((q: any) => String(q.id) === String(body.questionId))
    }
    if (!question) {
      const exam = await loadExam(attempt.examCode)
      if (!exam) return reply.status(400).send({ message: 'exam not found' })
      question = exam.questions.find((q: any) => String(q.id) === String(body.questionId))
    }
    if (!question) return reply.status(400).send({ message: 'question not found' })

    const timeMs = body.timeMs ?? null
    const showTip = !!body.showTip

    // --- New format: choices are objects with { id, text, isCorrect } ---
    // Accept selectedChoiceId (string) or selectedChoiceIds (string[]) for multi-select
    const selectedChoiceId: string | null = body.selectedChoiceId ?? null
    const selectedChoiceIds: string[] | null = Array.isArray(body.selectedChoiceIds) ? body.selectedChoiceIds : null

    // Also support legacy selectedIndex / selectedIndices for backwards compat
    const selectedIndex = body.selectedIndex
    const selectedIndices: number[] | null = Array.isArray(body.selectedIndices) ? body.selectedIndices : null

    let isCorrect: boolean
    const choices = question.choices ?? []
    const hasObjectChoices = choices.length > 0 && typeof choices[0] === 'object' && 'isCorrect' in choices[0]

    if (hasObjectChoices) {
      // New format: check isCorrect on the selected choice(s)
      const correctIds = new Set<string>(choices.filter((c: any) => c.isCorrect).map((c: any) => c.id))
      if (selectedChoiceIds && selectedChoiceIds.length > 0) {
        const actual = new Set(selectedChoiceIds)
        isCorrect = correctIds.size === actual.size && [...correctIds].every((v) => actual.has(v))
      } else if (selectedChoiceId) {
        isCorrect = correctIds.size === 1 && correctIds.has(selectedChoiceId)
      } else if (typeof selectedIndex === 'number') {
        // legacy fallback: translate index to choice id
        const choice = choices[selectedIndex]
        isCorrect = !!choice?.isCorrect
      } else if (selectedIndices && selectedIndices.length > 0) {
        const actual = new Set(selectedIndices.map((i: number) => choices[i]?.id).filter(Boolean))
        isCorrect = correctIds.size === actual.size && [...correctIds].every((v) => actual.has(v))
      } else {
        isCorrect = false
      }
    } else {
      // Legacy format: answerIndex / answerIndices
      if (Array.isArray(question.answerIndices) && question.answerIndices.length > 0) {
        const expected = new Set(question.answerIndices as number[])
        const actual = new Set(selectedIndices ?? (typeof selectedIndex === 'number' ? [selectedIndex] : []))
        isCorrect = expected.size === actual.size && [...expected].every((v) => actual.has(v))
      } else {
        isCorrect = typeof question.answerIndex === 'number' && question.answerIndex === selectedIndex
      }
    }

    const answerRecord = {
      questionId: question.id,
      selectedChoiceId: selectedChoiceId ?? null,
      selectedChoiceIds: selectedChoiceIds ?? null,
      // keep legacy fields for backwards compat
      selectedIndex: selectedIndex ?? null,
      selectedIndices: selectedIndices ?? null,
      correct: !!isCorrect,
      timeMs,
      showTip,
      createdAt: new Date().toISOString()
    }

    // replace existing answer for same questionId if present
    const existingIndex = attempt.answers.findIndex((a: any) => String(a.questionId) === String(question.id))
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
      : (await loadExam(attempt.examCode))?.questions ?? []

    const total = qSet.length

    // Build latest answer per question (use createdAt to pick the latest)
    const latestByQ = new Map<string, any>()
    if (Array.isArray(attempt.answers)) {
      for (const ans of attempt.answers) {
        const qid = String(ans?.questionId)
        if (!qid) continue
        const prev = latestByQ.get(qid)
        const prevT = prev?.createdAt ? String(prev.createdAt) : ''
        const currT = ans?.createdAt ? String(ans.createdAt) : ''
        if (!prev || currT >= prevT) latestByQ.set(qid, ans)
      }
    }

    // Count correct answers from the latest answer per question
    let correctCount = 0
    for (const q of qSet) {
      const ans = latestByQ.get(String(q.id))
      if (ans && ans.correct) correctCount += 1
    }

    const score = total > 0 ? Math.round((correctCount / total) * 100) : 0

    // compute per-domain breakdown using latest answers
    const perDomain: Record<string, { total: number; correct: number; score: number }> = {}
    for (const q of qSet) {
      const domain = q.domain ?? q.meta?.domain ?? 'General'
      if (!perDomain[domain]) perDomain[domain] = { total: 0, correct: 0, score: 0 }
      perDomain[domain].total += 1
      const latestAns = latestByQ.get(String(q.id))
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
    // Ensure returned attempt.questions are normalised to the current schema
    try {
      if (Array.isArray(attempt.questions) && attempt.questions.length > 0) {
        attempt.questions = attempt.questions.map((q: any) => normaliseQuestion(q))
      }
    } catch (err) {
      // If normalization fails, return original attempt but log the error
      console.error('Failed to normalise attempt.questions', err)
    }
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

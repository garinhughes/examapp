import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { randomUUID } from 'crypto'
import { loadExam, shuffleQuestions, normaliseQuestion, getDomainBalancedQuestions } from '../examLoader.js'
import { attemptsStore } from '../services/attemptsStore.js'
import { getActiveProductIds } from '../services/entitlements.js'
import { resolveUserTier, TIERS, isPaidTier } from '../catalog.js'
import { updateMetricsOnAttemptFinish } from '../services/metricsStore.js'
import { touchUserActivity } from '../services/dynamo.js'
import { captureWithContext } from '../lib/sentry.js'

/** Extract userId from a JWT-authenticated user or a visitor ID header. */
function extractUserId(request: any): string | null {
  if (request.user?.sub) return request.user.sub
  const vid = request.headers['x-visitor-id']
  if (typeof vid === 'string' && vid.length >= 1 && vid.length <= 256) {
    return `visitor:${vid}`
  }
  return null
}

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  // Start an attempt
  server.post('/', { preHandler: [server.optionalAuth], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = request.body as any
    const examCode = body?.examCode
    if (!examCode) return reply.status(400).send({ message: 'examCode required' })

    const userId = extractUserId(request)
    if (!userId) return reply.status(401).send({ message: 'unauthorized' })

    // Idempotent start: if the user already has an in-progress attempt for this exam, return it.
    // Cross-device resume relies on this — opening "Start Exam" on a second device picks up where they left off.
    // If the user has an in-progress attempt for a DIFFERENT exam, block with 409 so the client can prompt
    // to resume or cancel (belt-and-braces: UI already disables the Setup button in this state).
    if (!userId.startsWith('visitor:')) {
      try {
        const existing = await attemptsStore.listInProgressByUser(userId)
        const match = existing.find((a: any) => a.examCode === examCode)
        if (match) return { attemptId: match.attemptId, startedAt: match.startedAt, resumed: true }
        const other = existing.find((a: any) => a.examCode && a.examCode !== examCode)
        if (other) {
          request.log.info({ userId, requestedExam: examCode, inProgressExam: other.examCode, inProgressAttemptId: other.attemptId }, '[attempts] 409 — blocked new exam start; another is in progress')
          return reply.status(409).send({
            error: 'exam-in-progress',
            message: 'You already have an exam in progress. Resume or cancel it before starting another.',
            attemptId: other.attemptId,
            examCode: other.examCode,
          })
        }
      } catch (err) {
        // GSI may not be populated yet during rollout — don't block attempt creation
        console.warn('[attempts] listInProgressByUser failed, continuing:', err)
        captureWithContext(err, {
          tags: { surface: 'attempt', stage: 'list-in-progress' },
          user: { id: userId },
          extra: { examCode },
        })
      }
    }

    const id = randomUUID()
    const now = new Date().toISOString()
    // build per-attempt question set if metadata.filterKeywords provided
    const lc = String(examCode || '').toLowerCase()
    const exam = await loadExam(lc)
    if (!exam) return reply.status(400).send({ message: 'exam not found' })

    // Resolve tier once — drives both the attempt limit and the source question pool.
    const isAuthenticated = !userId.startsWith('visitor:')
    const ownedProductIds = isAuthenticated ? await getActiveProductIds(userId).catch(() => []) : []
    const tier = resolveUserTier({ isAuthenticated, ownedProductIds, examCode })
    const tierConfig = TIERS[tier]

    // Enforce per-exam attempt limit for authenticated users only (visitors are anonymous)
    if (isAuthenticated && tierConfig.attemptLimit !== null) {
      const userAttempts = await attemptsStore.listByUser(userId)
      const finishedForExam = userAttempts.filter((a: any) => a.examCode === examCode && a.finishedAt)
      if (finishedForExam.length >= tierConfig.attemptLimit) {
        request.log.info({ userId, examCode, tier, limit: tierConfig.attemptLimit, used: finishedForExam.length }, '[attempts] 403 — attempt limit reached')
        return reply.status(403).send({
          error: 'attempt-limit-reached',
          message: `Attempt limit reached. You can save up to ${tierConfig.attemptLimit} attempt${tierConfig.attemptLimit === 1 ? '' : 's'} per exam on your current plan.`,
          limit: tierConfig.attemptLimit,
          tier,
        })
      }
    }

    // Non-paying tiers see only showcase questions. Mirrors /exams/:code/questions and
    // keeps the finished-attempt gate (which strips non-showcase ids) from locking
    // questions the user just answered.
    const sourcePool: any[] = (() => {
      if (isPaidTier(tier)) return exam.questions.slice()
      const showcaseIds: (number | string)[] = Array.isArray((exam as any).showcaseQuestionIds)
        ? (exam as any).showcaseQuestionIds
        : []
      if (showcaseIds.length === 0) return exam.questions.slice()
      const byId = new Map(exam.questions.map((q: any) => [String(q.id), q]))
      return showcaseIds.map((id) => byId.get(String(id))).filter(Boolean) as any[]
    })()

    let filteredQuestions = sourcePool.slice()

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
      // Validate that every supplied question exists in the accessible pool
      const validIds = new Set(sourcePool.map((q: any) => String(q.id)))
      filteredQuestions = inlineQuestions.filter((q: any) => validIds.has(String(q.id)))
    } else if (questionIds && questionIds.length > 0) {
      const byId = new Map(sourcePool.map((q: any) => [String(q.id), q]))
      // preserve the requested order
      filteredQuestions = questionIds.map((id: number) => byId.get(String(id))).filter(Boolean)
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

    // respect requested numQuestions if provided. Use domain-balanced sampling
    // so the sample spreads across all domains rather than taking the first N
    // from file order (which clusters by domain since questions are appended
    // per-skill).
    const numQuestionsRequested = typeof body?.numQuestions === 'number' && body.numQuestions > 0 ? body.numQuestions : null
    if (numQuestionsRequested && filteredQuestions.length > numQuestionsRequested) {
      filteredQuestions = getDomainBalancedQuestions(filteredQuestions, numQuestionsRequested)
    }
    } // end else (non-questionIds path)

    // If filtering produced no questions, return a clear error (don't create empty attempts)
    if (!filteredQuestions || filteredQuestions.length === 0) {
      return reply.status(400).send({ message: 'No questions match the requested filters (service keywords + domains)' })
    }

    // Shuffle choices for this attempt so answer positions vary
    const shuffled = shuffleQuestions(filteredQuestions)

    const attempt = {
      attemptId: id,
      userId,
      examCode,
      // Snapshot the exam version at time of attempt creation so edits to the
      // canonical exam file do not affect scoring/resume for this attempt.
      examVersion: (exam as any)?.version ?? null,
      // Pin the exact S3 object version used for this attempt.  If the exam is
      // republished later, this attempt still references the original snapshot.
      s3VersionId: (exam as any)?.s3VersionId ?? null,
      attemptSchemaVersion: 1,
      startedAt: now,
      updatedAt: now,
      finishedAt: null,
      status: 'in-progress',
      score: null,
      answers: [] as any[],
      metadata: body?.metadata ?? null,
      // store the concrete question objects for this attempt so scoring and resume work on the filtered set
      questions: shuffled
    }

    try {
      await attemptsStore.put(attempt)
    } catch (err: any) {
      // DynamoDB rejects items > 400 KB. With ~1.7 KB/question this caps a single
      // attempt at roughly 230 questions; full-bank runs on long exams trip it.
      const name = err?.name ?? err?.code
      if (name === 'ValidationException' && /item size/i.test(String(err?.message ?? ''))) {
        request.log.warn({ userId, examCode, requested: shuffled.length }, '[attempts] rejected — exceeds DynamoDB item size')
        return reply.status(413).send({
          error: 'too-many-questions',
          message: `Too many questions for a single attempt. Please reduce the question count and try again.`,
          requested: shuffled.length,
        })
      }
      throw err
    }
    request.log.info({ userId, examCode, attemptId: id, questionCount: shuffled.length, mode: body?.metadata?.mode ?? 'standard' }, '[attempts] started')

    return { attemptId: id, startedAt: now }
  })

  // List in-progress attempts for the current user (used by the "Exam in progress" top bar)
  server.get('/in-progress', { preHandler: [server.authenticate], config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    const userId = request.user?.sub
    if (!userId) return { attempts: [] }
    try {
      const items = await attemptsStore.listInProgressByUser(userId)
      const attempts = items.map((a: any) => ({
        attemptId: a.attemptId,
        examCode: a.examCode,
        answeredCount: Array.isArray(a.answers) ? a.answers.length : 0,
        total: Array.isArray(a.questions) ? a.questions.length : (a.numQuestions ?? 0),
        updatedAt: a.updatedAt ?? a.startedAt ?? null,
        examMode: a.examMode ?? null,
        timed: a.timed ?? null,
      }))
      return { attempts }
    } catch (err) {
      console.error('[attempts] /in-progress failed', err)
      captureWithContext(err, {
        tags: { surface: 'attempt', stage: 'in-progress-route' },
        user: { id: userId },
      })
      return reply.status(500).send({ message: 'failed to list in-progress attempts' })
    }
  })

  // Patch UI/progress fields on an in-progress attempt (cross-device resume)
  server.patch('/:id/progress', { preHandler: [server.optionalAuth], config: { rateLimit: { max: 240, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = request.params as any
    const userId = extractUserId(request)
    if (!userId) return reply.status(401).send({ message: 'unauthorized' })
    const attempt = await attemptsStore.get(userId, id)
    if (!attempt) return reply.status(404).send({ message: 'attempt not found' })
    if (attempt.userId !== userId) return reply.status(403).send({ message: 'forbidden' })
    if (attempt.finishedAt) return reply.status(400).send({ message: 'attempt already finished' })

    const body = (request.body as any) ?? {}
    // Whitelisted, typed fields only
    const allowed: Record<string, any> = {}
    if (typeof body.currentIndex === 'number') allowed.currentIndex = body.currentIndex
    if (Array.isArray(body.flags)) allowed.flags = body.flags.map((x: any) => String(x))
    if (typeof body.timeLeft === 'number' || body.timeLeft === null) allowed.timeLeft = body.timeLeft
    if (typeof body.timed === 'boolean') allowed.timed = body.timed
    if (typeof body.durationMinutes === 'number') allowed.durationMinutes = body.durationMinutes
    if (typeof body.numQuestions === 'number') allowed.numQuestions = body.numQuestions
    if (['casual', 'timed', 'weakest-link', 'weakest-link-timed'].includes(body.examMode)) allowed.examMode = body.examMode
    if (['immediately', 'on-completion'].includes(body.revealAnswers)) allowed.revealAnswers = body.revealAnswers
    allowed.updatedAt = new Date().toISOString()
    // Ensure status is set (covers legacy rows written before this field existed)
    if (!attempt.status) allowed.status = 'in-progress'

    await attemptsStore.updateProgress(userId, id, allowed)
    return { updated: true, updatedAt: allowed.updatedAt }
  })

  // List all attempts (filtered to current user). With ?summary=1, returns one row
  // per exam code (last/best/count) — used by the catalogue cards (dev-guide §16 / 15.9).
  server.get('/', { preHandler: [server.authenticate], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request, reply) => {
    const userId = request.user?.sub
    if (!userId) return { attempts: [] }
    const userAttempts = await attemptsStore.listByUser(userId)

    const q = (request.query as any) ?? {}
    if (q.summary === '1' || q.summary === 'true') {
      const byExam = new Map<string, { examCode: string; lastScore: number | null; bestScore: number | null; lastAttemptAt: string | null; attemptCount: number; _scoreSum: number }>()
      for (const a of userAttempts) {
        const code = a?.examCode
        if (!code) continue
        const finishedAt = typeof a.finishedAt === 'string' ? a.finishedAt : null
        const score = typeof a.score === 'number' ? a.score : null
        const cur = byExam.get(code) ?? { examCode: code, lastScore: null, bestScore: null, lastAttemptAt: null, attemptCount: 0, _scoreSum: 0 }
        // Only finished attempts contribute to score/count — abandoned/in-progress noise excluded.
        if (finishedAt) {
          cur.attemptCount += 1
          if (score !== null) {
            cur._scoreSum += score
            if (cur.bestScore === null || score > cur.bestScore) cur.bestScore = score
          }
          if (cur.lastAttemptAt === null || finishedAt > cur.lastAttemptAt) {
            cur.lastAttemptAt = finishedAt
            cur.lastScore = score
          }
        }
        byExam.set(code, cur)
      }
      const summaries = [...byExam.values()]
        .filter((s) => s.attemptCount > 0)
        .map(({ _scoreSum, ...s }) => ({
          ...s,
          avgScore: s.attemptCount > 0 ? Math.round(_scoreSum / s.attemptCount) : null,
        }))
      return { summaries }
    }

    return { attempts: userAttempts }
  })

  // Delete all attempts for current user
  server.delete('/all', { preHandler: [server.authenticate], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request, reply) => {
    const userId = request.user?.sub
    if (!userId) return reply.status(401).send({ message: 'unauthorized' })
    const count = await attemptsStore.deleteAllForUser(userId)
    return { deleted: count }
  })

  // Delete an attempt (owner only). In-progress attempts can always be cancelled;
  // finished attempts may only be deleted when they have 0 answers.
  server.delete('/:id', { preHandler: [server.optionalAuth], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = request.params as any
    const userId = extractUserId(request)
    if (!userId) return reply.status(401).send({ message: 'unauthorized' })
    const attempt = await attemptsStore.get(userId, id)
    if (!attempt) return reply.status(404).send({ message: 'attempt not found' })
    if (attempt.userId !== userId) return reply.status(403).send({ message: 'forbidden' })
    const answersCount = Array.isArray(attempt.answers) ? attempt.answers.length : 0
    if (attempt.finishedAt && answersCount > 0) {
      return reply.status(400).send({ message: 'Only attempts with 0 answers can be deleted' })
    }
    await attemptsStore.delete(userId, id)
    return { deleted: true, attemptId: id }
  })

  // Soft-abandon an in-progress attempt (dev-guide §16 / 15.13).
  // Replaces the user-facing DELETE flow — preserves the row + answers so the
  // signal "user got 30 questions in then quit" survives. DELETE stays for admin/GDPR.
  // Optional `reason` (chips) only collected when the client has 20+ answers (15.15).
  const ABANDON_REASONS = new Set(['too-hard', 'ran-out-of-time', 'changed-my-mind', 'technical-issue', 'prefer-not-to-say'])
  server.post('/:id/abandon', { preHandler: [server.optionalAuth], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = request.params as any
    const userId = extractUserId(request)
    if (!userId) return reply.status(401).send({ message: 'unauthorized' })
    const attempt = await attemptsStore.get(userId, id)
    if (!attempt) return reply.status(404).send({ message: 'attempt not found' })
    if (attempt.userId !== userId) return reply.status(403).send({ message: 'forbidden' })
    if (attempt.finishedAt) return reply.status(400).send({ message: 'attempt already finished' })
    if (attempt.status === 'abandoned') return { abandoned: true, attemptId: id, alreadyAbandoned: true }

    const body = (request.body as any) ?? {}
    const reason = typeof body.reason === 'string' && ABANDON_REASONS.has(body.reason) ? body.reason : null

    const now = new Date().toISOString()
    const fields: Record<string, any> = { status: 'abandoned', abandonedAt: now, updatedAt: now }
    if (reason) fields.abandonReason = reason
    await attemptsStore.updateProgress(userId, id, fields)

    request.log.info({ userId, examCode: attempt.examCode, attemptId: id, reason: reason ?? 'none', answeredCount: Array.isArray(attempt.answers) ? attempt.answers.length : 0 }, '[attempts] abandoned')
    return { abandoned: true, attemptId: id, abandonedAt: now, reason }
  })

  // Submit an answer for an attempt
  server.post('/:id/answer', { preHandler: [server.optionalAuth], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = request.params as any
    const body = request.body as any
    if (!body?.questionId) return reply.status(400).send({ message: 'questionId required' })

    const userId = extractUserId(request)
    if (!userId) return reply.status(401).send({ message: 'unauthorized' })
    const attempt = await attemptsStore.get(userId, id)
    if (!attempt) return reply.status(404).send({ message: 'attempt not found' })
    if (attempt.userId !== userId) return reply.status(403).send({ message: 'forbidden' })
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
    const questionType: string = question.type ?? 'single-choice'

    // --- Accept answer fields per question type ---
    const selectedChoiceId: string | null = body.selectedChoiceId ?? null
    const selectedChoiceIds: string[] | null = Array.isArray(body.selectedChoiceIds) ? body.selectedChoiceIds : null
    // matching: { slotId: choiceId, ... }
    const selectedMappings: Record<string, string> | null =
      body.selectedMappings && typeof body.selectedMappings === 'object' ? body.selectedMappings : null
    // ordering: [choiceId, choiceId, ...]
    const selectedOrder: string[] | null = Array.isArray(body.selectedOrder) ? body.selectedOrder : null

    // Legacy fields
    const selectedIndex = body.selectedIndex
    const selectedIndices: number[] | null = Array.isArray(body.selectedIndices) ? body.selectedIndices : null

    let isCorrect: boolean
    const choices = question.choices ?? []

    if (questionType === 'matching') {
      // Correct when every slot is mapped to its correctChoiceId
      const slots: any[] = question.slots ?? []
      if (!selectedMappings || slots.length === 0) {
        isCorrect = false
      } else {
        isCorrect = slots.every((s: any) => selectedMappings[s.id] === s.correctChoiceId)
      }
    } else if (questionType === 'ordering') {
      // Correct when the submitted order matches the sequence-defined order
      if (!selectedOrder || selectedOrder.length !== choices.length) {
        isCorrect = false
      } else {
        // Build the correct order from sequence field
        const correctOrder = [...choices]
          .filter((c: any) => typeof c.sequence === 'number')
          .sort((a: any, b: any) => a.sequence - b.sequence)
          .map((c: any) => c.id)
        isCorrect = correctOrder.length === selectedOrder.length &&
          correctOrder.every((id: string, idx: number) => id === selectedOrder[idx])
      }
    } else {
      // single-choice / multiple-choice
      const correctIds = new Set<string>(choices.filter((c: any) => c.isCorrect).map((c: any) => c.id))
      if (selectedChoiceIds && selectedChoiceIds.length > 0) {
        const actual = new Set(selectedChoiceIds)
        isCorrect = correctIds.size === actual.size && [...correctIds].every((v) => actual.has(v))
      } else if (selectedChoiceId) {
        isCorrect = correctIds.size === 1 && correctIds.has(selectedChoiceId)
      } else if (typeof selectedIndex === 'number') {
        const choice = choices[selectedIndex]
        isCorrect = !!choice?.isCorrect
      } else if (selectedIndices && selectedIndices.length > 0) {
        const actual = new Set(selectedIndices.map((i: number) => choices[i]?.id).filter(Boolean))
        isCorrect = correctIds.size === actual.size && [...correctIds].every((v) => actual.has(v))
      } else {
        isCorrect = false
      }
    }

    const answerRecord = {
      questionId: question.id,
      selectedChoiceId: selectedChoiceId ?? null,
      selectedChoiceIds: selectedChoiceIds ?? null,
      selectedMappings: selectedMappings ?? null,
      selectedOrder: selectedOrder ?? null,
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
    attempt.updatedAt = new Date().toISOString()
    if (!attempt.status) attempt.status = 'in-progress'
    await attemptsStore.put(attempt)
    void touchUserActivity(userId)

    return { answer: answerRecord, correct: !!isCorrect }
  })

  // Finish attempt and compute score
  server.patch('/:id/finish', { preHandler: [server.optionalAuth], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = request.params as any
    const userId = extractUserId(request)
    if (!userId) return reply.status(401).send({ message: 'unauthorized' })
    const attempt = await attemptsStore.get(userId, id)
    if (!attempt) return reply.status(404).send({ message: 'attempt not found' })
    if (attempt.userId !== userId) return reply.status(403).send({ message: 'forbidden' })
    if (attempt.finishedAt) return reply.send({ message: 'already finished', attempt })

    // Check for early-complete flag from request body
    const body = (request.body as any) ?? {}
    const earlyComplete = !!body.earlyComplete

    // prefer per-attempt question set when computing totals
    const qSet = Array.isArray(attempt.questions) && attempt.questions.length > 0
      ? attempt.questions
      : (await loadExam(attempt.examCode))?.questions ?? []

    const totalQuestions = qSet.length

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

    const answeredCount = latestByQ.size

    // Count correct answers from the latest answer per question
    let correctCount = 0
    for (const q of qSet) {
      const ans = latestByQ.get(String(q.id))
      if (ans && ans.correct) correctCount += 1
    }

    // When completing early, score only the answered questions
    const total = earlyComplete ? answeredCount : totalQuestions
    const score = total > 0 ? Math.round((correctCount / total) * 100) : 0

    // compute per-domain breakdown using latest answers
    const perDomain: Record<string, { total: number; correct: number; score: number }> = {}
    for (const q of qSet) {
      const latestAns = latestByQ.get(String(q.id))
      // When completing early, skip unanswered questions in domain totals
      if (earlyComplete && !latestAns) continue
      const domain = q.domain ?? q.meta?.domain ?? 'General'
      if (!perDomain[domain]) perDomain[domain] = { total: 0, correct: 0, score: 0 }
      perDomain[domain].total += 1
      if (latestAns && latestAns.correct) perDomain[domain].correct += 1
    }
    for (const k of Object.keys(perDomain)) {
      const entry = perDomain[k]
      entry.score = entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : 0
    }

    attempt.finishedAt = new Date().toISOString()
    attempt.updatedAt = attempt.finishedAt
    attempt.status = 'finished'
    attempt.score = score
    attempt.perDomain = perDomain
    if (earlyComplete) {
      attempt.earlyComplete = true
      attempt.answeredCount = answeredCount
      attempt.totalQuestions = totalQuestions
    }

    await attemptsStore.put(attempt)
    void touchUserActivity(userId)
    request.log.info({ userId, examCode: attempt.examCode, attemptId: attempt.attemptId, score, answeredCount, totalQuestions, earlyComplete }, '[attempts] finished')

    // Fire-and-forget metrics aggregation — failures must not break the attempt response
    updateMetricsOnAttemptFinish({
      examCode: attempt.examCode,
      userId: attempt.userId ?? '',
      score,
      perDomain,
      answers: Array.isArray(attempt.answers) ? attempt.answers : [],
      questions: Array.isArray(attempt.questions) ? attempt.questions : [],
      metadata: attempt.metadata as any,
    }).catch((err) => {
      console.error('[metrics] updateMetricsOnAttemptFinish failed', err)
      captureWithContext(err, {
        tags: { surface: 'attempt', stage: 'metrics-update' },
        user: { id: attempt.userId ?? userId },
        extra: { attemptId: attempt.attemptId, examCode: attempt.examCode },
      })
    })

    return { attemptId: attempt.attemptId, score, correctCount, total, totalQuestions, answeredCount, earlyComplete, perDomain }
  })

  // Get attempt (user must own it)
  server.get('/:id', { preHandler: [server.optionalAuth], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { id } = request.params as any
    const userId = extractUserId(request)
    if (!userId) return reply.status(401).send({ message: 'unauthorized' })
    const attempt = await attemptsStore.get(userId, id)
    if (!attempt) return reply.status(404).send({ message: 'attempt not found' })
    if (attempt.userId !== userId) return reply.status(403).send({ message: 'forbidden' })
    // Ensure returned attempt.questions are normalised to the current schema
    let loadedExam: any = null
    try {
      if (Array.isArray(attempt.questions) && attempt.questions.length > 0) {
        // Build a lookup from the live exam so we can backfill fields (like skills)
        // that may be missing from older snapshotted question objects
        let examLookup: Map<string, any> | null = null
        try {
          loadedExam = await loadExam(attempt.examCode)
          if (loadedExam) examLookup = new Map(loadedExam.questions.map((q: any) => [String(q.id), q]))
        } catch { /* ignore */ }
        attempt.questions = attempt.questions.map((q: any) => {
          const normalised = normaliseQuestion(q)
          // Backfill missing fields from live exam (handles legacy snapshots)
          if (examLookup) {
            const live = examLookup.get(String(q.id))
            if (live) {
              if (!normalised.skills && Array.isArray(live.skills)) normalised.skills = live.skills
              if (!normalised.domain && live.domain) normalised.domain = live.domain
            }
          }
          return normalised
        })
      }
    } catch (err) {
      // If normalization fails, return original attempt but log the error
      console.error('Failed to normalise attempt.questions', err)
      captureWithContext(err, {
        tags: { surface: 'attempt', stage: 'normalise' },
        user: { id: userId },
        extra: { attemptId: id, examCode: attempt.examCode },
      })
    }

    return attempt
  })

  // List attempts for a user (legacy — redirects to own attempts only)
  server.get('/user/:userId', { preHandler: [server.authenticate], config: { rateLimit: { max: 100, timeWindow: '1 minute' } } }, async (request, reply) => {
    const userId = request.user?.sub
    if (!userId) return { attempts: [] }
    const list = await attemptsStore.listByUser(userId)
    return { attempts: list }
  })
}

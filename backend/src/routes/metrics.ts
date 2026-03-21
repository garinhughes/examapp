import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { getUserBySub } from '../services/dynamo.js'
import {
  getAllExamMetas,
  queryExamItems,
  queryQuestionItems,
  getAllLabMetas,
  getDailyItems,
} from '../services/metricsStore.js'

// Suggestion thresholds
const THRESHOLD_TOO_HARD = 35      // correctRate % below this → too hard
const THRESHOLD_TOO_EASY = 85      // correctRate % above this → too easy
const THRESHOLD_DOMAIN_WEAK = 45   // domain avgScore % below → weak area
const THRESHOLD_LAB_LOW_PASS = 50  // lab passRate % below → needs revision
const MIN_SAMPLE_QUESTIONS = 15    // minimum answers before flagging a question
const MIN_SAMPLE_DOMAIN = 25       // minimum answers before flagging a domain
const MIN_SAMPLE_LAB = 8           // minimum lab attempts before flagging

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  // Admin-only guard — mirrors admin.ts pattern
  // lgtm[js/missing-rate-limiting] — rate limiting applied per-route via @fastify/rate-limit config
  server.addHook('preHandler', async (request, reply) => {
    await server.authenticate(request, reply)
    const user = await getUserBySub(request.user?.sub ?? '')
    if (!user?.isAdmin) return reply.status(403).send({ message: 'Forbidden' })
  })

  // GET /admin/metrics/overview — global KPIs + 30-day trend
  server.get('/overview', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (_request, _reply) => {
    const [examMetas, labMetas, dailyItems] = await Promise.all([
      getAllExamMetas(),
      getAllLabMetas(),
      getDailyItems(30),
    ])

    let totalAttempts = 0
    let finishedAttempts = 0
    let totalScore = 0
    let passCount = 0

    for (const item of examMetas) {
      totalAttempts += item.totalAttempts ?? 0
      finishedAttempts += item.finishedAttempts ?? 0
      totalScore += item.totalScore ?? 0
      passCount += item.passCount ?? 0
    }

    let labAttempts = 0
    let labPassCount = 0
    for (const item of labMetas) {
      labAttempts += item.totalAttempts ?? 0
      labPassCount += item.passCount ?? 0
    }

    const avgScore = finishedAttempts > 0 ? Math.round(totalScore / finishedAttempts) : 0
    const overallPassRate = finishedAttempts > 0 ? Math.round((passCount / finishedAttempts) * 100) : 0
    const labPassRate = labAttempts > 0 ? Math.round((labPassCount / labAttempts) * 100) : 0

    const dailyTrend = dailyItems.map((d) => ({
      date: d.sk,
      attempts: d.attempts ?? 0,
      finished: d.finishedAttempts ?? 0,
      labAttempts: d.labAttempts ?? 0,
    }))

    const active30d = dailyItems.reduce((sum, d) => sum + (d.attempts ?? 0), 0)

    return {
      totalAttempts,
      finishedAttempts,
      avgScore,
      overallPassRate,
      labAttempts,
      labPassRate,
      active30dAttempts: active30d,
      dailyTrend,
      examCount: examMetas.length,
      labCount: labMetas.length,
    }
  })

  // GET /admin/metrics/exams — per-exam summary with mode breakdown
  server.get('/exams', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (_request, _reply) => {
    const examMetas = await getAllExamMetas()

    const results = await Promise.all(
      examMetas.map(async (meta) => {
        const examCode = meta.pk.replace('EXAM#', '')
        const items = await queryExamItems(examCode)

        const modeBreakdown: Record<string, number> = {}
        for (const item of items) {
          if (item.sk?.startsWith('MODE#')) {
            const mode = item.sk.replace('MODE#', '')
            modeBreakdown[mode] = item.count ?? 0
          }
        }

        const avgScore =
          (meta.finishedAttempts ?? 0) > 0
            ? Math.round((meta.totalScore ?? 0) / meta.finishedAttempts)
            : 0
        const passRate =
          (meta.finishedAttempts ?? 0) > 0
            ? Math.round(((meta.passCount ?? 0) / meta.finishedAttempts) * 100)
            : 0
        const finishRate =
          (meta.totalAttempts ?? 0) > 0
            ? Math.round(((meta.finishedAttempts ?? 0) / meta.totalAttempts) * 100)
            : 0

        return {
          examCode,
          totalAttempts: meta.totalAttempts ?? 0,
          finishedAttempts: meta.finishedAttempts ?? 0,
          finishRate,
          avgScore,
          passRate,
          modeBreakdown,
        }
      })
    )

    return results.sort((a, b) => b.totalAttempts - a.totalAttempts)
  })

  // GET /admin/metrics/exams/:code/questions — per-question stats
  server.get('/exams/:code/questions', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, _reply) => {
    const { code } = request.params as { code: string }
    const items = await queryQuestionItems(code)

    const questions = items.map((item) => {
      const totalAnswered = item.totalAnswered ?? 0
      const correctCount = item.correctCount ?? 0
      const timedAnswers = item.timedAnswers ?? 0
      const totalTimeMs = item.totalTimeMs ?? 0

      const correctRate = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0
      const avgTimeMs = timedAnswers > 0 ? Math.round(totalTimeMs / timedAnswers) : null
      const avgTimeSecs = avgTimeMs !== null ? Math.round(avgTimeMs / 1000) : null

      return {
        questionId: item.sk,
        domain: item.domain ?? 'General',
        totalAnswered,
        correctCount,
        correctRate,
        avgTimeMs,
        avgTimeSecs,
      }
    })

    return questions.sort((a, b) => a.correctRate - b.correctRate)
  })

  // GET /admin/metrics/exams/:code/domains — per-domain breakdown
  server.get('/exams/:code/domains', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, _reply) => {
    const { code } = request.params as { code: string }
    const items = await queryExamItems(code)

    const domains = items
      .filter((item) => item.sk?.startsWith('DOMAIN#'))
      .map((item) => {
        const totalAnswered = item.totalAnswered ?? 0
        const correctCount = item.correctCount ?? 0
        const avgScore = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0
        return {
          domain: item.domain ?? item.sk.replace('DOMAIN#', ''),
          totalAnswered,
          correctCount,
          avgScore,
        }
      })

    return domains.sort((a, b) => a.avgScore - b.avgScore)
  })

  // GET /admin/metrics/labs — per-lab stats
  server.get('/labs', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (_request, _reply) => {
    const labMetas = await getAllLabMetas()

    return labMetas.map((item) => {
      const totalAttempts = item.totalAttempts ?? 0
      const passCount = item.passCount ?? 0
      const totalTimeTaken = item.totalTimeTaken ?? 0

      const passRate = totalAttempts > 0 ? Math.round((passCount / totalAttempts) * 100) : 0
      const avgTimeSecs = totalAttempts > 0 ? Math.round(totalTimeTaken / totalAttempts) : 0

      return {
        labId: item.labId ?? item.pk.replace('LAB#', ''),
        labType: item.labType ?? 'unknown',
        totalAttempts,
        passCount,
        passRate,
        avgTimeSecs,
      }
    }).sort((a, b) => b.totalAttempts - a.totalAttempts)
  })

  // GET /admin/metrics/suggestions — auto-generated content recommendations
  server.get('/suggestions', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, _reply) => {
    const params = request.query as any
    const tooHardThreshold = Number(params.tooHard ?? THRESHOLD_TOO_HARD)
    const tooEasyThreshold = Number(params.tooEasy ?? THRESHOLD_TOO_EASY)
    const domainWeakThreshold = Number(params.domainWeak ?? THRESHOLD_DOMAIN_WEAK)
    const labLowPassThreshold = Number(params.labLowPass ?? THRESHOLD_LAB_LOW_PASS)

    const [examMetas, labMetas] = await Promise.all([getAllExamMetas(), getAllLabMetas()])
    const suggestions: any[] = []

    // Process each exam's questions and domains
    for (const meta of examMetas) {
      const examCode = meta.pk.replace('EXAM#', '')

      const [questionItems, examItems] = await Promise.all([
        queryQuestionItems(examCode),
        queryExamItems(examCode),
      ])

      for (const item of questionItems) {
        const totalAnswered = item.totalAnswered ?? 0
        if (totalAnswered < MIN_SAMPLE_QUESTIONS) continue

        const correctRate = Math.round(((item.correctCount ?? 0) / totalAnswered) * 100)

        if (correctRate < tooHardThreshold) {
          suggestions.push({
            type: 'question_too_hard',
            examCode,
            questionId: item.sk,
            domain: item.domain ?? 'General',
            correctRate,
            sampleSize: totalAnswered,
            message: `Only ${correctRate}% correct (${totalAnswered} answers) — consider revising the explanation or adding simpler scaffolding questions in "${item.domain ?? 'General'}"`,
          })
        } else if (correctRate > tooEasyThreshold) {
          suggestions.push({
            type: 'question_too_easy',
            examCode,
            questionId: item.sk,
            domain: item.domain ?? 'General',
            correctRate,
            sampleSize: totalAnswered,
            message: `${correctRate}% correct (${totalAnswered} answers) — this question may be too easy; consider adding a harder variant in "${item.domain ?? 'General'}"`,
          })
        }
      }

      for (const item of examItems) {
        if (!item.sk?.startsWith('DOMAIN#')) continue
        const totalAnswered = item.totalAnswered ?? 0
        if (totalAnswered < MIN_SAMPLE_DOMAIN) continue

        const avgScore = Math.round(((item.correctCount ?? 0) / totalAnswered) * 100)
        if (avgScore < domainWeakThreshold) {
          suggestions.push({
            type: 'domain_weak',
            examCode,
            domain: item.domain ?? item.sk.replace('DOMAIN#', ''),
            avgScore,
            sampleSize: totalAnswered,
            message: `Average score ${avgScore}% in "${item.domain ?? item.sk.replace('DOMAIN#', '')}" for ${examCode} — learners consistently struggle here; consider expanding content`,
          })
        }
      }
    }

    // Lab suggestions
    for (const item of labMetas) {
      const totalAttempts = item.totalAttempts ?? 0
      if (totalAttempts < MIN_SAMPLE_LAB) continue

      const passRate = Math.round(((item.passCount ?? 0) / totalAttempts) * 100)
      if (passRate < labLowPassThreshold) {
        suggestions.push({
          type: 'lab_low_pass',
          labId: item.labId ?? item.pk.replace('LAB#', ''),
          labType: item.labType ?? 'unknown',
          passRate,
          sampleSize: totalAttempts,
          message: `Only ${passRate}% pass rate on lab "${item.labId ?? item.pk.replace('LAB#', '')}" (${totalAttempts} attempts) — consider revising difficulty or adding hints`,
        })
      }
    }

    // Sort: hardest questions first, then weak domains, then easy questions, then labs
    const order = { question_too_hard: 0, domain_weak: 1, lab_low_pass: 2, question_too_easy: 3 }
    suggestions.sort((a, b) => (order[a.type as keyof typeof order] ?? 9) - (order[b.type as keyof typeof order] ?? 9))

    return { suggestions, thresholds: { tooHard: tooHardThreshold, tooEasy: tooEasyThreshold, domainWeak: domainWeakThreshold, labLowPass: labLowPassThreshold } }
  })
}

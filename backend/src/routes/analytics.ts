import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import fs from 'fs/promises'

const attemptsFile = new URL('../../data/attempts.json', import.meta.url)

async function loadAttempts() {
  const raw = await fs.readFile(attemptsFile)
  return JSON.parse(raw.toString())
}

function computeTotals(attempt: any): { correctCount: number | null; total: number | null; percent: number | null } {
  const total = Array.isArray(attempt?.questions) && attempt.questions.length > 0
    ? attempt.questions.length
    : (attempt?.perDomain && typeof attempt.perDomain === 'object'
      ? Object.values(attempt.perDomain).reduce((s: number, v: any) => s + (Number(v?.total) || 0), 0)
      : null)

  // Robustly compute correct answers (latest answer per questionId wins)
  let correctCount: number | null = null
  if (Array.isArray(attempt?.answers)) {
    const latestByQ = new Map<number, any>()
    for (const ans of attempt.answers) {
      const qid = Number(ans?.questionId)
      if (!Number.isFinite(qid)) continue
      const prev = latestByQ.get(qid)
      const prevT = prev?.createdAt ? String(prev.createdAt) : ''
      const currT = ans?.createdAt ? String(ans.createdAt) : ''
      if (!prev || currT >= prevT) latestByQ.set(qid, ans)
    }
    let c = 0
    for (const v of latestByQ.values()) if (v?.correct) c += 1
    correctCount = c
  }

  let percent: number | null = null
  if (typeof total === 'number' && total > 0 && typeof correctCount === 'number') {
    percent = Math.round((correctCount / total) * 100)
  } else if (attempt?.score !== null && attempt?.score !== undefined) {
    const s = Number(attempt.score)
    percent = Number.isFinite(s) ? Math.max(0, Math.min(100, Math.round(s))) : null
  }

  return { correctCount, total, percent }
}

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  // Return score history and attempts for a given exam code (scoped to current user)
  server.get('/exam/:code/scores', { preHandler: [server.authenticate] }, async (request, reply) => {
    const { code } = request.params as any
    if (!code) return reply.status(400).send({ message: 'exam code required' })
    const attemptsDb = await loadAttempts()
    const lc = String(code || '').toLowerCase()
    const userId = request.user?.sub
    const allAttempts = (attemptsDb.attempts || []).filter(
      (a: any) => String(a.examCode || '').toLowerCase() === lc && a.userId === userId
    )

    // scores: only finished attempts with a finishedAt timestamp
    const scores = allAttempts.filter((a: any) => a.finishedAt).map((a: any) => {
      const { correctCount, total, percent } = computeTotals(a)
      return {
        attemptId: a.attemptId,
        startedAt: a.startedAt,
        finishedAt: a.finishedAt,
        score: percent,
        correctCount,
        total
      }
    }).filter((s: any) => typeof s.score === 'number')

    // sort scores by finishedAt (fallback to startedAt)
    scores.sort((x: any, y: any) => {
      const tx = x.finishedAt || x.startedAt || ''
      const ty = y.finishedAt || y.startedAt || ''
      return tx.localeCompare(ty)
    })

    // attempts: include all attempts for the exam (finished or in-progress)
    const attempts = allAttempts.map((a: any) => {
      const { correctCount, total, percent } = computeTotals(a)
      return {
        attemptId: a.attemptId,
        userId: a.userId ?? null,
        startedAt: a.startedAt,
        finishedAt: a.finishedAt,
        score: percent,
        correctCount,
        total,
        answersCount: Array.isArray(a.answers) ? a.answers.length : 0
      }
    }).sort((x: any, y: any) => {
      const tx = x.finishedAt || x.startedAt || ''
      const ty = y.finishedAt || y.startedAt || ''
      return tx.localeCompare(ty)
    })

    // Aggregate per-domain stats across all finished attempts
    const domainAgg: Record<string, { total: number; correct: number; attempts: number }> = {}
    for (const a of allAttempts) {
      if (!a.finishedAt || !a.perDomain || typeof a.perDomain !== 'object') continue
      for (const [domain, vals] of Object.entries(a.perDomain) as [string, any][]) {
        if (!domainAgg[domain]) domainAgg[domain] = { total: 0, correct: 0, attempts: 0 }
        domainAgg[domain].total += Number(vals?.total) || 0
        domainAgg[domain].correct += Number(vals?.correct) || 0
        domainAgg[domain].attempts += 1
      }
    }
    const domains: Record<string, { total: number; correct: number; avgScore: number; attemptCount: number }> = {}
    for (const [domain, agg] of Object.entries(domainAgg)) {
      domains[domain] = {
        total: agg.total,
        correct: agg.correct,
        avgScore: agg.total > 0 ? Math.round((agg.correct / agg.total) * 100) : 0,
        attemptCount: agg.attempts
      }
    }

    return { scores, attempts, domains }
  })
}

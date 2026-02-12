import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import fs from 'fs/promises'

const dataFile = new URL('../../data/questions.json', import.meta.url)

async function loadDb() {
  const raw = await fs.readFile(dataFile)
  return JSON.parse(raw.toString())
}

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  server.get('/', async () => {
    const db = await loadDb()
    // expose useful exam metadata so frontend can show defaults (question count, duration, provider)
    return db.exams.map((e: any) => ({
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

  server.get('/:examCode/questions', async (request, reply) => {
    const { examCode } = request.params as any
    const db = await loadDb()
    const lc = String(examCode || '').toLowerCase()
    const exam = db.exams.find((e: any) => String(e.code || '').toLowerCase() === lc)
    if (!exam) {
      return reply.status(404).send({ message: 'exam not found' })
    }
    return exam.questions
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


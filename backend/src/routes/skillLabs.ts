import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { skillLabAttemptsStore } from '../services/skillLabAttemptsStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LABS_FILE = path.join(__dirname, '..', '..', 'data', 'skill-labs.json')

async function loadLabs(): Promise<any[]> {
  try {
    const raw = await fs.readFile(LABS_FILE, 'utf-8')
    return JSON.parse(raw)
  } catch (err) {
    console.error('[skill-labs] Failed to load labs data', err)
    return []
  }
}

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  // GET /skill-labs — list available labs (public metadata only)
  server.get('/', async (_request, reply) => {
    const labs = await loadLabs()
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

  // GET /skill-labs/:id — full lab definition
  server.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const labs = await loadLabs()
    const lab = labs.find((l) => l.id === id)
    if (!lab) return reply.status(404).send({ message: 'Lab not found' })
    return reply.send(lab)
  })

  // POST /skill-labs/:id/validate-policy — validate policy-fix lab submission
  server.post('/:id/validate-policy', async (request, reply) => {
    const { id: labId } = request.params as { id: string }
    const labs = await loadLabs()
    const lab = labs.find((l) => l.id === labId)
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
    return reply.status(201).send(attempt)
  })
}

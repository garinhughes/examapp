import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { getUserBySub, updateUserFields, findUserByUsername } from '../services/dynamo.js'
import { validateUsername } from '../services/profanityFilter.js'

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  /**
   * GET /username — get the current user's username
   */
  server.get('/', { preHandler: [server.authenticate] }, async (request, reply) => {
    const userId = request.user?.sub
    if (!userId) return reply.status(401).send({ message: 'unauthorized' })

    const user = await getUserBySub(userId)
    return {
      username: user?.username ?? null,
      updatedAt: user?.usernameUpdatedAt ?? null,
    }
  })

  /**
   * GET /username/check/:name — check availability + validation (no auth required for UX)
   */
  server.get('/check/:name', { preHandler: [server.optionalAuth] }, async (request, reply) => {
    const { name } = request.params as { name: string }

    const validation = validateUsername(name)
    if (!validation.valid) {
      return { available: false, reason: validation.reason }
    }

    const existing = await findUserByUsername(name)
    // If the requesting user already owns this username, it's "available" to them
    const userId = request.user?.sub
    if (existing && existing.userId !== userId) {
      return { available: false, reason: 'That username is already taken.' }
    }

    return { available: true }
  })

  /**
   * PUT /username — claim or change username
   */
  server.put('/', { preHandler: [server.authenticate] }, async (request, reply) => {
    const userId = request.user?.sub
    if (!userId) return reply.status(401).send({ message: 'unauthorized' })

    const body = request.body as any
    const username = typeof body?.username === 'string' ? body.username.trim() : ''

    // Validate format + profanity
    const validation = validateUsername(username)
    if (!validation.valid) {
      return reply.status(400).send({ message: validation.reason })
    }

    // Check uniqueness (case-insensitive)
    const existing = await findUserByUsername(username)
    if (existing && existing.userId !== userId) {
      return reply.status(409).send({ message: 'That username is already taken.' })
    }

    // Save to DynamoDB
    const now = new Date().toISOString()
    await updateUserFields(userId, {
      username,
      usernameLower: username.toLowerCase(),
      usernameUpdatedAt: now,
    })

    return { ok: true, username }
  })
}

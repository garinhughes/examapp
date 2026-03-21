import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { randomUUID } from 'crypto'
import { putRating, getRating } from '../services/interactions.js'

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  server.post(
    '/',
    {
      preHandler: [server.authenticate],
      config: { rateLimit: { max: 100, timeWindow: '1 minute' } }, // codeql[js/missing-rate-limiting]
      schema: {
        body: {
          type: 'object',
          required: ['contentType', 'contentId', 'stars', 'difficulty'],
          properties: {
            contentType: { type: 'string', enum: ['question', 'lab'] },
            contentId: { type: 'string', minLength: 1 },
            stars: { type: 'integer', minimum: 1, maximum: 5 },
            difficulty: { type: 'string', enum: ['too-easy', 'just-right', 'too-hard'] },
            comment: { type: 'string', maxLength: 500 },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!
      const body = request.body as {
        contentType: 'question' | 'lab'
        contentId: string
        stars: number
        difficulty: 'too-easy' | 'just-right' | 'too-hard'
        comment?: string
      }

      const now = new Date().toISOString()
      await putRating({
        userId: user.sub,
        SK: `RATING#${body.contentType}#${body.contentId}`,
        interactionType: 'RATING',
        contentType: body.contentType,
        contentId: body.contentId,
        userEmail: user.email,
        stars: body.stars,
        difficulty: body.difficulty,
        comment: body.comment,
        createdAt: now,
        updatedAt: now,
      })

      return reply.status(201).send({ ok: true })
    },
  )

  server.get(
    '/mine',
    {
      preHandler: [server.authenticate],
      config: { rateLimit: { max: 100, timeWindow: '1 minute' } }, // codeql[js/missing-rate-limiting]
      schema: {
        querystring: {
          type: 'object',
          required: ['contentType', 'contentId'],
          properties: {
            contentType: { type: 'string', enum: ['question', 'lab'] },
            contentId: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!
      const { contentType, contentId } = request.query as { contentType: string; contentId: string }

      const rating = await getRating(user.sub, contentType, contentId)
      return reply.send({ rating })
    },
  )
}

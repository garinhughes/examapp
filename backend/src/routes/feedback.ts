import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { sendGeneralFeedbackEmail } from '../services/ses.js'

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  server.post(
    '/',
    {
      preHandler: [server.authenticate],
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
      schema: {
        body: {
          type: 'object',
          required: ['message'],
          properties: {
            category: { type: 'string', maxLength: 100 },
            message: { type: 'string', minLength: 1, maxLength: 2000 },
          },
        },
      },
    },
    async (request, reply) => {
      const user = request.user!
      const { category, message } = request.body as { category?: string; message: string }

      try {
        await sendGeneralFeedbackEmail({
          senderName: user.name ?? user.email,
          senderEmail: user.email,
          category,
          message,
        })
      } catch (err) {
        request.log.error({ err }, 'SES send failed for general feedback')
        return reply.status(502).send({ message: 'Failed to send feedback. Please try again.' })
      }

      return reply.status(201).send({ ok: true })
    },
  )
}

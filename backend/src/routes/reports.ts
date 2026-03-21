import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { randomUUID } from 'crypto'
import { sendIssueReportEmail } from '../services/ses.js'
import { putIssueReport } from '../services/dynamo.js'

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  server.post(
    '/',
    {
      preHandler: [server.authenticate, server.resolveEntitlements],
      config: { rateLimit: { max: 100, timeWindow: '1 minute' } }, // codeql[js/missing-rate-limiting]
      schema: {
        body: {
          type: 'object',
          required: ['contentType', 'contentId', 'description'],
          properties: {
            contentType: { type: 'string', enum: ['question', 'answer', 'explanation', 'lab'] },
            contentId: { type: 'string', minLength: 1 },
            examCode: { type: 'string' },
            issueType: { type: 'string', minLength: 1 },
            description: { type: 'string', minLength: 10, maxLength: 2000 },
          },
        },
      },
    },
    async (request, reply) => {
      if (request.entitlements.length === 0) {
        return reply.status(403).send({ message: 'Issue reporting requires a paid plan.' })
      }

      const user = request.user!
      const body = request.body as {
        contentType: 'question' | 'answer' | 'explanation' | 'lab'
        contentId: string
        examCode?: string
        issueType?: string
        description: string
      }

      try {
        await sendIssueReportEmail({
          reporterName: user.name ?? user.email,
          reporterEmail: user.email,
          contentType: body.contentType,
          contentId: body.contentId,
          examCode: body.examCode,
          issueType: body.issueType,
          description: body.description,
        })
      } catch (err) {
        request.log.error({ err }, 'SES send failed')
        return reply.status(502).send({ message: 'Failed to send report. Please try again.' })
      }

      await putIssueReport({
        reportId: randomUUID(),
        userId: user.sub,
        reporterEmail: user.email,
        reporterName: user.name ?? user.email,
        createdAt: new Date().toISOString(),
        status: 'open',
        contentType: body.contentType,
        contentId: body.contentId,
        examCode: body.examCode,
        issueType: body.issueType,
        description: body.description,
      })

      return reply.status(201).send({ ok: true })
    },
  )
}

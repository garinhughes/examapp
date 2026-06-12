import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { sendExamRequestEmail } from '../services/ses.js'

const BOT_UA = /bot|spider|crawler|crawling|headless|preview|fetch|curl|wget|python-requests|scrapy|http-client|node-fetch|axios|slurp|facebookexternalhit|whatsapp|telegrambot/i

function looksLikeBot(ua: string | undefined): boolean {
  if (!ua) return true
  return BOT_UA.test(ua)
}

function originMatches(origin: string | undefined, allowed: string): boolean {
  if (!origin) return false
  try {
    return new URL(origin).host === new URL(allowed).host
  } catch {
    return false
  }
}

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  server.post(
    '/',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
      schema: {
        body: {
          type: 'object',
          required: ['email', 'exam'],
          properties: {
            email: { type: 'string', format: 'email', maxLength: 254 },
            exam: { type: 'string', minLength: 1, maxLength: 500 },
            usage: { type: 'string', enum: ['light', 'heavy'] },
            // Honeypot: real users never fill this. Name chosen so browser autofill
            // and password managers don't recognise it. Silently dropped if set.
            exam_ref_code: { type: 'string', maxLength: 500 },
          },
        },
      },
    },
    async (request, reply) => {
      const ua = request.headers['user-agent']
      if (looksLikeBot(typeof ua === 'string' ? ua : undefined)) {
        // Silently 201 so bots can't distinguish a block from a success.
        return reply.status(201).send({ ok: true })
      }

      const allowedOrigin = process.env.FRONTEND_ORIGIN ?? 'https://certshack.com'
      const origin = request.headers.origin
      if (!originMatches(typeof origin === 'string' ? origin : undefined, allowedOrigin)) {
        return reply.status(201).send({ ok: true })
      }

      const { email, exam, usage, exam_ref_code } = request.body as {
        email: string
        exam: string
        usage?: 'light' | 'heavy'
        exam_ref_code?: string
      }

      // Honeypot tripped — fake success.
      if (exam_ref_code && exam_ref_code.trim().length > 0) {
        request.log.info({ ip: request.ip }, 'exam-request honeypot tripped')
        return reply.status(201).send({ ok: true })
      }

      try {
        await sendExamRequestEmail({ requesterEmail: email, examText: exam, usage })
      } catch (err) {
        request.log.error({ err }, 'SES send failed for exam request')
        return reply.status(502).send({ message: 'Failed to send request. Please try again.' })
      }

      return reply.status(201).send({ ok: true })
    },
  )
}

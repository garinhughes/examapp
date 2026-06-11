import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { recordEvent, EventType, EventPayload } from '../services/metricsStore.js'

const ALLOWED_TYPES: ReadonlySet<EventType> = new Set([
  'page_view',
  'exam_start',
  'lab_start',
  'exam_abandon',
  'signup_start',
  'pricing_view',
  'upgrade_click',
])

const BOT_UA = /bot|spider|crawler|crawling|headless|preview|fetch|curl|wget|python-requests|scrapy|http-client|node-fetch|axios|slurp|facebookexternalhit|whatsapp|telegrambot/i

function looksLikeBot(ua: string | undefined): boolean {
  if (!ua) return true
  return BOT_UA.test(ua)
}

function originMatches(origin: string | undefined, allowed: string): boolean {
  if (!origin) return false
  try {
    const o = new URL(origin).host
    const a = new URL(allowed).host
    return o === a
  } catch {
    return false
  }
}

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  server.post(
    '/track',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const ua = request.headers['user-agent']
      if (looksLikeBot(typeof ua === 'string' ? ua : undefined)) {
        return reply.status(204).send()
      }

      const allowedOrigin = process.env.FRONTEND_ORIGIN ?? 'https://certshack.com'
      const origin = request.headers.origin
      if (!originMatches(typeof origin === 'string' ? origin : undefined, allowedOrigin)) {
        return reply.status(204).send()
      }

      const body = (request.body ?? {}) as { type?: string; payload?: EventPayload }
      const type = body.type as EventType | undefined
      if (!type || !ALLOWED_TYPES.has(type)) {
        return reply.status(400).send({ error: 'Invalid event type' })
      }

      const raw = (body.payload ?? {}) as EventPayload
      const payload: EventPayload = {
        examCode: typeof raw.examCode === 'string' ? raw.examCode.slice(0, 32) : undefined,
        labId: typeof raw.labId === 'string' ? raw.labId.slice(0, 64) : undefined,
        labType: typeof raw.labType === 'string' ? raw.labType.slice(0, 32) : undefined,
        mode: typeof raw.mode === 'string' ? raw.mode.slice(0, 32) : undefined,
        surface: raw.surface === 'labs' || raw.surface === 'pricing' ? raw.surface : raw.surface === 'exams' ? 'exams' : undefined,
        referrerHost: typeof raw.referrerHost === 'string' ? raw.referrerHost.slice(0, 64).toLowerCase() : undefined,
        isNew: raw.isNew === true,
        lastQuestionIndex: typeof raw.lastQuestionIndex === 'number' ? raw.lastQuestionIndex : undefined,
        totalQuestions: typeof raw.totalQuestions === 'number' ? raw.totalQuestions : undefined,
        cta: typeof raw.cta === 'string' ? raw.cta.slice(0, 32) : undefined,
      }

      recordEvent(type, payload).catch((err) => {
        server.log.error({ err, type }, '[events] recordEvent failed')
      })

      return reply.status(204).send()
    },
  )
}

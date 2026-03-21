import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { SignJWT, jwtVerify } from 'jose'
import { createSecretKey, createHash } from 'crypto'

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  /**
   * POST /certificates/token — generate a signed certificate token
   * Auth + paying tier required.
   */
  server.post(
    '/token',
    {
      preHandler: [server.authenticate, server.resolveEntitlements],
    },
    async (request, reply) => {
      if (request.tier !== 'paying') {
        return reply.status(403).send({ message: 'Certificates require a paid plan.' })
      }

      const secret = process.env.CERTIFICATE_SECRET
      if (!secret) {
        request.log.error('CERTIFICATE_SECRET env var is not set')
        return reply.status(503).send({ message: 'Certificate signing is unavailable.' })
      }

      const body = request.body as {
        displayName: string
        includeExams: boolean
        selectedExamCodes: string[] | null
        includeBestScores: boolean
        includeLabs: boolean
        includeProviderGrouping: boolean
        passedExams: Record<string, { examCode: string; provider: string; bestScore: number }>
        labsCompleted: number
      }

      // Filter passedExams to selectedExamCodes if provided
      let filteredExams = body.passedExams
      if (body.selectedExamCodes && body.selectedExamCodes.length > 0) {
        const allowed = new Set(body.selectedExamCodes)
        filteredExams = Object.fromEntries(
          Object.entries(body.passedExams).filter(([code]) => allowed.has(code))
        )
      }

      const secretKey = createSecretKey(Buffer.from(secret, 'utf-8'))
      const issuedAt = new Date().toISOString()

      const token = await new SignJWT({
        displayName: body.displayName,
        includeExams: body.includeExams,
        includeBestScores: body.includeBestScores,
        includeLabs: body.includeLabs,
        includeProviderGrouping: body.includeProviderGrouping,
        passedExams: filteredExams,
        labsCompleted: body.labsCompleted,
        issuedAt,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('10y')
        .sign(secretKey)

      // Derive certId from SHA-256 hash of the token
      const hash = createHash('sha256').update(token).digest('hex')
      const certId = 'CS-' + hash.slice(0, 8).toUpperCase()

      return { token, certId, issuedAt }
    }
  )

  /**
   * GET /certificates/verify/:token — public verification endpoint
   * No auth required.
   */
  server.get('/verify/:token', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const secret = process.env.CERTIFICATE_SECRET
    if (!secret) {
      return reply.status(503).send({ valid: false, message: 'Verification is unavailable.' })
    }

    const { token } = request.params as { token: string }
    const secretKey = createSecretKey(Buffer.from(secret, 'utf-8'))

    try {
      const { payload } = await jwtVerify(token, secretKey)
      return { valid: true, certificate: payload }
    } catch {
      return reply.status(400).send({ valid: false, message: 'Invalid or expired certificate token.' })
    }
  })
}

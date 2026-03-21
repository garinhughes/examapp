import 'dotenv/config'
// Ensure Node's WebCrypto is available as `globalThis.crypto` for libraries
// like `jose` that expect the Web Crypto API.
import { webcrypto as nodeWebcrypto } from 'crypto'
if (!(globalThis as any).crypto) {
  ;(globalThis as any).crypto = nodeWebcrypto
}

import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import cookie from '@fastify/cookie'
import authPlugin from './plugins/auth.js'
import entitlementPlugin from './plugins/entitlements.js'
import authRoutes from './routes/auth.js'
import examsRoutes from './routes/exams.js'
import attemptsRoutes from './routes/attempts.js'
import analyticsRoutes from './routes/analytics.js'
import gamificationRoutes from './routes/gamification.js'
import adminRoutes from './routes/admin.js'
import metricsRoutes from './routes/metrics.js'
import pricingRoutes from './routes/pricing.js'
import goCardlessRoutes from './routes/gocardless.js'
import paypalRoutes from './routes/paypal.js'
import usernameRoutes from './routes/username.js'
import skillLabsRoutes from './routes/skillLabs.js'
import reportsRoutes from './routes/reports.js'
import ratingsRoutes from './routes/ratings.js'
import certificatesRoutes from './routes/certificates.js'
import pollsRoutes from './routes/polls.js'

const server = Fastify({ logger: true })

// Capture raw body string so the GoCardless webhook handler can verify the
// HMAC-SHA256 signature over the exact bytes GoCardless signed.
server.addContentTypeParser('application/json', { parseAs: 'string' }, function (_req, body, done) {
  ;(_req as any).rawBody = body
  try {
    done(null, JSON.parse(body as string))
  } catch (err: any) {
    err.statusCode = 400
    done(err, undefined)
  }
})

await server.register(cors, {
  origin: process.env.FRONTEND_ORIGIN ?? 'https://certshack.com',
  credentials: true,
})

await server.register(rateLimit, {
  global: true,
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip,
})

await server.register(cookie)

// Origin-verify: reject requests that don't carry the CloudFront shared secret.
// No-op when ORIGIN_VERIFY_SECRET is not set (dev / local).
const ORIGIN_VERIFY_SECRET = process.env.ORIGIN_VERIFY_SECRET
if (ORIGIN_VERIFY_SECRET) {
  server.addHook('onRequest', async (request, reply) => {
    if (request.headers['x-origin-verify'] !== ORIGIN_VERIFY_SECRET) {
      return reply.status(403).send({ message: 'Forbidden' })
    }
  })
}

// Auth plugin — decorates request.user + server.authenticate / server.optionalAuth
await server.register(authPlugin)

// Entitlement plugin — decorates request.tier, request.tierConfig, request.entitlements
// Must be registered before any routes that use server.resolveEntitlements
await server.register(entitlementPlugin)

// Auth routes (public: /auth/config, protected: /auth/me)
await server.register(authRoutes, { prefix: '/auth' })

// Pricing & GoCardless (scaffolded)
await server.register(pricingRoutes, { prefix: '/pricing' })
await server.register(goCardlessRoutes, { prefix: '/payments' })
await server.register(paypalRoutes, { prefix: '/payments/paypal' })

// App routes
await server.register(examsRoutes, { prefix: '/exams' })
await server.register(attemptsRoutes, { prefix: '/attempts' })
await server.register(analyticsRoutes, { prefix: '/analytics' })
await server.register(gamificationRoutes, { prefix: '/gamification' })
// Username routes
await server.register(usernameRoutes, { prefix: '/username' })
// Admin routes
await server.register(adminRoutes, { prefix: '/admin' })
// Admin metrics routes
await server.register(metricsRoutes, { prefix: '/admin/metrics' })
// Skill Labs routes
await server.register(skillLabsRoutes, { prefix: '/skill-labs' })
// Issue reports
await server.register(reportsRoutes, { prefix: '/reports' })
// Ratings
await server.register(ratingsRoutes, { prefix: '/ratings' })
// Certificates
await server.register(certificatesRoutes, { prefix: '/certificates' })
// Polls
await server.register(pollsRoutes, { prefix: '/polls' })

// Health check for ALB
server.get('/health', async () => ({ status: 'ok' }))

const port = Number(process.env.PORT) || 3000

try {
  await server.listen({ port, host: '0.0.0.0' })
} catch (err) {
  server.log.error(err)
  process.exit(1)
}

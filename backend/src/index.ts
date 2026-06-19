import 'dotenv/config'
import * as Sentry from '@sentry/node'

// Cognito user-error names — these are normal user actions (wrong password,
// unconfirmed account, etc.), not bugs. Drop them so we don't burn quota.
const COGNITO_USER_ERRORS = new Set([
  'NotAuthorizedException',
  'UserNotConfirmedException',
  'UserNotFoundException',
  'CodeMismatchException',
  'ExpiredCodeException',
  'UsernameExistsException',
  'InvalidPasswordException',
  'InvalidParameterException',
  'LimitExceededException',
  'TooManyRequestsException',
  'TooManyFailedAttemptsException',
])

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'production',
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event, hint) {
      const err: any = hint?.originalException
      if (err) {
        // Drop client errors — Fastify validation, 401/403/404, rate-limit 429.
        const status = err.statusCode ?? err.status
        if (typeof status === 'number' && status >= 400 && status < 500) return null
        // Drop expected Cognito user errors
        const name = err.name || err.code || err.__type
        if (typeof name === 'string') {
          const bare = name.split('#').pop() as string
          if (COGNITO_USER_ERRORS.has(bare)) return null
          if (bare === 'AbortError') return null
        }
        // Drop Stripe webhook signature failures (replay attempts / scanners)
        if (typeof err.message === 'string' && /signature verification failed/i.test(err.message)) {
          return null
        }
      }
      return event
    },
  })
}

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
import stripeRoutes from './routes/stripe.js'
import paypalRoutes from './routes/paypal.js'
import usernameRoutes from './routes/username.js'
import skillLabsRoutes from './routes/skillLabs.js'
import reportsRoutes from './routes/reports.js'
import ratingsRoutes from './routes/ratings.js'
import certificatesRoutes from './routes/certificates.js'
import pollsRoutes from './routes/polls.js'
import imagesRoutes from './routes/images.js'
import cronRoutes from './routes/cron.js'
import unsubscribeRoutes from './routes/unsubscribe.js'
import feedbackRoutes from './routes/feedback.js'
import examRequestsRoutes from './routes/examRequests.js'
import eventsRoutes from './routes/events.js'

const server = Fastify({ logger: true, trustProxy: true })

if (process.env.SENTRY_DSN) {
  Sentry.setupFastifyErrorHandler(server)
}

// Reject requests that didn't come through CloudFront (which injects this header).
// Exempt /health so the ALB health checker (no CloudFront header) still works.
server.addHook('onRequest', async (req, reply) => {
  const secret = process.env.ORIGIN_VERIFY_SECRET
  if (!secret) return
  if (req.url === '/health' || req.url.startsWith('/health?')) return
  if (req.headers['x-origin-verify'] !== secret) {
    // Log enough to distinguish a CloudFront propagation gap (header absent on a
    // POP that hasn't picked up the custom-header config) from a direct-to-ALB
    // request (stale DNS / corporate proxy / scanner bypassing CloudFront).
    req.log.warn({
      msg: 'origin-verify rejected',
      url: req.url,
      method: req.method,
      ip: req.ip,
      headerPresent: req.headers['x-origin-verify'] !== undefined,
      ua: req.headers['user-agent'],
      via: req.headers['via'],
      xff: req.headers['x-forwarded-for'],
    })
    return reply.code(403).send({ error: 'Forbidden' })
  }
})

// Per-request scope: tag route + set user (when auth resolves) so any error
// captured during the request carries useful context.
server.addHook('onRequest', async (req) => {
  if (!process.env.SENTRY_DSN) return
  Sentry.getCurrentScope().setTag('route', (req.routeOptions as any)?.url ?? req.url)
  Sentry.getCurrentScope().setContext('request', {
    id: req.id,
    method: req.method,
    ip: req.ip,
  })
})

server.addHook('preHandler', async (req) => {
  if (!process.env.SENTRY_DSN) return
  if (req.user?.sub) {
    Sentry.getCurrentScope().setUser({ id: req.user.sub })
  }
})

// Capture raw body string so webhook handlers (Stripe, PayPal) can verify
// HMAC-SHA256 signatures over the exact bytes the provider signed.
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

if (process.env.RATE_LIMIT_DISABLED !== 'true') {
  await server.register(rateLimit, {
    global: true,
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '120'),
    timeWindow: '1 minute',
    // Use the authenticated user's sub as the rate-limit key so each user
    // gets their own budget regardless of shared NAT / corporate egress.
    // JWT is decoded without verification intentionally — sub is only a
    // bucket key here, not used for access control. Falls back to IP for
    // anonymous/unauthenticated requests (e.g. exam browsing, auth routes).
    keyGenerator: (req) => {
      const auth = (req.headers as any).authorization
      if (auth?.startsWith('Bearer ')) {
        try {
          const payload = JSON.parse(
            Buffer.from(auth.slice(7).split('.')[1], 'base64url').toString()
          )
          if (typeof payload.sub === 'string') return payload.sub
        } catch { /* fall through to IP */ }
      }
      return req.ip
    },
  })
}

await server.register(cookie)

// Auth plugin — decorates request.user + server.authenticate / server.optionalAuth
await server.register(authPlugin)

// Entitlement plugin — decorates request.tier, request.tierConfig, request.entitlements
// Must be registered before any routes that use server.resolveEntitlements
await server.register(entitlementPlugin)

// Auth routes (public: /auth/config, protected: /auth/me)
await server.register(authRoutes, { prefix: '/auth' })

// Pricing & payments
await server.register(pricingRoutes, { prefix: '/pricing' })
await server.register(stripeRoutes, { prefix: '/payments' })
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
// General user feedback
await server.register(feedbackRoutes, { prefix: '/feedback' })
// Public exam-request form
await server.register(examRequestsRoutes, { prefix: '/exam-requests' })
// Ratings
await server.register(ratingsRoutes, { prefix: '/ratings' })
// Certificates
await server.register(certificatesRoutes, { prefix: '/certificates' })
// Polls
await server.register(pollsRoutes, { prefix: '/polls' })
// Images — presigned S3 URLs for question diagrams
await server.register(imagesRoutes, { prefix: '/images' })
// Internal cron — expiry reminders (EventBridge calls daily)
await server.register(cronRoutes, { prefix: '/internal/cron' })
// Public one-click unsubscribe
await server.register(unsubscribeRoutes, { prefix: '/unsubscribe' })
// Public event tracking (page views, funnel events) — bot-filtered, no auth
await server.register(eventsRoutes, { prefix: '/events' })

// Sentry.setupFastifyErrorHandler (above) already captures unhandled errors
// with full request context. This handler only owns the wire response shape;
// beforeSend filters out 4xx so we don't need to re-check statusCode here.
server.setErrorHandler((err, _req, reply) => {
  reply.status(err.statusCode ?? 500).send({ error: err.message })
})

// Health check for ALB
server.get('/health', async () => ({ status: 'ok' }))

// Disallow all bots from crawling the API subdomain
server.get('/robots.txt', async (_req, reply) => {
  reply.type('text/plain').send('User-agent: *\nDisallow: /\n')
})

// Root route — 200 instead of 404, noindex so Google doesn't index it
server.get('/', async (_req, reply) => {
  reply.header('X-Robots-Tag', 'noindex, nofollow').send({ name: 'certshack-api' })
})

const port = Number(process.env.PORT) || 3000

try {
  await server.listen({ port, host: '0.0.0.0' })
} catch (err) {
  server.log.error(err)
  process.exit(1)
}

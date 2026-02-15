import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import authPlugin from './plugins/auth.js'
import entitlementPlugin from './plugins/entitlements.js'
import authRoutes from './routes/auth.js'
import examsRoutes from './routes/exams.js'
import attemptsRoutes from './routes/attempts.js'
import analyticsRoutes from './routes/analytics.js'
import gamificationRoutes from './routes/gamification.js'
import adminRoutes from './routes/admin.js'
import pricingRoutes from './routes/pricing.js'
import stripeRoutes from './routes/stripe.js'

const server = Fastify({ logger: true })

await server.register(cors, { origin: '*' })

// Auth plugin — decorates request.user + server.authenticate / server.optionalAuth
await server.register(authPlugin)

// Auth routes (public: /auth/config, protected: /auth/me)
await server.register(authRoutes, { prefix: '/auth' })

// Entitlement plugin — decorates request.tier, request.tierConfig, request.entitlements
await server.register(entitlementPlugin)

// Pricing & Stripe (scaffolded)
await server.register(pricingRoutes, { prefix: '/pricing' })
await server.register(stripeRoutes, { prefix: '/stripe' })

// App routes
await server.register(examsRoutes, { prefix: '/exams' })
await server.register(attemptsRoutes, { prefix: '/attempts' })
await server.register(analyticsRoutes, { prefix: '/analytics' })
await server.register(gamificationRoutes, { prefix: '/gamification' })
// Admin routes
await server.register(adminRoutes, { prefix: '/admin' })

const port = Number(process.env.PORT) || 3000

try {
  await server.listen({ port, host: '0.0.0.0' })
} catch (err) {
  server.log.error(err)
  process.exit(1)
}

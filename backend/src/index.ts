import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import authPlugin from './plugins/auth.js'
import authRoutes from './routes/auth.js'
import examsRoutes from './routes/exams.js'
import attemptsRoutes from './routes/attempts.js'
import analyticsRoutes from './routes/analytics.js'
import gamificationRoutes from './routes/gamification.js'

const server = Fastify({ logger: true })

await server.register(cors, { origin: '*' })

// Auth plugin — decorates request.user + server.authenticate / server.optionalAuth
await server.register(authPlugin)

// Auth routes (public: /auth/config, protected: /auth/me)
await server.register(authRoutes, { prefix: '/auth' })

// App routes
await server.register(examsRoutes, { prefix: '/exams' })
await server.register(attemptsRoutes, { prefix: '/attempts' })
await server.register(analyticsRoutes, { prefix: '/analytics' })
await server.register(gamificationRoutes, { prefix: '/gamification' })

const port = Number(process.env.PORT) || 3000

try {
  await server.listen({ port, host: '0.0.0.0' })
} catch (err) {
  server.log.error(err)
  process.exit(1)
}

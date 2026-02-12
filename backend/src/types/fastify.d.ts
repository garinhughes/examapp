import 'fastify'

declare module 'fastify' {
  interface FastifyRequest {
    user: { sub: string; email: string; name: string } | null
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    optionalAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

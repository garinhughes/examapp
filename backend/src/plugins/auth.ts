/**
 * Auth plugin for Fastify.
 *
 * Supports two modes controlled by AUTH_MODE env var:
 *   - 'dev'     : injects a mock user from env vars (no real auth needed)
 *   - 'cognito' : verifies AWS Cognito JWT access tokens via JWKS
 *
 * After registration the plugin decorates:
 *   request.user  — { sub: string; email: string; name?: string } | null
 *   server.authenticate — preHandler hook that rejects unauthenticated requests
 *   server.optionalAuth — preHandler hook that attaches user if token present but doesn't reject
 */

import fp from 'fastify-plugin'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import jwksRsa from 'jwks-rsa'

// ——— Types ———

export interface AuthUser {
  sub: string
  email: string
  name?: string
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    optionalAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

// ——— Helpers ———

const AUTH_MODE = process.env.AUTH_MODE || 'dev'

// Cognito JWKS client (lazily created)
let jwksClient: jwksRsa.JwksClient | null = null

function getJwksClient(): jwksRsa.JwksClient {
  if (jwksClient) return jwksClient
  const region = process.env.COGNITO_REGION
  const poolId = process.env.COGNITO_USER_POOL_ID
  if (!region || !poolId) throw new Error('COGNITO_REGION and COGNITO_USER_POOL_ID are required when AUTH_MODE=cognito')
  jwksClient = jwksRsa({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 10,
    jwksUri: `https://cognito-idp.${region}.amazonaws.com/${poolId}/.well-known/jwks.json`
  })
  return jwksClient
}

/** Decode a JWT without verification (just parse header + payload) */
function decodeJwt(token: string) {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('invalid JWT')
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
  return { header, payload }
}

/** Verify a Cognito JWT using JWKS */
async function verifyCognitoToken(token: string): Promise<AuthUser> {
  // dynamic import jose (ESM)
  const { importJWK, jwtVerify } = await import('jose')

  const { header } = decodeJwt(token)
  const kid = header.kid as string
  if (!kid) throw new Error('JWT missing kid')

  const client = getJwksClient()
  const key = await client.getSigningKey(kid)
  const pubKey = key.getPublicKey()

  const region = process.env.COGNITO_REGION!
  const poolId = process.env.COGNITO_USER_POOL_ID!
  const clientId = process.env.COGNITO_APP_CLIENT_ID!
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${poolId}`

  // jose needs a CryptoKey — import the PEM
  const cryptoKey = await importJWK(
    JSON.parse(JSON.stringify(key)),
    header.alg || 'RS256'
  ).catch(() => {
    // fallback: use createPublicKey
    const { createPublicKey } = require('crypto')
    return createPublicKey(pubKey)
  })

  const { payload } = await jwtVerify(token, cryptoKey as any, {
    issuer,
    audience: clientId,
    algorithms: ['RS256']
  })

  return {
    sub: payload.sub as string,
    email: (payload.email as string) || (payload['cognito:username'] as string) || '',
    name: (payload.name as string) || undefined
  }
}

// ——— Plugin ———

async function authPlugin(server: FastifyInstance) {
  // decorate requests
  server.decorateRequest('user', null)

  // authenticate preHandler (rejects if no valid user)
  server.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    await extractUser(request)
    if (!request.user) {
      reply.status(401).send({ message: 'Unauthorized' })
    }
  })

  // optionalAuth preHandler (attaches user if present, doesn't reject)
  server.decorate('optionalAuth', async function (request: FastifyRequest, _reply: FastifyReply) {
    await extractUser(request)
  })
}

async function extractUser(request: FastifyRequest) {
  if (AUTH_MODE === 'dev') {
    // In dev mode, inject a mock user from env vars
    request.user = {
      sub: process.env.DEV_USER_ID || 'dev-user-001',
      email: process.env.DEV_USER_EMAIL || 'dev@example.com',
      name: process.env.DEV_USER_NAME || 'Dev User'
    }
    return
  }

  // Cognito mode: extract Bearer token from Authorization header
  const authHeader = request.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    request.user = null
    return
  }

  const token = authHeader.slice(7)
  try {
    request.user = await verifyCognitoToken(token)
  } catch (err: any) {
    request.log.warn({ err: err.message }, 'JWT verification failed')
    request.user = null
  }
}

export default fp(authPlugin, { name: 'auth' })

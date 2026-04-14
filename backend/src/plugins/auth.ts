/**
 * Auth plugin for Fastify.
 *
 * Supports two modes controlled by AUTH_MODE env var:
 *   - 'dev'     : injects a mock user from env vars (no real auth needed)
 *   - 'cognito' : verifies AWS Cognito JWT access tokens via JWKS
 *
 * Also handles backend-signed impersonation tokens (type: 'impersonation') regardless
 * of AUTH_MODE, so admins can browse as another user in any environment.
 *
 * After registration the plugin decorates:
 *   request.user  — { sub: string; email: string; name?: string; impersonatedBy?: string } | null
 *   server.authenticate — preHandler hook that rejects unauthenticated requests
 *   server.optionalAuth — preHandler hook that attaches user if token present but doesn't reject
 */

import fp from 'fastify-plugin'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { createSecretKey } from 'crypto'
// ——— Types ———

export interface AuthUser {
  sub: string
  email: string
  name?: string
  /** Set when this session is an admin impersonating another user. */
  impersonatedBy?: string
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
// We'll use jose's createRemoteJWKSet for verification and add debug logging

/** Decode a JWT without verification (just parse header + payload) */
function decodeJwt(token: string) {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('invalid JWT')
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString())
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
  return { header, payload }
}

/** Decode only the payload of a JWT without verification */
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    return decodeJwt(token).payload
  } catch {
    return null
  }
}

/** Verify a backend-signed impersonation token */
async function verifyImpersonationToken(token: string): Promise<AuthUser> {
  const secret = process.env.CRON_SECRET
  if (!secret) throw new Error('CRON_SECRET is not configured')

  const { jwtVerify } = await import('jose')
  const secretKey = createSecretKey(Buffer.from(secret, 'utf-8'))

  const { payload } = await jwtVerify(token, secretKey, { algorithms: ['HS256'] })
  const p = payload as any

  if (p.type !== 'impersonation') throw new Error('Not an impersonation token')
  if (!p.sub || !p.impersonatedBy) throw new Error('Malformed impersonation token')

  return {
    sub: p.sub as string,
    email: (p.email as string) || '',
    name: (p.name as string) || undefined,
    impersonatedBy: p.impersonatedBy as string,
  }
}

/** Verify a Cognito JWT using JWKS */
async function verifyCognitoToken(token: string): Promise<AuthUser> {
  // Use jose's createRemoteJWKSet which handles JWKS retrieval/rotation
  const { jwtVerify, createRemoteJWKSet } = await import('jose')

  // Decode for lightweight logging (do not trust until verified)
  let header: any = {}
  let payloadPreview: any = {}
  try {
    const decoded = decodeJwt(token)
    header = decoded.header || {}
    payloadPreview = decoded.payload || {}
  } catch (e) {
    // ignore
  }

  const region = process.env.COGNITO_REGION
  const poolId = process.env.COGNITO_USER_POOL_ID
  const clientId = process.env.COGNITO_APP_CLIENT_ID

  if (!region || !poolId || !clientId) {
    console.warn('[auth] Missing Cognito config', { region, poolId, clientId })
    throw new Error('COGNITO_REGION, COGNITO_USER_POOL_ID and COGNITO_APP_CLIENT_ID must be set')
  }

  const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${poolId}/.well-known/jwks.json`
  const JWKS = createRemoteJWKSet(new URL(jwksUrl))
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${poolId}`

  try {
    const result = await jwtVerify(token, JWKS, { issuer, audience: clientId, algorithms: ['RS256'] })
    const payload = result.payload as any
    return {
      sub: payload.sub as string,
      email: (payload.email as string) || (payload['cognito:username'] as string) || '',
      name: (payload.name as string) || undefined
    }
  } catch (err: any) {
    const kid = header?.kid || '<no-kid>'
    const aud = payloadPreview?.aud || '<no-aud>'
    const sub = payloadPreview?.sub || '<no-sub>'
    const msg = `JWT verification failed (kid=${kid} aud=${aud} sub=${sub}): ${err?.message || String(err)}`
    console.warn('[auth] ' + msg)
    throw new Error(msg)
  }
}

function requestLogWarn(msg: string) {
  console.warn('[auth-plugin]', msg)
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
  // Always check for an impersonation token first — works in both dev and cognito modes.
  const authHeader = request.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const payload = decodeJwtPayload(token)
    if (payload?.type === 'impersonation') {
      try {
        request.user = await verifyImpersonationToken(token)
        return
      } catch (err: any) {
        request.log.warn({ err: err.message }, 'Impersonation token verification failed')
        request.user = null
        return
      }
    }
  }

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

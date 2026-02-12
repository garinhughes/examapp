/**
 * Auth routes — provides /auth/me and /auth/config (public).
 *
 * In dev mode /auth/me returns the mock user without a token.
 * In cognito mode /auth/me validates the Bearer token and returns the user.
 * /auth/config returns non-secret Cognito config so the frontend can build login URLs.
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import { upsertUserFromCognito } from '../services/dynamo.js'

const AUTH_MODE = process.env.AUTH_MODE || 'dev'

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  // Return current user (requires valid auth)
  server.get('/me', { preHandler: [server.authenticate] }, async (request) => {
    return {
      user: request.user,
      authMode: AUTH_MODE
    }
  })

  // Public endpoint: return non-secret auth config for the frontend
  server.get('/config', async () => {
    if (AUTH_MODE === 'dev') {
      return {
        authMode: 'dev',
        devUser: {
          sub: process.env.DEV_USER_ID || 'dev-user-001',
          email: process.env.DEV_USER_EMAIL || 'dev@example.com',
          name: process.env.DEV_USER_NAME || 'Dev User'
        }
      }
    }

    return {
      authMode: 'cognito',
      cognito: {
        region: process.env.COGNITO_REGION,
        userPoolId: process.env.COGNITO_USER_POOL_ID,
        clientId: process.env.COGNITO_APP_CLIENT_ID,
        domain: process.env.COGNITO_DOMAIN
      }
    }
  })

  // Token exchange endpoint — exchanges Cognito authorization code for tokens
  // The SPA sends the auth code here; the backend exchanges it server-side
  // (keeps client_secret off the frontend if you later use a confidential client)
  server.post('/token', async (request, reply) => {
    if (AUTH_MODE === 'dev') {
      // In dev mode, return a fake token
      return {
        access_token: 'dev-access-token',
        id_token: 'dev-id-token',
        token_type: 'Bearer',
        expires_in: 3600
      }
    }

    const { code, redirectUri } = request.body as any
    if (!code || !redirectUri) {
      return reply.status(400).send({ message: 'code and redirectUri required' })
    }

    const domain = process.env.COGNITO_DOMAIN
    const clientId = process.env.COGNITO_APP_CLIENT_ID
    if (!domain || !clientId) {
      return reply.status(500).send({ message: 'Cognito not configured' })
    }

    // Exchange authorization code for tokens
    const tokenUrl = `https://${domain}/oauth2/token`
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: redirectUri
    })

    try {
      // include client secret when configured (confidential client)
      const clientSecret = process.env.COGNITO_APP_CLIENT_SECRET
      const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
      if (clientSecret) {
        const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
        headers['Authorization'] = `Basic ${basic}`
      }

      const res = await fetch(tokenUrl, {
        method: 'POST',
        headers,
        body: params.toString()
      })

      if (!res.ok) {
        const text = await res.text()
        return reply.status(res.status).send({ message: text })
      }

      const tokens = await res.json()

      // verify id_token using Cognito JWKS
      if (tokens.id_token) {
        try {
          const region = process.env.COGNITO_REGION
          const userPoolId = process.env.COGNITO_USER_POOL_ID
          if (region && userPoolId) {
            const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`
            const JWKS = createRemoteJWKSet(new URL(jwksUrl))
            const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`
            const verified = await jwtVerify(tokens.id_token, JWKS, { issuer, audience: clientId })
            // upsert user in DynamoDB
            try { await upsertUserFromCognito(verified.payload) } catch (e) { /* ignore */ }
            // attach user info
            return { ...tokens, user: verified.payload }
          }
        } catch (verErr: any) {
          request.log?.error?.('id_token verification failed', verErr)
          return reply.status(401).send({ message: 'id_token verification failed' })
        }
      }

      return tokens
    } catch (err: any) {
      return reply.status(500).send({ message: err.message })
    }
  })

  // Accept Cognito redirect (GET) which will include `?code=...` when using a confidential app client.
  server.get('/token', async (request, reply) => {
    if (AUTH_MODE === 'dev') {
      return reply.send({ message: 'dev mode' })
    }

    const code = (request.query as any).code
    if (!code) return reply.status(400).send({ message: 'code required' })

    const domain = process.env.COGNITO_DOMAIN
    const clientId = process.env.COGNITO_APP_CLIENT_ID
    if (!domain || !clientId) return reply.status(500).send({ message: 'Cognito not configured' })

    const redirectUri = process.env.COGNITO_REDIRECT_URI || `http://localhost:3000/auth/token`
    const tokenUrl = `https://${domain}/oauth2/token`
    const params = new URLSearchParams({ grant_type: 'authorization_code', code, client_id: clientId, redirect_uri: redirectUri })

    try {
      const clientSecret = process.env.COGNITO_APP_CLIENT_SECRET
      const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
      if (clientSecret) {
        const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
        headers['Authorization'] = `Basic ${basic}`
      }

      const res = await fetch(tokenUrl, { method: 'POST', headers, body: params.toString() })
      if (!res.ok) {
        const text = await res.text()
        return reply.status(res.status).send({ message: text })
      }

      const tokens = await res.json()

      // verify id_token
      if (tokens.id_token) {
        try {
          const region = process.env.COGNITO_REGION
          const userPoolId = process.env.COGNITO_USER_POOL_ID
          if (region && userPoolId) {
            const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`
            const JWKS = createRemoteJWKSet(new URL(jwksUrl))
            const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`
            const verified = await jwtVerify(tokens.id_token, JWKS, { issuer, audience: clientId })
            // upsert user in DynamoDB
            try { await upsertUserFromCognito(verified.payload) } catch (e) { /* ignore */ }
            // redirect back to frontend with id_token (dev-friendly; consider HttpOnly cookie for prod)
            const frontend = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
            const sep = frontend.includes('#') ? '&' : '#'
            return reply.redirect(`${frontend}${sep}id_token=${encodeURIComponent(tokens.id_token)}`)
          }
        } catch (verErr: any) {
          request.log?.error?.('id_token verification failed', verErr)
          return reply.status(401).send({ message: 'id_token verification failed' })
        }
      }

      return reply.send(tokens)
    } catch (err: any) {
      return reply.status(500).send({ message: err.message })
    }
  })

  // Debug helper: verify an arbitrary token and return decoded payload (useful for local testing)
  server.post('/debug-token', async (request, reply) => {
    const { token } = request.body as any
    if (!token) return reply.status(400).send({ message: 'token required' })

    if (AUTH_MODE === 'dev') {
      return { ok: true, payload: { sub: process.env.DEV_USER_ID || 'dev-user-001', email: process.env.DEV_USER_EMAIL || 'dev@example.com' } }
    }

    try {
      const region = process.env.COGNITO_REGION
      const userPoolId = process.env.COGNITO_USER_POOL_ID
      const clientId = process.env.COGNITO_APP_CLIENT_ID
      if (!region || !userPoolId || !clientId) return reply.status(500).send({ message: 'Cognito not configured' })

      const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`
      const JWKS = createRemoteJWKSet(new URL(jwksUrl))
      const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`

      const verified = await jwtVerify(token, JWKS, { issuer, audience: clientId })
      return { ok: true, payload: verified.payload }
    } catch (err: any) {
      return reply.status(401).send({ message: 'token verification failed', detail: err?.message ?? String(err) })
    }
  })
}

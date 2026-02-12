/**
 * Auth routes — provides /auth/me and /auth/config (public).
 *
 * In dev mode /auth/me returns the mock user without a token.
 * In cognito mode /auth/me validates the Bearer token and returns the user.
 * /auth/config returns non-secret Cognito config so the frontend can build login URLs.
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify'

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
      const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      })

      if (!res.ok) {
        const text = await res.text()
        return reply.status(res.status).send({ message: text })
      }

      const tokens = await res.json()
      return tokens
    } catch (err: any) {
      return reply.status(500).send({ message: err.message })
    }
  })
}

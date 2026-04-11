/**
 * Auth routes — provides /auth/me and /auth/config (public).
 *
 * In dev mode /auth/me returns the mock user without a token.
 * In cognito mode /auth/me validates the Bearer token and returns the user.
 * /auth/config returns non-secret Cognito config so the frontend can build login URLs.
 */

import { createHmac } from 'crypto'
import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { jwtVerify, createRemoteJWKSet, decodeProtectedHeader } from 'jose'
import { upsertUserFromCognito, getUserBySub, setRegisteredAtIfNew, updateUserFields, setEmailOptIn, setWelcomeEmailSent } from '../services/dynamo.js'
import { sendWelcomeEmail } from '../services/ses.js'
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ResendConfirmationCodeCommand,
  AdminUpdateUserAttributesCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { fromSSO } from '@aws-sdk/credential-providers'

const AUTH_MODE = process.env.AUTH_MODE || 'dev'

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  // Return current user + global tier (requires valid auth)
  server.get('/me', { preHandler: [server.authenticate, server.resolveEntitlements] }, async (request) => {
    const userId = request.user!.sub
    const profile = await getUserBySub(userId)
    const registeredAt: string | null = profile?.registeredAt ?? null
    return {
      user: request.user,
      authMode: AUTH_MODE,
      tier: request.tier,
      registeredAt,
      trialDaysRemaining: null,
      emailOptIn: profile?.emailOptIn ?? true,
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
  server.post('/token', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
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
            // upsert user in DynamoDB and stamp registeredAt on first login
            try { await upsertUserFromCognito(verified.payload) } catch (e) { /* ignore */ }
            try { await setRegisteredAtIfNew(String(verified.payload.sub)) } catch (e) { /* ignore */ }
            // On first login: auto opt-in + send welcome email (fire-and-forget)
            try {
              const userId = String(verified.payload.sub)
              const isNew = await setWelcomeEmailSent(userId)
              if (isNew) {
                await setEmailOptIn(userId, true)
                const email = (verified.payload.email ?? verified.payload.preferred_username) as string | undefined
                const name = ((verified.payload.name ?? verified.payload.given_name) as string | undefined) ?? email ?? 'there'
                if (email) sendWelcomeEmail({ to: email, name, userId }).catch((e: any) => request.log?.warn?.({ err: e?.message }, 'welcome email failed'))
              }
            } catch { /* non-critical */ }
            // attach user info
            return { ...tokens, user: verified.payload }
          }
        } catch (verErr: any) {
          try {
            const hdr = await decodeProtectedHeader(tokens.id_token)
            request.log?.error?.({ err: verErr?.message ?? String(verErr), kid: hdr.kid, alg: hdr.alg }, 'id_token verification failed')
          } catch (hdrErr) {
            request.log?.error?.({ err: verErr?.message ?? String(verErr), hdrErr: String(hdrErr) }, 'id_token verification failed (header decode failed)')
          }
          return reply.status(401).send({ message: 'id_token verification failed' })
        }
      }

      return tokens
    } catch (err: any) {
      return reply.status(500).send({ message: err.message })
    }
  })

  // Accept Cognito redirect (GET) which will include `?code=...` when using a confidential app client.
  server.get('/token', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
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
            // upsert user in DynamoDB and stamp registeredAt on first login
            try { await upsertUserFromCognito(verified.payload) } catch (e) { /* ignore */ }
            try { await setRegisteredAtIfNew(String(verified.payload.sub)) } catch (e) { /* ignore */ }
            // On first login: auto opt-in + send welcome email (fire-and-forget)
            try {
              const userId = String(verified.payload.sub)
              const isNew = await setWelcomeEmailSent(userId)
              if (isNew) {
                await setEmailOptIn(userId, true)
                const email = (verified.payload.email ?? verified.payload.preferred_username) as string | undefined
                const name = ((verified.payload.name ?? verified.payload.given_name) as string | undefined) ?? email ?? 'there'
                if (email) sendWelcomeEmail({ to: email, name, userId }).catch((e: any) => request.log?.warn?.({ err: e?.message }, 'welcome email failed'))
              }
            } catch { /* non-critical */ }
            // redirect back to frontend with id_token (dev-friendly; consider HttpOnly cookie for prod)
            const frontend = process.env.FRONTEND_ORIGIN || 'http://localhost:5173'
            const sep = frontend.includes('#') ? '&' : '#'
            let redirectUrl = `${frontend}${sep}id_token=${encodeURIComponent(tokens.id_token)}`
            if (tokens.refresh_token) {
              redirectUrl += `&refresh_token=${encodeURIComponent(tokens.refresh_token)}`
            }
            return reply.redirect(redirectUrl)
          }
        } catch (verErr: any) {
          try {
            const hdr = await decodeProtectedHeader(tokens.id_token)
            request.log?.error?.({ err: verErr?.message ?? String(verErr), kid: hdr.kid, alg: hdr.alg }, 'id_token verification failed')
          } catch (hdrErr) {
            request.log?.error?.({ err: verErr?.message ?? String(verErr), hdrErr: String(hdrErr) }, 'id_token verification failed (header decode failed)')
          }
          return reply.status(401).send({ message: 'id_token verification failed' })
        }
      }

      return reply.send(tokens)
    } catch (err: any) {
      return reply.status(500).send({ message: err.message })
    }
  })

  // ── Token refresh endpoint ──
  // Frontend sends its refresh_token; backend exchanges it with Cognito for new tokens.
  server.post('/refresh', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
    if (AUTH_MODE === 'dev') {
      return {
        id_token: 'dev-id-token',
        access_token: 'dev-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
      }
    }

    const { refresh_token } = request.body as any
    if (!refresh_token) {
      return reply.status(400).send({ message: 'refresh_token required' })
    }

    const domain = process.env.COGNITO_DOMAIN
    const clientId = process.env.COGNITO_APP_CLIENT_ID
    if (!domain || !clientId) {
      return reply.status(500).send({ message: 'Cognito not configured' })
    }

    const tokenUrl = `https://${domain}/oauth2/token`
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token,
    })

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
        request.log?.warn?.({ status: res.status, body: text }, 'Cognito refresh failed')
        return reply.status(res.status).send({ message: 'refresh failed', detail: text })
      }

      const tokens = await res.json()

      // verify the new id_token
      if (tokens.id_token) {
        try {
          const region = process.env.COGNITO_REGION
          const userPoolId = process.env.COGNITO_USER_POOL_ID
          if (region && userPoolId) {
            const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`
            const JWKS = createRemoteJWKSet(new URL(jwksUrl))
            const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`
            await jwtVerify(tokens.id_token, JWKS, { issuer, audience: clientId })
          }
        } catch (verErr: any) {
          request.log?.warn?.({ err: verErr?.message }, 'refreshed id_token failed verification')
          return reply.status(401).send({ message: 'refreshed token verification failed' })
        }
      }

      // Cognito refresh_token grants do NOT return a new refresh_token — the original stays valid.
      return {
        id_token: tokens.id_token,
        access_token: tokens.access_token,
        token_type: tokens.token_type || 'Bearer',
        expires_in: tokens.expires_in || 3600,
      }
    } catch (err: any) {
      request.log?.error?.({ err: err.message }, 'refresh exchange error')
      return reply.status(500).send({ message: err.message })
    }
  })

  // ── Email / password auth (Cognito native) ──
  // Requires USER_PASSWORD_AUTH enabled on the Cognito app client.

  const cognitoAwsProfile = process.env.COGNITO_AWS_PROFILE || ''
  const cognitoClient = new CognitoIdentityProviderClient({
    region: process.env.COGNITO_REGION || 'eu-west-1',
    ...(cognitoAwsProfile ? { credentials: fromSSO({ profile: cognitoAwsProfile }) } : {}),
  })

  function getCognitoClientId() {
    const id = process.env.COGNITO_APP_CLIENT_ID
    if (!id) throw new Error('COGNITO_APP_CLIENT_ID not set')
    return id
  }

  function getSecretHash(username: string): string | undefined {
    const clientSecret = process.env.COGNITO_APP_CLIENT_SECRET
    if (!clientSecret) return undefined
    return createHmac('sha256', clientSecret).update(username + getCognitoClientId()).digest('base64')
  }

  server.post('/email/register', async (request, reply) => {
    if (AUTH_MODE === 'dev') return { message: 'dev mode — no real signup' }
    const { email, password, firstName, lastName } = request.body as any
    if (!email || !password) return reply.status(400).send({ message: 'email and password required' })
    try {
      const userAttributes: { Name: string; Value: string }[] = [{ Name: 'email', Value: email }]
      if (firstName) userAttributes.push({ Name: 'given_name', Value: String(firstName) })
      if (lastName) userAttributes.push({ Name: 'family_name', Value: String(lastName) })
      await cognitoClient.send(new SignUpCommand({
        ClientId: getCognitoClientId(),
        SecretHash: getSecretHash(email),
        Username: email,
        Password: password,
        UserAttributes: userAttributes,
      }))
      return { message: 'Verification code sent to email' }
    } catch (err: any) {
      return reply.status(400).send({ message: err.message })
    }
  })

  server.post('/email/confirm', async (request, reply) => {
    if (AUTH_MODE === 'dev') return { message: 'dev mode — confirmed' }
    const { email, code } = request.body as any
    if (!email || !code) return reply.status(400).send({ message: 'email and code required' })
    try {
      await cognitoClient.send(new ConfirmSignUpCommand({
        ClientId: getCognitoClientId(),
        SecretHash: getSecretHash(email),
        Username: email,
        ConfirmationCode: code,
      }))
      return { message: 'Email confirmed — you can now sign in' }
    } catch (err: any) {
      return reply.status(400).send({ message: err.message })
    }
  })

  server.post('/email/resend', async (request, reply) => {
    if (AUTH_MODE === 'dev') return { message: 'dev mode — resent' }
    const { email } = request.body as any
    if (!email) return reply.status(400).send({ message: 'email required' })
    try {
      await cognitoClient.send(new ResendConfirmationCodeCommand({
        ClientId: getCognitoClientId(),
        SecretHash: getSecretHash(email),
        Username: email,
      }))
      return { message: 'Verification code resent' }
    } catch (err: any) {
      return reply.status(400).send({ message: err.message })
    }
  })

  server.post('/email/login', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
    if (AUTH_MODE === 'dev') {
      return { id_token: 'dev-id-token', refresh_token: 'dev-refresh-token' }
    }
    const { email, password } = request.body as any
    if (!email || !password) return reply.status(400).send({ message: 'email and password required' })

    const clientId = getCognitoClientId()
    const authParams: Record<string, string> = { USERNAME: email, PASSWORD: password }
    const secretHash = getSecretHash(email)
    if (secretHash) authParams['SECRET_HASH'] = secretHash

    try {
      const res = await cognitoClient.send(new InitiateAuthCommand({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: clientId,
        AuthParameters: authParams,
      }))

      const tokens = res.AuthenticationResult
      if (!tokens?.IdToken) return reply.status(401).send({ message: 'Authentication failed' })

      // Verify id_token via JWKS and upsert user
      const region = process.env.COGNITO_REGION
      const userPoolId = process.env.COGNITO_USER_POOL_ID
      if (region && userPoolId) {
        const jwksUrl = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`
        const JWKS = createRemoteJWKSet(new URL(jwksUrl))
        const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`
        const verified = await jwtVerify(tokens.IdToken, JWKS, { issuer, audience: clientId })
        try { await upsertUserFromCognito(verified.payload) } catch { /* ignore */ }
        try { await setRegisteredAtIfNew(String(verified.payload.sub)) } catch { /* ignore */ }
        // On first login: auto opt-in + send welcome email (fire-and-forget)
        try {
          const userId = String(verified.payload.sub)
          const isNew = await setWelcomeEmailSent(userId)
          if (isNew) {
            await setEmailOptIn(userId, true)
            const name = ((verified.payload.name ?? verified.payload.given_name) as string | undefined) ?? email ?? 'there'
            sendWelcomeEmail({ to: email, name, userId }).catch((e: any) => request.log?.warn?.({ err: e?.message }, 'welcome email failed'))
          }
        } catch { /* non-critical */ }
      }

      return {
        id_token: tokens.IdToken,
        refresh_token: tokens.RefreshToken,
        access_token: tokens.AccessToken,
        expires_in: tokens.ExpiresIn,
      }
    } catch (err: any) {
      // UserNotConfirmedException means they need to verify their email first
      if (err.name === 'UserNotConfirmedException') {
        return reply.status(403).send({ message: 'Email not confirmed', code: 'UserNotConfirmed' })
      }
      return reply.status(401).send({ message: err.message })
    }
  })

  server.post('/email/forgot', async (request, reply) => {
    if (AUTH_MODE === 'dev') return { message: 'dev mode — reset code sent' }
    const { email } = request.body as any
    if (!email) return reply.status(400).send({ message: 'email required' })
    try {
      await cognitoClient.send(new ForgotPasswordCommand({
        ClientId: getCognitoClientId(),
        SecretHash: getSecretHash(email),
        Username: email,
      }))
      // Always return success to avoid user enumeration
      return { message: 'If an account exists, a reset code has been sent' }
    } catch (err: any) {
      return { message: 'If an account exists, a reset code has been sent' }
    }
  })

  server.post('/email/reset', async (request, reply) => {
    if (AUTH_MODE === 'dev') return { message: 'dev mode — password reset' }
    const { email, code, newPassword } = request.body as any
    if (!email || !code || !newPassword) {
      return reply.status(400).send({ message: 'email, code, and newPassword required' })
    }
    try {
      await cognitoClient.send(new ConfirmForgotPasswordCommand({
        ClientId: getCognitoClientId(),
        SecretHash: getSecretHash(email),
        Username: email,
        ConfirmationCode: code,
        Password: newPassword,
      }))
      return { message: 'Password reset successful — you can now sign in' }
    } catch (err: any) {
      return reply.status(400).send({ message: err.message })
    }
  })

  /**
   * PUT /auth/profile — update first/last name for the authenticated user.
   * Updates Cognito attributes (given_name / family_name) and DynamoDB.
   */
  server.put('/profile', { preHandler: [server.authenticate] }, async (request, reply) => {
    const userId = request.user!.sub
    const email = request.user!.email
    const { firstName, lastName } = request.body as any
    const trimFirst = typeof firstName === 'string' ? firstName.trim() : undefined
    const trimLast = typeof lastName === 'string' ? lastName.trim() : undefined
    if (!trimFirst) return reply.status(400).send({ message: 'firstName is required' })

    // Update Cognito attributes (best-effort; federated users may not support this)
    if (AUTH_MODE !== 'dev') {
      const userAttributes: { Name: string; Value: string }[] = [
        { Name: 'given_name', Value: trimFirst },
      ]
      if (trimLast !== undefined) userAttributes.push({ Name: 'family_name', Value: trimLast })
      try {
        await cognitoClient.send(new AdminUpdateUserAttributesCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID!,
          Username: email,
          UserAttributes: userAttributes,
        }))
      } catch (err: any) {
        request.log?.warn?.({ err: err.message }, 'AdminUpdateUserAttributes failed')
      }
    }

    // Update DynamoDB
    const nameParts = [trimFirst, trimLast].filter(Boolean) as string[]
    await updateUserFields(userId, {
      firstName: trimFirst,
      lastName: trimLast ?? '',
      name: nameParts.join(' '),
    })

    return { message: 'Profile updated', name: nameParts.join(' ') }
  })

  // Debug helper: verify an arbitrary token and return decoded payload (useful for local testing)
  server.post('/debug-token', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => { // codeql[js/missing-rate-limiting]
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

  /**
   * PATCH /auth/preferences — update email opt-in preference for the authenticated user.
   * Body: { emailOptIn: boolean }
   */
  server.patch('/preferences', { preHandler: [server.authenticate] }, async (request, reply) => {
    const { emailOptIn } = request.body as any
    if (typeof emailOptIn !== 'boolean') {
      return reply.status(400).send({ message: 'emailOptIn (boolean) is required' })
    }
    await setEmailOptIn(request.user!.sub, emailOptIn)
    return { ok: true, emailOptIn }
  })
}

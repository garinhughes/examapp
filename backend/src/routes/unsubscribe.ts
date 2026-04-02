/**
 * Unsubscribe route — public one-click unsubscribe link included in marketing emails.
 *
 * GET /unsubscribe?token=<jwt>
 *   Verifies the signed JWT (sub + purpose=unsubscribe), sets emailOptIn=false,
 *   and returns a plain HTML confirmation page.
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { jwtVerify } from 'jose'
import { setEmailOptIn } from '../services/dynamo.js'

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  server.get(
    '/',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { token } = request.query as any
      reply.header('Content-Type', 'text/html; charset=utf-8')

      if (!token || typeof token !== 'string') {
        return reply.status(400).send(unsubPage('Invalid link', 'This unsubscribe link is invalid or expired.'))
      }

      try {
        const secret = new TextEncoder().encode(process.env.UNSUBSCRIBE_SECRET || 'change-me-in-production')
        const { payload } = await jwtVerify(token, secret)

        if (payload.purpose !== 'unsubscribe' || typeof payload.sub !== 'string') {
          return reply.status(400).send(unsubPage('Invalid link', 'This unsubscribe link is not valid.'))
        }

        await setEmailOptIn(payload.sub, false)
        server.log.info({ userId: payload.sub }, '[unsubscribe] user opted out')
        return reply.send(unsubPage('Unsubscribed', "You've been removed from certshack marketing emails. You'll still receive important account notifications."))
      } catch (err: any) {
        server.log.warn({ err: err.message }, '[unsubscribe] token verification failed')
        return reply.status(400).send(unsubPage('Link expired', 'This unsubscribe link has expired. Log in to manage your email preferences.'))
      }
    }
  )
}

function unsubPage(heading: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${heading} — certshack</title>
  <style>
    body { margin:0; padding:0; background:#f4f4f4; font-family:Arial,sans-serif; }
    .wrap { max-width:560px; margin:80px auto; background:#fff; border-radius:8px; overflow:hidden; }
    .bar  { background:#FF6B35; padding:24px 32px; }
    .bar h1 { margin:0; color:#fff; font-size:18px; }
    .body { padding:32px; }
    .body p { color:#555; line-height:1.6; }
    a { color:#FF6B35; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="bar"><h1>certshack</h1></div>
    <div class="body">
      <h2 style="color:#222;margin-top:0;">${heading}</h2>
      <p>${message}</p>
      <p><a href="${process.env.FRONTEND_ORIGIN || 'https://certshack.com'}">Return to certshack</a></p>
    </div>
  </div>
</body>
</html>`
}

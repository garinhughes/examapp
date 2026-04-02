/**
 * Cron route — internal endpoint called by EventBridge on a daily schedule.
 *
 * POST /internal/cron/expiry-reminders
 *   Scans entitlements expiring within REMINDER_DAYS (default 7) and sends
 *   a reminder email to each affected user.  Requires x-cron-secret header.
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify'
import { ScanCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, ENTITLEMENTS_TABLE, getUserBySub } from '../services/dynamo.js'
import { sendExpiryReminderEmail } from '../services/ses.js'
import { logEmailSend } from '../services/emailLogs.js'
import { PRODUCTS } from '../catalog.js'

const REMINDER_DAYS = parseInt(process.env.EXPIRY_REMINDER_DAYS ?? '7', 10)

export default async function (server: FastifyInstance, _opts: FastifyPluginOptions) {
  server.post(
    '/expiry-reminders',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const cronSecret = process.env.CRON_SECRET
      if (cronSecret) {
        const provided = request.headers['x-cron-secret'] as string | undefined
        if (!provided || provided !== cronSecret) {
          return reply.status(401).send({ message: 'Unauthorized' })
        }
      }

      const cutoff = new Date(Date.now() + REMINDER_DAYS * 86_400_000).toISOString()
      const now = new Date().toISOString()

      // Scan for active entitlements expiring within the reminder window
      const items: any[] = []
      let lastKey: any = undefined
      do {
        const res = await ddb.send(new ScanCommand({
          TableName: ENTITLEMENTS_TABLE,
          FilterExpression:
            '#st = :active AND expiresAt BETWEEN :now AND :cutoff',
          ExpressionAttributeNames: { '#st': 'status' },
          ExpressionAttributeValues: { ':active': 'active', ':now': now, ':cutoff': cutoff },
          ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
        } as any))
        items.push(...(res.Items ?? []))
        lastKey = res.LastEvaluatedKey
      } while (lastKey)

      let sent = 0
      const errors: string[] = []

      for (const ent of items) {
        try {
          const user = await getUserBySub(ent.userId)
          if (!user?.email) continue

          const daysLeft = Math.max(
            0,
            Math.ceil((Date.parse(ent.expiresAt) - Date.now()) / 86_400_000)
          )

          const product = PRODUCTS.find((p) => p.productId === ent.productId)
          const productLabel = product?.label ?? ent.productId

          await sendExpiryReminderEmail({
            to: user.email,
            name: user.name ?? user.email,
            userId: ent.userId,
            productLabel,
            expiresAt: ent.expiresAt,
            daysLeft,
          })
          sent++
        } catch (err: any) {
          errors.push(`${ent.userId}/${ent.productId}: ${err.message ?? String(err)}`)
          server.log.error({ err }, '[cron] expiry reminder send failed')
        }
      }

      await logEmailSend({
        type: 'expiry-reminder',
        sentBy: 'cron',
        templateId: 'expiry-reminder',
        recipientCount: sent,
        subject: 'Your access is expiring soon',
        filters: { windowDays: REMINDER_DAYS },
      })

      server.log.info({ sent, errors: errors.length }, '[cron] expiry reminders sent')
      return { sent, errors: errors.length > 0 ? errors : undefined }
    }
  )
}

/**
 * Email audit log — records every email send event (high-level).
 *
 * Table: examapp-email-logs
 *   PK: logId (UUID string)
 *   Fields: type, sentAt, sentBy, templateId, recipientCount, subject, filters
 */

import { randomUUID } from 'crypto'
import { PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { ddb } from './dynamo.js'

const EMAIL_LOGS_TABLE = process.env.EMAIL_LOGS_TABLE || 'examapp-email-logs'

export type EmailLogType = 'welcome' | 'payment-confirmed' | 'expiry-reminder' | 'marketing'

export interface EmailLog {
  logId: string
  type: EmailLogType
  sentAt: string
  sentBy: string
  templateId: string
  recipientCount: number
  subject: string
  filters: Record<string, any>
}

export async function logEmailSend(params: {
  type: EmailLogType
  sentBy: string
  templateId: string
  recipientCount: number
  subject: string
  filters?: Record<string, any>
}): Promise<void> {
  const item: EmailLog = {
    logId: randomUUID(),
    type: params.type,
    sentAt: new Date().toISOString(),
    sentBy: params.sentBy,
    templateId: params.templateId,
    recipientCount: params.recipientCount,
    subject: params.subject,
    filters: params.filters ?? {},
  }
  try {
    await ddb.send(new PutCommand({ TableName: EMAIL_LOGS_TABLE, Item: item }))
  } catch (err) {
    // Non-critical — log but don't throw
    console.warn('[emailLogs] logEmailSend failed', err)
  }
}

export async function listEmailLogs(limit = 50, lastKey?: any): Promise<{ items: EmailLog[]; lastKey: any }> {
  try {
    const params: any = { TableName: EMAIL_LOGS_TABLE, Limit: limit }
    if (lastKey) params.ExclusiveStartKey = lastKey
    const res = await ddb.send(new ScanCommand(params))
    return { items: (res.Items ?? []) as EmailLog[], lastKey: res.LastEvaluatedKey ?? null }
  } catch (err) {
    console.warn('[emailLogs] listEmailLogs failed', err)
    return { items: [], lastKey: null }
  }
}

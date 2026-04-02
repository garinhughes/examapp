/**
 * Email template store — CRUD for HTML email templates stored in DynamoDB.
 *
 * Table: examapp-email-templates
 *   PK: templateId (string)
 *   Fields: name, subject, htmlBody, textBody, updatedAt, updatedBy
 */

import { PutCommand, GetCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { ddb } from './dynamo.js'

const EMAIL_TEMPLATES_TABLE = process.env.EMAIL_TEMPLATES_TABLE || 'examapp-email-templates'

export interface EmailTemplate {
  templateId: string
  name: string
  subject: string
  htmlBody: string
  textBody: string
  updatedAt: string
  updatedBy: string
}

export async function getTemplate(templateId: string): Promise<EmailTemplate | null> {
  try {
    const res = await ddb.send(new GetCommand({ TableName: EMAIL_TEMPLATES_TABLE, Key: { templateId } }))
    return (res.Item as EmailTemplate) ?? null
  } catch (err) {
    console.warn('[emailTemplates] getTemplate failed', err)
    return null
  }
}

export async function listTemplates(): Promise<EmailTemplate[]> {
  try {
    const res = await ddb.send(new ScanCommand({ TableName: EMAIL_TEMPLATES_TABLE }))
    return (res.Items ?? []) as EmailTemplate[]
  } catch (err) {
    console.warn('[emailTemplates] listTemplates failed', err)
    return []
  }
}

export async function upsertTemplate(template: EmailTemplate): Promise<void> {
  try {
    await ddb.send(new PutCommand({ TableName: EMAIL_TEMPLATES_TABLE, Item: template }))
  } catch (err) {
    console.warn('[emailTemplates] upsertTemplate failed', err)
    throw err
  }
}

export async function deleteTemplate(templateId: string): Promise<void> {
  try {
    await ddb.send(new DeleteCommand({ TableName: EMAIL_TEMPLATES_TABLE, Key: { templateId } }))
  } catch (err) {
    console.warn('[emailTemplates] deleteTemplate failed', err)
    throw err
  }
}

/**
 * PayPal session store — persists checkout sessions in the examapp-sessions
 * DynamoDB table (PK/SK schema, already provisioned).
 *
 * PK: "PAYPAL_ORDER" | "PAYPAL_SUB"
 * SK: <orderId> | <subscriptionId>
 *
 * TTL is set to 24 hours from creation; enable TTL on the `ttl` attribute
 * in the DynamoDB table to auto-expire abandoned sessions.
 */

import { PutCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, SESSIONS_TABLE } from './dynamo.js'

export interface PaypalSession {
  PK: string
  SK: string
  userId: string
  productIds: string[]
  amountPence: number
  successUrl?: string
  cancelUrl?: string
  createdAt: string
  ttl: number
}

export async function putPaypalSession(
  pk: string,
  sk: string,
  data: Omit<PaypalSession, 'PK' | 'SK' | 'createdAt' | 'ttl'>
): Promise<void> {
  const item: PaypalSession = {
    PK: pk,
    SK: sk,
    ...data,
    createdAt: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + 60 * 60 * 24, // 24 hours
  }
  await ddb.send(new PutCommand({ TableName: SESSIONS_TABLE, Item: item }))
}

export async function getPaypalSession(pk: string, sk: string): Promise<PaypalSession | null> {
  const res = await ddb.send(new GetCommand({ TableName: SESSIONS_TABLE, Key: { PK: pk, SK: sk } }))
  return (res.Item as PaypalSession) ?? null
}

export async function deletePaypalSession(pk: string, sk: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: SESSIONS_TABLE, Key: { PK: pk, SK: sk } }))
}

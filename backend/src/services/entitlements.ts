/**
 * Entitlement service — queries the examapp-entitlements DynamoDB table
 * to determine what products a user has purchased.
 *
 * Table schema (already created):
 *   PK: userId (string)  — Cognito sub
 *   SK: productId (string) — e.g. "exam:SAA-C03", "sub:all-access"
 *   kind: "exam" | "bundle" | "subscription" | "extra"
 *   purchasedAt: ISO string
 *   expiresAt: ISO string | null  (null = never expires)
 *   status: "active" | "cancelled" | "expired"
 *   stripeSubscriptionId?: string
 *   meta: Record<string, any>
 */

import { QueryCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, ENTITLEMENTS_TABLE } from './dynamo.js'

export interface Entitlement {
  userId: string
  productId: string
  kind: string
  purchasedAt: string
  expiresAt: string | null
  status: 'active' | 'cancelled' | 'expired'
  stripeSubscriptionId?: string
  meta?: Record<string, any>
}

/**
 * Get all active entitlements for a user.
 * Filters out expired items unless includeExpired is true.
 */
export async function getUserEntitlements(
  userId: string,
  includeExpired = false
): Promise<Entitlement[]> {
  try {
    const res = await ddb.send(
      new QueryCommand({
        TableName: ENTITLEMENTS_TABLE,
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': userId },
      })
    )

    const items = (res.Items ?? []) as Entitlement[]
    if (includeExpired) return items

    const now = new Date().toISOString()
    return items.filter((e) => {
      if (e.status === 'expired' || e.status === 'cancelled') return false
      if (e.expiresAt && e.expiresAt < now) return false
      return true
    })
  } catch (err) {
    console.warn('[entitlements] getUserEntitlements failed', err)
    return []
  }
}

/** Get product IDs the user currently has active access to */
export async function getActiveProductIds(userId: string): Promise<string[]> {
  const ents = await getUserEntitlements(userId)
  return ents.map((e) => e.productId)
}

/** Grant an entitlement to a user (called after purchase / admin action) */
export async function grantEntitlement(params: {
  userId: string
  productId: string
  kind: string
  expiresAt?: string | null
  stripeSubscriptionId?: string
  meta?: Record<string, any>
}): Promise<Entitlement> {
  const item: Entitlement = {
    userId: params.userId,
    productId: params.productId,
    kind: params.kind,
    purchasedAt: new Date().toISOString(),
    expiresAt: params.expiresAt ?? null,
    status: 'active',
    stripeSubscriptionId: params.stripeSubscriptionId,
    meta: params.meta ?? {},
  }

  await ddb.send(new PutCommand({ TableName: ENTITLEMENTS_TABLE, Item: item }))
  return item
}

/** Revoke / cancel an entitlement */
export async function revokeEntitlement(userId: string, productId: string): Promise<void> {
  try {
    await ddb.send(
      new UpdateCommand({
        TableName: ENTITLEMENTS_TABLE,
        Key: { userId, productId },
        UpdateExpression: 'SET #st = :s, revokedAt = :now',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':s': 'cancelled',
          ':now': new Date().toISOString(),
        },
      })
    )
  } catch (err) {
    console.warn('[entitlements] revokeEntitlement failed', err)
    throw err
  }
}

/** Scan the entitlements table for all users who have an active entitlement for a given product */
export async function findUsersWithActiveEntitlement(productId: string): Promise<Entitlement[]> {
  const results: Entitlement[] = []
  let lastKey: Record<string, any> | undefined = undefined

  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: ENTITLEMENTS_TABLE,
        FilterExpression: 'productId = :pid AND #st = :active',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: { ':pid': productId, ':active': 'active' },
        ExclusiveStartKey: lastKey,
      })
    )
    results.push(...((res.Items ?? []) as Entitlement[]))
    lastKey = res.LastEvaluatedKey as Record<string, any> | undefined
  } while (lastKey)

  return results
}

/** Admin: grant entitlement by sub + product (no Stripe) */
export async function adminGrantEntitlement(
  userId: string,
  productId: string,
  kind: string,
  expiresAt?: string | null,
  extraMeta?: Record<string, any>
): Promise<Entitlement> {
  return grantEntitlement({
    userId,
    productId,
    kind,
    expiresAt,
    meta: { grantedByAdmin: true, ...extraMeta },
  })
}

/** Count distinct users with an active promo grant (meta.promoGrant = true) */
export async function countPromoGrants(): Promise<number> {
  const userIds = new Set<string>()
  let lastKey: Record<string, any> | undefined = undefined

  do {
    const res = await ddb.send(
      new ScanCommand({
        TableName: ENTITLEMENTS_TABLE,
        FilterExpression: '#st = :active AND meta.promoGrant = :t',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: { ':active': 'active', ':t': true },
        ProjectionExpression: 'userId',
        ExclusiveStartKey: lastKey,
      })
    )
    for (const item of res.Items ?? []) {
      if (item.userId) userIds.add(item.userId as string)
    }
    lastKey = res.LastEvaluatedKey as Record<string, any> | undefined
  } while (lastKey)

  return userIds.size
}

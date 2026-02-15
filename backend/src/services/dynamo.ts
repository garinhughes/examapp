import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, UpdateCommand, PutCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-1'
const client = new DynamoDBClient({ region: REGION })
const ddb = DynamoDBDocumentClient.from(client)

const USERS_TABLE = process.env.USERS_TABLE || 'examapp-users'
const ENTITLEMENTS_TABLE = process.env.ENTITLEMENTS_TABLE || 'examapp-entitlements'
const AUDIT_TABLE = process.env.AUDIT_TABLE || 'examapp-audit'

export async function upsertUserFromCognito(payload: any) {
  if (!payload || !payload.sub) return
  const userId = String(payload.sub)
  const now = new Date().toISOString()

  const params = {
    TableName: USERS_TABLE,
    Key: { userId },
    UpdateExpression:
      'SET #email = :email, #name = :name, provider = :provider, lastLogin = :now, updatedAt = :now, isAdmin = :isAdmin',
    ExpressionAttributeNames: { '#email': 'email', '#name': 'name' },
    ExpressionAttributeValues: {
      ':email': payload.email ?? payload.preferred_username ?? null,
      ':name': payload.name ?? payload.preferred_username ?? null,
      ':provider': payload.iss?.includes('google') ? 'google' : 'cognito',
      ':isAdmin': Array.isArray(payload['cognito:groups']) && payload['cognito:groups'].includes('admins'),
      ':now': now
    },
    ReturnValues: 'ALL_NEW'
  }

  try {
    await ddb.send(new UpdateCommand(params as any))
  } catch (err) {
    console.warn('[dynamo] upsertUserFromCognito failed', err)
  }
}

export async function getUserBySub(sub: string) {
  try {
    const res = await ddb.send(new GetCommand({ TableName: USERS_TABLE, Key: { userId: sub } }))
    return res.Item || null
  } catch (err) {
    console.warn('[dynamo] getUserBySub failed', err)
    return null
  }
}

export async function addEntitlement(userId: string, productId: string, data: any = {}) {
  const item = {
    userId,
    productId,
    kind: data.kind || 'oneoff',
    purchasedAt: data.purchasedAt || new Date().toISOString(),
    expiresAt: data.expiresAt || null,
    meta: data.meta || {}
  }
  try {
    await ddb.send(new PutCommand({ TableName: ENTITLEMENTS_TABLE, Item: item }))
    return item
  } catch (err) {
    console.warn('[dynamo] addEntitlement failed', err)
    throw err
  }
}

export async function updateUserFields(userId: string, updates: Record<string, any>) {
  if (!userId) throw new Error('missing userId')
  const exprNames: any = {}
  const exprVals: any = {}
  const setParts: string[] = []
  let i = 0
  for (const k of Object.keys(updates)) {
    i++
    exprNames[`#f${i}`] = k
    exprVals[`:v${i}`] = updates[k]
    setParts.push(`#f${i} = :v${i}`)
  }
  if (setParts.length === 0) return null
  const updateExpr = 'SET ' + setParts.join(', ')
  try {
    const res = await ddb.send(new UpdateCommand({ TableName: USERS_TABLE, Key: { userId }, UpdateExpression: updateExpr, ExpressionAttributeNames: exprNames, ExpressionAttributeValues: exprVals } as any))
    return res
  } catch (err) {
    console.warn('[dynamo] updateUserFields failed', err)
    throw err
  }
}

export async function listUsers(limit = 50, lastKey?: any) {
  try {
    const params: any = { TableName: USERS_TABLE, Limit: limit }
    if (lastKey) params.ExclusiveStartKey = lastKey
    const res = await ddb.send(new ScanCommand(params as any))
    return res
  } catch (err) {
    console.warn('[dynamo] listUsers failed', err)
    throw err
  }
}

export async function recordAdminAudit(adminId: string, targetUserId: string | null, action: string, detail: any = {}) {
  const createdAt = new Date().toISOString()
  const item = { adminId, createdAt, targetUserId, action, detail }
  try {
    await ddb.send(new PutCommand({ TableName: AUDIT_TABLE, Item: item }))
  } catch (err) {
    console.warn('[dynamo] recordAdminAudit failed', err)
  }
}

/**
 * Find a user by their username (case-insensitive scan).
 * Returns the user item or null.
 *
 * NOTE: For production scale, add a GSI on `usernameLower` to avoid table scans.
 */
export async function findUserByUsername(username: string): Promise<any | null> {
  const lower = username.toLowerCase()
  try {
    const res = await ddb.send(new ScanCommand({
      TableName: USERS_TABLE,
      FilterExpression: 'usernameLower = :u',
      ExpressionAttributeValues: { ':u': lower },
      Limit: 1,
    }))
    return res.Items && res.Items.length > 0 ? res.Items[0] : null
  } catch (err) {
    console.warn('[dynamo] findUserByUsername failed', err)
    return null
  }
}

export default { upsertUserFromCognito, getUserBySub, addEntitlement, listUsers, recordAdminAudit, updateUserFields, findUserByUsername }

export { ddb, USERS_TABLE, ENTITLEMENTS_TABLE, AUDIT_TABLE }

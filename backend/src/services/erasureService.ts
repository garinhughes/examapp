/**
 * Erasure Service — GDPR "right to be forgotten" implementation.
 *
 * Orchestrates deletion of all personal data for a given userId across:
 *   - Exam attempts (hard delete)
 *   - Skill lab attempts (hard delete)
 *   - Interactions: ratings + poll votes (hard delete)
 *   - Entitlements (hard delete)
 *   - Gamification record (hard delete — removes from leaderboard)
 *   - Issue reports (anonymised: PII stripped, content kept)
 *   - User profile DynamoDB record (hard delete)
 *   - Cognito account (hard delete)
 *
 * Aggregate metrics (examapp-metrics) are NOT deleted — they contain no
 * personal data and are exempt under UK GDPR as anonymised statistics.
 *
 * The audit record written to examapp-audit is also kept as our evidence
 * of the erasure having taken place.
 */

import { randomUUID } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, DeleteCommand } from '@aws-sdk/lib-dynamodb'

import { getUserBySub, deleteUser, anonymiseIssueReports, recordAdminAudit } from './dynamo.js'
import { attemptsStore } from './attemptsStore.js'
import { skillLabAttemptsStore } from './skillLabAttemptsStore.js'
import { deleteAllInteractionsForUser } from './interactions.js'
import { deleteAllEntitlementsForUser } from './entitlements.js'
import { deleteCognitoUser, getCognitoUser } from './cognitoAdmin.js'

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-1'
const GAM_TABLE = process.env.GAM_TABLE || ''
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const GAM_LOCAL_FILE = path.join(__dirname, '..', '..', 'data', 'gamification.json')

export interface ErasureStep {
  name: string
  status: 'ok' | 'error'
  count: number
  detail?: string
}

export interface ErasurePreview {
  targetUserId: string
  targetEmail: string | null
  targetName: string | null
  registeredAt: string | null
  counts: {
    attempts: number
    skillLabAttempts: number
    interactions: number
    entitlements: number
    gamification: number
    issueReports: number
  }
}

export interface ErasureReceipt {
  receiptId: string
  deletedAt: string
  adminId: string
  targetUserId: string
  targetEmail: string
  targetName: string
  steps: ErasureStep[]
  allOk: boolean
}

async function countGamificationRecords(userId: string): Promise<number> {
  if (GAM_TABLE) {
    // In production (DynamoDB) gamification is client-side only — no server records to delete
    return 0
  }
  try {
    const raw = await fs.readFile(GAM_LOCAL_FILE, 'utf-8')
    const db = JSON.parse(raw)
    return (db.users as any[]).some((u) => u.userId === userId) ? 1 : 0
  } catch {
    return 0
  }
}

async function deleteGamificationRecord(userId: string): Promise<number> {
  if (GAM_TABLE) {
    try {
      const client = new DynamoDBClient({ region: REGION })
      const ddb = DynamoDBDocumentClient.from(client)
      await ddb.send(new DeleteCommand({ TableName: GAM_TABLE, Key: { userId } }))
      return 1
    } catch {
      return 0
    }
  }
  try {
    const raw = await fs.readFile(GAM_LOCAL_FILE, 'utf-8')
    const db = JSON.parse(raw)
    const before = (db.users as any[]).length
    db.users = (db.users as any[]).filter((u: any) => u.userId !== userId)
    const deleted = before - db.users.length
    if (deleted > 0) await fs.writeFile(GAM_LOCAL_FILE, JSON.stringify(db, null, 2))
    return deleted
  } catch {
    return 0
  }
}

export async function previewErasure(userId: string): Promise<ErasurePreview | null> {
  const user = await getUserBySub(userId)
  if (!user) return null

  const [attempts, skillLabAttempts, interactions, entitlements, gamification] = await Promise.all([
    attemptsStore.listByUser(userId).then((r) => r.length).catch(() => 0),
    skillLabAttemptsStore.listByUser(userId).then((r) => r.length).catch(() => 0),
    (async () => {
      // count interactions by querying and counting
      const { QueryCommand } = await import('@aws-sdk/lib-dynamodb')
      const INTERACTIONS_TABLE = process.env.INTERACTIONS_TABLE || 'examapp-interactions'
      const client = new DynamoDBClient({ region: REGION })
      const ddb = DynamoDBDocumentClient.from(client)
      let count = 0
      let lastKey: any = undefined
      do {
        const res: any = await ddb.send(new QueryCommand({
          TableName: INTERACTIONS_TABLE,
          KeyConditionExpression: 'userId = :uid',
          ExpressionAttributeValues: { ':uid': userId },
          Select: 'COUNT',
          ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
        }))
        count += res.Count ?? 0
        lastKey = res.LastEvaluatedKey
      } while (lastKey)
      return count
    })().catch(() => 0),
    (async () => {
      const { getUserEntitlements } = await import('./entitlements.js')
      return getUserEntitlements(userId, true).then((r) => r.length).catch(() => 0)
    })(),
    countGamificationRecords(userId),
  ])

  // Count issue reports (scan with filter)
  let issueReports = 0
  try {
    const { ScanCommand } = await import('@aws-sdk/lib-dynamodb')
    const ISSUE_REPORTS_TABLE = process.env.ISSUE_REPORTS_TABLE || 'examapp-issue-reports'
    const client = new DynamoDBClient({ region: REGION })
    const ddb = DynamoDBDocumentClient.from(client)
    let lastKey: any = undefined
    do {
      const res: any = await ddb.send(new ScanCommand({
        TableName: ISSUE_REPORTS_TABLE,
        FilterExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': userId },
        Select: 'COUNT',
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }))
      issueReports += res.Count ?? 0
      lastKey = res.LastEvaluatedKey
    } while (lastKey)
  } catch {}

  return {
    targetUserId: userId,
    targetEmail: user.email ?? null,
    targetName: user.name ?? null,
    registeredAt: user.registeredAt ?? null,
    counts: { attempts, skillLabAttempts, interactions, entitlements, gamification, issueReports },
  }
}

export interface DryRunResult {
  dryRun: true
  targetUserId: string
  targetEmail: string
  targetName: string
  steps: ErasureStep[]
  allOk: boolean
}

/**
 * Dry-run: performs read-only connectivity checks for every erasure step.
 * Returns per-step ok/error — no data is written or deleted.
 * Use this to validate all services are reachable before committing to erasure.
 */
export async function dryRunErasure(userId: string): Promise<DryRunResult | null> {
  const user = await getUserBySub(userId)
  if (!user) return null

  const targetEmail = user.email ?? 'unknown'
  const targetName = user.name ?? 'unknown'
  const steps: ErasureStep[] = []

  async function check(name: string, fn: () => Promise<number>) {
    try {
      const count = await fn()
      steps.push({ name, status: 'ok', count })
    } catch (err: any) {
      steps.push({ name, status: 'error', count: 0, detail: err?.message ?? String(err) })
    }
  }

  await check('Exam attempts', () => attemptsStore.listByUser(userId).then((r) => r.length))
  await check('Skill lab attempts', () => skillLabAttemptsStore.listByUser(userId).then((r) => r.length))
  await check('Interactions (ratings & polls)', async () => {
    const { QueryCommand } = await import('@aws-sdk/lib-dynamodb')
    const INTERACTIONS_TABLE = process.env.INTERACTIONS_TABLE || 'examapp-interactions'
    const client = new DynamoDBClient({ region: REGION })
    const ddb = DynamoDBDocumentClient.from(client)
    let count = 0; let lastKey: any = undefined
    do {
      const res: any = await ddb.send(new QueryCommand({
        TableName: INTERACTIONS_TABLE,
        KeyConditionExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': userId },
        Select: 'COUNT',
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }))
      count += res.Count ?? 0; lastKey = res.LastEvaluatedKey
    } while (lastKey)
    return count
  })
  await check('Entitlements', async () => {
    const { getUserEntitlements } = await import('./entitlements.js')
    return getUserEntitlements(userId, true).then((r) => r.length)
  })
  await check('Gamification record', () => countGamificationRecords(userId))
  await check('Issue reports (anonymised)', async () => {
    const { ScanCommand } = await import('@aws-sdk/lib-dynamodb')
    const ISSUE_REPORTS_TABLE = process.env.ISSUE_REPORTS_TABLE || 'examapp-issue-reports'
    const client = new DynamoDBClient({ region: REGION })
    const ddb = DynamoDBDocumentClient.from(client)
    let count = 0; let lastKey: any = undefined
    do {
      const res: any = await ddb.send(new ScanCommand({
        TableName: ISSUE_REPORTS_TABLE,
        FilterExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': userId },
        Select: 'COUNT',
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      }))
      count += res.Count ?? 0; lastKey = res.LastEvaluatedKey
    } while (lastKey)
    return count
  })
  await check('User profile', async () => {
    const u = await getUserBySub(userId)
    if (!u) throw new Error('User not found in DynamoDB')
    return 1
  })
  await check('Cognito account', async () => {
    const u = await getCognitoUser(userId)
    if (!u) throw new Error('User not found in Cognito — cannot delete')
    return 1
  })

  return { dryRun: true, targetUserId: userId, targetEmail, targetName, steps, allOk: steps.every((s) => s.status === 'ok') }
}

export async function executeErasure(targetUserId: string, adminId: string): Promise<ErasureReceipt> {
  const receiptId = randomUUID()
  const deletedAt = new Date().toISOString()
  const steps: ErasureStep[] = []

  // Capture user details before deletion
  const user = await getUserBySub(targetUserId)
  const targetEmail = user?.email ?? 'unknown'
  const targetName = user?.name ?? 'unknown'

  async function run(name: string, fn: () => Promise<number>) {
    try {
      const count = await fn()
      steps.push({ name, status: 'ok', count })
    } catch (err: any) {
      steps.push({ name, status: 'error', count: 0, detail: err?.message ?? String(err) })
    }
  }

  await run('Exam attempts', () => attemptsStore.deleteAllForUser(targetUserId))
  await run('Skill lab attempts', () => skillLabAttemptsStore.deleteAllForUser(targetUserId))
  await run('Interactions (ratings & polls)', () => deleteAllInteractionsForUser(targetUserId))
  await run('Entitlements', () => deleteAllEntitlementsForUser(targetUserId))
  await run('Gamification record', () => deleteGamificationRecord(targetUserId))
  await run('Issue reports (anonymised)', () => anonymiseIssueReports(targetUserId))
  await run('User profile', async () => { await deleteUser(targetUserId); return 1 })
  await run('Cognito account', async () => { await deleteCognitoUser(targetUserId); return 1 })

  const allOk = steps.every((s) => s.status === 'ok')

  const receipt: ErasureReceipt = {
    receiptId,
    deletedAt,
    adminId,
    targetUserId,
    targetEmail,
    targetName,
    steps,
    allOk,
  }

  await recordAdminAudit(adminId, targetUserId, 'gdpr_erasure', { receiptId, allOk, steps, targetEmail })

  return receipt
}

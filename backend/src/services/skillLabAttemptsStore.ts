/**
 * Skill Lab Attempts Store — abstracts persistence for skill lab attempts.
 *
 * Local dev  → data/skill-lab-attempts.json
 * Production → DynamoDB table (SKILL_LAB_ATTEMPTS_TABLE env var)
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCAL_FILE = path.join(__dirname, '..', '..', 'data', 'skill-lab-attempts.json')

const TABLE = process.env.SKILL_LAB_ATTEMPTS_TABLE || ''
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-1'
const useDynamo = TABLE.length > 0

export type SkillLabAttemptStatus = 'in_progress' | 'completed' | 'abandoned'

export interface SkillLabAttempt {
  userId: string
  attemptId: string
  labId: string
  labType: string
  selectedAnswer: string
  correct: boolean
  timeTaken: number
  createdAt: string
  // Lifecycle (dev-guide §15 / 14.2). Undefined on legacy rows → treat as completed.
  status?: SkillLabAttemptStatus
  startedAt?: string
  lastSavedAt?: string
  completedAt?: string
  abandonedAt?: string
  progressState?: any
  timed?: boolean
  rating?: number
  ratingComment?: string
  country?: string | null
}

export interface SkillLabAttemptsStore {
  listByUser(userId: string): Promise<SkillLabAttempt[]>
  get(userId: string, attemptId: string): Promise<SkillLabAttempt | null>
  put(attempt: SkillLabAttempt): Promise<void>
  update(userId: string, attemptId: string, fields: Partial<SkillLabAttempt>): Promise<void>
  /** Latest in_progress attempt for this user+lab, if any. */
  findActiveForLab(userId: string, labId: string): Promise<SkillLabAttempt | null>
  /** First in_progress attempt across all labs (sorted by startedAt desc), if any. */
  findAnyActive(userId: string): Promise<{ attemptId: string; labId: string; startedAt?: string; timed?: boolean; lastSavedAt?: string } | null>
  deleteAllForUser(userId: string): Promise<number>
  /** Admin: scan attempts by startedAt range (Dynamo) or fallback to createdAt (legacy). */
  scanByDateRange(from: string, to: string): Promise<SkillLabAttempt[]>
}

function createDynamoStore(): SkillLabAttemptsStore {
  const client = new DynamoDBClient({ region: REGION })
  const ddb = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } })

  return {
    async listByUser(userId: string) {
      const res = await ddb.send(
        new QueryCommand({
          TableName: TABLE,
          KeyConditionExpression: 'userId = :uid',
          ExpressionAttributeValues: { ':uid': userId },
        }),
      )
      return (res.Items as SkillLabAttempt[]) ?? []
    },

    async get(userId: string, attemptId: string) {
      const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { userId, attemptId } }))
      return (res.Item as SkillLabAttempt) ?? null
    },

    async put(attempt: SkillLabAttempt) {
      await ddb.send(new PutCommand({ TableName: TABLE, Item: attempt }))
    },

    async update(userId: string, attemptId: string, fields: Partial<SkillLabAttempt>) {
      const keys = Object.keys(fields)
      if (keys.length === 0) return
      const names: Record<string, string> = {}
      const values: Record<string, any> = {}
      const sets: string[] = []
      keys.forEach((k, i) => {
        const nk = `#f${i}`
        const vk = `:v${i}`
        names[nk] = k
        values[vk] = (fields as any)[k]
        sets.push(`${nk} = ${vk}`)
      })
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { userId, attemptId },
          UpdateExpression: `SET ${sets.join(', ')}`,
          ExpressionAttributeNames: names,
          ExpressionAttributeValues: values,
          ConditionExpression: 'attribute_exists(attemptId)',
        }),
      )
    },

    async findActiveForLab(userId: string, labId: string) {
      // Without a GSI, scan-then-filter the user partition. Volume per user is small.
      const items = await this.listByUser(userId)
      const active = items
        .filter((a) => a.labId === labId && a.status === 'in_progress')
        .sort((a, b) => String(b.startedAt ?? b.createdAt).localeCompare(String(a.startedAt ?? a.createdAt)))
      return active[0] ?? null
    },

    async findAnyActive(userId: string) {
      const items = await this.listByUser(userId)
      const active = items
        .filter((a) => a.status === 'in_progress')
        .sort((a, b) => String(b.startedAt ?? b.createdAt).localeCompare(String(a.startedAt ?? a.createdAt)))
      if (!active[0]) return null
      return { attemptId: active[0].attemptId, labId: active[0].labId, startedAt: active[0].startedAt, timed: active[0].timed, lastSavedAt: active[0].lastSavedAt }
    },

    async deleteAllForUser(userId: string) {
      const items = await this.listByUser(userId)
      for (const item of items) {
        await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { userId, attemptId: item.attemptId } }))
      }
      return items.length
    },

    async scanByDateRange(from: string, to: string) {
      const items: SkillLabAttempt[] = []
      let cursor: Record<string, any> | undefined = undefined
      do {
        const res: any = await ddb.send(new ScanCommand({
          TableName: TABLE,
          // Use startedAt where present (newer rows), else fall back to createdAt (legacy / one-shot)
          FilterExpression: '(attribute_exists(startedAt) AND startedAt BETWEEN :f AND :t) OR (attribute_not_exists(startedAt) AND createdAt BETWEEN :f AND :t)',
          ExpressionAttributeValues: { ':f': from, ':t': to },
          ExclusiveStartKey: cursor,
        }))
        items.push(...((res.Items as SkillLabAttempt[]) ?? []))
        cursor = res.LastEvaluatedKey
      } while (cursor)
      return items
    },
  }
}

function createLocalStore(): SkillLabAttemptsStore {
  async function loadAll(): Promise<SkillLabAttempt[]> {
    try {
      const raw = await fs.readFile(LOCAL_FILE, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return []
    }
  }

  async function saveAll(items: SkillLabAttempt[]) {
    await fs.writeFile(LOCAL_FILE, JSON.stringify(items, null, 2))
  }

  return {
    async listByUser(userId: string) {
      const all = await loadAll()
      return all.filter((a) => a.userId === userId)
    },

    async get(userId: string, attemptId: string) {
      const all = await loadAll()
      return all.find((a) => a.userId === userId && a.attemptId === attemptId) ?? null
    },

    async put(attempt: SkillLabAttempt) {
      const all = await loadAll()
      const idx = all.findIndex((a) => a.attemptId === attempt.attemptId)
      if (idx >= 0) all[idx] = attempt
      else all.push(attempt)
      await saveAll(all)
    },

    async update(userId: string, attemptId: string, fields: Partial<SkillLabAttempt>) {
      const all = await loadAll()
      const idx = all.findIndex((a) => a.userId === userId && a.attemptId === attemptId)
      if (idx < 0) return
      all[idx] = { ...all[idx], ...fields }
      await saveAll(all)
    },

    async findActiveForLab(userId: string, labId: string) {
      const all = await loadAll()
      const active = all
        .filter((a) => a.userId === userId && a.labId === labId && a.status === 'in_progress')
        .sort((a, b) => String(b.startedAt ?? b.createdAt).localeCompare(String(a.startedAt ?? a.createdAt)))
      return active[0] ?? null
    },

    async findAnyActive(userId: string) {
      const items = await this.listByUser(userId)
      const active = items
        .filter((a) => a.status === 'in_progress')
        .sort((a, b) => String(b.startedAt ?? b.createdAt).localeCompare(String(a.startedAt ?? a.createdAt)))
      if (!active[0]) return null
      return { attemptId: active[0].attemptId, labId: active[0].labId, startedAt: active[0].startedAt, timed: active[0].timed, lastSavedAt: active[0].lastSavedAt }
    },

    async deleteAllForUser(userId: string) {
      const all = await loadAll()
      const remaining = all.filter((a) => a.userId !== userId)
      const count = all.length - remaining.length
      await saveAll(remaining)
      return count
    },

    async scanByDateRange(from: string, to: string) {
      const all = await loadAll()
      return all.filter((a) => {
        const ts = a.startedAt ?? a.createdAt
        return typeof ts === 'string' && ts >= from && ts <= to
      })
    },
  }
}

export const skillLabAttemptsStore: SkillLabAttemptsStore = useDynamo
  ? createDynamoStore()
  : createLocalStore()

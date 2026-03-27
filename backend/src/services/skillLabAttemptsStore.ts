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
  QueryCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCAL_FILE = path.join(__dirname, '..', '..', 'data', 'skill-lab-attempts.json')

const TABLE = process.env.SKILL_LAB_ATTEMPTS_TABLE || ''
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-1'
const useDynamo = TABLE.length > 0

export interface SkillLabAttempt {
  userId: string
  attemptId: string
  labId: string
  labType: string
  selectedAnswer: string
  correct: boolean
  timeTaken: number
  createdAt: string
}

export interface SkillLabAttemptsStore {
  listByUser(userId: string): Promise<SkillLabAttempt[]>
  put(attempt: SkillLabAttempt): Promise<void>
  deleteAllForUser(userId: string): Promise<number>
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

    async put(attempt: SkillLabAttempt) {
      await ddb.send(new PutCommand({ TableName: TABLE, Item: attempt }))
    },

    async deleteAllForUser(userId: string) {
      const items = await this.listByUser(userId)
      for (const item of items) {
        await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { userId, attemptId: item.attemptId } }))
      }
      return items.length
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

    async put(attempt: SkillLabAttempt) {
      const all = await loadAll()
      all.push(attempt)
      await saveAll(all)
    },

    async deleteAllForUser(userId: string) {
      const all = await loadAll()
      const remaining = all.filter((a) => a.userId !== userId)
      const count = all.length - remaining.length
      await saveAll(remaining)
      return count
    },
  }
}

export const skillLabAttemptsStore: SkillLabAttemptsStore = useDynamo
  ? createDynamoStore()
  : createLocalStore()

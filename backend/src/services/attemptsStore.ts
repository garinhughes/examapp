/**
 * Attempts Store — abstracts attempt persistence.
 *
 * Local dev  → data/attempts.json  (ATTEMPTS_TABLE not set or empty)
 * Production → DynamoDB table      (ATTEMPTS_TABLE env var set)
 *
 * The route layer calls a uniform interface regardless of backend.
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
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb'

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const ATTEMPTS_TABLE = process.env.ATTEMPTS_TABLE || ''
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-1'
const useDynamo = ATTEMPTS_TABLE.length > 0

/* ------------------------------------------------------------------ */
/*  Shared interface                                                   */
/* ------------------------------------------------------------------ */

export interface AttemptsStore {
  /** Get all attempts for a given userId */
  listByUser(userId: string): Promise<any[]>

  /** Get a single attempt by userId + attemptId */
  get(userId: string, attemptId: string): Promise<any | null>

  /** Create / overwrite an attempt */
  put(attempt: any): Promise<void>

  /** Delete a single attempt */
  delete(userId: string, attemptId: string): Promise<void>

  /** Delete all attempts for a user */
  deleteAllForUser(userId: string): Promise<number>
}

/* ================================================================== */
/*  DynamoDB implementation                                            */
/* ================================================================== */

function createDynamoStore(): AttemptsStore {
  const client = new DynamoDBClient({ region: REGION })
  const ddb = DynamoDBDocumentClient.from(client)

  return {
    async listByUser(userId: string) {
      const res = await ddb.send(
        new QueryCommand({
          TableName: ATTEMPTS_TABLE,
          KeyConditionExpression: 'userId = :uid',
          ExpressionAttributeValues: { ':uid': userId },
        }),
      )
      return (res.Items as any[]) ?? []
    },

    async get(userId: string, attemptId: string) {
      const res = await ddb.send(
        new GetCommand({
          TableName: ATTEMPTS_TABLE,
          Key: { userId, attemptId },
        }),
      )
      return res.Item ?? null
    },

    async put(attempt: any) {
      await ddb.send(
        new PutCommand({
          TableName: ATTEMPTS_TABLE,
          Item: attempt,
        }),
      )
    },

    async delete(userId: string, attemptId: string) {
      await ddb.send(
        new DeleteCommand({
          TableName: ATTEMPTS_TABLE,
          Key: { userId, attemptId },
        }),
      )
    },

    async deleteAllForUser(userId: string) {
      // Query all items, then batch-delete them
      const items = await this.listByUser(userId)
      for (const item of items) {
        await ddb.send(
          new DeleteCommand({
            TableName: ATTEMPTS_TABLE,
            Key: { userId, attemptId: item.attemptId },
          }),
        )
      }
      return items.length
    },
  }
}

/* ================================================================== */
/*  Local JSON-file implementation                                     */
/* ================================================================== */

function createLocalStore(): AttemptsStore {
  const dataDir = fileURLToPath(new URL('../../data', import.meta.url))
  const attemptsFile = path.join(dataDir, 'attempts.json')

  async function loadAll(): Promise<any[]> {
    try {
      const raw = await fs.readFile(attemptsFile, 'utf-8')
      return JSON.parse(raw).attempts ?? []
    } catch {
      return []
    }
  }

  async function saveAll(attempts: any[]) {
    await fs.mkdir(dataDir, { recursive: true })
    await fs.writeFile(attemptsFile, JSON.stringify({ attempts }, null, 2))
  }

  return {
    async listByUser(userId: string) {
      const all = await loadAll()
      return all.filter((a: any) => a.userId === userId)
    },

    async get(_userId: string, attemptId: string) {
      const all = await loadAll()
      return all.find((a: any) => a.attemptId === attemptId) ?? null
    },

    async put(attempt: any) {
      const all = await loadAll()
      const idx = all.findIndex((a: any) => a.attemptId === attempt.attemptId)
      if (idx >= 0) {
        all[idx] = attempt
      } else {
        all.push(attempt)
      }
      await saveAll(all)
    },

    async delete(_userId: string, attemptId: string) {
      const all = await loadAll()
      const filtered = all.filter((a: any) => a.attemptId !== attemptId)
      await saveAll(filtered)
    },

    async deleteAllForUser(userId: string) {
      const all = await loadAll()
      const remaining = all.filter((a: any) => a.userId !== userId)
      const count = all.length - remaining.length
      await saveAll(remaining)
      return count
    },
  }
}

/* ================================================================== */
/*  Export singleton                                                    */
/* ================================================================== */

export const attemptsStore: AttemptsStore = useDynamo
  ? createDynamoStore()
  : createLocalStore()

console.log(`[attemptsStore] backend=${useDynamo ? 'dynamodb' : 'local'} table=${ATTEMPTS_TABLE || 'N/A'}`)

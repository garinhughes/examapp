#!/usr/bin/env node
/**
 * One-off backfill: set `status` on every item in examapp-attempts.
 *
 *   status = 'finished'     when finishedAt is truthy
 *   status = 'in-progress'  otherwise
 *
 * Also sets `updatedAt` when missing (uses finishedAt or startedAt as fallback).
 *
 * Usage:
 *   AWS_PROFILE=certshack AWS_REGION=eu-west-1 node backend/scripts/backfill-attempt-status.mjs
 *   add --dry-run to preview without writing
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

const TABLE = process.env.ATTEMPTS_TABLE || 'examapp-attempts'
const REGION = process.env.AWS_REGION || 'eu-west-1'
const DRY_RUN = process.argv.includes('--dry-run')

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }))

async function scanAll() {
  const items = []
  let ExclusiveStartKey
  do {
    const res = await ddb.send(new ScanCommand({ TableName: TABLE, ExclusiveStartKey }))
    if (res.Items) items.push(...res.Items)
    ExclusiveStartKey = res.LastEvaluatedKey
  } while (ExclusiveStartKey)
  return items
}

async function patch(item) {
  const targetStatus = item.finishedAt ? 'finished' : 'in-progress'
  const needsStatus = item.status !== targetStatus
  const needsUpdatedAt = !item.updatedAt
  if (!needsStatus && !needsUpdatedAt) return { skipped: true }

  const fields = {}
  if (needsStatus) fields.status = targetStatus
  if (needsUpdatedAt) fields.updatedAt = item.finishedAt || item.startedAt || new Date().toISOString()

  if (DRY_RUN) return { dry: true, fields }

  const names = {}
  const values = {}
  const sets = []
  Object.entries(fields).forEach(([k, v], i) => {
    names[`#f${i}`] = k
    values[`:v${i}`] = v
    sets.push(`#f${i} = :v${i}`)
  })
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { userId: item.userId, attemptId: item.attemptId },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }))
  return { updated: true, fields }
}

async function main() {
  console.log(`[backfill] table=${TABLE} region=${REGION} dryRun=${DRY_RUN}`)
  const items = await scanAll()
  console.log(`[backfill] scanned ${items.length} items`)
  let updated = 0, skipped = 0, inProgress = 0, finished = 0
  for (const item of items) {
    const r = await patch(item)
    if (r.skipped) skipped++
    else {
      updated++
      if (r.fields.status === 'in-progress') inProgress++
      if (r.fields.status === 'finished') finished++
      if (DRY_RUN) console.log(`  would update ${item.userId}/${item.attemptId}:`, r.fields)
    }
  }
  console.log(`[backfill] done — updated=${updated} (in-progress=${inProgress}, finished=${finished}) skipped=${skipped}`)
}

main().catch((err) => { console.error(err); process.exit(1) })

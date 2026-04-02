import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { randomUUID } from 'crypto'

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-1'
const client = new DynamoDBClient({ region: REGION })
const ddb = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } })

const INTERACTIONS_TABLE = process.env.INTERACTIONS_TABLE || 'examapp-interactions'

export interface RatingItem {
  userId: string
  SK: string
  interactionType: 'RATING'
  contentType: 'question' | 'lab'
  contentId: string
  userEmail?: string
  stars: number
  difficulty: 'too-easy' | 'just-right' | 'too-hard'
  comment?: string
  createdAt: string
  updatedAt: string
}

export async function putRating(rating: RatingItem): Promise<void> {
  try {
    await ddb.send(new PutCommand({ TableName: INTERACTIONS_TABLE, Item: rating }))
  } catch (err) {
    console.warn('[interactions] putRating failed', err)
    throw err
  }
}

export async function getRating(
  userId: string,
  contentType: string,
  contentId: string
): Promise<RatingItem | null> {
  const SK = `RATING#${contentType}#${contentId}`
  try {
    const res = await ddb.send(new GetCommand({ TableName: INTERACTIONS_TABLE, Key: { userId, SK } }))
    return (res.Item as RatingItem) || null
  } catch (err) {
    console.warn('[interactions] getRating failed', err)
    return null
  }
}

export async function listAllRatings(
  limit = 50,
  lastKey?: any
): Promise<{ items: RatingItem[]; lastKey: any }> {
  try {
    const params: any = {
      TableName: INTERACTIONS_TABLE,
      FilterExpression: 'interactionType = :t',
      ExpressionAttributeValues: { ':t': 'RATING' },
      Limit: limit,
    }
    if (lastKey) params.ExclusiveStartKey = lastKey
    const res = await ddb.send(new ScanCommand(params))
    return { items: (res.Items as RatingItem[]) || [], lastKey: res.LastEvaluatedKey }
  } catch (err) {
    console.warn('[interactions] listAllRatings failed', err)
    throw err
  }
}

export async function countNewRatings(since: string): Promise<number> {
  try {
    const res = await ddb.send(new ScanCommand({
      TableName: INTERACTIONS_TABLE,
      FilterExpression: 'interactionType = :t AND createdAt > :since',
      ExpressionAttributeValues: { ':t': 'RATING', ':since': since },
      Select: 'COUNT',
    }))
    return res.Count || 0
  } catch (err) {
    console.warn('[interactions] countNewRatings failed', err)
    return 0
  }
}

// ── Polls ──────────────────────────────────────────────────────────────────

export interface PollOption {
  id: string
  label: string
}

export interface PollDef {
  userId: 'SYSTEM'
  SK: string
  interactionType: 'POLL_DEF'
  pollId: string
  question: string
  options: PollOption[]
  allowComment?: boolean
  visible: boolean
  createdAt: string
  createdBy: string
}

export interface PollVote {
  userId: string
  SK: string
  interactionType: 'POLL_VOTE'
  pollId: string
  selectedOptions: string[]
  otherText?: string
  userEmail?: string
  createdAt: string
  updatedAt: string
}

export async function putPollDef(def: PollDef): Promise<void> {
  try {
    await ddb.send(new PutCommand({ TableName: INTERACTIONS_TABLE, Item: def }))
  } catch (err) {
    console.warn('[interactions] putPollDef failed', err)
    throw err
  }
}

export async function createPoll(
  question: string,
  options: PollOption[],
  createdBy: string,
  visible = false,
  allowComment = false
): Promise<PollDef> {
  const pollId = randomUUID()
  const now = new Date().toISOString()
  const def: PollDef = {
    userId: 'SYSTEM',
    SK: `POLL_DEF#${pollId}`,
    interactionType: 'POLL_DEF',
    pollId,
    question,
    options,
    ...(allowComment && { allowComment: true }),
    visible,
    createdAt: now,
    createdBy,
  }
  await putPollDef(def)
  return def
}

export async function getActivePoll(): Promise<PollDef | null> {
  try {
    const res = await ddb.send(new ScanCommand({
      TableName: INTERACTIONS_TABLE,
      FilterExpression: 'interactionType = :t AND visible = :v',
      ExpressionAttributeValues: { ':t': 'POLL_DEF', ':v': true },
    }))
    const items = res.Items as PollDef[] | undefined
    return items?.[0] ?? null
  } catch (err) {
    console.warn('[interactions] getActivePoll failed', err)
    return null
  }
}

export async function getPollDef(pollId: string): Promise<PollDef | null> {
  try {
    const res = await ddb.send(new GetCommand({
      TableName: INTERACTIONS_TABLE,
      Key: { userId: 'SYSTEM', SK: `POLL_DEF#${pollId}` },
    }))
    return (res.Item as PollDef) || null
  } catch (err) {
    console.warn('[interactions] getPollDef failed', err)
    return null
  }
}

export async function listPollDefs(
  limit = 50,
  lastKey?: any
): Promise<{ items: PollDef[]; lastKey: any }> {
  try {
    const params: any = {
      TableName: INTERACTIONS_TABLE,
      FilterExpression: 'interactionType = :t',
      ExpressionAttributeValues: { ':t': 'POLL_DEF' },
      Limit: limit,
    }
    if (lastKey) params.ExclusiveStartKey = lastKey
    const res = await ddb.send(new ScanCommand(params))
    return { items: (res.Items as PollDef[]) || [], lastKey: res.LastEvaluatedKey }
  } catch (err) {
    console.warn('[interactions] listPollDefs failed', err)
    throw err
  }
}

export async function deactivateAllPolls(): Promise<void> {
  try {
    const res = await ddb.send(new ScanCommand({
      TableName: INTERACTIONS_TABLE,
      FilterExpression: 'interactionType = :t AND visible = :v',
      ExpressionAttributeValues: { ':t': 'POLL_DEF', ':v': true },
    }))
    const items = (res.Items as PollDef[]) || []
    await Promise.all(items.map((item) =>
      ddb.send(new UpdateCommand({
        TableName: INTERACTIONS_TABLE,
        Key: { userId: 'SYSTEM', SK: item.SK },
        UpdateExpression: 'SET visible = :f',
        ExpressionAttributeValues: { ':f': false },
      }))
    ))
  } catch (err) {
    console.warn('[interactions] deactivateAllPolls failed', err)
    throw err
  }
}

export async function deletePollDef(pollId: string): Promise<void> {
  try {
    await ddb.send(new DeleteCommand({
      TableName: INTERACTIONS_TABLE,
      Key: { userId: 'SYSTEM', SK: `POLL_DEF#${pollId}` },
    }))
  } catch (err) {
    console.warn('[interactions] deletePollDef failed', err)
    throw err
  }
}

export async function updatePollDef(
  pollId: string,
  updates: Partial<Pick<PollDef, 'question' | 'options' | 'visible' | 'allowComment'>>
): Promise<void> {
  const sets: string[] = []
  const removes: string[] = []
  const vals: Record<string, any> = {}
  if (updates.question !== undefined) { sets.push('question = :q'); vals[':q'] = updates.question }
  if (updates.options !== undefined) { sets.push('options = :o'); vals[':o'] = updates.options }
  if (updates.visible !== undefined) { sets.push('visible = :v'); vals[':v'] = updates.visible }
  if (updates.allowComment === true) { sets.push('allowComment = :ac'); vals[':ac'] = true }
  else if (updates.allowComment === false) { removes.push('allowComment') }
  if (sets.length === 0 && removes.length === 0) return
  const expressions: string[] = []
  if (sets.length > 0) expressions.push(`SET ${sets.join(', ')}`)
  if (removes.length > 0) expressions.push(`REMOVE ${removes.join(', ')}`)
  try {
    await ddb.send(new UpdateCommand({
      TableName: INTERACTIONS_TABLE,
      Key: { userId: 'SYSTEM', SK: `POLL_DEF#${pollId}` },
      UpdateExpression: expressions.join(' '),
      ...(Object.keys(vals).length > 0 && { ExpressionAttributeValues: vals }),
    }))
  } catch (err) {
    console.warn('[interactions] updatePollDef failed', err)
    throw err
  }
}

export async function putPollVote(vote: PollVote): Promise<void> {
  try {
    await ddb.send(new PutCommand({ TableName: INTERACTIONS_TABLE, Item: vote }))
  } catch (err) {
    console.warn('[interactions] putPollVote failed', err)
    throw err
  }
}

export async function getPollVote(userId: string, pollId: string): Promise<PollVote | null> {
  try {
    const res = await ddb.send(new GetCommand({
      TableName: INTERACTIONS_TABLE,
      Key: { userId, SK: `POLL#${pollId}` },
    }))
    return (res.Item as PollVote) || null
  } catch (err) {
    console.warn('[interactions] getPollVote failed', err)
    return null
  }
}

export async function listPollVotes(
  pollId: string,
  limit = 50,
  lastKey?: any
): Promise<{ items: PollVote[]; lastKey: any }> {
  try {
    const params: any = {
      TableName: INTERACTIONS_TABLE,
      FilterExpression: 'interactionType = :t AND pollId = :p',
      ExpressionAttributeValues: { ':t': 'POLL_VOTE', ':p': pollId },
      Limit: limit,
    }
    if (lastKey) params.ExclusiveStartKey = lastKey
    const res = await ddb.send(new ScanCommand(params))
    return { items: (res.Items as PollVote[]) || [], lastKey: res.LastEvaluatedKey }
  } catch (err) {
    console.warn('[interactions] listPollVotes failed', err)
    throw err
  }
}

export async function deleteAllInteractionsForUser(userId: string): Promise<number> {
  const items: Array<{ userId: string; SK: string }> = []
  let lastKey: any = undefined
  do {
    const res = await ddb.send(new QueryCommand({
      TableName: INTERACTIONS_TABLE,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    }))
    items.push(...((res.Items ?? []) as any[]))
    lastKey = res.LastEvaluatedKey
  } while (lastKey)

  for (const item of items) {
    await ddb.send(new DeleteCommand({ TableName: INTERACTIONS_TABLE, Key: { userId: item.userId, SK: item.SK } }))
  }
  return items.length
}

export async function countNewPollVotes(since: string): Promise<number> {
  try {
    const res = await ddb.send(new ScanCommand({
      TableName: INTERACTIONS_TABLE,
      FilterExpression: 'interactionType = :t AND createdAt > :since',
      ExpressionAttributeValues: { ':t': 'POLL_VOTE', ':since': since },
      Select: 'COUNT',
    }))
    return res.Count || 0
  } catch (err) {
    console.warn('[interactions] countNewPollVotes failed', err)
    return 0
  }
}

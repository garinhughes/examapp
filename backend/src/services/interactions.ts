import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb'

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

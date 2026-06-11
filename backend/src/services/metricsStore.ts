import {
  UpdateCommand,
  QueryCommand,
  ScanCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb'
import { ddb } from './dynamo.js'

const METRICS_TABLE = process.env.METRICS_TABLE ?? ''

// ── Write helpers ─────────────────────────────────────────────────────────────

export async function updateMetricsOnAttemptFinish(attempt: {
  examCode: string
  userId: string
  score: number
  perDomain: Record<string, { total: number; correct: number; score: number }>
  answers: Array<{ questionId: string | number; correct: boolean; timeMs?: number | null }>
  questions: Array<{ id: string | number; domain?: string }>
  metadata?: { mode?: string } | null
}) {
  if (!METRICS_TABLE) return

  const { examCode, score, perDomain, answers, questions, metadata } = attempt
  const today = new Date().toISOString().slice(0, 10)
  const passed = score >= 70
  const mode: string = (metadata as any)?.mode ?? 'casual'

  // Build question → domain lookup from snapshotted questions
  const qDomainMap = new Map<string, string>()
  for (const q of questions ?? []) {
    if (q.domain) qDomainMap.set(String(q.id), q.domain)
  }

  const ops: Promise<any>[] = []

  // 1. Exam-level aggregate
  ops.push(ddb.send(new UpdateCommand({
    TableName: METRICS_TABLE,
    Key: { pk: `EXAM#${examCode}`, sk: 'META' },
    UpdateExpression: 'ADD totalAttempts :one, finishedAttempts :one, totalScore :score, passCount :pass',
    ExpressionAttributeValues: { ':one': 1, ':score': score, ':pass': passed ? 1 : 0 },
  })))

  // 2. Mode usage counter
  ops.push(ddb.send(new UpdateCommand({
    TableName: METRICS_TABLE,
    Key: { pk: `EXAM#${examCode}`, sk: `MODE#${mode}` },
    UpdateExpression: 'ADD #count :one SET examCode = :ec, #mode = :m',
    ExpressionAttributeNames: { '#count': 'count', '#mode': 'mode' },
    ExpressionAttributeValues: { ':one': 1, ':ec': examCode, ':m': mode },
  })))

  // 3. Per-domain aggregates
  for (const [domain, vals] of Object.entries(perDomain ?? {})) {
    ops.push(ddb.send(new UpdateCommand({
      TableName: METRICS_TABLE,
      Key: { pk: `EXAM#${examCode}`, sk: `DOMAIN#${domain}` },
      UpdateExpression: 'ADD totalAnswered :total, correctCount :correct SET examCode = :ec, #domain = :d',
      ExpressionAttributeNames: { '#domain': 'domain' },
      ExpressionAttributeValues: {
        ':total': vals.total,
        ':correct': vals.correct,
        ':ec': examCode,
        ':d': domain,
      },
    })))
  }

  // 4. Per-question aggregates
  for (const ans of answers ?? []) {
    const qid = String(ans.questionId)
    const domain = qDomainMap.get(qid) ?? 'General'
    const timeMs = typeof ans.timeMs === 'number' && ans.timeMs > 0 ? ans.timeMs : 0
    ops.push(ddb.send(new UpdateCommand({
      TableName: METRICS_TABLE,
      Key: { pk: `QUESTION#${examCode}`, sk: qid },
      UpdateExpression: 'ADD totalAnswered :one, correctCount :correct, totalTimeMs :time, timedAnswers :timed SET examCode = :ec, #domain = :d',
      ExpressionAttributeNames: { '#domain': 'domain' },
      ExpressionAttributeValues: {
        ':one': 1,
        ':correct': ans.correct ? 1 : 0,
        ':time': timeMs,
        ':timed': timeMs > 0 ? 1 : 0,
        ':ec': examCode,
        ':d': domain,
      },
    })))
  }

  // 5. Daily global totals
  ops.push(ddb.send(new UpdateCommand({
    TableName: METRICS_TABLE,
    Key: { pk: 'DAILY', sk: today },
    UpdateExpression: 'ADD attempts :one, finishedAttempts :one',
    ExpressionAttributeValues: { ':one': 1 },
  })))

  await Promise.allSettled(ops)
}

export async function updateMetricsOnLabAttempt(attempt: {
  labId: string
  labType: string
  correct: boolean
  timeTaken: number
}) {
  if (!METRICS_TABLE) return

  const { labId, labType, correct, timeTaken } = attempt
  const today = new Date().toISOString().slice(0, 10)

  await Promise.allSettled([
    ddb.send(new UpdateCommand({
      TableName: METRICS_TABLE,
      Key: { pk: `LAB#${labId}`, sk: 'META' },
      UpdateExpression: 'ADD totalAttempts :one, passCount :pass, totalTimeTaken :time SET labId = :lid, labType = :lt',
      ExpressionAttributeValues: {
        ':one': 1,
        ':pass': correct ? 1 : 0,
        ':time': timeTaken,
        ':lid': labId,
        ':lt': labType,
      },
    })),
    ddb.send(new UpdateCommand({
      TableName: METRICS_TABLE,
      Key: { pk: 'DAILY', sk: today },
      UpdateExpression: 'ADD labAttempts :one',
      ExpressionAttributeValues: { ':one': 1 },
    })),
  ])
}

// ── Generic event recorder ────────────────────────────────────────────────────

export type EventType =
  | 'page_view'
  | 'exam_start'
  | 'lab_start'
  | 'exam_abandon'
  | 'signup_start'
  | 'signup_complete'
  | 'login'
  | 'pricing_view'
  | 'upgrade_click'
  | 'checkout_start'
  | 'checkout_complete'

export interface EventPayload {
  examCode?: string
  labId?: string
  labType?: string
  mode?: string
  surface?: 'exams' | 'labs' | 'pricing'
  referrerHost?: string
  isNew?: boolean
  lastQuestionIndex?: number
  totalQuestions?: number
  cta?: string
  plan?: string
}

const DAILY_ATTR: Partial<Record<EventType, string>> = {
  exam_start: 'examStarts',
  lab_start: 'labStarts',
  exam_abandon: 'examAbandons',
  signup_start: 'signupStarts',
  signup_complete: 'signupCompletes',
  login: 'logins',
  pricing_view: 'pricingViews',
  upgrade_click: 'upgradeClicks',
  checkout_start: 'checkoutStarts',
  checkout_complete: 'checkoutCompletes',
}

const KNOWN_REFERRER_HOSTS = new Set([
  'google.com', 'bing.com', 'duckduckgo.com', 'yahoo.com',
  'reddit.com', 'youtube.com', 'facebook.com', 'twitter.com', 'x.com',
  'linkedin.com', 'github.com',
])

function bucketAbandon(pct: number): string {
  if (pct < 25) return 'bucket0_25'
  if (pct < 50) return 'bucket25_50'
  if (pct < 75) return 'bucket50_75'
  return 'bucket75_100'
}

export async function recordEvent(type: EventType, payload: EventPayload = {}): Promise<void> {
  if (!METRICS_TABLE) return
  const today = new Date().toISOString().slice(0, 10)
  const ops: Promise<any>[] = []

  // Daily counter
  const dailyAttr = DAILY_ATTR[type]
  if (dailyAttr) {
    ops.push(ddb.send(new UpdateCommand({
      TableName: METRICS_TABLE,
      Key: { pk: 'DAILY', sk: today },
      UpdateExpression: `ADD #a :one`,
      ExpressionAttributeNames: { '#a': dailyAttr },
      ExpressionAttributeValues: { ':one': 1 },
    })))
  }

  if (type === 'page_view') {
    const attr = payload.surface === 'labs' ? 'pageViewsLabs'
      : payload.surface === 'pricing' ? 'pageViewsPricing'
      : 'pageViewsExams'
    const expr = payload.isNew
      ? 'ADD #a :one, newVisitors :one'
      : 'ADD #a :one'
    ops.push(ddb.send(new UpdateCommand({
      TableName: METRICS_TABLE,
      Key: { pk: 'DAILY', sk: today },
      UpdateExpression: expr,
      ExpressionAttributeNames: { '#a': attr },
      ExpressionAttributeValues: { ':one': 1 },
    })))

    if (payload.isNew && payload.referrerHost) {
      const host = KNOWN_REFERRER_HOSTS.has(payload.referrerHost) ? payload.referrerHost : 'other'
      ops.push(ddb.send(new UpdateCommand({
        TableName: METRICS_TABLE,
        Key: { pk: 'REFERRER', sk: `${today}#${host}` },
        UpdateExpression: 'ADD #count :one SET #date = :d, host = :h',
        ExpressionAttributeNames: { '#count': 'count', '#date': 'date' },
        ExpressionAttributeValues: { ':one': 1, ':d': today, ':h': host },
      })))
    }
  }

  if (type === 'exam_start' && payload.examCode) {
    ops.push(ddb.send(new UpdateCommand({
      TableName: METRICS_TABLE,
      Key: { pk: `EXAM#${payload.examCode}`, sk: 'META' },
      UpdateExpression: 'ADD startedAttempts :one',
      ExpressionAttributeValues: { ':one': 1 },
    })))
    if (payload.mode) {
      ops.push(ddb.send(new UpdateCommand({
        TableName: METRICS_TABLE,
        Key: { pk: `EXAM#${payload.examCode}`, sk: `START_MODE#${payload.mode}` },
        UpdateExpression: 'ADD #count :one SET examCode = :ec, #mode = :m',
        ExpressionAttributeNames: { '#count': 'count', '#mode': 'mode' },
        ExpressionAttributeValues: { ':one': 1, ':ec': payload.examCode, ':m': payload.mode },
      })))
    }
  }

  if (type === 'exam_abandon' && payload.examCode) {
    ops.push(ddb.send(new UpdateCommand({
      TableName: METRICS_TABLE,
      Key: { pk: `EXAM#${payload.examCode}`, sk: 'META' },
      UpdateExpression: 'ADD abandonedAttempts :one',
      ExpressionAttributeValues: { ':one': 1 },
    })))
    if (typeof payload.lastQuestionIndex === 'number' && typeof payload.totalQuestions === 'number' && payload.totalQuestions > 0) {
      const pct = Math.min(100, Math.max(0, Math.round((payload.lastQuestionIndex / payload.totalQuestions) * 100)))
      const bucket = bucketAbandon(pct)
      ops.push(ddb.send(new UpdateCommand({
        TableName: METRICS_TABLE,
        Key: { pk: `EXAM#${payload.examCode}`, sk: 'ABANDON_AT' },
        UpdateExpression: 'ADD #b :one',
        ExpressionAttributeNames: { '#b': bucket },
        ExpressionAttributeValues: { ':one': 1 },
      })))
    }
  }

  if (type === 'lab_start' && payload.labId) {
    ops.push(ddb.send(new UpdateCommand({
      TableName: METRICS_TABLE,
      Key: { pk: `LAB#${payload.labId}`, sk: 'META' },
      UpdateExpression: 'ADD startedAttempts :one SET labId = :lid, labType = if_not_exists(labType, :lt)',
      ExpressionAttributeValues: {
        ':one': 1,
        ':lid': payload.labId,
        ':lt': payload.labType ?? 'unknown',
      },
    })))
  }

  await Promise.allSettled(ops)
}

export async function getReferrerItems(days = 30): Promise<any[]> {
  if (!METRICS_TABLE) return []
  const { Items } = await ddb.send(new QueryCommand({
    TableName: METRICS_TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': 'REFERRER' },
  }))
  if (!Items) return []
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return Items.filter((it: any) => typeof it.date === 'string' && it.date >= cutoffStr)
}

// ── Query helpers ─────────────────────────────────────────────────────────────

export async function getAllExamMetas(): Promise<any[]> {
  if (!METRICS_TABLE) return []
  const { Items } = await ddb.send(new ScanCommand({
    TableName: METRICS_TABLE,
    FilterExpression: 'begins_with(pk, :prefix) AND sk = :meta',
    ExpressionAttributeValues: { ':prefix': 'EXAM#', ':meta': 'META' },
  }))
  return Items ?? []
}

export async function queryExamItems(examCode: string): Promise<any[]> {
  if (!METRICS_TABLE) return []
  const { Items } = await ddb.send(new QueryCommand({
    TableName: METRICS_TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `EXAM#${examCode}` },
  }))
  return Items ?? []
}

export async function queryQuestionItems(examCode: string): Promise<any[]> {
  if (!METRICS_TABLE) return []
  const { Items } = await ddb.send(new QueryCommand({
    TableName: METRICS_TABLE,
    KeyConditionExpression: 'pk = :pk',
    ExpressionAttributeValues: { ':pk': `QUESTION#${examCode}` },
  }))
  return Items ?? []
}

export async function getAllLabMetas(): Promise<any[]> {
  if (!METRICS_TABLE) return []
  const { Items } = await ddb.send(new ScanCommand({
    TableName: METRICS_TABLE,
    FilterExpression: 'begins_with(pk, :prefix) AND sk = :meta',
    ExpressionAttributeValues: { ':prefix': 'LAB#', ':meta': 'META' },
  }))
  return Items ?? []
}

export async function getDailyItems(days = 30): Promise<any[]> {
  if (!METRICS_TABLE) return []
  const dates: string[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }
  const results = await Promise.all(
    dates.map((date) =>
      ddb.send(new GetCommand({ TableName: METRICS_TABLE, Key: { pk: 'DAILY', sk: date } }))
        .then((r) => r.Item ?? { pk: 'DAILY', sk: date, attempts: 0, finishedAttempts: 0, labAttempts: 0 })
    )
  )
  return results
}

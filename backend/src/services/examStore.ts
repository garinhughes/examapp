/**
 * Exam Store — manages exam JSON blobs in S3 (versioned) and the
 * exam index in DynamoDB.
 *
 * Key concepts:
 *   • Each exam is stored at  s3://<BUCKET>/exams/<examCode>.json
 *   • S3 bucket versioning keeps every publish as an immutable snapshot.
 *   • DynamoDB `examapp-exams-index` maps examCode → latest S3 key + VersionId.
 *   • When an attempt starts, the backend fetches by the *current* VersionId
 *     and snapshots the questions into the attempt record.  Later exam edits
 *     publish a new version — existing attempts are unaffected.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
} from '@aws-sdk/client-s3'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb'

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'eu-west-1'
const BUCKET = process.env.EXAM_BUCKET || 'certshack-examapp-questions'
const INDEX_TABLE = process.env.EXAM_INDEX_TABLE || 'examapp-exams-index'

const s3 = new S3Client({ region: REGION })
const ddbClient = new DynamoDBClient({ region: REGION })
const ddb = DynamoDBDocumentClient.from(ddbClient)

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ExamIndexEntry {
  examCode: string
  s3Key: string
  s3VersionId: string
  version: number
  publishedAt: string
  title?: string
  provider?: string
}

/* ------------------------------------------------------------------ */
/*  S3 operations                                                      */
/* ------------------------------------------------------------------ */

/**
 * Upload an exam JSON blob to S3 and return the VersionId assigned
 * by S3's object-versioning.
 */
export async function uploadExamToS3(
  examCode: string,
  jsonBody: string | Buffer,
): Promise<{ s3Key: string; s3VersionId: string }> {
  const s3Key = `exams/${examCode}.json`
  const res = await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: jsonBody,
      ContentType: 'application/json',
    }),
  )
  const s3VersionId = res.VersionId
  if (!s3VersionId) {
    throw new Error(
      `S3 did not return a VersionId for ${s3Key}. ` +
        'Ensure bucket versioning is enabled.',
    )
  }
  return { s3Key, s3VersionId }
}

/**
 * Fetch an exam JSON blob from S3.
 * If `versionId` is supplied the exact version is retrieved (immutable snapshot).
 * Otherwise the latest version is returned.
 */
export async function getExamFromS3(
  examCode: string,
  versionId?: string,
): Promise<{ body: string; s3VersionId: string }> {
  const s3Key = `exams/${examCode}.json`
  const cmd: any = { Bucket: BUCKET, Key: s3Key }
  if (versionId) cmd.VersionId = versionId

  const res = await s3.send(new GetObjectCommand(cmd))
  const body = await res.Body!.transformToString('utf-8')
  return { body, s3VersionId: res.VersionId ?? versionId ?? 'null' }
}

/**
 * List all object versions for an exam key.
 */
export async function listExamVersions(examCode: string) {
  const s3Key = `exams/${examCode}.json`
  const res = await s3.send(
    new ListObjectVersionsCommand({
      Bucket: BUCKET,
      Prefix: s3Key,
    }),
  )
  return (res.Versions ?? []).map((v) => ({
    key: v.Key,
    versionId: v.VersionId,
    isLatest: v.IsLatest,
    lastModified: v.LastModified?.toISOString(),
    size: v.Size,
  }))
}

/* ------------------------------------------------------------------ */
/*  DynamoDB exam-index operations                                     */
/* ------------------------------------------------------------------ */

/**
 * Write / overwrite the exam-index entry for a given examCode.
 * Called after a successful S3 upload (publish).
 */
export async function putExamIndex(entry: ExamIndexEntry): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: INDEX_TABLE,
      Item: entry,
    }),
  )
}

/**
 * Get the current published index entry for an examCode.
 * Returns null if the exam hasn't been published yet.
 */
export async function getExamIndex(
  examCode: string,
): Promise<ExamIndexEntry | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: INDEX_TABLE,
      Key: { examCode },
    }),
  )
  return (res.Item as ExamIndexEntry) ?? null
}

/**
 * List all published exams from the index table.
 */
export async function listExamIndex(): Promise<ExamIndexEntry[]> {
  const res = await ddb.send(new ScanCommand({ TableName: INDEX_TABLE }))
  return (res.Items as ExamIndexEntry[]) ?? []
}

/* ------------------------------------------------------------------ */
/*  Composite helpers                                                  */
/* ------------------------------------------------------------------ */

/**
 * Publish an exam: upload JSON to S3 → update DynamoDB index.
 * Returns the new index entry.
 */
export async function publishExam(
  examCode: string,
  jsonBody: string | Buffer,
  meta: { version: number; title?: string; provider?: string },
): Promise<ExamIndexEntry> {
  const { s3Key, s3VersionId } = await uploadExamToS3(examCode, jsonBody)
  const entry: ExamIndexEntry = {
    examCode,
    s3Key,
    s3VersionId,
    version: meta.version,
    publishedAt: new Date().toISOString(),
    title: meta.title,
    provider: meta.provider,
  }
  await putExamIndex(entry)
  return entry
}

export { BUCKET, INDEX_TABLE, REGION }

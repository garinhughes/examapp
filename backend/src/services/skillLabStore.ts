/**
 * Skill Lab Store — manages skill lab JSON blobs in S3 (versioned) and the
 * skill-labs index in DynamoDB.
 *
 * Mirrors the examStore.ts pattern:
 *   • Each lab is stored at  s3://<BUCKET>/labs/<labId>.json
 *   • S3 bucket versioning keeps every publish as an immutable snapshot.
 *   • DynamoDB `examapp-skill-labs-index` maps labId → latest S3 key + VersionId.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
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
const BUCKET = process.env.SKILL_LAB_S3_BUCKET || 'examapp-skill-labs-809472479011'
const INDEX_TABLE = process.env.SKILL_LAB_INDEX_TABLE || 'examapp-skill-labs-index'

const s3 = new S3Client({ region: REGION })
const ddbClient = new DynamoDBClient({ region: REGION })
const ddb = DynamoDBDocumentClient.from(ddbClient, { marshallOptions: { removeUndefinedValues: true } })

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SkillLabIndexEntry {
  labId: string
  s3Key: string
  s3VersionId: string
  version: number
  publishedAt: string
  title?: string
  type?: string
  platform?: string
  category?: string
  difficulty?: string
}

/* ------------------------------------------------------------------ */
/*  S3 operations                                                      */
/* ------------------------------------------------------------------ */

export async function uploadLabToS3(
  labId: string,
  jsonBody: string | Buffer,
): Promise<{ s3Key: string; s3VersionId: string }> {
  const s3Key = `labs/${labId}.json`
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

export async function getLabFromS3(
  labId: string,
  versionId?: string,
): Promise<{ body: string; s3VersionId: string }> {
  const s3Key = `labs/${labId}.json`
  const cmd: any = { Bucket: BUCKET, Key: s3Key }
  if (versionId) cmd.VersionId = versionId

  const res = await s3.send(new GetObjectCommand(cmd))
  const body = await res.Body!.transformToString('utf-8')
  return { body, s3VersionId: res.VersionId ?? versionId ?? 'null' }
}

export async function listLabVersions(labId: string) {
  const s3Key = `labs/${labId}.json`
  const res = await s3.send(
    new ListObjectVersionsCommand({ Bucket: BUCKET, Prefix: s3Key }),
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
/*  DynamoDB index operations                                          */
/* ------------------------------------------------------------------ */

export async function putLabIndex(entry: SkillLabIndexEntry): Promise<void> {
  await ddb.send(new PutCommand({ TableName: INDEX_TABLE, Item: entry }))
}

export async function getLabIndex(
  labId: string,
): Promise<SkillLabIndexEntry | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: INDEX_TABLE, Key: { labId } }),
  )
  return (res.Item as SkillLabIndexEntry) ?? null
}

export async function listLabIndex(): Promise<SkillLabIndexEntry[]> {
  const res = await ddb.send(new ScanCommand({ TableName: INDEX_TABLE }))
  return (res.Items as SkillLabIndexEntry[]) ?? []
}

/* ------------------------------------------------------------------ */
/*  Composite helpers                                                  */
/* ------------------------------------------------------------------ */

export async function publishLab(
  labId: string,
  jsonBody: string | Buffer,
  meta: {
    version: number
    title?: string
    type?: string
    platform?: string
    category?: string
    difficulty?: string
  },
): Promise<SkillLabIndexEntry> {
  const { s3Key, s3VersionId } = await uploadLabToS3(labId, jsonBody)
  const entry: SkillLabIndexEntry = {
    labId,
    s3Key,
    s3VersionId,
    version: meta.version,
    publishedAt: new Date().toISOString(),
    title: meta.title,
    type: meta.type,
    platform: meta.platform,
    category: meta.category,
    difficulty: meta.difficulty,
  }
  await putLabIndex(entry)
  return entry
}

export { BUCKET, INDEX_TABLE, REGION }

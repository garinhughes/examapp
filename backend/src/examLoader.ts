/**
 * Shared exam loader — reads per-exam JSON files from local disk or S3.
 *
 * Controlled by EXAM_SOURCE env var:
 *   'local' (default) — reads from data/exams/ on disk (fast iteration).
 *   's3'              — reads from S3 via the DynamoDB exam-index
 *                       (version-pinned, immutable snapshots).
 *
 * Workflow:
 *   1. Edit JSON in data/exams/, run backend with EXAM_SOURCE=local.
 *   2. Verify questions render correctly in the frontend.
 *   3. Run `pnpm publish:exams` to upload to S3 + update DynamoDB index.
 *   4. Switch to EXAM_SOURCE=s3 (or deploy with it) for production use.
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  getExamIndex,
  getExamFromS3,
  listExamIndex,
  type ExamIndexEntry,
} from './services/examStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const examsDir = path.resolve(__dirname, '../data/exams')

/**
 * Exam source switch — mirrors AUTH_MODE pattern.
 *   'local' = filesystem (default for dev)
 *   's3'    = S3 + DynamoDB index (production)
 */
const EXAM_SOURCE: 'local' | 's3' = (process.env.EXAM_SOURCE ?? 'local') as any
const USE_S3 = EXAM_SOURCE === 's3'

export interface Choice {
  id: string
  text: string
  isCorrect: boolean
  explanation?: string
}

export interface Question {
  id: string
  question: string
  choices: Choice[]
  /** number of correct choices the user must select (derived from isCorrect count) */
  selectCount: number
  format?: string
  domain?: string
  skills?: string[]
  services?: string[]
  docs?: string
  tip?: string
  explanation?: string
}

export interface Exam {
  code: string
  title: string
  provider?: string
  passMark?: number
  defaultQuestions?: number
  defaultDuration?: number
  logo?: string | null
  logoHref?: string | null
  level?: string
  version?: number | string
  publishedAt?: string
  /** S3 VersionId of the object this exam was loaded from (null when loaded from filesystem). */
  s3VersionId?: string | null
  questions: Question[]
}

/**
 * Normalise a raw question object from the new per-exam JSON format.
 * Handles `meta.domain` → `domain` flattening and derives `selectCount`.
 */
export function normaliseQuestion(raw: any): Question {
  const choices: Choice[] = (raw.choices ?? []).map((c: any) =>
    typeof c === 'string'
      ? { id: String(Math.random().toString(36).slice(2)), text: c, isCorrect: false }
      : { id: c.id, text: c.text, isCorrect: !!c.isCorrect, ...(c.explanation ? { explanation: c.explanation } : {}) }
  )
  const selectCount = choices.filter((c) => c.isCorrect).length || 1

  return {
    id: String(raw.id),
    question: raw.question,
    choices,
    selectCount,
    format: raw.format,
    domain: raw.domain ?? raw.meta?.domain ?? undefined,
    skills: Array.isArray(raw.skills) ? raw.skills : undefined,
    services: raw.services,
    docs: raw.docs,
    tip: raw.tip,
    explanation: raw.explanation,
  }
}

/**
 * Parse raw exam JSON into an Exam object.
 */
function parseExamJson(raw: any, code: string, s3VersionId?: string | null): Exam {
  return {
    code: raw.code ?? code,
    title: raw.title ?? code,
    provider: raw.provider,
    passMark: raw.passMark,
    defaultQuestions: raw.defaultQuestions ?? raw.defaultQuestionCount,
    defaultDuration: raw.defaultDuration,
    logo: raw.logo,
    logoHref: raw.logoHref,
    level: raw.level,
    version: raw.version ?? raw.v ?? undefined,
    publishedAt: raw.publishedAt ?? undefined,
    s3VersionId: s3VersionId ?? null,
    questions: (raw.questions ?? []).map(normaliseQuestion),
  }
}

/**
 * Load a single exam by code.
 *
 * When USE_S3 is true:
 *   - If `s3VersionId` is provided, fetches that exact immutable version from S3.
 *   - Otherwise, looks up the latest published version via DynamoDB exam-index
 *     and fetches that version.
 *
 * Fallback: reads from local data/exams/ directory.
 */
export async function loadExam(
  code: string,
  s3VersionId?: string,
): Promise<Exam | null> {
  const lc = code.toLowerCase()

  if (USE_S3) {
    try {
      // If a specific version is requested, go straight to S3
      if (s3VersionId) {
        const { body, s3VersionId: vid } = await getExamFromS3(lc.toUpperCase(), s3VersionId)
        const raw = JSON.parse(body)
        return parseExamJson(raw, code, vid)
      }
      // Otherwise look up the latest published version
      const idx = await getExamIndex(lc.toUpperCase())
        ?? await getExamIndex(code) // try exact case too
      if (idx) {
        const { body, s3VersionId: vid } = await getExamFromS3(
          idx.examCode,
          idx.s3VersionId,
        )
        const raw = JSON.parse(body)
        return parseExamJson(raw, idx.examCode, vid)
      }
    } catch (err) {
      console.error(`[examLoader] S3 load failed for ${code}:`, err)
      return null
    }
  }

  // Filesystem path (local dev only)
  try {
    const files = await fs.readdir(examsDir)
    const file = files.find((f) => f.toLowerCase().replace(/\.json$/, '') === lc)
    if (!file) return null

    const raw = JSON.parse(await fs.readFile(path.join(examsDir, file), 'utf-8'))
    return parseExamJson(raw, code, null)
  } catch (err) {
    console.warn(`[examLoader] Filesystem fallback failed for ${code}:`, err)
    return null
  }
}

/**
 * Load all exams.
 *
 * When USE_S3 is true, reads the exam-index from DynamoDB and fetches
 * each published exam from S3 (version-pinned).
 * Falls back to the local data/exams/ directory.
 */
export async function loadAllExams(): Promise<Exam[]> {
  if (USE_S3) {
    try {
      const entries = await listExamIndex()
      const exams: Exam[] = []
      for (const entry of entries) {
        try {
          const { body, s3VersionId: vid } = await getExamFromS3(
            entry.examCode,
            entry.s3VersionId,
          )
          const raw = JSON.parse(body)
          exams.push(parseExamJson(raw, entry.examCode, vid))
        } catch (err) {
          console.error(`[examLoader] Failed to load ${entry.examCode} from S3:`, err)
        }
      }
      if (exams.length === 0) {
        console.warn('[examLoader] DynamoDB exam-index returned 0 entries — have you run pnpm publish:exams?')
      }
      return exams
    } catch (err) {
      console.error('[examLoader] S3 index scan failed:', err)
      return []
    }
  }

  // Filesystem path (local dev only)
  try {
    const files = await fs.readdir(examsDir)
    const exams: Exam[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = JSON.parse(await fs.readFile(path.join(examsDir, file), 'utf-8'))
        exams.push(parseExamJson(raw, file.replace(/\.json$/, ''), null))
      } catch (err) {
        console.error(`Failed to load exam file ${file}:`, err)
      }
    }
    return exams
  } catch (err) {
    console.warn('[examLoader] Filesystem fallback failed (data/exams dir missing?):', err)
    return []
  }
}

/**
 * Fisher–Yates shuffle (returns a new array).
 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * Shuffle the choices within each question.
 * Returns new question objects (originals are not mutated).
 * `isCorrect` is preserved so the client / visitor can score locally.
 */
/**
 * Shuffle both the order of questions AND the choices within each question.
 * Returns new arrays (originals are not mutated).
 */
export function shuffleQuestions(questions: Question[]): Question[] {
  return shuffle(questions).map((q) => ({
    ...q,
    choices: shuffle(q.choices),
  }))
}

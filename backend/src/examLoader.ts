/**
 * Shared exam loader — reads per-exam JSON files from data/exams/
 * and provides utilities for normalising and shuffling questions.
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const examsDir = path.resolve(__dirname, '../data/exams')

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
    services: raw.services,
    docs: raw.docs,
    tip: raw.tip,
    explanation: raw.explanation,
  }
}

/**
 * Load a single exam by code (case-insensitive filename match).
 * Returns null if no matching file is found.
 */
export async function loadExam(code: string): Promise<Exam | null> {
  const files = await fs.readdir(examsDir)
  const lc = code.toLowerCase()
  const file = files.find((f) => f.toLowerCase().replace(/\.json$/, '') === lc)
  if (!file) return null

  const raw = JSON.parse(await fs.readFile(path.join(examsDir, file), 'utf-8'))
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
    questions: (raw.questions ?? []).map(normaliseQuestion),
  }
}

/**
 * Load all exams from the data/exams/ directory.
 */
export async function loadAllExams(): Promise<Exam[]> {
  const files = await fs.readdir(examsDir)
  const exams: Exam[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    try {
      const raw = JSON.parse(await fs.readFile(path.join(examsDir, file), 'utf-8'))
      exams.push({
        code: raw.code ?? file.replace(/\.json$/, ''),
        title: raw.title ?? file.replace(/\.json$/, ''),
        provider: raw.provider,
        passMark: raw.passMark,
        defaultQuestions: raw.defaultQuestions ?? raw.defaultQuestionCount,
        defaultDuration: raw.defaultDuration,
        logo: raw.logo,
        logoHref: raw.logoHref,
        level: raw.level,
        version: raw.version ?? raw.v ?? undefined,
        publishedAt: raw.publishedAt ?? undefined,
        questions: (raw.questions ?? []).map(normaliseQuestion),
      })
    } catch (err) {
      console.error(`Failed to load exam file ${file}:`, err)
    }
  }
  return exams
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

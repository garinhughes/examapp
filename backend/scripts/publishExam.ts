#!/usr/bin/env node
/**
 * publishExam.ts — CLI tool to publish exam JSON files to S3 and
 * update the DynamoDB exam index.
 *
 * Usage:
 *   npx ts-node --esm scripts/publishExam.ts <examCode>        # publish one exam
 *   npx ts-node --esm scripts/publishExam.ts --all              # publish all exams in data/exams/
 *   npx ts-node --esm scripts/publishExam.ts --all --dry-run    # preview, don't upload
 *
 * Environment:
 *   AWS_PROFILE / AWS_REGION (defaults to eu-west-1)
 *   EXAM_BUCKET (defaults to certshack-examapp-questions)
 *   EXAM_INDEX_TABLE (defaults to examapp-exams-index)
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { publishExam, getExamIndex } from '../src/services/examStore.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const examsDir = path.resolve(__dirname, '../data/exams')

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const publishAll = args.includes('--all')
  const examCode = args.find((a) => !a.startsWith('--'))

  if (!publishAll && !examCode) {
    console.error('Usage: publishExam.ts <examCode> | --all [--dry-run]')
    process.exit(1)
  }

  // Collect files to publish
  let files: { code: string; filePath: string }[] = []

  if (publishAll) {
    const entries = await fs.readdir(examsDir)
    for (const f of entries) {
      if (!f.endsWith('.json')) continue
      files.push({ code: f.replace(/\.json$/, ''), filePath: path.join(examsDir, f) })
    }
  } else {
    // Find file by case-insensitive match
    const entries = await fs.readdir(examsDir)
    const lc = examCode!.toLowerCase()
    const match = entries.find((f) => f.toLowerCase().replace(/\.json$/, '') === lc)
    if (!match) {
      console.error(`Exam file not found for code "${examCode}" in ${examsDir}`)
      process.exit(1)
    }
    files.push({ code: match.replace(/\.json$/, ''), filePath: path.join(examsDir, match) })
  }

  console.log(`Publishing ${files.length} exam(s)${dryRun ? ' (DRY RUN)' : ''}...\n`)

  for (const { code, filePath } of files) {
    const raw = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    const version = parsed.version ?? 1
    const title = parsed.title ?? code
    const provider = parsed.provider ?? undefined

    // Check current index
    const current = await getExamIndex(code).catch(() => null)
    const currentVersion = current?.version ?? 0

    console.log(`  ${code}:`)
    console.log(`    file:            ${filePath}`)
    console.log(`    questions:       ${(parsed.questions ?? []).length}`)
    console.log(`    version (file):  ${version}`)
    console.log(`    version (index): ${currentVersion || '(not published)'}`)

    if (dryRun) {
      console.log(`    → DRY RUN: would upload to exams/${code}.json\n`)
      continue
    }

    const entry = await publishExam(code, raw, { version, title, provider })
    console.log(`    → published: s3VersionId=${entry.s3VersionId}`)
    console.log(`    → index updated: version=${entry.version} publishedAt=${entry.publishedAt}\n`)
  }

  console.log('Done.')
}

main().catch((err) => {
  console.error('Publish failed:', err)
  process.exit(1)
})

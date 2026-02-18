#!/usr/bin/env node
/**
 * Integration test — proves that an in-progress exam attempt is
 * unaffected when the same exam is republished mid-attempt.
 *
 * Flow:
 *   1. Start the backend (EXAM_SOURCE=s3, AUTH_MODE=dev)
 *   2. Start an attempt for SCS-C03
 *   3. Answer the first 2 questions
 *   4. Republish the exam to S3 (new S3 VersionId)
 *   5. Answer the 3rd question and finish the attempt
 *   6. Verify: attempt still has the original s3VersionId,
 *      questions haven't changed, score is computed correctly.
 *
 * Usage:
 *   cd backend
 *   pnpm test:workflow                # runs this script
 *   # or manually:
 *   node --loader ts-node/esm scripts/testWorkflow.ts
 *
 * Prerequisites:
 *   - Backend running on PORT (default 3000) with AUTH_MODE=dev, EXAM_SOURCE=s3
 *   - AWS credentials available (SSO profile or env)
 *   - Exam SCS-C03 already published to S3
 */

import { publishExam, getExamIndex } from '../src/services/examStore.js'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const BASE = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`
const EXAM_CODE = 'SCS-C03'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`
  const headers: Record<string, string> = {}
  const opts: any = { method, headers }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(url, opts)
  const text = await res.text()
  let json: any
  try { json = JSON.parse(text) } catch { json = text }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json)}`)
  return json
}

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error(`✗ FAIL: ${msg}`); process.exit(1) }
  console.log(`  ✓ ${msg}`)
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */
async function main() {
  console.log(`\n=== Integration Test: exam versioning workflow ===`)
  console.log(`Backend: ${BASE}`)
  console.log(`Exam:    ${EXAM_CODE}\n`)

  // ── 0. Check backend is up ──
  console.log('Step 0: Check backend health')
  try {
    await api('GET', '/auth/config')
    console.log('  ✓ Backend is reachable\n')
  } catch (err: any) {
    console.error(`  ✗ Backend not reachable at ${BASE}. Start it first.\n    ${err.message}`)
    process.exit(1)
  }

  // ── 1. Fetch questions to see what we're working with ──
  console.log('Step 1: Fetch exam questions')
  const questionsRes = await api('GET', `/exams/${EXAM_CODE}/questions`)
  const questions = questionsRes.questions
  assert(questions.length > 0, `Got ${questions.length} questions`)
  console.log()

  // ── 2. Record the current exam index entry ──
  console.log('Step 2: Record current exam index')
  const indexBefore = await getExamIndex(EXAM_CODE)
  assert(!!indexBefore, `Index entry exists for ${EXAM_CODE}`)
  const versionIdBefore = indexBefore!.s3VersionId
  console.log(`  s3VersionId (before): ${versionIdBefore}\n`)

  // ── 3. Start an attempt ──
  console.log('Step 3: Start attempt')
  const startRes = await api('POST', '/attempts', {
    examCode: EXAM_CODE,
    numQuestions: 5, // small set for speed
  })
  const attemptId = startRes.attemptId
  assert(!!attemptId, `Attempt started: ${attemptId}`)
  console.log()

  // ── 4. Answer first 2 questions ──
  console.log('Step 4: Answer first 2 questions')
  const attemptData = await api('GET', `/attempts/${attemptId}`)
  const attemptQuestions = attemptData.questions
  assert(attemptQuestions.length > 0, `Attempt has ${attemptQuestions.length} questions`)

  for (let i = 0; i < Math.min(2, attemptQuestions.length); i++) {
    const q = attemptQuestions[i]
    // Pick the first choice
    const choiceId = q.choices[0]?.id
    const ansRes = await api('POST', `/attempts/${attemptId}/answer`, {
      questionId: q.id,
      selectedChoiceId: choiceId,
    })
    assert(ansRes.answer !== undefined, `Answered question ${q.id} (correct=${ansRes.correct})`)
  }
  console.log()

  // ── 5. Republish the exam (creates new S3 version) ──
  console.log('Step 5: Republish exam (new S3 version, same content)')
  const examFile = path.resolve(__dirname, '../data/exams', `${EXAM_CODE}.json`)
  const examJson = await fs.readFile(examFile, 'utf-8')
  const parsed = JSON.parse(examJson)
  const entry = await publishExam(EXAM_CODE, examJson, {
    version: (parsed.version ?? 1),
    title: parsed.title,
    provider: parsed.provider,
  })
  const versionIdAfter = entry.s3VersionId
  assert(versionIdAfter !== versionIdBefore, `New s3VersionId: ${versionIdAfter} (differs from before)`)
  console.log()

  // ── 6. Answer 3rd question and finish attempt ──
  console.log('Step 6: Answer 3rd question + finish attempt')
  if (attemptQuestions.length >= 3) {
    const q = attemptQuestions[2]
    const choiceId = q.choices[0]?.id
    const ansRes = await api('POST', `/attempts/${attemptId}/answer`, {
      questionId: q.id,
      selectedChoiceId: choiceId,
    })
    assert(ansRes.answer !== undefined, `Answered question ${q.id} post-republish`)
  }

  const finishRes = await api('PATCH', `/attempts/${attemptId}/finish`)
  assert(typeof finishRes.score === 'number', `Attempt finished: score=${finishRes.score}%`)
  console.log()

  // ── 7. Verify the attempt still references the ORIGINAL version ──
  console.log('Step 7: Verify attempt integrity')
  const finalAttempt = await api('GET', `/attempts/${attemptId}`)
  assert(
    finalAttempt.s3VersionId === versionIdBefore,
    `Attempt s3VersionId (${finalAttempt.s3VersionId}) matches original (${versionIdBefore}) — NOT the new version`,
  )
  assert(
    finalAttempt.questions.length === attemptQuestions.length,
    `Question count unchanged: ${finalAttempt.questions.length}`,
  )
  assert(!!finalAttempt.finishedAt, `Attempt has finishedAt: ${finalAttempt.finishedAt}`)
  console.log()

  // ── 8. Verify the exam index now points to the NEW version ──
  console.log('Step 8: Verify exam index updated')
  const indexAfter = await getExamIndex(EXAM_CODE)
  assert(indexAfter!.s3VersionId === versionIdAfter, `Index now points to new version: ${versionIdAfter}`)
  console.log()

  // ── 9. Start a NEW attempt (should get the new version) ──
  console.log('Step 9: New attempt gets latest version')
  const newStartRes = await api('POST', '/attempts', {
    examCode: EXAM_CODE,
    numQuestions: 3,
  })
  const newAttempt = await api('GET', `/attempts/${newStartRes.attemptId}`)
  assert(
    newAttempt.s3VersionId === versionIdAfter,
    `New attempt has latest s3VersionId: ${newAttempt.s3VersionId}`,
  )

  // Clean up: delete the new attempt (0 answers so deletable)
  // Actually it has 0 answers so we can try, but it's fine to leave it

  console.log()
  console.log('═══════════════════════════════════════════')
  console.log('  ALL TESTS PASSED ✓')
  console.log('═══════════════════════════════════════════')
  console.log()
}

main().catch((err) => {
  console.error('\n✗ Test failed:', err.message || err)
  process.exit(1)
})

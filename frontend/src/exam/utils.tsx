import React from 'react'
import CodeBlock from '../components/CodeBlock'
import type { Question } from './types'

/** Check if an answer is correct for any question type */
export function isAnswerCorrect(q: Question, sel: string | string[] | undefined): boolean {
  if (sel === undefined) return false
  const qType = q.type ?? 'single-choice'
  if (qType === 'matching') {
    try {
      const mappings: Record<string, string> = typeof sel === 'string' ? JSON.parse(sel) : {}
      const slots = q.slots ?? []
      return slots.length > 0 && slots.every((s) => mappings[s.id] === s.correctChoiceId)
    } catch { return false }
  }
  if (qType === 'ordering') {
    try {
      const order: string[] = typeof sel === 'string' ? JSON.parse(sel) : []
      const correctOrder = [...q.choices]
        .filter((c) => typeof c.sequence === 'number')
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
        .map((c) => c.id)
      return correctOrder.length === order.length && correctOrder.every((id, idx) => id === order[idx])
    } catch { return false }
  }
  const correctIds = q.choices.filter((c) => c.isCorrect).map((c) => c.id)
  if (Array.isArray(sel)) {
    return sel.length === correctIds.length && sel.every((v) => correctIds.includes(v))
  }
  return correctIds.length === 1 && correctIds[0] === sel
}

/** Recompute attempt-level derived stats (score, correctCount, total, perDomain) */
export function computeDerivedAttempt(attemptObj: any, fallbackQuestions: Question[]) {
  const qSet: Question[] = Array.isArray(attemptObj.questions) && attemptObj.questions.length > 0
    ? attemptObj.questions
    : fallbackQuestions

  const latestByQ = new Map<string, any>()
  if (Array.isArray(attemptObj.answers)) {
    for (const ans of attemptObj.answers) {
      const qid = String(ans?.questionId)
      if (!qid) continue
      const prev = latestByQ.get(qid)
      const prevT = prev?.createdAt ? String(prev.createdAt) : ''
      const currT = ans?.createdAt ? String(ans.createdAt) : ''
      if (!prev || currT >= prevT) latestByQ.set(qid, ans)
    }
  }

  const isEarlyComplete = !!attemptObj.earlyComplete
  let total = 0
  let correctCount = 0
  const perDomain: Record<string, { total: number; correct: number; score: number }> = {}
  for (const q of qSet) {
    const latestAns = latestByQ.get(q.id)
    if (isEarlyComplete && !latestAns) continue
    const domain = q.domain ?? 'General'
    if (!perDomain[domain]) perDomain[domain] = { total: 0, correct: 0, score: 0 }
    perDomain[domain].total += 1
    total += 1
    if (latestAns && latestAns.correct) {
      perDomain[domain].correct += 1
      correctCount += 1
    }
  }
  for (const k of Object.keys(perDomain)) {
    const entry = perDomain[k]
    entry.score = entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : 0
  }

  const score = total > 0 ? Math.round((correctCount / total) * 100) : 0
  return {
    ...attemptObj,
    total,
    correctCount,
    score,
    perDomain,
    ...(isEarlyComplete ? { totalQuestions: qSet.length, answeredCount: latestByQ.size } : {})
  }
}

/** Render choice content (plain text, JSON, YAML, or CLI snippets) */
export function renderChoiceContent(val: any, q?: Question, inline = false) {
  const s = typeof val === 'string' ? val : (val?.text != null ? String(val.text) : (val == null ? '' : String(val)))
  const isLikelyJson = (q?.format === 'json') || s.trim().startsWith('{') || s.trim().startsWith('[')
  const isLikelyYaml = (q?.format === 'yaml')
  const isLikelyCli = (q?.format === 'cli') || s.includes('\n') || /^\s*(?:\$|sudo\b)/.test(s) || /^\s*aws\s+[a-z0-9-]/.test(s)

  if (isLikelyJson) {
    try {
      const parsed = JSON.parse(s)
      const pretty = JSON.stringify(parsed, null, 2)
      return <CodeBlock code={pretty} language="json" inline={false} />
    } catch { /* fallthrough */ }
  }

  if (isLikelyYaml) {
    return <CodeBlock code={s} language="yaml" inline={false} />
  }

  if (isLikelyCli) {
    return <CodeBlock code={s} language="bash" inline={false} />
  }

  return <span>{s}</span>
}

/** Render question text with \n\n as paragraph breaks */
export function renderWithParagraphs(text: string) {
  const parts = text.split('\n\n')
  if (parts.length <= 1) return <>{text}</>
  return (
    <>
      {parts.map((part, i) => (
        <p key={i} className={i > 0 ? 'mt-3' : ''}>{part}</p>
      ))}
    </>
  )
}

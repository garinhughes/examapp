import type { Question, Exam } from './types'

const esc = (v: any) => {
  const s = String(v ?? '').replace(/"/g, '""')
  return `"${s}"`
}

/** Build a CSV string for a finished attempt and trigger download */
export function downloadAttemptCSV(attemptData: any, selectedMeta: Exam | null, questions: Question[]) {
  if (!attemptData) return
  const examTitle = selectedMeta?.title ?? attemptData.examCode ?? 'Exam'
  const examCode = selectedMeta?.code ?? attemptData.examCode ?? ''
  const score = attemptData.score ?? ''
  const correctCount = attemptData.correctCount ?? ''
  const total = attemptData.total ?? ''
  const finishedAt = attemptData.finishedAt ? new Date(attemptData.finishedAt).toLocaleString() : ''

  const rows: string[] = []
  rows.push(`Exam,${esc(examTitle)} (${examCode})`)
  rows.push(`Score,${score}%`)
  rows.push(`Result,${correctCount} / ${total} correct`)
  rows.push(`Completed,${esc(finishedAt)}`)
  rows.push('')

  if (attemptData.perDomain && typeof attemptData.perDomain === 'object') {
    rows.push('Domain,Score,Correct,Total')
    for (const [domain, vals] of Object.entries(attemptData.perDomain) as [string, any][]) {
      rows.push(`${esc(domain)},${vals.score ?? 0}%,${vals.correct ?? 0},${vals.total ?? 0}`)
    }
    rows.push('')
  }

  rows.push('Question,Domain,Your Answer,Correct Answer,Result,Explanation')
  const qs = Array.isArray(attemptData.questions) && attemptData.questions.length > 0 ? attemptData.questions : questions
  for (const q of qs as Question[]) {
    const ansRec = Array.isArray(attemptData.answers) ? attemptData.answers.find((a: any) => a.questionId === q.id) : undefined
    const chosenIds: string[] = ansRec?.selectedChoiceIds ?? (ansRec?.selectedChoiceId ? [ansRec.selectedChoiceId] : ansRec?.selectedIndices ?? (typeof ansRec?.selectedIndex === 'number' ? [ansRec.selectedIndex] : []))
    const yourAnswer = chosenIds.map((cid: any) => { const ch = q.choices?.find((c: any) => c.id === cid); return ch?.text ?? (typeof cid === 'number' ? q.choices?.[cid] ?? '' : cid) }).join('; ')
    const correctAnswer = q.choices?.filter((c: any) => c.isCorrect).map((c: any) => c.text).join('; ') ?? ''
    const result = ansRec ? (ansRec.correct ? 'Correct' : 'Incorrect') : 'Unanswered'
    rows.push(`${esc(q.question)},${esc(q.domain ?? '')},${esc(yourAnswer)},${esc(correctAnswer)},${result},${esc(q.explanation ?? '')}`)
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${examCode || 'exam'}-report-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Open a printable report in a new window (user can Save as PDF via browser print) */
export function downloadAttemptPDF(attemptData: any, selectedMeta: Exam | null, questions: Question[]) {
  if (!attemptData) return
  const examTitle = selectedMeta?.title ?? attemptData.examCode ?? 'Exam'
  const examCode = selectedMeta?.code ?? attemptData.examCode ?? ''
  const score = Number(attemptData.score) || 0
  const correctCount = attemptData.correctCount ?? 0
  const total = attemptData.total ?? 0
  const pm = typeof selectedMeta?.passMark === 'number' ? selectedMeta.passMark : 70
  const passed = score >= pm
  const finishedAt = attemptData.finishedAt ? new Date(attemptData.finishedAt).toLocaleString() : '—'

  const qs = Array.isArray(attemptData.questions) && attemptData.questions.length > 0 ? attemptData.questions : questions

  let domainHTML = ''
  if (attemptData.perDomain && typeof attemptData.perDomain === 'object') {
    domainHTML = `<h2>Domain Performance</h2><table><thead><tr><th>Domain</th><th>Score</th><th>Correct</th><th>Total</th></tr></thead><tbody>`
    for (const [domain, vals] of Object.entries(attemptData.perDomain) as [string, any][]) {
      domainHTML += `<tr><td>${domain}</td><td>${vals.score ?? 0}%</td><td>${vals.correct ?? 0}</td><td>${vals.total ?? 0}</td></tr>`
    }
    domainHTML += `</tbody></table>`
  }

  let questionsHTML = '<h2>Questions</h2>'
  for (const q of qs as Question[]) {
    const ansRec = Array.isArray(attemptData.answers) ? attemptData.answers.find((a: any) => a.questionId === q.id) : undefined
    const chosenIds: string[] = ansRec?.selectedChoiceIds ?? (ansRec?.selectedChoiceId ? [ansRec.selectedChoiceId] : ansRec?.selectedIndices ?? (typeof ansRec?.selectedIndex === 'number' ? [ansRec.selectedIndex] : []))
    const isCorrect = ansRec ? !!ansRec.correct : false
    const statusIcon = ansRec ? (isCorrect ? '✅' : '❌') : '⬜'

    questionsHTML += `<div class="q"><div class="q-header">${statusIcon} <strong>${q.question.replace(/</g, '&lt;')}</strong></div>`
    if (q.domain) questionsHTML += `<div class="q-domain">Domain: ${q.domain}</div>`

    questionsHTML += `<ol>`
    for (let ci = 0; ci < (q.choices?.length ?? 0); ci++) {
      const ch = q.choices[ci]
      const choiceText = typeof ch === 'string' ? ch : (ch?.text ?? '')
      const choiceId = typeof ch === 'string' ? String(ci) : (ch?.id ?? String(ci))
      const isChosen = chosenIds.includes(choiceId) || chosenIds.includes(ci as any)
      const isCorrectChoice = typeof ch === 'object' && !!ch?.isCorrect
      const cls = isChosen && isCorrectChoice ? 'correct' : isChosen ? 'wrong' : isCorrectChoice ? 'correct-not-chosen' : ''
      questionsHTML += `<li class="${cls}">${choiceText.replace(/</g, '&lt;')}${isChosen ? ' ◀ your answer' : ''}${isCorrectChoice && !isChosen ? ' ◀ correct' : ''}</li>`
      if (typeof ch === 'object' && ch?.explanation) {
        questionsHTML += `<div class="choice-expl">${String(ch.explanation).replace(/</g, '&lt;')}</div>`
      }
    }
    questionsHTML += `</ol>`
    if (q.explanation) questionsHTML += `<div class="explanation">💡 ${q.explanation.replace(/</g, '&lt;')}</div>`
    questionsHTML += `</div>`
  }

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${examTitle} — Report</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:24px;color:#1e293b;font-size:13px;}
  h1{font-size:22px;margin-bottom:4px;} h2{font-size:16px;margin-top:28px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;}
  .meta{color:#64748b;font-size:13px;margin-bottom:20px;}
  .badge{display:inline-block;padding:4px 12px;border-radius:6px;font-weight:700;font-size:14px;color:#fff;}
  .pass{background:#059669;} .fail{background:#dc2626;}
  table{width:100%;border-collapse:collapse;margin:12px 0;} th,td{text-align:left;padding:6px 10px;border:1px solid #e2e8f0;}
  th{background:#f1f5f9;font-size:12px;}
  .q{margin:16px 0;padding:12px;border:1px solid #e2e8f0;border-radius:8px;page-break-inside:avoid;}
  .q-header{font-size:13px;} .q-domain{color:#64748b;font-size:11px;margin:2px 0 6px;}
  ol{padding-left:20px;margin:6px 0;} li{margin:3px 0;padding:2px 4px;border-radius:3px;}
  li.correct{background:#d1fae5;} li.wrong{background:#fee2e2;} li.correct-not-chosen{background:#dbeafe;}
  .explanation{margin-top:8px;padding:8px;background:#fefce8;border-radius:4px;font-size:12px;}
  .choice-expl{margin-left:18px;margin-top:4px;font-size:12px;color:#334155;background:#f8fafc;padding:6px;border-radius:4px;}
  @media print{body{padding:0;} .no-print{display:none;}}
</style></head><body>
<h1>${examTitle} <span style="color:#94a3b8;font-weight:400;font-size:14px">${examCode}</span></h1>
<div class="meta">
  <span class="badge ${passed ? 'pass' : 'fail'}">${score}% — ${passed ? 'PASS' : 'FAIL'}</span>
  &nbsp;&nbsp;${correctCount} / ${total} correct &nbsp;|&nbsp; Completed: ${finishedAt}
</div>
${domainHTML}
${questionsHTML}
<div class="no-print" style="margin-top:24px;text-align:center;">
  <button onclick="window.print()" style="padding:10px 28px;font-size:14px;cursor:pointer;border:none;background:#0ea5e9;color:#fff;border-radius:6px;">Print / Save as PDF</button>
</div>
</body></html>`

  const win = window.open('', '_blank')
  if (win) {
    win.document.write(html)
    win.document.close()
  }
}

/** Download analytics summary as CSV */
export function downloadAnalyticsCSV(
  selected: string | null,
  selectedMeta: Exam | null,
  analyticsAttempts: any[] | null,
  analyticsDomains: Record<string, any> | null
) {
  if (!selected) return
  const examTitle = selectedMeta?.title ?? selected
  const examCode = selectedMeta?.code ?? selected
  const pm = typeof selectedMeta?.passMark === 'number' ? selectedMeta.passMark : 70

  const rows: string[] = []
  rows.push(`Analytics Report — ${examTitle} (${examCode})`)
  rows.push('')

  const atts = analyticsAttempts || []
  const scores = atts
    .map((a: any) => (typeof a.score === 'number' ? a.score : null))
    .filter((v: any) => typeof v === 'number' && Number.isFinite(v)) as number[]
  const finished = scores.length
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
  const avg = finished ? Math.round(scores.map(clamp).reduce((s, x) => s + x, 0) / finished) : null
  const best = finished ? Math.max(...scores.map(clamp)) : null
  const passed = finished ? scores.map(clamp).filter((s) => s >= pm).length : 0
  const passRate = finished ? Math.round((passed / finished) * 100) : null

  rows.push('Metric,Value')
  rows.push(`Total attempts,${atts.length}`)
  rows.push(`Finished,${finished}`)
  rows.push(`Average score,${avg !== null ? avg + '%' : '—'}`)
  rows.push(`Best score,${best !== null ? best + '%' : '—'}`)
  rows.push(`Pass rate,${passRate !== null ? passRate + '%' : '—'}`)
  rows.push('')

  if (analyticsDomains && Object.keys(analyticsDomains).length > 0) {
    rows.push('Domain,Avg Score,Correct,Total,Attempts')
    for (const [domain, v] of Object.entries(analyticsDomains)) {
      rows.push(`${esc(domain)},${v.avgScore}%,${v.correct},${v.total},${v.attemptCount}`)
    }
    rows.push('')
  }

  rows.push('Attempt,Started,Finished,Score,Correct,Total')
  for (const a of atts) {
    rows.push(`${a.attemptId},${a.startedAt ? new Date(a.startedAt).toLocaleString() : ''},${a.finishedAt ? new Date(a.finishedAt).toLocaleString() : ''},${typeof a.score === 'number' ? a.score + '%' : ''},${a.correctCount ?? ''},${a.total ?? ''}`)
  }

  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${examCode || 'exam'}-analytics-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

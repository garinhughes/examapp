import { useState, useCallback, useEffect } from 'react'
import type React from 'react'
import { useExam } from '@/exam/ExamContext'
import type { FillCommandLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { ExplanationBlock } from '../ExplanationBlock'
import { useLabSession } from '../useLabSession'
import { LabCompleteModal } from '../LabCompleteModal'

// Matches, in priority order:
// 1. Comment lines   2. --flags   3. single-quoted strings   4. double-quoted strings
// 5. line-continuation \   6. ARNs   7. s3:// URIs
// 8. "aws <service>" pair   9. standalone "aws"
const SYNTAX_RE =
  /(#[^\n]*)|(--[\w-]+)|('(?:[^'\\]|\\.)*')|("(?:[^"\\]|\\.)*")|(\\(?=[ \t]*(?:\n|$)))|(arn:[\w:.\/-]+)|(s3:\/\/\S+)|(aws)[ \t]+(rds|ecs|route53|s3|cloudfront|sns|ec2|iam|lambda|cloudwatch|sesv2|cognito-idp|secretsmanager|ssm|logs)\b|\b(aws)\b/gm

function highlightCode(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  const re = new RegExp(SYNTAX_RE.source, SYNTAX_RE.flags)
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) nodes.push(text.slice(lastIndex, m.index))
    const [full, comment, flag, sq, dq, bslash, arn, s3uri, awsSvc, svc, awsAlone] = m
    if (comment !== undefined) {
      nodes.push(<span key={k++} className="text-slate-500 dark:text-slate-400 italic">{comment}</span>)
    } else if (flag !== undefined) {
      nodes.push(<span key={k++} className="text-amber-600 dark:text-amber-400">{flag}</span>)
    } else if (sq !== undefined || dq !== undefined) {
      nodes.push(<span key={k++} className="text-orange-600 dark:text-orange-400">{full}</span>)
    } else if (bslash !== undefined) {
      nodes.push(<span key={k++} className="text-slate-400 dark:text-slate-500">{full}</span>)
    } else if (arn !== undefined || s3uri !== undefined) {
      nodes.push(<span key={k++} className="text-emerald-700 dark:text-emerald-400">{full}</span>)
    } else if (awsSvc !== undefined) {
      const gap = full.slice(awsSvc.length, -svc!.length)
      nodes.push(
        <span key={k++}>
          <span className="text-sky-700 dark:text-sky-300 font-semibold">{awsSvc}</span>
          {gap}
          <span className="text-sky-500 dark:text-sky-300">{svc}</span>
        </span>
      )
    } else if (awsAlone !== undefined) {
      nodes.push(<span key={k++} className="text-sky-700 dark:text-sky-300 font-semibold">{awsAlone}</span>)
    }
    lastIndex = m.index + full.length
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

interface FillCommandProgress {
  answers: Record<string, string>   // key: `${questionId}:${blankId}`
  timeLeft: number
}

interface Props {
  lab: FillCommandLabDefinition
  timed?: boolean
}

export function FillCommandRunner({ lab, timed = true }: Props) {
  const { setRoute } = useExam()
  const session = useLabSession<FillCommandProgress>({ lab, timed })

  const [answers, setAnswers] = useState<Record<string, string>>(
    () => session.savedProgress?.answers ?? {}
  )
  const [results, setResults] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ answers, timeLeft: session.timeLeft })
  }, [answers, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !session.submitted) doSubmit()
  }, [session.timeLeft])

  const setBlank = useCallback((qId: string, bId: string, value: string) => {
    if (session.submitted) return
    setAnswers((prev) => ({ ...prev, [`${qId}:${bId}`]: value }))
  }, [session.submitted])

  const doSubmit = useCallback(async () => {
    const res: Record<string, boolean> = {}
    let allCorrect = true
    for (const q of lab.questions) {
      for (const b of q.blanks) {
        const key = `${q.id}:${b.id}`
        const pass = (answers[key] ?? '').trim().toLowerCase() === b.answer.trim().toLowerCase()
        res[key] = pass
        if (!pass) allCorrect = false
      }
    }
    setResults(res)
    await session.finalize(allCorrect, JSON.stringify(answers))
  }, [lab, answers, session.finalize])

  const totalBlanks = lab.questions.reduce((sum, q) => sum + q.blanks.length, 0)
  const filledBlanks = Object.values(answers).filter(Boolean).length

  return (
    <div className="flex flex-col h-full gap-4">
      {session.showConfirmModal && (
        <LabCompleteModal
          title={lab.title}
          timeTaken={session.timeLimit - session.timeLeft}
          timed={timed}
          onConfirm={() => { session.setShowConfirmModal(false); doSubmit() }}
          onCancel={() => session.setShowConfirmModal(false)}
        />
      )}
      <LabHeader
        title={lab.title}
        timed={timed}
        timeLeft={session.timeLeft}
        subtitle={lab.scenario}
        labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ answers, timeLeft: session.timeLeft })}
        onCancelLab={session.submitted ? undefined : session.handleCancelLab}
      />
      {session.resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-4">
        {lab.questions.map((q) => {
          const parts = q.template.split('___')
          let blankIdx = 0
          return (
            <div key={q.id} className="rounded-lg border border-border bg-card p-4">
              <div className="font-mono text-sm whitespace-pre-wrap bg-muted/40 dark:bg-muted/20 rounded p-3 overflow-x-auto leading-relaxed">
                {parts.map((part, i) => {
                  const blank = q.blanks[blankIdx]
                  const node = (
                    <span key={i}>
                      {highlightCode(part)}
                      {i < parts.length - 1 && blank && (() => {
                        const b = blank
                        const key = `${q.id}:${b.id}`
                        const isCorrect = session.submitted ? results[key] : undefined
                        blankIdx++
                        return (
                          <input
                            key={b.id}
                            type="text"
                            placeholder={b.placeholder}
                            value={answers[key] ?? ''}
                            onChange={(e) => setBlank(q.id, b.id, e.target.value)}
                            disabled={session.submitted}
                            spellCheck={false}
                            autoComplete="off"
                            className={`inline font-mono text-sm px-2 py-0.5 rounded border w-44 align-middle focus:outline-none focus:ring-1 focus:ring-primary ${
                              isCorrect === true
                                ? 'border-green-600 bg-green-50 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                : isCorrect === false
                                  ? 'border-red-600 bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                  : 'border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'
                            }`}
                          />
                        )
                      })()}
                    </span>
                  )
                  return node
                })}
              </div>
              {q.hint && !session.submitted && (
                <p className="text-xs text-muted-foreground mt-2">Hint: {q.hint}</p>
              )}
              {session.submitted && (
                <div className="mt-2 space-y-1">
                  {q.blanks.map((b) => {
                    const key = `${q.id}:${b.id}`
                    if (results[key]) return null
                    return (
                      <div key={b.id} className="text-xs text-muted-foreground">
                        Expected: <span className="font-mono text-foreground">{b.answer}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        {!session.submitted ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Fill in all blanks, then submit.</p>
            <button
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50"
              disabled={filledBlanks < totalBlanks}
              onClick={() => session.setShowConfirmModal(true)}
            >
              Submit Commands
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className={`font-semibold text-sm ${Object.values(results).every(Boolean) ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {Object.values(results).every(Boolean)
                ? '✓ All commands correct!'
                : `✗ ${Object.values(results).filter(Boolean).length}/${totalBlanks} correct`}
            </div>
            <ExplanationBlock text={lab.explanation} />
            <button onClick={() => setRoute('skill-labs')} className="mt-2 px-4 py-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition">
              Back to Skill Labs
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

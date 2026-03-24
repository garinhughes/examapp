import { useState, useCallback, useEffect } from 'react'
import { useExam } from '@/exam/ExamContext'
import type { FillCommandLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabSession } from '../useLabSession'
import { LabCompleteModal } from '../LabCompleteModal'

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
          timeTaken={lab.timeLimit - session.timeLeft}
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
              <div className="font-mono text-sm flex flex-wrap items-center gap-1">
                {parts.map((part, i) => {
                  const blank = q.blanks[blankIdx]
                  const node = (
                    <span key={i}>
                      <span>{part}</span>
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
                            className={`inline-block font-mono text-sm px-2 py-0.5 rounded border mx-1 w-36 focus:outline-none focus:ring-1 focus:ring-primary ${
                              isCorrect === true
                                ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
                                : isCorrect === false
                                  ? 'border-destructive bg-destructive/10 text-destructive'
                                  : 'border-border bg-background'
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
            <div className="text-sm text-muted-foreground">{lab.explanation}</div>
            <button onClick={() => setRoute('skill-labs')} className="mt-2 px-4 py-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted/50 transition">
              Back to Skill Labs
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

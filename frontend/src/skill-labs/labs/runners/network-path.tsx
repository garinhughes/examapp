import { useState, useCallback, useEffect } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { NetworkPathLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { ExplanationBlock } from '../ExplanationBlock'
import { useLabSession } from '../useLabSession'
import { LabCheckActions } from '../LabCheckActions'
import { useExam } from '@/exam/ExamContext'

interface NetworkPathProgress {
  checkedSteps: Record<string, boolean>
  selectedAnswer: string | null
  timeLeft: number
}

interface Props {
  lab: NetworkPathLabDefinition
  timed?: boolean
}

export function NetworkPathRunner({ lab, timed = true }: Props) {
  const { setRoute } = useExam()
  const session = useLabSession<NetworkPathProgress>({ lab, timed })

  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>(session.savedProgress?.checkedSteps ?? {})
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(session.savedProgress?.selectedAnswer ?? null)
  const [checked, setChecked] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)

  useEffect(() => {
    if (session.restartKey === 0) return
    setCheckedSteps({})
    setSelectedAnswer(null)
    setChecked(false)
    setIsCorrect(false)
  }, [session.restartKey])

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ checkedSteps, selectedAnswer, timeLeft: session.timeLeft })
  }, [checkedSteps, selectedAnswer, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !checked) handleCheck()
  }, [session.timeLeft])

  const runCheck = useCallback((stepId: string) => {
    if (checked || checkedSteps[stepId] !== undefined) return
    const step = lab.steps.find((s) => s.id === stepId)
    if (!step) return
    session.markDirty()
    setCheckedSteps((prev) => ({ ...prev, [stepId]: step.status === 'pass' }))
  }, [checked, checkedSteps, lab.steps])

  const handleCheck = useCallback(() => {
    if (checked) return
    const correctAnswer = lab.answers.find((a) => a.correct)
    const correct = selectedAnswer === correctAnswer?.id
    setIsCorrect(correct)
    setChecked(true)
  }, [checked, lab, selectedAnswer])

  const handleComplete = useCallback(async () => {
    await session.finalize(isCorrect, selectedAnswer || '')
  }, [session.finalize, selectedAnswer, isCorrect])

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader
        title={lab.title}
        timed={timed}
        timeLeft={session.timeLeft}
        subtitle={lab.scenario}
        labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ checkedSteps, selectedAnswer, timeLeft: session.timeLeft })}
        onRatingClose={() => setRoute('skill-labs')}
      />
      {session.resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Path diagram */}
        <div className="flex-1 rounded-lg border border-border bg-card p-6 overflow-y-auto">
          <div className="flex flex-col items-center gap-1">
            {lab.nodes.map((node, i) => (
              <div key={node.id} className="flex flex-col items-center">
                <div className="px-6 py-3 rounded-lg border-2 border-border bg-card font-semibold text-sm min-w-[160px] text-center">
                  {node.label}
                </div>
                {i < lab.nodes.length - 1 && (
                  <div className="w-px h-8 bg-border relative">
                    {lab.edges[i] && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground whitespace-nowrap">
                        {lab.edges[i].label}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Check controls */}
        <div className="w-80 shrink-0 rounded-lg border border-border bg-card p-4 overflow-y-auto">
          <h3 className="font-semibold text-sm mb-3">Diagnostic Checks</h3>
          <p className="text-xs text-muted-foreground mb-4">Click each check to run the diagnostic and reveal its output. You decide where the failure lies.</p>
          <div className="space-y-2">
            {lab.steps.map((step) => {
              const stepChecked = checkedSteps[step.id]
              const run = stepChecked !== undefined
              return (
                <div key={step.id}>
                  <button
                    onClick={() => runCheck(step.id)}
                    disabled={checked || run}
                    className={`w-full text-left px-3 py-2.5 rounded-md border text-sm transition ${
                      run
                        ? 'border-border bg-muted/40'
                        : 'border-border hover:bg-muted/50 cursor-pointer'
                    } disabled:cursor-not-allowed`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{step.checkLabel}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{run ? 'ran' : 'run →'}</span>
                    </div>
                  </button>
                  {run && (
                    <div className="mt-1 ml-3 text-xs text-muted-foreground font-mono bg-muted/40 rounded px-2 py-1 whitespace-pre-wrap">
                      {step.detail}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Answer section */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h3 className="font-semibold text-sm mb-3">Where is the failure?</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {lab.answers.map((answer) => {
            let cls = 'border border-border rounded-md px-4 py-2.5 text-sm text-left transition '
            if (checked) {
              if (answer.correct) cls += 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
              else if (answer.id === selectedAnswer && !answer.correct) cls += 'border-destructive bg-destructive/10 text-destructive'
              else cls += 'bg-muted/30 text-muted-foreground'
            } else if (answer.id === selectedAnswer) {
              cls += 'border-primary bg-primary/10 text-primary'
            } else {
              cls += 'hover:bg-muted/50 cursor-pointer'
            }
            return (
              <button key={answer.id} className={cls} disabled={checked} onClick={() => { if (!checked) { session.markDirty(); setSelectedAnswer(answer.id) } }}>
                {answer.text}
              </button>
            )
          })}
        </div>
        {checked && (
          <div className="space-y-3">
            <div className={`inline-flex items-center gap-1.5 font-semibold text-sm ${isCorrect ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
              {isCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {isCorrect ? 'Correct!' : 'Incorrect'}
            </div>
            <ExplanationBlock text={lab.explanation} />
          </div>
        )}
      </div>

      <LabCheckActions
        checked={checked}
        isCorrect={isCorrect}
        submitted={session.submitted}
        canCheck={!!selectedAnswer}
        onCheck={handleCheck}
        onComplete={handleComplete}
        onRetry={session.restart}
        onCancel={session.handleCancelLab}
      />
    </div>
  )
}

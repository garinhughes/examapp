import { useState, useCallback, useEffect } from 'react'
import { useExam } from '@/exam/ExamContext'
import type { NetworkPathLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { ExplanationBlock } from '../ExplanationBlock'
import { useLabSession } from '../useLabSession'
import { LabCompleteModal } from '../LabCompleteModal'

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
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({})
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(session.savedProgress?.selectedAnswer ?? null)
  const [isCorrect, setIsCorrect] = useState(false)

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ checkedSteps, selectedAnswer, timeLeft: session.timeLeft })
  }, [checkedSteps, selectedAnswer, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !session.submitted) doSubmit()
  }, [session.timeLeft])

  const runCheck = useCallback((stepId: string) => {
    if (session.submitted || checkedSteps[stepId] !== undefined) return
    const step = lab.steps.find((s) => s.id === stepId)
    if (!step) return
    setCheckedSteps((prev) => ({ ...prev, [stepId]: step.status === 'pass' }))
  }, [session.submitted, checkedSteps, lab.steps])

  const doSubmit = useCallback(async () => {
    const correctAnswer = lab.answers.find((a) => a.correct)
    const correct = selectedAnswer === correctAnswer?.id
    setIsCorrect(correct)
    await session.finalize(correct, selectedAnswer || '')
  }, [lab, selectedAnswer, session.finalize])

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
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ checkedSteps, selectedAnswer, timeLeft: session.timeLeft })}
        onCancelLab={session.submitted ? undefined : session.handleCancelLab}
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
          <p className="text-xs text-muted-foreground mb-4">Click each check to run diagnostics and trace the request path.</p>
          <div className="space-y-2">
            {lab.steps.map((step) => {
              const checked = checkedSteps[step.id]
              return (
                <div key={step.id}>
                  <button
                    onClick={() => runCheck(step.id)}
                    disabled={session.submitted || checked !== undefined}
                    className={`w-full text-left px-3 py-2.5 rounded-md border text-sm transition ${
                      checked === undefined
                        ? 'border-border hover:bg-muted/50 cursor-pointer'
                        : checked
                          ? 'border-green-500/30 bg-green-500/10'
                          : 'border-destructive/30 bg-destructive/10'
                    } disabled:cursor-not-allowed`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{step.checkLabel}</span>
                      {checked !== undefined && (
                        <span className={checked ? 'text-green-600 dark:text-green-400 text-xs font-bold' : 'text-destructive text-xs font-bold'}>
                          {checked ? '✓ PASS' : '✗ FAIL'}
                        </span>
                      )}
                    </div>
                  </button>
                  {checked !== undefined && (
                    <div>
                      <button
                        onClick={() => setExpandedSteps(prev => ({ ...prev, [step.id]: !prev[step.id] }))}
                        className="mt-1 ml-3 text-xs text-muted-foreground hover:text-foreground transition"
                      >
                        {expandedSteps[step.id] ? '▾ hide detail' : '▸ show detail'}
                      </button>
                      {expandedSteps[step.id] && (
                        <div className="mt-1 ml-3 text-xs text-muted-foreground font-mono bg-muted/40 rounded px-2 py-1">
                          {step.detail}
                        </div>
                      )}
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
            if (session.submitted) {
              if (answer.correct) cls += 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
              else if (answer.id === selectedAnswer && !answer.correct) cls += 'border-destructive bg-destructive/10 text-destructive'
              else cls += 'bg-muted/30 text-muted-foreground'
            } else if (answer.id === selectedAnswer) {
              cls += 'border-primary bg-primary/10 text-primary'
            } else {
              cls += 'hover:bg-muted/50 cursor-pointer'
            }
            return (
              <button key={answer.id} className={cls} disabled={session.submitted} onClick={() => !session.submitted && setSelectedAnswer(answer.id)}>
                {answer.text}
              </button>
            )
          })}
        </div>
        {!session.submitted ? (
          <button
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!selectedAnswer}
            onClick={() => session.setShowConfirmModal(true)}
          >
            Submit Answer
          </button>
        ) : (
          <div className="space-y-3">
            <div className={`font-semibold text-sm ${isCorrect ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {isCorrect ? '✓ Correct!' : '✗ Incorrect'}
            </div>
            <ExplanationBlock text={lab.explanation} />
            <button onClick={() => setRoute('skill-labs')} className="mt-2 px-4 py-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted/50 transition">
              Back to Skill Labs
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

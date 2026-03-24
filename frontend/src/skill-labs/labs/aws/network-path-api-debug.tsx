import { useState, useCallback, useRef, useEffect } from 'react'
import { useExam } from '@/exam/ExamContext'
import { apiUrl } from '@/apiBase'
import type { NetworkPathLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabComplete } from '../shared'
import { useLabProgress } from '../useLabProgress'
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
  const { authFetch, user, setRoute } = useExam()
  const completeWithGamification = useLabComplete(lab)
  const { savedProgress, saveProgress, clearProgress } = useLabProgress<NetworkPathProgress>(lab.id, timed)

  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>(savedProgress?.checkedSteps ?? {})
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(savedProgress?.selectedAnswer ?? null)
  const [submitted, setSubmitted] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [resumeNotice, setResumeNotice] = useState(savedProgress !== null)
  const [timeLeft, setTimeLeft] = useState(savedProgress?.timeLeft ?? lab.timeLimit)
  const [labPaused, setLabPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    if (!resumeNotice) return
    const t = setTimeout(() => setResumeNotice(false), 3000)
    return () => clearTimeout(t)
  }, [resumeNotice])

  useEffect(() => {
    if (submitted) return
    saveProgress({ checkedSteps, selectedAnswer, timeLeft })
  }, [checkedSteps, selectedAnswer, timeLeft, submitted])

  useEffect(() => {
    if (submitted || !timed || labPaused) return
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [submitted, timed, labPaused])

  useEffect(() => {
    if (timed && timeLeft === 0 && !submitted) doSubmit()
  }, [timeLeft])

  const runCheck = useCallback((stepId: string) => {
    if (submitted || checkedSteps[stepId] !== undefined) return
    const step = lab.steps.find((s) => s.id === stepId)
    if (!step) return
    setCheckedSteps((prev) => ({ ...prev, [stepId]: step.status === 'pass' }))
  }, [submitted, checkedSteps, lab.steps])

  const doSubmit = useCallback(async () => {
    if (submitted) return
    setSubmitted(true)
    clearProgress()
    if (timerRef.current) clearInterval(timerRef.current)

    const correctAnswer = lab.answers.find((a) => a.correct)
    const correct = selectedAnswer === correctAnswer?.id
    setIsCorrect(correct)
    completeWithGamification(correct)

    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000)
    if (user) {
      try {
        await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedAnswer: selectedAnswer || '', correct, timeTaken }),
        })
      } catch { /* non-critical */ }
    }
  }, [submitted, lab, selectedAnswer, authFetch, user])

  const handlePauseAndExit = useCallback(() => {
    saveProgress({ checkedSteps, selectedAnswer, timeLeft })
    setRoute('skill-labs')
  }, [checkedSteps, selectedAnswer, timeLeft])

  const handleCancelLab = useCallback(() => {
    clearProgress()
    setRoute('skill-labs')
  }, [])

  return (
    <div className="flex flex-col h-full gap-4">
      {showConfirmModal && (
        <LabCompleteModal
          title={lab.title}
          timeTaken={lab.timeLimit - timeLeft}
          timed={timed}
          onConfirm={() => { setShowConfirmModal(false); doSubmit() }}
          onCancel={() => setShowConfirmModal(false)}
        />
      )}
      <LabHeader
        title={lab.title}
        timed={timed}
        timeLeft={timeLeft}
        subtitle={lab.scenario}
        labId={lab.id}
        onPauseChange={setLabPaused}
        onPauseAndExit={submitted ? undefined : handlePauseAndExit}
        onCancelLab={submitted ? undefined : handleCancelLab}
      />
      {resumeNotice && (
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
                    disabled={submitted || checked !== undefined}
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
                    <div className="mt-1 ml-3 text-xs text-muted-foreground font-mono bg-muted/40 rounded px-2 py-1">
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
            if (submitted) {
              if (answer.correct) cls += 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
              else if (answer.id === selectedAnswer && !answer.correct) cls += 'border-destructive bg-destructive/10 text-destructive'
              else cls += 'bg-muted/30 text-muted-foreground'
            } else if (answer.id === selectedAnswer) {
              cls += 'border-primary bg-primary/10 text-primary'
            } else {
              cls += 'hover:bg-muted/50 cursor-pointer'
            }
            return (
              <button key={answer.id} className={cls} disabled={submitted} onClick={() => !submitted && setSelectedAnswer(answer.id)}>
                {answer.text}
              </button>
            )
          })}
        </div>
        {!submitted ? (
          <button
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!selectedAnswer}
            onClick={() => setShowConfirmModal(true)}
          >
            Submit Answer
          </button>
        ) : (
          <div className="space-y-3">
            <div className={`font-semibold text-sm ${isCorrect ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {isCorrect ? '✓ Correct!' : '✗ Incorrect'}
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

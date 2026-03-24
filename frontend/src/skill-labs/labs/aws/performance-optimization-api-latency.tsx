import { useState, useCallback, useRef, useEffect } from 'react'
import { Zap } from 'lucide-react'
import { useExam } from '@/exam/ExamContext'
import { apiUrl } from '@/apiBase'
import type { PerformanceOptLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabComplete } from '../shared'
import { useLabProgress } from '../useLabProgress'
import { LabCompleteModal } from '../LabCompleteModal'

interface PerfOptProgress { selections: Record<string, string>; timeLeft: number }

interface Props {
  lab: PerformanceOptLabDefinition
  timed?: boolean
}

export function PerformanceOptRunner({ lab, timed = true }: Props) {
  const { authFetch, user, setRoute } = useExam()
  const completeWithGamification = useLabComplete(lab)
  const { savedProgress, saveProgress, clearProgress } = useLabProgress<PerfOptProgress>(lab.id, timed)

  const [selections, setSelections] = useState<Record<string, string>>(() => {
    if (savedProgress?.selections) return savedProgress.selections
    const init: Record<string, string> = {}
    for (const p of lab.problems) init[p.id] = ''
    return init
  })
  const [submitted, setSubmitted] = useState(false)
  const [results, setResults] = useState<Record<string, boolean>>({})
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
    saveProgress({ selections, timeLeft })
  }, [selections, timeLeft, submitted])

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

  const handleSelect = useCallback((problemId: string, option: string) => {
    if (submitted) return
    setSelections((prev) => ({ ...prev, [problemId]: option }))
  }, [submitted])

  const doSubmit = useCallback(async () => {
    if (submitted) return
    setSubmitted(true)
    clearProgress()
    if (timerRef.current) clearInterval(timerRef.current)

    const res: Record<string, boolean> = {}
    let allCorrect = true
    for (const p of lab.problems) {
      const pass = selections[p.id] === p.correctOption
      res[p.id] = pass
      if (!pass) allCorrect = false
    }
    setResults(res)
    completeWithGamification(allCorrect)

    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000)
    if (user) {
      try {
        await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedAnswer: JSON.stringify(selections), correct: allCorrect, timeTaken }),
        })
      } catch { /* non-critical */ }
    }
  }, [submitted, lab, selections, authFetch, user])

  const handlePauseAndExit = useCallback(() => {
    saveProgress({ selections, timeLeft })
    setRoute('skill-labs')
  }, [selections, timeLeft])

  const handleCancelLab = useCallback(() => {
    clearProgress()
    setRoute('skill-labs')
  }, [])

  const allCorrect = submitted && lab.problems.every((p) => results[p.id])
  const answeredCount = Object.values(selections).filter(Boolean).length

  return (
    <div className="flex flex-col h-full gap-4">
      {showConfirmModal && (
        <LabCompleteModal title={lab.title} timeTaken={lab.timeLimit - timeLeft} timed={timed}
          onConfirm={() => { setShowConfirmModal(false); doSubmit() }} onCancel={() => setShowConfirmModal(false)} />
      )}
      <LabHeader title={lab.title} timed={timed} timeLeft={timeLeft} subtitle={lab.scenario} labId={lab.id}
        onPauseChange={setLabPaused} onPauseAndExit={submitted ? undefined : handlePauseAndExit}
        onCancelLab={submitted ? undefined : handleCancelLab} />
      {resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

      {/* Architecture description */}
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Architecture</div>
        <div className="text-sm font-mono">{lab.architectureDescription}</div>
      </div>

      {/* Problems list */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {lab.problems.map((problem) => (
          <div
            key={problem.id}
            className={`rounded-lg border p-4 ${
              submitted
                ? results[problem.id] ? 'border-green-500 bg-green-500/5' : 'border-destructive bg-destructive/5'
                : 'border-border bg-card'
            }`}
          >
            <div className="flex items-start gap-3 mb-3">
              <Zap className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-sm">{problem.area}</div>
                <div className="text-sm text-muted-foreground">{problem.problem}</div>
              </div>
            </div>
            <div className="space-y-1.5 ml-7">
              {problem.options.map((option) => (
                <button
                  key={option}
                  onClick={() => handleSelect(problem.id, option)}
                  disabled={submitted}
                  className={`w-full text-left px-3 py-2 rounded-md border text-sm transition ${
                    submitted && option === problem.correctOption
                      ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
                      : submitted && selections[problem.id] === option && option !== problem.correctOption
                        ? 'border-destructive bg-destructive/10 text-destructive'
                        : selections[problem.id] === option
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:bg-muted/50'
                  } disabled:cursor-not-allowed`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Submit / Result */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        {!submitted ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Choose the best optimization for each problem area.</p>
            <button
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50"
              disabled={answeredCount < lab.problems.length}
              onClick={() => setShowConfirmModal(true)}
            >
              Submit Optimizations
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className={`font-semibold text-sm ${allCorrect ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {allCorrect
                ? '✓ All optimizations correct!'
                : `✗ ${Object.values(results).filter(Boolean).length}/${lab.problems.length} correct`}
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

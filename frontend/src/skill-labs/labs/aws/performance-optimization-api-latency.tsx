import { useState, useCallback, useRef, useEffect } from 'react'
import { Zap } from 'lucide-react'
import { useExam } from '@/exam/ExamContext'
import { apiUrl } from '@/apiBase'
import type { PerformanceOptLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { markLabCompleted } from '../shared'

interface Props {
  lab: PerformanceOptLabDefinition
  timed?: boolean
}

export function PerformanceOptRunner({ lab, timed = true }: Props) {
  const { authFetch, user } = useExam()

  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const p of lab.problems) init[p.id] = ''
    return init
  })
  const [submitted, setSubmitted] = useState(false)
  const [results, setResults] = useState<Record<string, boolean>>({})
  const [timeLeft, setTimeLeft] = useState(lab.timeLimit)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    if (submitted || !timed) return
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [submitted, timed])

  useEffect(() => {
    if (timed && timeLeft === 0 && !submitted) handleSubmit()
  }, [timeLeft])

  const handleSelect = useCallback((problemId: string, option: string) => {
    if (submitted) return
    setSelections((prev) => ({ ...prev, [problemId]: option }))
  }, [submitted])

  const handleSubmit = useCallback(async () => {
    if (submitted) return
    setSubmitted(true)
    if (timerRef.current) clearInterval(timerRef.current)

    const res: Record<string, boolean> = {}
    let allCorrect = true
    for (const p of lab.problems) {
      const pass = selections[p.id] === p.correctOption
      res[p.id] = pass
      if (!pass) allCorrect = false
    }
    setResults(res)
    markLabCompleted(lab.id)

    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000)
    if (user) {
      try {
        await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedAnswer: JSON.stringify(selections), correct: allCorrect, timeTaken, labType: 'performance-optimization' }),
        })
      } catch { /* non-critical */ }
    }
  }, [submitted, lab, selections, authFetch, user])

  const allCorrect = submitted && lab.problems.every((p) => results[p.id])
  const answeredCount = Object.values(selections).filter(Boolean).length

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader title={lab.title} timed={timed} timeLeft={timeLeft} subtitle={lab.scenario} labId={lab.id} />

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
              onClick={handleSubmit}
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
          </div>
        )}
      </div>
    </div>
  )
}

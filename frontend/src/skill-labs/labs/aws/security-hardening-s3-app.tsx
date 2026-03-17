import { useState, useCallback, useRef, useEffect } from 'react'
import { Shield } from 'lucide-react'
import { useExam } from '@/exam/ExamContext'
import { apiUrl } from '@/apiBase'
import type { SecurityHardeningLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { markLabCompleted } from '../shared'

interface Props {
  lab: SecurityHardeningLabDefinition
  timed?: boolean
}

export function SecurityHardeningRunner({ lab, timed = true }: Props) {
  const { authFetch, user } = useExam()

  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const issue of lab.issues) init[issue.id] = ''
    return init
  })
  const [submitted, setSubmitted] = useState(false)
  const [results, setResults] = useState<Record<string, boolean>>({})
  const [timeLeft, setTimeLeft] = useState(lab.timeLimit)
  const [labPaused, setLabPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(Date.now())

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
    if (timed && timeLeft === 0 && !submitted) handleSubmit()
  }, [timeLeft])

  const handleSelect = useCallback((issueId: string, option: string) => {
    if (submitted) return
    setSelections((prev) => ({ ...prev, [issueId]: option }))
  }, [submitted])

  const handleSubmit = useCallback(async () => {
    if (submitted) return
    setSubmitted(true)
    if (timerRef.current) clearInterval(timerRef.current)

    const res: Record<string, boolean> = {}
    let allCorrect = true
    for (const issue of lab.issues) {
      const pass = selections[issue.id] === issue.correctOption
      res[issue.id] = pass
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
          body: JSON.stringify({ selectedAnswer: JSON.stringify(selections), correct: allCorrect, timeTaken }),
        })
      } catch { /* non-critical */ }
    }
  }, [submitted, lab, selections, authFetch, user])

  const allCorrect = submitted && lab.issues.every((issue) => results[issue.id])
  const answeredCount = Object.values(selections).filter(Boolean).length

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader title={lab.title} timed={timed} timeLeft={timeLeft} subtitle={lab.scenario} labId={lab.id} onPauseChange={setLabPaused} />

      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all rounded-full"
            style={{ width: `${(answeredCount / lab.issues.length) * 100}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground">{answeredCount}/{lab.issues.length} addressed</span>
      </div>

      {/* Issues list */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {lab.issues.map((issue) => (
          <div
            key={issue.id}
            className={`rounded-lg border p-4 ${
              submitted
                ? results[issue.id] ? 'border-green-500 bg-green-500/5' : 'border-destructive bg-destructive/5'
                : 'border-border bg-card'
            }`}
          >
            <div className="flex items-start gap-3 mb-3">
              <Shield className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-sm">{issue.resource}</div>
                <div className="text-sm text-destructive/80 dark:text-red-400/80">{issue.issue}</div>
              </div>
            </div>
            <div className="space-y-1.5 ml-7">
              {issue.options.map((option) => (
                <button
                  key={option}
                  onClick={() => handleSelect(issue.id, option)}
                  disabled={submitted}
                  className={`w-full text-left px-3 py-2 rounded-md border text-sm transition ${
                    submitted && option === issue.correctOption
                      ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
                      : submitted && selections[issue.id] === option && option !== issue.correctOption
                        ? 'border-destructive bg-destructive/10 text-destructive'
                        : selections[issue.id] === option
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
            <p className="text-sm text-muted-foreground">Select the correct fix for each security vulnerability.</p>
            <button
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50"
              disabled={answeredCount < lab.issues.length}
              onClick={handleSubmit}
            >
              Submit Fixes
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className={`font-semibold text-sm ${allCorrect ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {allCorrect
                ? '✓ All vulnerabilities fixed!'
                : `✗ ${Object.values(results).filter(Boolean).length}/${lab.issues.length} correct`}
            </div>
            <div className="text-sm text-muted-foreground">{lab.explanation}</div>
          </div>
        )}
      </div>
    </div>
  )
}

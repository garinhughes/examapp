import { useState, useCallback, useRef, useEffect } from 'react'
import { Activity } from 'lucide-react'
import { useExam } from '@/exam/ExamContext'
import { apiUrl } from '@/apiBase'
import type { ServiceLimitsLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { markLabCompleted } from '../shared'

interface Props {
  lab: ServiceLimitsLabDefinition
  timed?: boolean
}

export function ServiceLimitsRunner({ lab, timed = true }: Props) {
  const { authFetch, user } = useExam()

  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const m of lab.metrics) init[m.id] = ''
    return init
  })
  const [submitted, setSubmitted] = useState(false)
  const [results, setResults] = useState<Record<string, boolean>>({})
  const [timeLeft, setTimeLeft] = useState(lab.timeLimit)
  const [labPaused, setLabPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(Date.now())
  const [simPhase, setSimPhase] = useState(0) // 0=idle, 1=spiking, 2=done

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

  // Auto-start the traffic spike simulation after 2 seconds
  useEffect(() => {
    const t = setTimeout(() => setSimPhase(1), 2000)
    return () => clearTimeout(t)
  }, [])

  const handleSelect = useCallback((metricId: string, option: string) => {
    if (submitted) return
    setSelections((prev) => ({ ...prev, [metricId]: option }))
  }, [submitted])

  const handleSubmit = useCallback(async () => {
    if (submitted) return
    setSubmitted(true)
    setSimPhase(2)
    if (timerRef.current) clearInterval(timerRef.current)

    const res: Record<string, boolean> = {}
    let allCorrect = true
    for (const m of lab.metrics) {
      const pass = selections[m.id] === m.correctOption
      res[m.id] = pass
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

  const allCorrect = submitted && lab.metrics.every((m) => results[m.id])
  const answeredCount = Object.values(selections).filter(Boolean).length

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader title={lab.title} timed={timed} timeLeft={timeLeft} subtitle={lab.scenario} labId={lab.id} onPauseChange={setLabPaused} />

      {/* Simulation status */}
      <div className={`rounded-lg border px-4 py-3 flex items-center gap-3 ${
        simPhase === 0 ? 'border-border bg-card' : simPhase === 1 ? 'border-amber-500 bg-amber-500/10' : 'border-border bg-card'
      }`}>
        <Activity className={`w-5 h-5 ${simPhase === 1 ? 'text-amber-500 animate-pulse' : 'text-muted-foreground'}`} />
        <div>
          <div className="text-sm font-semibold">
            {simPhase === 0 && 'Initializing simulation…'}
            {simPhase === 1 && '⚠ Traffic spike in progress!'}
            {simPhase === 2 && 'Simulation complete'}
          </div>
          <div className="text-xs text-muted-foreground">
            {simPhase === 1 && 'Select the correct scaling action for each metric below.'}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {lab.metrics.map((metric) => (
          <div
            key={metric.id}
            className={`rounded-lg border p-4 ${
              submitted
                ? results[metric.id] ? 'border-green-500 bg-green-500/5' : 'border-destructive bg-destructive/5'
                : 'border-border bg-card'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-semibold text-sm">{metric.metric}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Current: <span className="font-mono text-destructive">{metric.currentValue}</span>
                  {' → '}Target: <span className="font-mono text-green-600 dark:text-green-400">{metric.targetValue}</span>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              {metric.options.map((option) => (
                <button
                  key={option}
                  onClick={() => handleSelect(metric.id, option)}
                  disabled={submitted}
                  className={`w-full text-left px-3 py-2 rounded-md border text-sm transition ${
                    submitted && option === metric.correctOption
                      ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
                      : submitted && selections[metric.id] === option && option !== metric.correctOption
                        ? 'border-destructive bg-destructive/10 text-destructive'
                        : selections[metric.id] === option
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
            <p className="text-sm text-muted-foreground">Choose the correct scaling action for each metric.</p>
            <button
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50"
              disabled={answeredCount < lab.metrics.length}
              onClick={handleSubmit}
            >
              Apply Scaling Actions
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className={`font-semibold text-sm ${allCorrect ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {allCorrect
                ? '✓ All scaling actions correct — system stabilized!'
                : `✗ ${Object.values(results).filter(Boolean).length}/${lab.metrics.length} correct`}
            </div>
            <div className="text-sm text-muted-foreground">{lab.explanation}</div>
          </div>
        )}
      </div>
    </div>
  )
}

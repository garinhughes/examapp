import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { DollarSign, ArrowRight } from 'lucide-react'
import { useExam } from '@/exam/ExamContext'
import { apiUrl } from '@/apiBase'
import type { CostOptimizationLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabComplete } from '../shared'

interface Props {
  lab: CostOptimizationLabDefinition
  timed?: boolean
}

export function CostOptimizationRunner({ lab, timed = true }: Props) {
  const { authFetch, user } = useExam()
  const completeWithGamification = useLabComplete(lab)

  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const comp of lab.components) init[comp.id] = comp.currentService
    return init
  })
  const [submitted, setSubmitted] = useState(false)
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

  const currentTotal = useMemo(() => {
    return lab.components.reduce((sum, comp) => {
      const selected = selections[comp.id]
      if (selected === comp.currentService) return sum + comp.currentCost
      const alt = comp.alternatives.find((a) => a.service === selected)
      return sum + (alt?.cost ?? comp.currentCost)
    }, 0)
  }, [selections, lab.components])

  const originalTotal = useMemo(() => {
    return lab.components.reduce((sum, comp) => sum + comp.currentCost, 0)
  }, [lab.components])

  const handleSelect = useCallback((compId: string, service: string) => {
    if (submitted) return
    setSelections((prev) => ({ ...prev, [compId]: service }))
  }, [submitted])

  const handleSubmit = useCallback(async () => {
    if (submitted) return
    setSubmitted(true)
    if (timerRef.current) clearInterval(timerRef.current)

    const correct = currentTotal <= lab.targetCost
    completeWithGamification(correct)

    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000)
    if (user) {
      try {
        await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedAnswer: JSON.stringify(selections), correct, timeTaken }),
        })
      } catch { /* non-critical */ }
    }
  }, [submitted, lab, selections, currentTotal, authFetch, user])

  const meetsTarget = currentTotal <= lab.targetCost

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader title={lab.title} timed={timed} timeLeft={timeLeft} subtitle={lab.scenario} labId={lab.id} onPauseChange={setLabPaused} />

      {/* Cost summary bar */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-5 py-3 shadow-sm">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-xs text-muted-foreground">Original Cost</div>
            <div className="font-mono font-semibold text-lg">${originalTotal}/mo</div>
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <div>
            <div className="text-xs text-muted-foreground">Current Cost</div>
            <div className={`font-mono font-semibold text-lg ${meetsTarget ? 'text-green-600 dark:text-green-400' : 'text-foreground'}`}>
              ${currentTotal}/mo
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Target</div>
          <div className={`font-mono font-semibold ${meetsTarget ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
            &lt; ${lab.targetCost}/mo
          </div>
        </div>
      </div>

      {/* Component cards */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lab.components.map((comp) => {
            const allOptions = [
              { service: comp.currentService, cost: comp.currentCost },
              ...comp.alternatives,
            ]
            const isCorrectChoice = submitted && selections[comp.id] === comp.correctService
            const isWrongChoice = submitted && selections[comp.id] !== comp.correctService

            return (
              <div key={comp.id} className={`rounded-lg border p-4 ${
                submitted
                  ? isCorrectChoice ? 'border-green-500 bg-green-500/5' : 'border-destructive bg-destructive/5'
                  : 'border-border bg-card'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">{comp.name}</span>
                </div>
                <div className="space-y-1.5">
                  {allOptions.map((opt) => (
                    <button
                      key={opt.service}
                      onClick={() => handleSelect(comp.id, opt.service)}
                      disabled={submitted}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-md border text-sm transition ${
                        selections[comp.id] === opt.service
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:bg-muted/50'
                      } disabled:cursor-not-allowed`}
                    >
                      <span>{opt.service}</span>
                      <span className="font-mono text-xs">${opt.cost}/mo</span>
                    </button>
                  ))}
                </div>
                {submitted && isWrongChoice && (
                  <div className="text-xs text-muted-foreground mt-2">
                    Recommended: <span className="font-mono text-foreground">{comp.correctService}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Submit / Result */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        {!submitted ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Swap services to reduce costs below ${lab.targetCost}/mo while keeping architecture functional.
            </p>
            <button
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition"
              onClick={handleSubmit}
            >
              Submit Optimization
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className={`font-semibold text-sm ${meetsTarget ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {meetsTarget
                ? `✓ Cost reduced to $${currentTotal}/mo — under target!`
                : `✗ Cost is $${currentTotal}/mo — still above $${lab.targetCost}/mo target`}
            </div>
            <div className="text-sm text-muted-foreground">{lab.explanation}</div>
          </div>
        )}
      </div>
    </div>
  )
}

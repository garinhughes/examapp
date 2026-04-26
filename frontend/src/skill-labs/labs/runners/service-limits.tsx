import { useState, useCallback, useEffect } from 'react'
import { Activity, CheckCircle2, XCircle } from 'lucide-react'
import type { ServiceLimitsLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { ExplanationBlock } from '../ExplanationBlock'
import { useLabSession } from '../useLabSession'
import { LabCheckActions } from '../LabCheckActions'
import { useExam } from '@/exam/ExamContext'

interface ServiceLimitsProgress { selections: Record<string, string>; timeLeft: number }

interface Props {
  lab: ServiceLimitsLabDefinition
  timed?: boolean
}

export function ServiceLimitsRunner({ lab, timed = true }: Props) {
  const { setRoute } = useExam()
  const session = useLabSession<ServiceLimitsProgress>({ lab, timed })

  const [selections, setSelections] = useState<Record<string, string>>(() => {
    if (session.savedProgress?.selections) return session.savedProgress.selections
    const init: Record<string, string> = {}
    for (const m of lab.metrics) init[m.id] = ''
    return init
  })
  const [results, setResults] = useState<Record<string, boolean>>({})
  const [simPhase, setSimPhase] = useState(session.savedProgress ? 1 : 0)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (session.restartKey === 0) return
    const init: Record<string, string> = {}
    for (const m of lab.metrics) init[m.id] = ''
    setSelections(init)
    setResults({})
    setSimPhase(0)
    setChecked(false)
    const t = setTimeout(() => setSimPhase(1), 2000)
    return () => clearTimeout(t)
  }, [session.restartKey])

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ selections, timeLeft: session.timeLeft })
  }, [selections, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !checked) handleCheck()
  }, [session.timeLeft])

  // Auto-start the traffic spike simulation after 2 seconds (skip if resuming)
  useEffect(() => {
    if (session.savedProgress) return
    const t = setTimeout(() => setSimPhase(1), 2000)
    return () => clearTimeout(t)
  }, [])

  const handleSelect = useCallback((metricId: string, option: string) => {
    if (checked) return
    session.markDirty()
    setSelections((prev) => ({ ...prev, [metricId]: option }))
  }, [checked])

  const handleCheck = useCallback(() => {
    if (checked) return
    setSimPhase(2)
    const res: Record<string, boolean> = {}
    for (const m of lab.metrics) {
      res[m.id] = selections[m.id] === m.correctOption
    }
    setResults(res)
    setChecked(true)
  }, [checked, lab, selections])

  const handleComplete = useCallback(async () => {
    await session.finalize(allCorrect, JSON.stringify(selections))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.finalize, selections, results])

  const allCorrect = checked && lab.metrics.every((m) => results[m.id])
  const answeredCount = Object.values(selections).filter(Boolean).length

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader title={lab.title} timed={timed} timeLeft={session.timeLeft} subtitle={lab.scenario} labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ selections, timeLeft: session.timeLeft })}
        onRatingClose={() => setRoute('skill-labs')} />
      {session.resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

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
              checked
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
                  disabled={checked}
                  className={`w-full text-left px-3 py-2 rounded-md border text-sm transition ${
                    checked && option === metric.correctOption
                      ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
                      : checked && selections[metric.id] === option && option !== metric.correctOption
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

      {checked && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-2">
          <div className={`inline-flex items-center gap-1.5 font-semibold text-sm ${allCorrect ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
            {allCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {allCorrect
              ? 'All scaling actions correct — system stabilized!'
              : `${Object.values(results).filter(Boolean).length}/${lab.metrics.length} correct`}
          </div>
          <ExplanationBlock text={lab.explanation} />
        </div>
      )}

      <LabCheckActions
        checked={checked}
        isCorrect={allCorrect}
        submitted={session.submitted}
        canCheck={answeredCount >= lab.metrics.length}
        onCheck={handleCheck}
        onComplete={handleComplete}
        onRetry={session.restart}
        onCancel={session.handleCancelLab}
      />
    </div>
  )
}

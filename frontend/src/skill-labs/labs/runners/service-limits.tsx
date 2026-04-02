import { useState, useCallback, useEffect } from 'react'
import { Activity } from 'lucide-react'
import { useExam } from '@/exam/ExamContext'
import type { ServiceLimitsLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { ExplanationBlock } from '../ExplanationBlock'
import { useLabSession } from '../useLabSession'
import { LabCompleteModal } from '../LabCompleteModal'

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

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ selections, timeLeft: session.timeLeft })
  }, [selections, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !session.submitted) doSubmit()
  }, [session.timeLeft])

  // Auto-start the traffic spike simulation after 2 seconds (skip if resuming)
  useEffect(() => {
    if (session.savedProgress) return
    const t = setTimeout(() => setSimPhase(1), 2000)
    return () => clearTimeout(t)
  }, [])

  const handleSelect = useCallback((metricId: string, option: string) => {
    if (session.submitted) return
    setSelections((prev) => ({ ...prev, [metricId]: option }))
  }, [session.submitted])

  const doSubmit = useCallback(async () => {
    setSimPhase(2)
    const res: Record<string, boolean> = {}
    let allCorrect = true
    for (const m of lab.metrics) {
      const pass = selections[m.id] === m.correctOption
      res[m.id] = pass
      if (!pass) allCorrect = false
    }
    setResults(res)
    await session.finalize(allCorrect, JSON.stringify(selections))
  }, [lab, selections, session.finalize])

  const allCorrect = session.submitted && lab.metrics.every((m) => results[m.id])
  const answeredCount = Object.values(selections).filter(Boolean).length

  return (
    <div className="flex flex-col h-full gap-4">
      {session.showConfirmModal && (
        <LabCompleteModal title={lab.title} timeTaken={lab.timeLimit - session.timeLeft} timed={timed}
          onConfirm={() => { session.setShowConfirmModal(false); doSubmit() }} onCancel={() => session.setShowConfirmModal(false)} />
      )}
      <LabHeader title={lab.title} timed={timed} timeLeft={session.timeLeft} subtitle={lab.scenario} labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ selections, timeLeft: session.timeLeft })}
        onCancelLab={session.submitted ? undefined : session.handleCancelLab} />
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
              session.submitted
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
                  disabled={session.submitted}
                  className={`w-full text-left px-3 py-2 rounded-md border text-sm transition ${
                    session.submitted && option === metric.correctOption
                      ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
                      : session.submitted && selections[metric.id] === option && option !== metric.correctOption
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
        {!session.submitted ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Choose the correct scaling action for each metric.</p>
            <button
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50"
              disabled={answeredCount < lab.metrics.length}
              onClick={() => session.setShowConfirmModal(true)}
            >
              Apply Scaling Actions
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className={`font-semibold text-sm ${allCorrect ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {allCorrect
                ? '✓ All scaling actions correct - system stabilized!'
                : `✗ ${Object.values(results).filter(Boolean).length}/${lab.metrics.length} correct`}
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

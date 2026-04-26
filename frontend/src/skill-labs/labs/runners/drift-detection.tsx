import { useState, useCallback, useEffect } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { DriftDetectionLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { LabDiagram } from '../LabDiagram'
import { ExplanationBlock } from '../ExplanationBlock'
import { useLabSession } from '../useLabSession'
import { LabCheckActions } from '../LabCheckActions'
import { useExam } from '@/exam/ExamContext'

interface DriftProgress {
  selections: Record<string, boolean>   // resourceId → user thinks it drifted
  timeLeft: number
}

interface Props {
  lab: DriftDetectionLabDefinition
  timed?: boolean
}

export function DriftDetectionRunner({ lab, timed = true }: Props) {
  const { setRoute } = useExam()
  const session = useLabSession<DriftProgress>({ lab, timed })

  const [selections, setSelections] = useState<Record<string, boolean>>(
    () => session.savedProgress?.selections ?? {}
  )
  const [results, setResults] = useState<Record<string, boolean> | null>(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (session.restartKey === 0) return
    setSelections({})
    setResults(null)
    setChecked(false)
  }, [session.restartKey])

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ selections, timeLeft: session.timeLeft })
  }, [selections, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !checked) handleCheck()
  }, [session.timeLeft])

  const toggleSelection = useCallback((resourceId: string) => {
    if (checked) return
    session.markDirty()
    setSelections(prev => ({ ...prev, [resourceId]: !prev[resourceId] }))
  }, [checked])

  const handleCheck = useCallback(() => {
    if (checked) return
    const res: Record<string, boolean> = {}
    for (const resource of lab.resources) {
      const userSaysDrifted = !!selections[resource.id]
      res[resource.id] = userSaysDrifted === resource.drifted
    }
    setResults(res)
    setChecked(true)
  }, [checked, lab, selections])

  const handleComplete = useCallback(async () => {
    await session.finalize(allCorrect, JSON.stringify(selections))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.finalize, selections, results])

  const totalResources = lab.resources.length
  const markedCount = Object.values(selections).filter(Boolean).length
  const correctCount = results ? Object.values(results).filter(Boolean).length : 0
  const allCorrect = results != null && correctCount === totalResources

  return (
    <div className="flex flex-col h-full gap-3">
      <LabHeader
        title={lab.title}
        timed={timed}
        timeLeft={session.timeLeft}
        subtitle={lab.scenario}
        labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ selections, timeLeft: session.timeLeft })}
        onRatingClose={() => setRoute('skill-labs')}
      />

      {session.resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

      {/* Expected-state diagram */}
      {lab.mermaidCode && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Expected state (Terraform)
          </div>
          <LabDiagram code={lab.mermaidCode} idHint={lab.id} />
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm">
        <span className="text-muted-foreground">
          {totalResources} live resources • {markedCount} marked as drifted
        </span>
        {checked && results && (
          <span className={`font-semibold ${allCorrect ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
            {correctCount}/{totalResources} correct
          </span>
        )}
      </div>

      {/* Resource list — flat, actual values only */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {lab.resources.map(resource => {
          const userMarkedDrifted = !!selections[resource.id]
          const showResult = checked && results
          const isResourceCorrect = showResult ? results[resource.id] : undefined

          // With a mermaid diagram, the diagram is the source of truth — show actual only.
          // Without one, show expected alongside actual so users can still spot the drift.
          const showExpected = !lab.mermaidCode
          const keys = Object.keys({ ...resource.expected, ...resource.actual })

          return (
            <div
              key={resource.id}
              className={`rounded-lg border p-3 transition ${
                showResult
                  ? isResourceCorrect
                    ? 'border-green-500/50 bg-green-500/5'
                    : 'border-destructive/50 bg-destructive/5'
                  : userMarkedDrifted
                    ? 'border-amber-400 bg-amber-500/5'
                    : 'border-border bg-card'
              }`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {resource.resourceType}
                    </span>
                    <span className="font-medium text-sm">{resource.resourceName}</span>
                    {showResult && (
                      <span className={`text-xs font-bold ${isResourceCorrect ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                        {isResourceCorrect ? '✓' : `✗ ${resource.drifted ? 'actually drifted' : 'no drift'}`}
                      </span>
                    )}
                  </div>
                  <div className={`grid gap-x-4 gap-y-0.5 ${showExpected ? 'grid-cols-[auto_1fr_1fr]' : 'grid-cols-1 sm:grid-cols-2'}`}>
                    {showExpected && (
                      <>
                        <span />
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Expected</span>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Actual</span>
                      </>
                    )}
                    {keys.map(key => {
                      const expected = resource.expected[key] ?? '—'
                      const actual = resource.actual[key] ?? '—'
                      const differs = expected !== actual
                      if (showExpected) {
                        return (
                          <div key={key} className="contents text-xs">
                            <span className="font-mono text-muted-foreground truncate">{key}</span>
                            <span className="font-mono truncate">{expected}</span>
                            <span className={`font-mono truncate ${differs ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}`}>{actual}</span>
                          </div>
                        )
                      }
                      return (
                        <div key={key} className="flex justify-between gap-2 text-xs">
                          <span className="font-mono text-muted-foreground truncate">{key}</span>
                          <span className="font-mono font-medium text-right truncate">{actual}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <button
                  onClick={() => toggleSelection(resource.id)}
                  disabled={checked}
                  className={`shrink-0 px-3 py-1.5 rounded-md border text-xs font-medium transition ${
                    userMarkedDrifted
                      ? 'border-amber-400 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                      : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/50'
                  } disabled:cursor-not-allowed disabled:opacity-70`}
                >
                  {userMarkedDrifted ? '⚠ Drifted' : 'Mark Drifted'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {checked && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-2">
          <div className={`inline-flex items-center gap-1.5 font-semibold text-sm ${allCorrect ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
            {allCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {allCorrect ? 'All drift assessments correct!' : `${correctCount}/${totalResources} correct`}
          </div>
          <ExplanationBlock text={lab.explanation} />
        </div>
      )}

      <LabCheckActions
        checked={checked}
        isCorrect={allCorrect}
        submitted={session.submitted}
        canCheck
        onCheck={handleCheck}
        onComplete={handleComplete}
        onRetry={session.restart}
        onCancel={session.handleCancelLab}
      />
    </div>
  )
}

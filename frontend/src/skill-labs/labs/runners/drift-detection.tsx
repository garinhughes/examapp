import { useState, useCallback, useEffect } from 'react'
import { useExam } from '@/exam/ExamContext'
import type { DriftDetectionLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { LabDiagram } from '../LabDiagram'
import { ExplanationBlock } from '../ExplanationBlock'
import { useLabSession } from '../useLabSession'
import { LabCompleteModal } from '../LabCompleteModal'

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

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ selections, timeLeft: session.timeLeft })
  }, [selections, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !session.submitted) doSubmit()
  }, [session.timeLeft])

  const toggleSelection = useCallback((resourceId: string) => {
    if (session.submitted) return
    setSelections(prev => ({ ...prev, [resourceId]: !prev[resourceId] }))
  }, [session.submitted])

  const doSubmit = useCallback(async () => {
    const res: Record<string, boolean> = {}
    let allCorrect = true
    for (const resource of lab.resources) {
      const userSaysDrifted = !!selections[resource.id]
      const correct = userSaysDrifted === resource.drifted
      res[resource.id] = correct
      if (!correct) allCorrect = false
    }
    setResults(res)
    await session.finalize(allCorrect, JSON.stringify(selections))
  }, [lab, selections, session.finalize])

  const totalResources = lab.resources.length
  const markedCount = Object.values(selections).filter(Boolean).length
  const correctCount = results ? Object.values(results).filter(Boolean).length : 0
  const allCorrect = results != null && correctCount === totalResources

  return (
    <div className="flex flex-col h-full gap-3">
      {session.showConfirmModal && (
        <LabCompleteModal
          title={lab.title}
          timeTaken={session.timeLimit - session.timeLeft}
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
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ selections, timeLeft: session.timeLeft })}
        onCancelLab={session.submitted ? undefined : session.handleCancelLab}
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
        {session.submitted && results && (
          <span className={`font-semibold ${allCorrect ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
            {correctCount}/{totalResources} correct
          </span>
        )}
      </div>

      {/* Resource list — flat, actual values only */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {lab.resources.map(resource => {
          const userMarkedDrifted = !!selections[resource.id]
          const showResult = session.submitted && results
          const isCorrect = showResult ? results[resource.id] : undefined

          // With a mermaid diagram, the diagram is the source of truth — show actual only.
          // Without one, show expected alongside actual so users can still spot the drift.
          const showExpected = !lab.mermaidCode
          const keys = Object.keys({ ...resource.expected, ...resource.actual })

          return (
            <div
              key={resource.id}
              className={`rounded-lg border p-3 transition ${
                showResult
                  ? isCorrect
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
                      <span className={`text-xs font-bold ${isCorrect ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                        {isCorrect ? '✓' : `✗ ${resource.drifted ? 'actually drifted' : 'no drift'}`}
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
                  disabled={session.submitted}
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

      {/* Bottom bar */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        {!session.submitted ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-muted-foreground">
              Compare each live resource against the expected Terraform state, then mark the ones that have drifted.
            </p>
            <button
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition"
              onClick={() => session.setShowConfirmModal(true)}
            >
              Submit Assessment
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className={`font-semibold text-sm ${allCorrect ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {allCorrect ? '✓ All drift assessments correct!' : `✗ ${correctCount}/${totalResources} correct`}
            </div>
            <ExplanationBlock text={lab.explanation} />
            <button onClick={() => setRoute('skill-labs')} className="mt-2 px-4 py-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition">
              Back to Skill Labs
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

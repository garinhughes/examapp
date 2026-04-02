import { useState, useCallback, useEffect } from 'react'
import { useExam } from '@/exam/ExamContext'
import type { DriftDetectionLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
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

  return (
    <div className="flex flex-col h-full gap-3">
      {session.showConfirmModal && (
        <LabCompleteModal
          title={lab.title}
          timeTaken={lab.timeLimit - session.timeLeft}
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

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 border border-border text-sm">
        <span className="text-muted-foreground">
          {totalResources} resources to inspect • {markedCount} marked as drifted
        </span>
        {session.submitted && results && (
          <span className={`font-semibold ${Object.values(results).every(Boolean) ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
            {Object.values(results).filter(Boolean).length}/{totalResources} correct
          </span>
        )}
      </div>

      {/* Resource list */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {lab.resources.map(resource => {
          const isExpanded = expandedId === resource.id
          const userMarkedDrifted = !!selections[resource.id]
          const showResult = session.submitted && results
          const isCorrect = showResult ? results[resource.id] : undefined

          // Find actual diff keys
          const allKeys = [...new Set([...Object.keys(resource.expected), ...Object.keys(resource.actual)])]
          const diffKeys = allKeys.filter(k => resource.expected[k] !== resource.actual[k])

          return (
            <div
              key={resource.id}
              className={`rounded-lg border transition ${
                showResult
                  ? isCorrect
                    ? 'border-green-500/50 bg-green-500/5'
                    : 'border-destructive/50 bg-destructive/5'
                  : userMarkedDrifted
                    ? 'border-amber-400 bg-amber-500/5'
                    : 'border-border bg-card'
              }`}
            >
              {/* Resource header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : resource.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
              >
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                  {resource.resourceType}
                </span>
                <span className="font-medium text-sm flex-1">{resource.resourceName}</span>
                {showResult && (
                  <span className={`text-xs font-bold ${isCorrect ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                    {isCorrect ? '✓' : '✗'}
                    {showResult && !isCorrect && (
                      <span className="ml-1 font-normal">
                        {resource.drifted ? '(has drift)' : '(no drift)'}
                      </span>
                    )}
                  </span>
                )}
                <span className="text-muted-foreground text-xs">{isExpanded ? '▲' : '▼'}</span>
              </button>

              {/* Expanded: side-by-side config */}
              {isExpanded && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Expected */}
                    <div className="rounded-md border border-border bg-background p-3">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                        Expected (Terraform)
                      </div>
                      <div className="space-y-1.5">
                        {allKeys.map(key => (
                          <div key={key} className="flex justify-between text-xs">
                            <span className="font-mono text-muted-foreground">{key}</span>
                            <span className={`font-mono font-medium ${
                              showResult && diffKeys.includes(key) ? 'text-blue-600 dark:text-blue-400' : ''
                            }`}>
                              {resource.expected[key] ?? '-'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Actual */}
                    <div className="rounded-md border border-border bg-background p-3">
                      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        Actual (AWS Console)
                      </div>
                      <div className="space-y-1.5">
                        {allKeys.map(key => {
                          const isDiff = resource.expected[key] !== resource.actual[key]
                          return (
                            <div key={key} className="flex justify-between text-xs">
                              <span className="font-mono text-muted-foreground">{key}</span>
                              <span className={`font-mono font-medium ${
                                isDiff ? 'text-amber-600 dark:text-amber-400 font-bold' : ''
                              }`}>
                                {resource.actual[key] ?? '-'}
                                {showResult && isDiff && <span className="ml-1 text-destructive">⚠</span>}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Mark as drifted button */}
                  {!session.submitted && (
                    <button
                      onClick={() => toggleSelection(resource.id)}
                      className={`w-full px-3 py-2 rounded-md border text-sm font-medium transition ${
                        userMarkedDrifted
                          ? 'border-amber-400 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      {userMarkedDrifted ? '⚠ Marked as Drifted - click to undo' : 'Mark as Drifted'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Bottom bar */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        {!session.submitted ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Expand each resource to compare expected vs actual configuration. Mark resources that have drifted.
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
            <div className={`font-semibold text-sm ${results && Object.values(results).every(Boolean) ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {results && Object.values(results).every(Boolean)
                ? '✓ All drift assessments correct!'
                : `✗ ${results ? Object.values(results).filter(Boolean).length : 0}/${totalResources} correct`}
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

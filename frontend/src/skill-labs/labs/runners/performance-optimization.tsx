import { useState, useCallback, useEffect } from 'react'
import { Zap } from 'lucide-react'
import { useExam } from '@/exam/ExamContext'
import type { PerformanceOptLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { ExplanationBlock } from '../ExplanationBlock'
import { useLabSession } from '../useLabSession'
import { LabCompleteModal } from '../LabCompleteModal'

interface PerfOptProgress { selections: Record<string, string>; timeLeft: number }

interface Props {
  lab: PerformanceOptLabDefinition
  timed?: boolean
}

export function PerformanceOptRunner({ lab, timed = true }: Props) {
  const { setRoute } = useExam()
  const session = useLabSession<PerfOptProgress>({ lab, timed })

  const [selections, setSelections] = useState<Record<string, string>>(() => {
    if (session.savedProgress?.selections) return session.savedProgress.selections
    const init: Record<string, string> = {}
    for (const p of lab.problems) init[p.id] = ''
    return init
  })
  const [results, setResults] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ selections, timeLeft: session.timeLeft })
  }, [selections, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !session.submitted) doSubmit()
  }, [session.timeLeft])

  const handleSelect = useCallback((problemId: string, option: string) => {
    if (session.submitted) return
    setSelections((prev) => ({ ...prev, [problemId]: option }))
  }, [session.submitted])

  const doSubmit = useCallback(async () => {
    const res: Record<string, boolean> = {}
    let allCorrect = true
    for (const p of lab.problems) {
      const pass = selections[p.id] === p.correctOption
      res[p.id] = pass
      if (!pass) allCorrect = false
    }
    setResults(res)
    await session.finalize(allCorrect, JSON.stringify(selections))
  }, [lab, selections, session.finalize])

  const allCorrect = session.submitted && lab.problems.every((p) => results[p.id])
  const answeredCount = Object.values(selections).filter(Boolean).length

  return (
    <div className="flex flex-col h-full gap-4">
      {session.showConfirmModal && (
        <LabCompleteModal title={lab.title} timeTaken={session.timeLimit - session.timeLeft} timed={timed}
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
              session.submitted
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
                  disabled={session.submitted}
                  className={`w-full text-left px-3 py-2 rounded-md border text-sm transition ${
                    session.submitted && option === problem.correctOption
                      ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
                      : session.submitted && selections[problem.id] === option && option !== problem.correctOption
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
        {!session.submitted ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Choose the best optimization for each problem area.</p>
            <button
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50"
              disabled={answeredCount < lab.problems.length}
              onClick={() => session.setShowConfirmModal(true)}
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

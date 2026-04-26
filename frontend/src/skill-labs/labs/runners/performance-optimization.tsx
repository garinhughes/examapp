import { useState, useCallback, useEffect } from 'react'
import { Zap, CheckCircle2, XCircle } from 'lucide-react'
import type { PerformanceOptLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { ExplanationBlock } from '../ExplanationBlock'
import { useLabSession } from '../useLabSession'
import { LabCheckActions } from '../LabCheckActions'
import { useExam } from '@/exam/ExamContext'

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
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (session.restartKey === 0) return
    const init: Record<string, string> = {}
    for (const p of lab.problems) init[p.id] = ''
    setSelections(init)
    setResults({})
    setChecked(false)
  }, [session.restartKey])

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ selections, timeLeft: session.timeLeft })
  }, [selections, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !checked) handleCheck()
  }, [session.timeLeft])

  const handleSelect = useCallback((problemId: string, option: string) => {
    if (checked) return
    session.markDirty()
    setSelections((prev) => ({ ...prev, [problemId]: option }))
  }, [checked])

  const handleCheck = useCallback(() => {
    if (checked) return
    const res: Record<string, boolean> = {}
    for (const p of lab.problems) {
      res[p.id] = selections[p.id] === p.correctOption
    }
    setResults(res)
    setChecked(true)
  }, [checked, lab, selections])

  const handleComplete = useCallback(async () => {
    await session.finalize(allCorrect, JSON.stringify(selections))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.finalize, selections, results])

  const allCorrect = checked && lab.problems.every((p) => results[p.id])
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
              checked
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
                  disabled={checked}
                  className={`w-full text-left px-3 py-2 rounded-md border text-sm transition ${
                    checked && option === problem.correctOption
                      ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
                      : checked && selections[problem.id] === option && option !== problem.correctOption
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

      {checked && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-2">
          <div className={`inline-flex items-center gap-1.5 font-semibold text-sm ${allCorrect ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
            {allCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {allCorrect
              ? 'All optimizations correct!'
              : `${Object.values(results).filter(Boolean).length}/${lab.problems.length} correct`}
          </div>
          <ExplanationBlock text={lab.explanation} />
        </div>
      )}

      <LabCheckActions
        checked={checked}
        isCorrect={allCorrect}
        submitted={session.submitted}
        canCheck={answeredCount >= lab.problems.length}
        onCheck={handleCheck}
        onComplete={handleComplete}
        onRetry={session.restart}
        onCancel={session.handleCancelLab}
      />
    </div>
  )
}

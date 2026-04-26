import { useState, useCallback, useEffect } from 'react'
import { Shield, CheckCircle2, XCircle } from 'lucide-react'
import { MarkdownText } from '@/exam/utils'
import type { SecurityHardeningLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { ExplanationBlock } from '../ExplanationBlock'
import { useLabSession } from '../useLabSession'
import { LabCheckActions } from '../LabCheckActions'
import { useExam } from '@/exam/ExamContext'

interface SecurityProgress { selections: Record<string, string>; timeLeft: number }

interface Props {
  lab: SecurityHardeningLabDefinition
  timed?: boolean
}

export function SecurityHardeningRunner({ lab, timed = true }: Props) {
  const { setRoute } = useExam()
  const session = useLabSession<SecurityProgress>({ lab, timed })

  const [selections, setSelections] = useState<Record<string, string>>(() => {
    if (session.savedProgress?.selections) return session.savedProgress.selections
    const init: Record<string, string> = {}
    for (const issue of lab.issues) init[issue.id] = ''
    return init
  })
  const [results, setResults] = useState<Record<string, boolean>>({})
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (session.restartKey === 0) return
    const init: Record<string, string> = {}
    for (const issue of lab.issues) init[issue.id] = ''
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

  const handleSelect = useCallback((issueId: string, option: string) => {
    if (checked) return
    session.markDirty()
    setSelections((prev) => ({ ...prev, [issueId]: option }))
  }, [checked])

  const handleCheck = useCallback(() => {
    if (checked) return
    const res: Record<string, boolean> = {}
    for (const issue of lab.issues) {
      res[issue.id] = selections[issue.id] === issue.correctOption
    }
    setResults(res)
    setChecked(true)
  }, [checked, lab, selections])

  const handleComplete = useCallback(async () => {
    await session.finalize(allCorrect, JSON.stringify(selections))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.finalize, selections, results])

  const allCorrect = checked && lab.issues.every((issue) => results[issue.id])
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
              checked
                ? results[issue.id] ? 'border-green-500 bg-green-500/5' : 'border-destructive bg-destructive/5'
                : 'border-border bg-card'
            }`}
          >
            <div className="flex items-start gap-3 mb-3">
              <Shield className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-sm">{issue.resource}</div>
                <div className="text-sm text-destructive/80 dark:text-red-400/80"><MarkdownText text={issue.issue} className="[&_p]:!my-0 [&_code]:!bg-destructive/10 [&_code]:!px-1 [&_code]:!py-0.5 [&_code]:!rounded [&_code]:!text-inherit" /></div>
              </div>
            </div>
            <div className="space-y-1.5 ml-7">
              {issue.options.map((option) => (
                <button
                  key={option}
                  onClick={() => handleSelect(issue.id, option)}
                  disabled={checked}
                  className={`w-full text-left px-3 py-2 rounded-md border text-sm transition ${
                    checked && option === issue.correctOption
                      ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
                      : checked && selections[issue.id] === option && option !== issue.correctOption
                        ? 'border-destructive bg-destructive/10 text-destructive'
                        : selections[issue.id] === option
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:bg-muted/50'
                  } disabled:cursor-not-allowed`}
                >
                  <MarkdownText text={option} className="[&_p]:!my-0 [&_code]:!bg-muted [&_code]:!px-1 [&_code]:!py-0.5 [&_code]:!rounded [&_code]:!text-inherit" />
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
              ? 'All vulnerabilities fixed!'
              : `${Object.values(results).filter(Boolean).length}/${lab.issues.length} correct`}
          </div>
          <ExplanationBlock text={lab.explanation} />
        </div>
      )}

      <LabCheckActions
        checked={checked}
        isCorrect={allCorrect}
        submitted={session.submitted}
        canCheck={answeredCount >= lab.issues.length}
        onCheck={handleCheck}
        onComplete={handleComplete}
        onRetry={session.restart}
        onCancel={session.handleCancelLab}
      />
    </div>
  )
}

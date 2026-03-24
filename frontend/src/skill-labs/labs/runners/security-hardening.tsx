import { useState, useCallback, useEffect } from 'react'
import { Shield } from 'lucide-react'
import { useExam } from '@/exam/ExamContext'
import type { SecurityHardeningLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabSession } from '../useLabSession'
import { LabCompleteModal } from '../LabCompleteModal'

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

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ selections, timeLeft: session.timeLeft })
  }, [selections, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !session.submitted) doSubmit()
  }, [session.timeLeft])

  const handleSelect = useCallback((issueId: string, option: string) => {
    if (session.submitted) return
    setSelections((prev) => ({ ...prev, [issueId]: option }))
  }, [session.submitted])

  const doSubmit = useCallback(async () => {
    const res: Record<string, boolean> = {}
    let allCorrect = true
    for (const issue of lab.issues) {
      const pass = selections[issue.id] === issue.correctOption
      res[issue.id] = pass
      if (!pass) allCorrect = false
    }
    setResults(res)
    await session.finalize(allCorrect, JSON.stringify(selections))
  }, [lab, selections, session.finalize])

  const allCorrect = session.submitted && lab.issues.every((issue) => results[issue.id])
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
              session.submitted
                ? results[issue.id] ? 'border-green-500 bg-green-500/5' : 'border-destructive bg-destructive/5'
                : 'border-border bg-card'
            }`}
          >
            <div className="flex items-start gap-3 mb-3">
              <Shield className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-sm">{issue.resource}</div>
                <div className="text-sm text-destructive/80 dark:text-red-400/80">{issue.issue}</div>
              </div>
            </div>
            <div className="space-y-1.5 ml-7">
              {issue.options.map((option) => (
                <button
                  key={option}
                  onClick={() => handleSelect(issue.id, option)}
                  disabled={session.submitted}
                  className={`w-full text-left px-3 py-2 rounded-md border text-sm transition ${
                    session.submitted && option === issue.correctOption
                      ? 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
                      : session.submitted && selections[issue.id] === option && option !== issue.correctOption
                        ? 'border-destructive bg-destructive/10 text-destructive'
                        : selections[issue.id] === option
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
            <p className="text-sm text-muted-foreground">Select the correct fix for each security vulnerability.</p>
            <button
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50"
              disabled={answeredCount < lab.issues.length}
              onClick={() => session.setShowConfirmModal(true)}
            >
              Submit Fixes
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className={`font-semibold text-sm ${allCorrect ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {allCorrect
                ? '✓ All vulnerabilities fixed!'
                : `✗ ${Object.values(results).filter(Boolean).length}/${lab.issues.length} correct`}
            </div>
            <div className="text-sm text-muted-foreground">{lab.explanation}</div>
            <button onClick={() => setRoute('skill-labs')} className="mt-2 px-4 py-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted/50 transition">
              Back to Skill Labs
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { Play, RotateCcw } from 'lucide-react'
import { useExam } from '@/exam/ExamContext'
import { apiUrl } from '@/apiBase'
import type { PolicyFixLabDefinition } from '../../types'
import { ExplanationBlock } from '../ExplanationBlock'
import { LabHeader } from '../LabHeader'
import { LabDiagram } from '../LabDiagram'
import { useLabSession } from '../useLabSession'
import { MarkdownText } from '@/exam/utils'

interface PolicyFixLabRunnerProps {
  lab: PolicyFixLabDefinition
  timed?: boolean
}

interface ValidationResult {
  success: boolean
  errors: string[]
}

interface PolicyFixProgress {
  policy: string
  timeLeft: number
}

export function PolicyFixLabRunner({ lab, timed = true }: PolicyFixLabRunnerProps) {
  const { setRoute } = useExam()
  const session = useLabSession<PolicyFixProgress>({ lab, timed })

  const [policy, setPolicy] = useState(session.savedProgress?.policy ?? lab.brokenPolicy)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [validating, setValidating] = useState(false)
  const [showingAnswer, setShowingAnswer] = useState(false)

  // Reset local state on Retry
  useEffect(() => {
    if (session.restartKey === 0) return
    setPolicy(lab.brokenPolicy)
    setValidationResult(null)
    setValidating(false)
    setShowingAnswer(false)
  }, [session.restartKey])

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ policy, timeLeft: session.timeLeft })
  }, [policy, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !session.submitted) handleCheck()
  }, [session.timeLeft])

  const handleCheck = useCallback(async () => {
    setValidating(true)
    try {
      const res = await fetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/validate-policy`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy }),
      })
      const result: ValidationResult = await res.json()
      setValidationResult(result)
      session.recordCheck(result.success, result.success ? null : result.errors)
    } catch {
      const errs = ['Failed to validate. Please try again.']
      setValidationResult({ success: false, errors: errs })
      session.recordCheck(false, errs)
    } finally {
      setValidating(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policy, lab.id])

  const handleComplete = useCallback(async () => {
    await session.finalize(true, 'solved')
  }, [session.finalize])

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader
        title={lab.title}
        timed={timed}
        timeLeft={session.timeLeft}
        labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ policy, timeLeft: session.timeLeft })}
        onRatingClose={() => setRoute('skill-labs')}
      />

      {session.resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

      {/* Scenario (top, full width) */}
      <div className="shrink-0 rounded-lg border border-border bg-card p-4">
        <h3 className="font-semibold text-base mb-2">Scenario</h3>
        <MarkdownText text={lab.scenario} className="text-sm text-muted-foreground leading-relaxed" />
        {lab.mermaidCode && <LabDiagram code={lab.mermaidCode} idHint={lab.id} className="mt-3" />}
        {lab.validations.length > 0 && (
          <div className="mt-3">
            <h4 className="font-semibold text-xs uppercase tracking-wide text-muted-foreground mb-1.5">Requirements</h4>
            <div className="flex flex-wrap gap-1.5">
              {lab.validations.map((v, i) => (
                <span key={i} className="text-xs bg-muted/60 rounded px-2 py-0.5 font-medium">{v.field}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Editor */}
      <div className="rounded-lg border border-border overflow-hidden min-w-0 h-[420px] md:h-[520px]">
          <Editor
            height="100%"
            defaultLanguage="json"
            value={showingAnswer ? lab.correctPolicy : policy}
            onChange={(value) => { if (!session.submitted && !showingAnswer) { session.markDirty(); setPolicy(value || '') } }}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              readOnly: session.submitted || showingAnswer,
              formatOnPaste: true,
            }}
          />
      </div>

      {/* Answer view */}
      {showingAnswer && !session.submitted && (
        <div className="shrink-0 rounded-lg border border-border bg-card p-4 shadow-sm space-y-3">
          <div className="font-semibold text-sm text-destructive">Reference answer shown above</div>
          <ExplanationBlock text={lab.explanation} />
        </div>
      )}

      {/* Test feedback (only shown when there's a result and exam not yet submitted) */}
      {validationResult && !session.submitted && validationResult.success && (
        <div className="shrink-0 rounded-lg border border-emerald-300/50 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-700/40 p-4">
          <div className="font-semibold text-sm text-emerald-700 dark:text-emerald-300 mb-1">✓ All checks passed</div>
          <ExplanationBlock text={lab.explanation} />
        </div>
      )}

      {session.submitted && (
        <div className="shrink-0 rounded-lg border border-emerald-300/50 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-700/40 p-4">
          <div className="font-semibold text-sm text-emerald-700 dark:text-emerald-300 mb-1">Lab completed</div>
          <ExplanationBlock text={lab.explanation} />
        </div>
      )}

      {!session.submitted && session.lastCheck && !session.lastCheck.correct && session.lastCheck.feedback && (
        <div className="text-xs text-destructive">
          {Array.isArray(session.lastCheck.feedback)
            ? <ul className="list-disc list-inside space-y-0.5">{session.lastCheck.feedback.map((f, i) => <li key={i}>{f}</li>)}</ul>
            : session.lastCheck.feedback}
        </div>
      )}

      {!session.submitted && !showingAnswer && (
        <div className="flex items-center justify-end gap-2 flex-wrap pt-1">
          <button
            onClick={session.handleCancelLab}
            className="px-3 py-2 rounded-md text-sm border border-border bg-card text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition"
          >
            Cancel Lab
          </button>
          {session.lastCheck && !session.lastCheck.correct && (
            <button
              onClick={() => setShowingAnswer(true)}
              className="px-3 py-2 rounded-md text-sm border border-border bg-card text-muted-foreground hover:bg-muted/50 transition"
            >
              Show Answer
            </button>
          )}
          {!session.lastCheck?.correct && (
            <button
              onClick={handleCheck}
              disabled={validating}
              className="px-4 py-2 rounded-md bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition disabled:opacity-50"
            >
              {validating ? 'Checking…' : (session.lastCheck && !session.lastCheck.correct ? 'Retest' : 'Check')}
            </button>
          )}
          {session.lastCheck?.correct && (
            <button
              onClick={handleComplete}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition inline-flex items-center gap-1.5"
            >
              <Play className="w-4 h-4" />
              Complete Lab
            </button>
          )}
        </div>
      )}

      {!session.submitted && showingAnswer && (
        <div className="flex items-center justify-end gap-2 flex-wrap pt-1">
          <button
            onClick={session.handleCancelLab}
            className="px-3 py-2 rounded-md text-sm border border-border bg-card text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition"
          >
            Cancel Lab
          </button>
          <button
            onClick={session.restart}
            className="px-4 py-2 rounded-md text-sm font-semibold border border-border bg-card hover:bg-muted/50 transition inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            Retry Lab
          </button>
          <button
            onClick={() => session.finalize(false, 'gave-up')}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition inline-flex items-center gap-1.5"
          >
            <Play className="w-4 h-4" />
            Complete Lab
          </button>
        </div>
      )}
    </div>
  )
}

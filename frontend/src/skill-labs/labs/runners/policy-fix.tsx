import { useState, useEffect, useCallback } from 'react'
import Editor from '@monaco-editor/react'
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

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ policy, timeLeft: session.timeLeft })
  }, [policy, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !session.submitted) handleTestPolicy()
  }, [session.timeLeft])

  const handleTestPolicy = useCallback(async () => {
    setValidating(true)
    try {
      const res = await fetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/validate-policy`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy }),
      })
      const result: ValidationResult = await res.json()
      setValidationResult(result)

      if (result.success) {
        await session.finalize(true, 'solved')
      }
    } catch {
      setValidationResult({ success: false, errors: ['Failed to validate. Please try again.'] })
    } finally {
      setValidating(false)
    }
  }, [policy, lab.id, session.finalize])

  const handleGiveUp = useCallback(async () => {
    setPolicy(lab.correctPolicy)
    setValidationResult({ success: false, errors: ['You gave up. The correct policy is now shown.'] })
    await session.finalize(false, 'gave-up')
  }, [lab, session.finalize])

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader
        title={lab.title}
        timed={timed}
        timeLeft={session.timeLeft}
        labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ policy, timeLeft: session.timeLeft })}
        onCancelLab={session.submitted ? undefined : session.handleCancelLab}
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
            value={policy}
            onChange={(value) => !session.submitted && setPolicy(value || '')}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              readOnly: session.submitted,
              formatOnPaste: true,
            }}
          />
      </div>

      {/* Bottom row: Test Results (full width) */}
      <div className="shrink-0 rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base mb-2">Test Results</h3>

            {!validationResult && !session.submitted && (
              <p className="text-sm text-muted-foreground">
                Edit the policy and click "Test Policy" to validate your changes.
              </p>
            )}

            {validationResult && (
              <div className="space-y-2">
                <div className={`flex items-center gap-2 font-semibold text-sm ${validationResult.success ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                  {validationResult.success ? '✓ All checks passed!' : '✗ Validation failed'}
                </div>
                {validationResult.errors.length > 0 && (
                  <ul className="flex flex-wrap gap-2">
                    {validationResult.errors.map((err, i) => (
                      <li key={i} className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
                        {err}
                      </li>
                    ))}
                  </ul>
                )}
                {validationResult.success && (
                  <ExplanationBlock text={lab.explanation} />
                )}
              </div>
            )}
          </div>

          <div className="shrink-0 flex flex-col gap-2 min-w-40">
            {!session.submitted ? (
              <>
                <button
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50"
                  disabled={validating}
                  onClick={handleTestPolicy}
                >
                  {validating ? 'Validating…' : 'Test Policy'}
                </button>
                <button
                  className="px-4 py-2 rounded-md border border-border text-muted-foreground font-medium text-sm hover:bg-muted/50 transition"
                  onClick={handleGiveUp}
                >
                  Give Up & Show Answer
                </button>
              </>
            ) : (
              <button
                onClick={() => setRoute('skill-labs')}
                className="px-4 py-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition"
              >
                Back to Skill Labs
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { useExam } from '@/exam/ExamContext'
import { apiUrl } from '@/apiBase'
import type { CodeFixLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabSession } from '../useLabSession'
import { ExplanationBlock } from '../ExplanationBlock'

interface CodeFixProgress {
  code: string
  timeLeft: number
}

interface ValidationResult {
  success: boolean
  errors: string[]
}

interface Props {
  lab: CodeFixLabDefinition
  timed?: boolean
}

export function CodeFixLabRunner({ lab, timed = true }: Props) {
  const { setRoute } = useExam()
  const session = useLabSession<CodeFixProgress>({ lab, timed })

  const [code, setCode] = useState(session.savedProgress?.code ?? lab.brokenCode)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [validating, setValidating] = useState(false)

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ code, timeLeft: session.timeLeft })
  }, [code, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !session.submitted) handleTest()
  }, [session.timeLeft])

  const handleTest = useCallback(async () => {
    setValidating(true)
    try {
      const res = await fetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/validate-code`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
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
  }, [code, lab.id, session.finalize])

  const handleGiveUp = useCallback(async () => {
    setCode(lab.correctCode)
    setValidationResult({ success: false, errors: ['You gave up. The correct code is now shown.'] })
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
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ code, timeLeft: session.timeLeft })}
        onCancelLab={session.submitted ? undefined : session.handleCancelLab}
      />

      {session.resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

      {/* Top row: Scenario left, Editor right */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left: Scenario */}
        <div className="w-72 shrink-0 rounded-lg border border-border bg-card p-4 overflow-y-auto">
          <h3 className="font-semibold text-base mb-3">Scenario</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{lab.scenario}</p>
          <div className="mt-4 space-y-2">
            <h4 className="font-semibold text-sm">Requirements</h4>
            {lab.validations.map((v, i) => (
              <div key={i} className="text-xs bg-muted/50 rounded px-2 py-1">
                <span className="font-medium">{v.field}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Editor */}
        <div className="flex-1 rounded-lg border border-border overflow-hidden min-w-0">
          <Editor
            height="100%"
            language={lab.language}
            value={code}
            onChange={(value) => !session.submitted && setCode(value || '')}
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
      </div>

      {/* Bottom row: Test Results (full width) */}
      <div className="shrink-0 rounded-lg border border-border bg-card p-4">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base mb-2">Test Results</h3>

            {!validationResult && !session.submitted && (
              <p className="text-sm text-muted-foreground">
                Edit the code and click "Test Code" to validate your changes.
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
                  onClick={handleTest}
                >
                  {validating ? 'Validating…' : 'Test Code'}
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
                className="px-4 py-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted/50 transition"
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

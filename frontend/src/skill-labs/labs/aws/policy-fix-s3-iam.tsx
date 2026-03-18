import { useState, useEffect, useCallback, useRef } from 'react'
import Editor from '@monaco-editor/react'
import { useExam } from '@/exam/ExamContext'
import { apiUrl } from '@/apiBase'
import type { PolicyFixLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabComplete } from '../shared'

interface PolicyFixLabRunnerProps {
  lab: PolicyFixLabDefinition
  timed?: boolean
}

interface ValidationResult {
  success: boolean
  errors: string[]
}

export function PolicyFixLabRunner({ lab, timed = true }: PolicyFixLabRunnerProps) {
  const { authFetch, user } = useExam()
  const completeWithGamification = useLabComplete(lab)

  const [policy, setPolicy] = useState(lab.brokenPolicy)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [validating, setValidating] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  // Timer
  const [timeLeft, setTimeLeft] = useState(lab.timeLimit)
  const [labPaused, setLabPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    if (submitted || !timed || labPaused) return
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [submitted, timed, labPaused])

  useEffect(() => {
    if (timed && timeLeft === 0 && !submitted) handleTestPolicy()
  }, [timeLeft])

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

      if (result.success && !submitted) {
        setSubmitted(true)
        if (timerRef.current) clearInterval(timerRef.current)
        completeWithGamification(true)
        await saveAttempt(true)
      }
    } catch {
      setValidationResult({ success: false, errors: ['Failed to validate. Please try again.'] })
    } finally {
      setValidating(false)
    }
  }, [policy, lab.id, submitted])

  const handleGiveUp = useCallback(async () => {
    setSubmitted(true)
    if (timerRef.current) clearInterval(timerRef.current)
    setPolicy(lab.correctPolicy)
    setValidationResult({ success: false, errors: ['You gave up. The correct policy is now shown.'] })
    completeWithGamification(false)
    await saveAttempt(false)
  }, [lab])

  const saveAttempt = async (correct: boolean) => {
    if (!user) return
    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000)
    try {
      await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedAnswer: correct ? 'solved' : 'gave-up',
          correct,
          timeTaken,
        }),
      })
    } catch {
      // Non-critical
    }
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader title={lab.title} timed={timed} timeLeft={timeLeft} labId={lab.id} onPauseChange={setLabPaused} />

      {/* Three-panel layout */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left: Scenario */}
        <div className="w-72 shrink-0 rounded-lg border border-border bg-card p-4 overflow-y-auto">
          <h3 className="font-semibold text-base mb-3">Scenario</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{lab.scenario}</p>
          <div className="mt-4 space-y-2">
            <h4 className="font-semibold text-sm">Requirements</h4>
            {lab.validations.map((v, i) => (
              <div key={i} className="text-xs bg-muted/50 rounded px-2 py-1">
                <span className="font-medium">{v.field}</span>: should be <code className="text-primary">{v.expected}</code>
              </div>
            ))}
          </div>
        </div>

        {/* Center: Editor */}
        <div className="flex-1 rounded-lg border border-border overflow-hidden">
          <Editor
            height="100%"
            defaultLanguage="json"
            value={policy}
            onChange={(value) => !submitted && setPolicy(value || '')}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              readOnly: submitted,
              formatOnPaste: true,
            }}
          />
        </div>

        {/* Right: Test Results */}
        <div className="w-72 shrink-0 rounded-lg border border-border bg-card p-4 overflow-y-auto">
          <h3 className="font-semibold text-base mb-3">Test Results</h3>

          {!validationResult && !submitted && (
            <p className="text-sm text-muted-foreground">
              Edit the policy and click "Test Policy" to validate your changes.
            </p>
          )}

          {validationResult && (
            <div className="space-y-3">
              <div className={`flex items-center gap-2 font-semibold text-sm ${validationResult.success ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                {validationResult.success ? '✓ All checks passed!' : '✗ Validation failed'}
              </div>
              {validationResult.errors.length > 0 && (
                <ul className="space-y-1">
                  {validationResult.errors.map((err, i) => (
                    <li key={i} className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
                      {err}
                    </li>
                  ))}
                </ul>
              )}
              {validationResult.success && (
                <div className="text-sm text-muted-foreground mt-4">
                  {lab.explanation}
                </div>
              )}
            </div>
          )}

          <div className="mt-6 space-y-2">
            {!submitted && (
              <>
                <button
                  className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50"
                  disabled={validating}
                  onClick={handleTestPolicy}
                >
                  {validating ? 'Validating…' : 'Test Policy'}
                </button>
                <button
                  className="w-full px-4 py-2 rounded-md border border-border text-muted-foreground font-medium text-sm hover:bg-muted/50 transition"
                  onClick={handleGiveUp}
                >
                  Give Up & Show Answer
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

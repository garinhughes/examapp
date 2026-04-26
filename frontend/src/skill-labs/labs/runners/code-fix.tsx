import { useState, useEffect, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { Play } from 'lucide-react'
import { apiUrl } from '@/apiBase'
import type { CodeFixLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { LabDiagram } from '../LabDiagram'
import { useLabSession } from '../useLabSession'
import { useExam } from '@/exam/ExamContext'
import { ExplanationBlock } from '../ExplanationBlock'
import { MarkdownText } from '@/exam/utils'

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

  // Reset on Retry
  useEffect(() => {
    if (session.restartKey === 0) return
    setCode(lab.brokenCode)
    setValidationResult(null)
    setValidating(false)
  }, [session.restartKey])

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ code, timeLeft: session.timeLeft })
  }, [code, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !session.submitted) {
      session.finalize(validationResult?.success === true, 'time-up')
    }
  }, [session.timeLeft])

  const handleCheck = useCallback(async () => {
    setValidating(true)
    try {
      const res = await fetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/validate-code`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
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
  }, [code, lab.id])

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
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ code, timeLeft: session.timeLeft })}
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
            language={lab.language}
            value={code}
            onChange={(value) => { if (!session.submitted) { session.markDirty(); setCode(value || '') } }}
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

      {validationResult?.success && !session.submitted && (
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

      {!session.submitted && (
        <div className="flex items-center justify-end gap-2 flex-wrap pt-1">
          <button
            onClick={session.handleCancelLab}
            className="px-3 py-2 rounded-md text-sm border border-border bg-card text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition"
          >
            Cancel Lab
          </button>
          <button
            onClick={handleCheck}
            disabled={validating}
            className="px-4 py-2 rounded-md bg-accent text-foreground text-sm font-medium hover:bg-accent/80 transition disabled:opacity-50"
          >
            {validating ? 'Checking…' : (session.lastCheck && !session.lastCheck.correct ? 'Retest' : 'Check')}
          </button>
          <button
            onClick={handleComplete}
            disabled={!session.lastCheck?.correct}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Play className="w-4 h-4" />
            Complete Lab
          </button>
        </div>
      )}
    </div>
  )
}

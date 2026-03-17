import { useState, useCallback, useRef, useEffect } from 'react'
import MonacoEditor from '@monaco-editor/react'
import { useExam } from '@/exam/ExamContext'
import { apiUrl } from '@/apiBase'
import type { PolicySimulationLabDefinition, PolicyTestCase } from '../../types'
import { LabHeader } from '../LabHeader'
import { markLabCompleted } from '../shared'

interface Props {
  lab: PolicySimulationLabDefinition
  timed?: boolean
}

interface TestResult {
  description: string
  expected: 'Allow' | 'Deny'
  actual: 'Allow' | 'Deny' | 'Error'
  pass: boolean
}

function evaluatePolicy(policyJson: string, testCases: PolicyTestCase[]): { results: TestResult[]; error?: string } {
  let parsed: any
  try {
    parsed = JSON.parse(policyJson)
  } catch {
    return { results: [], error: 'Invalid JSON' }
  }

  const statements = parsed?.Statement
  if (!Array.isArray(statements)) {
    return { results: [], error: 'Policy must contain a Statement array' }
  }

  const results: TestResult[] = testCases.map((tc) => {
    let allowed = false
    let denied = false

    for (const stmt of statements) {
      const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action]
      const resources = Array.isArray(stmt.Resource) ? stmt.Resource : [stmt.Resource]

      const actionMatch = actions.some((a: string) => a === '*' || a === tc.action)
      const resourceMatch = resources.some((r: string) => {
        if (r === '*') return true
        // Simple ARN prefix match (ending with /*)
        if (r.endsWith('/*')) {
          const prefix = r.slice(0, -1)
          return tc.resource.startsWith(prefix) || tc.resource === r
        }
        return r === tc.resource
      })

      if (actionMatch && resourceMatch) {
        if (stmt.Effect === 'Allow') allowed = true
        if (stmt.Effect === 'Deny') denied = true
      }
    }

    const actual: 'Allow' | 'Deny' = denied ? 'Deny' : allowed ? 'Allow' : 'Deny'
    return {
      description: tc.description,
      expected: tc.expectedResult,
      actual,
      pass: actual === tc.expectedResult,
    }
  })

  return { results }
}

export function PolicySimulationRunner({ lab, timed = true }: Props) {
  const { authFetch, user } = useExam()

  const [policy, setPolicy] = useState(lab.initialPolicy)
  const [testResults, setTestResults] = useState<TestResult[] | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [timeLeft, setTimeLeft] = useState(lab.timeLimit)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    if (submitted || !timed) return
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [submitted, timed])

  useEffect(() => {
    if (timed && timeLeft === 0 && !submitted) handleRunTests()
  }, [timeLeft])

  const handleRunTests = useCallback(async () => {
    const { results, error } = evaluatePolicy(policy, lab.testCases)
    if (error) {
      setTestError(error)
      setTestResults(null)
      return
    }
    setTestError(null)
    setTestResults(results)

    const allPass = results.every((r) => r.pass)
    if (allPass && !submitted) {
      setSubmitted(true)
      if (timerRef.current) clearInterval(timerRef.current)
      markLabCompleted(lab.id)

      const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000)
      if (user) {
        try {
          await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
        } catch { /* non-critical */ }
      }
    }
  }, [policy, lab, submitted, authFetch, user])

  const handleGiveUp = useCallback(async () => {
    setSubmitted(true)
    if (timerRef.current) clearInterval(timerRef.current)
    markLabCompleted(lab.id)

    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000)
    if (user) {
      try {
        await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      } catch { /* non-critical */ }
    }
  }, [lab, authFetch, user])

  const allPass = testResults !== null && testResults.every((r) => r.pass)

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader title={lab.title} timed={timed} timeLeft={timeLeft} subtitle={lab.scenario} labId={lab.id} />

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Requirements panel */}
        <div className="w-64 shrink-0 rounded-lg border border-border bg-card p-4 overflow-y-auto">
          <h3 className="font-semibold text-sm mb-3">Requirements</h3>
          <ul className="space-y-2">
            {lab.requirements.map((req, i) => (
              <li key={i} className="text-sm text-muted-foreground flex gap-2">
                <span className="text-muted-foreground shrink-0">•</span>
                <span>{req}</span>
              </li>
            ))}
          </ul>

          <h3 className="font-semibold text-sm mt-6 mb-3">Test Cases</h3>
          <div className="space-y-2">
            {lab.testCases.map((tc, i) => (
              <div key={i} className="text-xs p-2 rounded bg-muted/50">
                <div className="font-medium">{tc.description}</div>
                <div className="text-muted-foreground mt-1">
                  <span className="font-mono">{tc.action}</span> on{' '}
                  <span className="font-mono text-[10px]">{tc.resource}</span>
                </div>
                <div className={`mt-1 font-bold ${tc.expectedResult === 'Allow' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                  Expected: {tc.expectedResult}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 rounded-lg border border-border overflow-hidden">
          <MonacoEditor
            height="100%"
            language="json"
            theme="vs-dark"
            value={policy}
            onChange={(v) => !submitted && setPolicy(v || '')}
            options={{ readOnly: submitted, minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on', scrollBeyondLastLine: false }}
          />
        </div>

        {/* Test results panel */}
        <div className="w-64 shrink-0 rounded-lg border border-border bg-card p-4 overflow-y-auto">
          <h3 className="font-semibold text-sm mb-3">Test Results</h3>
          {testError && (
            <div className="text-sm text-destructive bg-destructive/10 rounded p-2 mb-3">{testError}</div>
          )}
          {testResults ? (
            <div className="space-y-2">
              {testResults.map((r, i) => (
                <div key={i} className={`p-2 rounded text-xs ${r.pass ? 'bg-green-500/10' : 'bg-destructive/10'}`}>
                  <div className="flex items-center gap-2">
                    <span className={r.pass ? 'text-green-600 dark:text-green-400 font-bold' : 'text-destructive font-bold'}>
                      {r.pass ? '✓' : '✗'}
                    </span>
                    <span className="font-medium">{r.description}</span>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    Expected: {r.expected} | Got: {r.actual}
                  </div>
                </div>
              ))}
              {allPass && (
                <div className="mt-3 text-sm font-semibold text-green-600 dark:text-green-400">
                  ✓ All tests pass!
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Click "Run Tests" to validate your policy against the test cases.</p>
          )}

          {submitted && (
            <div className="text-sm text-muted-foreground mt-4 pt-3 border-t border-border">
              {lab.explanation}
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm flex items-center justify-between">
        {!submitted ? (
          <>
            <button
              className="text-sm text-muted-foreground hover:text-foreground transition"
              onClick={handleGiveUp}
            >
              Give Up &amp; Show Answer
            </button>
            <button
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition"
              onClick={handleRunTests}
            >
              Run Tests
            </button>
          </>
        ) : !allPass ? (
          <div className="text-sm text-muted-foreground">Lab complete — review the explanation above.</div>
        ) : (
          <div className="text-sm text-green-600 dark:text-green-400 font-semibold">Policy validates successfully!</div>
        )}
      </div>
    </div>
  )
}

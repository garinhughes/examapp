import { useState, useCallback, useRef, useEffect } from 'react'
import { useExam } from '@/exam/ExamContext'
import { apiUrl } from '@/apiBase'
import type { ConfigToggleLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { markLabCompleted } from '../shared'

interface Props {
  lab: ConfigToggleLabDefinition
  timed?: boolean
}

export function ConfigToggleRunner({ lab, timed = true }: Props) {
  const { authFetch, user } = useExam()

  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const item of lab.configItems) init[item.id] = item.currentValue
    return init
  })
  const [submitted, setSubmitted] = useState(false)
  const [results, setResults] = useState<Record<string, boolean>>({})
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
    if (timed && timeLeft === 0 && !submitted) handleSubmit()
  }, [timeLeft])

  const updateValue = useCallback((id: string, value: string) => {
    if (submitted) return
    setValues((prev) => ({ ...prev, [id]: value }))
  }, [submitted])

  const handleSubmit = useCallback(async () => {
    if (submitted) return
    setSubmitted(true)
    if (timerRef.current) clearInterval(timerRef.current)

    const res: Record<string, boolean> = {}
    let allCorrect = true
    for (const item of lab.configItems) {
      const pass = values[item.id]?.trim() === item.correctValue.trim()
      res[item.id] = pass
      if (!pass) allCorrect = false
    }
    setResults(res)
    markLabCompleted(lab.id)

    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000)
    if (user) {
      try {
        await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedAnswer: JSON.stringify(values), correct: allCorrect, timeTaken, labType: 'config-toggle' }),
        })
      } catch { /* non-critical */ }
    }
  }, [submitted, lab, values, authFetch, user])

  const allCorrect = submitted && lab.configItems.every((item) => results[item.id])

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader title={lab.title} timed={timed} timeLeft={timeLeft} subtitle={lab.scenario} labId={lab.id} />

      <div className="flex-1 rounded-lg border border-border bg-card p-6 overflow-y-auto">
        <h3 className="font-semibold text-base mb-4">Configuration</h3>
        <div className="space-y-4 max-w-xl">
          {lab.configItems.map((item) => (
            <div key={item.id}>
              <label className="block text-sm font-medium mb-1">
                {item.label}
                {submitted && (
                  <span className={`ml-2 text-xs font-bold ${results[item.id] ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
                    {results[item.id] ? '✓' : '✗'}
                  </span>
                )}
              </label>
              {item.inputType === 'select' && item.options ? (
                <select
                  value={values[item.id] || ''}
                  onChange={(e) => updateValue(item.id, e.target.value)}
                  disabled={submitted}
                  className={`w-full px-3 py-2 rounded-md border text-sm bg-card focus:outline-none focus:ring-1 focus:ring-primary ${
                    submitted
                      ? results[item.id] ? 'border-green-500' : 'border-destructive'
                      : 'border-border'
                  }`}
                >
                  {item.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={values[item.id] || ''}
                  onChange={(e) => updateValue(item.id, e.target.value)}
                  disabled={submitted}
                  className={`w-full px-3 py-2 rounded-md border text-sm font-mono bg-card focus:outline-none focus:ring-1 focus:ring-primary ${
                    submitted
                      ? results[item.id] ? 'border-green-500' : 'border-destructive'
                      : 'border-border'
                  }`}
                />
              )}
              {submitted && !results[item.id] && (
                <div className="text-xs text-muted-foreground mt-1">
                  Expected: <span className="font-mono text-foreground">{item.correctValue}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Submit / Result */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        {!submitted ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Fix the configuration values, then test your changes.</p>
            <button
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition"
              onClick={handleSubmit}
            >
              Test Configuration
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className={`font-semibold text-sm ${allCorrect ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {allCorrect ? '✓ All configuration values are correct!' : '✗ Some configuration values are incorrect'}
            </div>
            <div className="text-sm text-muted-foreground">{lab.explanation}</div>
          </div>
        )}
      </div>
    </div>
  )
}

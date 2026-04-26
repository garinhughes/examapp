import { useState, useCallback, useEffect } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { DiagramLabelLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabSession } from '../useLabSession'
import { LabCheckActions } from '../LabCheckActions'
import { useExam } from '@/exam/ExamContext'
import { ExplanationBlock } from '../ExplanationBlock'

interface DiagramLabelProgress {
  selections: Record<string, string>   // hotspotId → selected option
  timeLeft: number
}

interface Props {
  lab: DiagramLabelLabDefinition
  timed?: boolean
}

export function DiagramLabelRunner({ lab, timed = true }: Props) {
  const { setRoute } = useExam()
  const session = useLabSession<DiagramLabelProgress>({ lab, timed })

  const [selections, setSelections] = useState<Record<string, string>>(
    () => session.savedProgress?.selections ?? {}
  )
  const [results, setResults] = useState<Record<string, boolean>>({})
  const [checked, setChecked] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)

  useEffect(() => {
    if (session.restartKey === 0) return
    setSelections({})
    setResults({})
    setChecked(false)
    setIsCorrect(false)
  }, [session.restartKey])

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ selections, timeLeft: session.timeLeft })
  }, [selections, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !checked) handleCheck()
  }, [session.timeLeft])

  const handleSelect = useCallback((hotspotId: string, value: string) => {
    if (checked) return
    session.markDirty()
    setSelections((prev) => ({ ...prev, [hotspotId]: value }))
  }, [checked])

  const handleCheck = useCallback(() => {
    if (checked) return
    const res: Record<string, boolean> = {}
    let allCorrect = true
    for (const h of lab.hotspots) {
      const pass = selections[h.id] === h.answer
      res[h.id] = pass
      if (!pass) allCorrect = false
    }
    setResults(res)
    setIsCorrect(allCorrect)
    setChecked(true)
  }, [checked, lab, selections])

  const handleComplete = useCallback(async () => {
    await session.finalize(isCorrect, JSON.stringify(selections))
  }, [session.finalize, selections, isCorrect])

  const answeredCount = Object.values(selections).filter(Boolean).length

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader
        title={lab.title}
        timed={timed}
        timeLeft={session.timeLeft}
        subtitle={lab.scenario}
        labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ selections, timeLeft: session.timeLeft })}
        onRatingClose={() => setRoute('skill-labs')}
      />
      {session.resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

      {/* Diagram canvas - natural image sizing so hotspot % coords map exactly to image pixels */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border bg-card">
        <div className="relative w-full">
        <img
          src={lab.imageUrl}
          alt="Architecture diagram"
          className="w-full h-auto block"
          draggable={false}
        />
        {lab.hotspots.map((hotspot) => {
          const hotspotCorrect = checked ? results[hotspot.id] : undefined
          return (
            <div
              key={hotspot.id}
              className="absolute"
              style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%`, transform: 'translate(-50%, -50%)' }}
            >
              {checked ? (
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shadow-sm ${
                  hotspotCorrect
                    ? 'border-green-500 bg-green-500 text-white'
                    : 'border-destructive bg-destructive text-white'
                }`}>
                  {hotspotCorrect ? '✓' : '✗'}
                </div>
              ) : (
                <select
                  value={selections[hotspot.id] ?? ''}
                  onChange={(e) => handleSelect(hotspot.id, e.target.value)}
                  className="text-xs border border-border rounded bg-card px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                >
                  <option value="">- select -</option>
                  {hotspot.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              )}
            </div>
          )
        })}
        </div>
      </div>

      {checked && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-3">
          <div className={`inline-flex items-center gap-1.5 font-semibold text-sm ${isCorrect ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
            {isCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {isCorrect
              ? 'All labels correct!'
              : `${Object.values(results).filter(Boolean).length}/${lab.hotspots.length} correct`}
          </div>
          <div className="grid grid-cols-1 gap-1">
            {lab.hotspots.map((h) => {
              const correct = results[h.id]
              const chosen = selections[h.id] || '-'
              return (
                <div key={h.id} className={`flex items-baseline gap-2 rounded px-2 py-1.5 text-xs ${correct ? 'bg-green-500/10' : 'bg-destructive/10'}`}>
                  <span className={`shrink-0 font-bold ${correct ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>{correct ? '✓' : '✗'}</span>
                  <span className="shrink-0 font-medium text-foreground">{h.label}:</span>
                  {correct ? (
                    <span className="text-green-700 dark:text-green-400">{h.answer}</span>
                  ) : (
                    <span className="flex items-baseline gap-1">
                      <span className="line-through text-muted-foreground">{chosen}</span>
                      <span className="text-muted-foreground">-&gt;</span>
                      <span className="font-medium text-foreground">{h.answer}</span>
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <div className="pt-1 border-t border-border">
            <ExplanationBlock text={lab.explanation} />
          </div>
        </div>
      )}

      <LabCheckActions
        checked={checked}
        isCorrect={isCorrect}
        submitted={session.submitted}
        canCheck={answeredCount >= lab.hotspots.length}
        onCheck={handleCheck}
        onComplete={handleComplete}
        onRetry={session.restart}
        onCancel={session.handleCancelLab}
      />
    </div>
  )
}

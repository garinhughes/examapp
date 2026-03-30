import { useState, useCallback, useEffect } from 'react'
import { useExam } from '@/exam/ExamContext'
import type { DiagramLabelLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabSession } from '../useLabSession'
import { LabCompleteModal } from '../LabCompleteModal'
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

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ selections, timeLeft: session.timeLeft })
  }, [selections, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !session.submitted) doSubmit()
  }, [session.timeLeft])

  const handleSelect = useCallback((hotspotId: string, value: string) => {
    if (session.submitted) return
    setSelections((prev) => ({ ...prev, [hotspotId]: value }))
  }, [session.submitted])

  const doSubmit = useCallback(async () => {
    const res: Record<string, boolean> = {}
    let allCorrect = true
    for (const h of lab.hotspots) {
      const pass = selections[h.id] === h.answer
      res[h.id] = pass
      if (!pass) allCorrect = false
    }
    setResults(res)
    await session.finalize(allCorrect, JSON.stringify(selections))
  }, [lab, selections, session.finalize])

  const answeredCount = Object.values(selections).filter(Boolean).length

  return (
    <div className="flex flex-col h-full gap-4">
      {session.showConfirmModal && (
        <LabCompleteModal
          title={lab.title}
          timeTaken={lab.timeLimit - session.timeLeft}
          timed={timed}
          onConfirm={() => { session.setShowConfirmModal(false); doSubmit() }}
          onCancel={() => session.setShowConfirmModal(false)}
        />
      )}
      <LabHeader
        title={lab.title}
        timed={timed}
        timeLeft={session.timeLeft}
        subtitle={lab.scenario}
        labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ selections, timeLeft: session.timeLeft })}
        onCancelLab={session.submitted ? undefined : session.handleCancelLab}
      />
      {session.resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

      {/* Diagram canvas — natural image sizing so hotspot % coords map exactly to image pixels */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-border bg-card">
        <div className="relative w-full">
        <img
          src={lab.imageUrl}
          alt="Architecture diagram"
          className="w-full h-auto block"
          draggable={false}
        />
        {lab.hotspots.map((hotspot) => {
          const isCorrect = session.submitted ? results[hotspot.id] : undefined
          return (
            <div
              key={hotspot.id}
              className="absolute"
              style={{ left: `${hotspot.x}%`, top: `${hotspot.y}%`, transform: 'translate(-50%, -50%)' }}
            >
              {session.submitted ? (
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shadow-sm ${
                  isCorrect
                    ? 'border-green-500 bg-green-500 text-white'
                    : 'border-destructive bg-destructive text-white'
                }`}>
                  {isCorrect ? '✓' : '✗'}
                </div>
              ) : (
                <select
                  value={selections[hotspot.id] ?? ''}
                  onChange={(e) => handleSelect(hotspot.id, e.target.value)}
                  className="text-xs border border-border rounded bg-card px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary shadow-sm"
                >
                  <option value="">— select —</option>
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

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        {!session.submitted ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Label each component on the diagram ({answeredCount}/{lab.hotspots.length} answered).
            </p>
            <button
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50"
              disabled={answeredCount < lab.hotspots.length}
              onClick={() => session.setShowConfirmModal(true)}
            >
              Submit Labels
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className={`font-semibold text-sm ${Object.values(results).every(Boolean) ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {Object.values(results).every(Boolean)
                ? '✓ All labels correct!'
                : `✗ ${Object.values(results).filter(Boolean).length}/${lab.hotspots.length} correct`}
            </div>

            {/* Per-hotspot results list */}
            <div className="grid grid-cols-1 gap-1">
              {lab.hotspots.map((h) => {
                const correct = results[h.id]
                const chosen = selections[h.id] || '-'
                return (
                  <div key={h.id} className={`flex items-baseline gap-2 rounded px-2 py-1.5 text-xs ${
                    correct ? 'bg-green-500/10' : 'bg-destructive/10'
                  }`}>
                    <span className={`shrink-0 font-bold ${
                      correct ? 'text-green-600 dark:text-green-400' : 'text-destructive'
                    }`}>{correct ? '✓' : '✗'}</span>
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

            {/* Formatted explanation */}
            <div className="pt-1 border-t border-border">
              <ExplanationBlock text={lab.explanation} />
            </div>

            <button onClick={() => setRoute('skill-labs')} className="mt-1 px-4 py-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted/50 transition">
              Back to Skill Labs
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

import { useState, useCallback, useEffect } from 'react'
import { useExam } from '@/exam/ExamContext'
import type { DiagramLabelLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabSession } from '../useLabSession'
import { LabCompleteModal } from '../LabCompleteModal'

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

      {/* Diagram canvas */}
      <div className="flex-1 rounded-lg border border-border bg-card overflow-hidden relative min-h-0">
        <img
          src={lab.imageUrl}
          alt="Architecture diagram"
          className="w-full h-full object-contain"
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
                <div className={`px-2 py-1 rounded border text-xs font-medium whitespace-nowrap ${
                  isCorrect
                    ? 'border-green-500 bg-green-500/20 text-green-700 dark:text-green-400'
                    : 'border-destructive bg-destructive/20 text-destructive'
                }`}>
                  {isCorrect ? hotspot.answer : (
                    <>
                      <span className="line-through opacity-60">{selections[hotspot.id] || '—'}</span>
                      {' → '}
                      {hotspot.answer}
                    </>
                  )}
                  <span className="ml-1">{isCorrect ? '✓' : '✗'}</span>
                  {hotspot.label && (
                    <span className="ml-1 text-muted-foreground">({hotspot.label})</span>
                  )}
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
          <div className="space-y-2">
            <div className={`font-semibold text-sm ${Object.values(results).every(Boolean) ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {Object.values(results).every(Boolean)
                ? '✓ All labels correct!'
                : `✗ ${Object.values(results).filter(Boolean).length}/${lab.hotspots.length} correct`}
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

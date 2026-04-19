import { useState, useCallback, useEffect, useMemo } from 'react'
import { ExplanationBlock } from '../ExplanationBlock'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useDroppable, useDraggable } from '@dnd-kit/core'
import { useExam } from '@/exam/ExamContext'
import type { DragMatchLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabSession } from '../useLabSession'
import { LabCompleteModal } from '../LabCompleteModal'

interface DragMatchProgress {
  matches: Record<string, string>   // termId → definitionId
  timeLeft: number
}

interface Props {
  lab: DragMatchLabDefinition
  timed?: boolean
}

function DraggableTerm({ id, label, disabled }: { id: string; label: string; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`px-3 py-2 rounded-md border text-sm font-medium select-none transition ${
        isDragging
          ? 'opacity-40'
          : disabled
            ? 'border-border bg-muted/50 text-muted-foreground cursor-default'
            : 'border-border bg-card hover:bg-muted/50 cursor-grab active:cursor-grabbing'
      }`}
    >
      {label}
    </div>
  )
}

function DefinitionDropZone({ id, definition, matchedTerm, correct, submitted }: {
  id: string
  definition: string
  matchedTerm?: string
  correct?: boolean
  submitted: boolean
}) {
  const { isOver, setNodeRef } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`flex gap-2 items-center rounded-lg border p-3 transition ${
        submitted
          ? correct
            ? 'border-green-500 bg-green-500/5'
            : matchedTerm ? 'border-destructive bg-destructive/5' : 'border-border bg-card'
          : isOver
            ? 'border-primary bg-primary/5'
            : matchedTerm
              ? 'border-primary/40 bg-primary/5'
              : 'border-dashed border-border bg-muted/20'
      }`}
    >
      <div className="w-28 shrink-0 text-xs font-medium font-mono px-2 py-1 rounded bg-muted/60 min-h-[28px] flex items-center">
        {matchedTerm || <span className="text-muted-foreground italic">Drop here</span>}
      </div>
      <div className="text-sm text-muted-foreground flex-1">{definition}</div>
      {submitted && (
        <span className={`text-xs font-bold shrink-0 ${correct ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
          {correct ? '✓' : '✗'}
        </span>
      )}
    </div>
  )
}

export function DragMatchRunner({ lab, timed = true }: Props) {
  const { setRoute } = useExam()
  const session = useLabSession<DragMatchProgress>({ lab, timed })
  const sensors = useSensors(useSensor(PointerSensor))

  const [matches, setMatches] = useState<Record<string, string>>(
    () => session.savedProgress?.matches ?? {}
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ matches, timeLeft: session.timeLeft })
  }, [matches, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !session.submitted) doSubmit()
  }, [session.timeLeft])

  // termId → definitionId (reverse of matches)
  const termToDefinition = useMemo(() => matches, [matches])
  // definitionId → termId
  const definitionToTerm = useMemo(() => {
    const m: Record<string, string> = {}
    for (const [termId, defId] of Object.entries(matches)) m[defId] = termId
    return m
  }, [matches])

  const unmatchedTermIds = useMemo(
    () => lab.pairs.map((p) => p.id).filter((id) => !termToDefinition[id]),
    [lab.pairs, termToDefinition]
  )

  const onDragStart = useCallback((e: DragStartEvent) => setActiveId(String(e.active.id)), [])

  const onDragEnd = useCallback((e: DragEndEvent) => {
    setActiveId(null)
    if (!e.over || session.submitted) return
    const termId = String(e.active.id)
    const defId = String(e.over.id)
    setMatches((prev) => {
      const next = { ...prev }
      // Remove existing match for this definition
      const existingTerm = definitionToTerm[defId]
      if (existingTerm) delete next[existingTerm]
      // Remove this term's previous match
      delete next[termId]
      next[termId] = defId
      return next
    })
  }, [session.submitted, definitionToTerm])

  const doSubmit = useCallback(async () => {
    const res: Record<string, boolean> = {}
    let allCorrect = true
    for (const pair of lab.pairs) {
      const pass = termToDefinition[pair.id] === pair.id
      res[pair.id] = pass
      if (!pass) allCorrect = false
    }
    setResults(res)
    await session.finalize(allCorrect, JSON.stringify(matches))
  }, [lab, termToDefinition, matches, session.finalize])

  const activeTerm = activeId ? lab.pairs.find((p) => p.id === activeId) : null
  const allMatched = unmatchedTermIds.length === 0

  return (
    <div className="flex flex-col h-full gap-4">
      {session.showConfirmModal && (
        <LabCompleteModal
          title={lab.title}
          timeTaken={session.timeLimit - session.timeLeft}
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
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ matches, timeLeft: session.timeLeft })}
        onCancelLab={session.submitted ? undefined : session.handleCancelLab}
      />
      {session.resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex-1 flex gap-4 min-h-0 overflow-y-auto">
          {/* Left: unmatched terms */}
          <div className="w-48 shrink-0 rounded-lg border border-border bg-card p-3">
            <h3 className="font-semibold text-sm mb-3">Terms</h3>
            <div className="space-y-2">
              {lab.pairs.map((pair) => {
                const isMatched = !!termToDefinition[pair.id]
                if (isMatched && !session.submitted) return null
                return (
                  <DraggableTerm
                    key={pair.id}
                    id={pair.id}
                    label={pair.term}
                    disabled={session.submitted || isMatched}
                  />
                )
              })}
              {unmatchedTermIds.length === 0 && !session.submitted && (
                <p className="text-xs text-muted-foreground italic">All terms placed</p>
              )}
            </div>
          </div>

          {/* Right: definition drop zones */}
          <div className="flex-1 space-y-2">
            <h3 className="font-semibold text-sm mb-3">Definitions</h3>
            {lab.pairs.map((pair) => (
              <DefinitionDropZone
                key={pair.id}
                id={pair.id}
                definition={pair.definition}
                matchedTerm={(() => {
                  const termId = definitionToTerm[pair.id]
                  return termId ? lab.pairs.find((p) => p.id === termId)?.term : undefined
                })()}
                correct={session.submitted ? results[definitionToTerm[pair.id] ?? ''] : undefined}
                submitted={session.submitted}
              />
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeTerm && (
            <div className="px-3 py-2 rounded-md border border-primary bg-primary/10 text-sm font-medium shadow-lg cursor-grabbing">
              {activeTerm.term}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        {!session.submitted ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Drag each term to its matching definition.</p>
            <button
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50"
              disabled={!allMatched}
              onClick={() => session.setShowConfirmModal(true)}
            >
              Submit Matches
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className={`font-semibold text-sm ${Object.values(results).every(Boolean) ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {Object.values(results).every(Boolean)
                ? '✓ All matches correct!'
                : `✗ ${Object.values(results).filter(Boolean).length}/${lab.pairs.length} correct`}
            </div>
            <ExplanationBlock text={lab.explanation} />
            <button onClick={() => setRoute('skill-labs')} className="mt-2 px-4 py-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted/50 transition">
              Back to Skill Labs
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

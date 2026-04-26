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
import { CheckCircle2, XCircle } from 'lucide-react'
import type { DragMatchLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabSession } from '../useLabSession'
import { LabCheckActions } from '../LabCheckActions'
import { useExam } from '@/exam/ExamContext'

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
  const [checked, setChecked] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)

  useEffect(() => {
    if (session.restartKey === 0) return
    setMatches({})
    setResults({})
    setActiveId(null)
    setChecked(false)
    setIsCorrect(false)
  }, [session.restartKey])

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ matches, timeLeft: session.timeLeft })
  }, [matches, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !checked) handleCheck()
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
    if (!e.over || checked) return
    session.markDirty()
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
  }, [checked, definitionToTerm])

  const handleCheck = useCallback(() => {
    if (checked) return
    const res: Record<string, boolean> = {}
    let allCorrect = true
    for (const pair of lab.pairs) {
      const pass = termToDefinition[pair.id] === pair.id
      res[pair.id] = pass
      if (!pass) allCorrect = false
    }
    setResults(res)
    setIsCorrect(allCorrect)
    setChecked(true)
  }, [checked, lab, termToDefinition])

  const handleComplete = useCallback(async () => {
    await session.finalize(isCorrect, JSON.stringify(matches))
  }, [session.finalize, matches, isCorrect])

  const activeTerm = activeId ? lab.pairs.find((p) => p.id === activeId) : null
  const allMatched = unmatchedTermIds.length === 0

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader
        title={lab.title}
        timed={timed}
        timeLeft={session.timeLeft}
        subtitle={lab.scenario}
        labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ matches, timeLeft: session.timeLeft })}
        onRatingClose={() => setRoute('skill-labs')}
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
                if (isMatched && !checked) return null
                return (
                  <DraggableTerm
                    key={pair.id}
                    id={pair.id}
                    label={pair.term}
                    disabled={checked || isMatched}
                  />
                )
              })}
              {unmatchedTermIds.length === 0 && !checked && (
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
                correct={checked ? results[definitionToTerm[pair.id] ?? ''] : undefined}
                submitted={checked}
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

      {checked && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-2">
          <div className={`inline-flex items-center gap-1.5 font-semibold text-sm ${isCorrect ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
            {isCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {isCorrect
              ? 'All matches correct!'
              : `${Object.values(results).filter(Boolean).length}/${lab.pairs.length} correct`}
          </div>
          <ExplanationBlock text={lab.explanation} />
        </div>
      )}

      <LabCheckActions
        checked={checked}
        isCorrect={isCorrect}
        submitted={session.submitted}
        canCheck={allMatched}
        onCheck={handleCheck}
        onComplete={handleComplete}
        onRetry={session.restart}
        onCancel={session.handleCancelLab}
      />
    </div>
  )
}

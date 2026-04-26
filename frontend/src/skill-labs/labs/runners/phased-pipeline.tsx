import { useState, useCallback, useEffect } from 'react'
import {
  DndContext, DragOverlay,
  PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, arrayMove, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, CheckCircle2, XCircle } from 'lucide-react'
import { ExplanationBlock } from '../ExplanationBlock'
import type { PhasedPipelineLabDefinition, PipelinePhase } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabSession } from '../useLabSession'
import { LabCheckActions } from '../LabCheckActions'
import { useExam } from '@/exam/ExamContext'

interface PhasedPipelineProgress {
  containers: Record<string, string[]>
  timeLeft: number
}

interface Props {
  lab: PhasedPipelineLabDefinition
  timed?: boolean
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const PHASE_HEADER_COLORS: Record<string, string> = {
  blue:   'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200',
  orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200',
  green:  'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200',
  purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200',
}

function SortableStepCard({ id, text, disabled, correct, position }: {
  id: string; text: string; disabled: boolean; correct?: boolean; position?: number
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const style = { transform: CSS.Transform.toString(transform), transition }
  let cls = 'border-border bg-card hover:bg-muted/40'
  if (correct === true)  cls = 'border-green-500 bg-green-500/5'
  if (correct === false) cls = 'border-destructive bg-destructive/5'
  const interactive = !disabled
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(interactive ? listeners : {})}
      {...(interactive ? attributes : {})}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition select-none touch-none ${cls} ${isDragging ? 'opacity-30' : ''} ${interactive ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {interactive && (
        <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
      )}
      {position !== undefined && (
        <span className="text-xs font-semibold text-muted-foreground shrink-0 w-4 text-center">{position}</span>
      )}
      <span className="flex-1 leading-snug">{text}</span>
      {correct !== undefined && (
        <span className={`text-xs font-bold shrink-0 ${correct ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
          {correct ? '✓' : '✗'}
        </span>
      )}
    </div>
  )
}

function PhaseColumn({ phase, phaseNumber, items, stepText, submitted, stepResults, disabled }: {
  phase: PipelinePhase
  phaseNumber: number
  items: string[]
  stepText: (id: string) => string
  submitted: boolean
  stepResults: Record<string, boolean>
  disabled: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: phase.id })
  const headerCls = PHASE_HEADER_COLORS[phase.color ?? 'blue']
  return (
    <div className={`flex-1 min-w-[150px] rounded-lg border ${isOver ? 'border-primary ring-1 ring-primary/20' : 'border-border'} bg-card flex flex-col transition`}>
      <div className={`px-3 py-2 rounded-t-lg border-b border-border text-xs font-semibold flex items-center gap-2 ${headerCls}`}>
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/70 dark:bg-black/30 text-[11px] font-bold">
          {phaseNumber}
        </span>
        <span>{phase.label}</span>
      </div>
      <div ref={setNodeRef} className="p-2 flex-1">
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5 min-h-[56px]">
            {items.map((id, idx) => (
              <SortableStepCard
                key={id}
                id={id}
                text={stepText(id)}
                disabled={disabled}
                correct={submitted ? stepResults[id] : undefined}
                position={idx + 1}
              />
            ))}
            {items.length === 0 && (
              <div className="text-xs text-muted-foreground italic text-center py-5 border border-dashed border-border/60 rounded-md">
                Drop steps here
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}

function PoolArea({ items, stepText, disabled }: {
  items: string[]
  stepText: (id: string) => string
  disabled: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool' })
  return (
    <div className={`rounded-lg border ${isOver ? 'border-primary ring-1 ring-primary/20' : 'border-border'} bg-muted/30 p-3 transition`}>
      <h3 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Unassigned Steps</h3>
      <div ref={setNodeRef}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((id) => (
              <SortableStepCard key={id} id={id} text={stepText(id)} disabled={disabled} />
            ))}
          </div>
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground italic py-1">All steps assigned</p>
          )}
        </SortableContext>
      </div>
    </div>
  )
}

export function PhasedPipelineRunner({ lab, timed = true }: Props) {
  const { setRoute } = useExam()
  const session = useLabSession<PhasedPipelineProgress>({ lab, timed })
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const initContainers = (): Record<string, string[]> => {
    if (session.savedProgress?.containers) return session.savedProgress.containers
    const c: Record<string, string[]> = { pool: shuffleArray(lab.steps.map((s) => s.id)) }
    for (const p of lab.phases) c[p.id] = []
    return c
  }

  const [containers, setContainers] = useState<Record<string, string[]>>(initContainers)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [stepResults, setStepResults] = useState<Record<string, boolean>>({})
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (session.restartKey === 0) return
    const c: Record<string, string[]> = { pool: shuffleArray(lab.steps.map((s) => s.id)) }
    for (const p of lab.phases) c[p.id] = []
    setContainers(c)
    setActiveId(null)
    setStepResults({})
    setChecked(false)
  }, [session.restartKey])

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ containers, timeLeft: session.timeLeft })
  }, [containers, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !checked) handleCheck()
  }, [session.timeLeft])

  const findContainer = useCallback((id: string) => {
    if (id in containers) return id
    return Object.keys(containers).find((k) => containers[k].includes(id))
  }, [containers])

  const onDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id))
  }, [])

  const onDragEnd = useCallback((e: DragEndEvent) => {
    setActiveId(null)
    if (checked) return
    const { active, over } = e
    if (!over) return
    session.markDirty()

    const activeId = String(active.id)
    const overId   = String(over.id)
    if (activeId === overId) return

    const src = findContainer(activeId)
    if (!src) return

    const dst = overId in containers ? overId : findContainer(overId)
    if (!dst) return

    setContainers((prev) => {
      const next: Record<string, string[]> = {}
      for (const k of Object.keys(prev)) next[k] = [...prev[k]]

      if (src === dst) {
        const oldIdx = next[src].indexOf(activeId)
        const newIdx = next[src].indexOf(overId)
        if (oldIdx !== newIdx) next[src] = arrayMove(next[src], oldIdx, newIdx)
      } else {
        next[src] = next[src].filter((id) => id !== activeId)
        if (overId in prev) {
          next[dst].push(activeId)
        } else {
          const idx = next[dst].indexOf(overId)
          next[dst].splice(idx >= 0 ? idx : next[dst].length, 0, activeId)
        }
      }
      return next
    })
  }, [containers, findContainer, checked])

  const allAssigned = containers.pool.length === 0

  const handleCheck = useCallback(() => {
    if (checked) return
    const results: Record<string, boolean> = {}
    for (const phaseId of Object.keys(containers)) {
      if (phaseId === 'pool') continue
      const sequence = containers[phaseId]
      const seen = new Set<string>()
      for (let i = 0; i < sequence.length; i++) {
        const stepId = sequence[i]
        const step = lab.steps.find((s) => s.id === stepId)!
        let ok = step.correctPhaseId === phaseId
        if (ok && step.mustFollowIds) {
          for (const prereq of step.mustFollowIds) {
            const prereqStep = lab.steps.find((s) => s.id === prereq)
            if (prereqStep && prereqStep.correctPhaseId === phaseId && !seen.has(prereq)) {
              ok = false
              break
            }
          }
        }
        results[stepId] = ok
        seen.add(stepId)
      }
    }
    for (const stepId of containers.pool) results[stepId] = false
    setStepResults(results)
    setChecked(true)
  }, [checked, containers, lab.steps])

  const handleComplete = useCallback(async () => {
    const allCorrect = Object.values(stepResults).every(Boolean) && Object.keys(stepResults).length === lab.steps.length
    await session.finalize(allCorrect, JSON.stringify(containers))
  }, [session.finalize, containers, stepResults, lab.steps.length])

  const activeStep = activeId ? lab.steps.find((s) => s.id === activeId) : null
  const correctCount = Object.values(stepResults).filter(Boolean).length

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader
        title={lab.title}
        timed={timed}
        timeLeft={session.timeLeft}
        subtitle={lab.scenario}
        labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ containers, timeLeft: session.timeLeft })}
        onRatingClose={() => setRoute('skill-labs')}
      />
      {session.resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto">
          <PoolArea
            items={containers.pool}
            stepText={(id) => lab.steps.find((s) => s.id === id)!.text}
            disabled={checked}
          />
          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            {lab.phases.map((phase, idx) => (
              <PhaseColumn
                key={phase.id}
                phase={phase}
                phaseNumber={idx + 1}
                items={containers[phase.id] ?? []}
                stepText={(id) => lab.steps.find((s) => s.id === id)!.text}
                submitted={checked}
                stepResults={stepResults}
                disabled={checked}
              />
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeStep && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary bg-primary/10 text-sm font-medium shadow-lg cursor-grabbing">
              <GripVertical className="w-4 h-4 text-primary shrink-0" />
              <span>{activeStep.text}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {checked && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="space-y-3">
            <div className={`inline-flex items-center gap-1.5 font-semibold text-sm ${correctCount === lab.steps.length ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
              {correctCount === lab.steps.length ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {correctCount === lab.steps.length
                ? `Perfect! All ${lab.steps.length} steps in the correct phase and position.`
                : `${correctCount}/${lab.steps.length} steps in the correct phase and position`}
            </div>
            {correctCount !== lab.steps.length && (
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
                <div className="text-sm font-semibold">Valid placements</div>
                <p className="text-sm text-muted-foreground">
                  Within each phase, steps only need to respect the listed dependencies.
                  Steps with no dependency on each other can appear in any order.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {lab.phases.map((phase, idx) => {
                    const phaseSteps = lab.steps.filter((s) => s.correctPhaseId === phase.id)
                    const headerCls = PHASE_HEADER_COLORS[phase.color ?? 'blue']
                    return (
                      <div key={phase.id} className="rounded-md border border-border bg-card overflow-hidden">
                        <div className={`px-2.5 py-1.5 text-sm font-semibold flex items-center gap-2 ${headerCls}`}>
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/70 dark:bg-black/30 text-[11px] font-bold">
                            {idx + 1}
                          </span>
                          <span>{phase.label}</span>
                        </div>
                        <ul className="p-2 space-y-1.5">
                          {phaseSteps.map((s) => {
                            const userPlaced = stepResults[s.id] === true
                            const prereqsInPhase = (s.mustFollowIds ?? [])
                              .map((id) => phaseSteps.find((p) => p.id === id))
                              .filter((p): p is typeof s => !!p)
                            return (
                              <li key={s.id} className="flex items-start gap-2 text-sm">
                                <span className={`flex-1 leading-snug ${userPlaced ? 'text-green-700 dark:text-green-400' : 'text-foreground'}`}>
                                  {s.text}
                                  {userPlaced && <span className="ml-1 text-green-600 dark:text-green-400">✓</span>}
                                  {prereqsInPhase.length > 0 ? (
                                    <span className="block text-xs text-muted-foreground italic mt-0.5">
                                      must come after: {prereqsInPhase.map((p) => `"${p.text}"`).join(', ')}
                                    </span>
                                  ) : (
                                    <span className="block text-xs text-muted-foreground italic mt-0.5">
                                      can be placed anywhere in this phase
                                    </span>
                                  )}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            <ExplanationBlock text={lab.explanation} />
          </div>
        </div>
      )}

      <LabCheckActions
        checked={checked}
        isCorrect={correctCount === lab.steps.length}
        submitted={session.submitted}
        canCheck={allAssigned}
        onCheck={handleCheck}
        onComplete={handleComplete}
        onRetry={session.restart}
        onCancel={session.handleCancelLab}
      />
    </div>
  )
}

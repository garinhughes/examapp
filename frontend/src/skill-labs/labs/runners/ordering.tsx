import { useState, useCallback, useEffect } from 'react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { GripVertical, CheckCircle2, XCircle } from 'lucide-react'
import { ExplanationBlock } from '../ExplanationBlock'
import type { OrderingLabDefinition, OrderingStep } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabSession } from '../useLabSession'
import { LabCheckActions } from '../LabCheckActions'
import { useExam } from '@/exam/ExamContext'
import { SortableOrderItem } from '@/exam/SortableOrderItem'

interface OrderingProgress {
  steps: OrderingStep[]
  timeLeft: number
}

interface Props {
  lab: OrderingLabDefinition
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

export function OrderingRunner({ lab, timed = true }: Props) {
  const { setRoute } = useExam()
  const session = useLabSession<OrderingProgress>({ lab, timed })

  const [steps, setSteps] = useState<OrderingStep[]>(() => session.savedProgress?.steps ?? shuffleArray(lab.steps))
  const [checked, setChecked] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)

  useEffect(() => {
    if (session.restartKey === 0) return
    setSteps(shuffleArray(lab.steps))
    setChecked(false)
    setIsCorrect(false)
  }, [session.restartKey])

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ steps, timeLeft: session.timeLeft })
  }, [steps, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !checked) handleCheck()
  }, [session.timeLeft])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (checked) return
    const { active, over } = event
    if (over && active.id !== over.id) {
      session.markDirty()
      setSteps((prev) => {
        const oldIndex = prev.findIndex((s) => s.id === active.id)
        const newIndex = prev.findIndex((s) => s.id === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }, [checked])

  const handleCheck = useCallback(() => {
    if (checked) return
    const correct = steps.every((step, idx) => step.correctPosition === idx + 1)
    setIsCorrect(correct)
    setChecked(true)
  }, [checked, steps])

  const handleComplete = useCallback(async () => {
    await session.finalize(isCorrect, steps.map((s) => s.id).join(','))
  }, [session.finalize, steps, isCorrect])

  const correctOrder = [...lab.steps].sort((a, b) => a.correctPosition - b.correctPosition)

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader
        title={lab.title}
        timed={timed}
        timeLeft={session.timeLeft}
        subtitle={lab.scenario}
        labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ steps, timeLeft: session.timeLeft })}
        onRatingClose={() => setRoute('skill-labs')}
      />
      {session.resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Ordering area */}
        <div className="flex-1 rounded-lg border border-border bg-card p-6 overflow-y-auto">
          <h3 className="font-semibold text-sm mb-1">Arrange the steps in the correct order</h3>
          <p className="text-xs text-muted-foreground mb-4">Drag and drop to reorder.</p>

          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {steps.map((step, idx) => {
                  let borderCls = 'border-border'
                  if (checked) {
                    borderCls = step.correctPosition === idx + 1
                      ? 'border-green-500 bg-green-500/5'
                      : 'border-destructive bg-destructive/5'
                  }
                  return (
                    <SortableOrderItem key={step.id} id={step.id} disabled={checked} className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${borderCls} bg-card transition`}>
                      <span className="text-muted-foreground">
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <span className="font-mono text-xs text-muted-foreground w-5">{idx + 1}.</span>
                      <span className="text-sm flex-1">{step.text}</span>
                      {checked && step.correctPosition !== idx + 1 && (
                        <span className="text-xs text-muted-foreground">→ position {step.correctPosition}</span>
                      )}
                    </SortableOrderItem>
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Correct order (shown after check) */}
        {checked && (
          <div className="w-72 shrink-0 rounded-lg border border-border bg-card p-4 overflow-y-auto">
            <h3 className="font-semibold text-sm mb-3">Correct Order</h3>
            <div className="space-y-2">
              {correctOrder.map((step, idx) => (
                <div key={step.id} className="flex items-center gap-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground w-5">{idx + 1}.</span>
                  <span>{step.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {checked && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-3">
          <div className={`inline-flex items-center gap-1.5 font-semibold text-sm ${isCorrect ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
            {isCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {isCorrect ? 'Correct order!' : 'Incorrect order'}
          </div>
          <ExplanationBlock text={lab.explanation} />
        </div>
      )}

      <LabCheckActions
        checked={checked}
        isCorrect={isCorrect}
        submitted={session.submitted}
        canCheck
        onCheck={handleCheck}
        onComplete={handleComplete}
        onRetry={session.restart}
        onCancel={session.handleCancelLab}
      />
    </div>
  )
}

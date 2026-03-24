import { useState, useCallback, useRef, useEffect } from 'react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { GripVertical } from 'lucide-react'
import { useExam } from '@/exam/ExamContext'
import { apiUrl } from '@/apiBase'
import type { OrderingLabDefinition, OrderingStep } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabComplete } from '../shared'
import { SortableOrderItem } from '@/exam/SortableOrderItem'
import { useLabProgress } from '../useLabProgress'
import { LabCompleteModal } from '../LabCompleteModal'

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
  const { authFetch, user, setRoute } = useExam()
  const completeWithGamification = useLabComplete(lab)
  const { savedProgress, saveProgress, clearProgress } = useLabProgress<OrderingProgress>(lab.id, timed)

  const [steps, setSteps] = useState<OrderingStep[]>(() => savedProgress?.steps ?? shuffleArray(lab.steps))
  const [submitted, setSubmitted] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [resumeNotice, setResumeNotice] = useState(savedProgress !== null)
  const [timeLeft, setTimeLeft] = useState(savedProgress?.timeLeft ?? lab.timeLimit)
  const [labPaused, setLabPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    if (!resumeNotice) return
    const t = setTimeout(() => setResumeNotice(false), 3000)
    return () => clearTimeout(t)
  }, [resumeNotice])

  useEffect(() => {
    if (submitted) return
    saveProgress({ steps, timeLeft })
  }, [steps, timeLeft, submitted])

  useEffect(() => {
    if (submitted || !timed || labPaused) return
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [submitted, timed, labPaused])

  useEffect(() => {
    if (timed && timeLeft === 0 && !submitted) doSubmit()
  }, [timeLeft])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    if (submitted) return
    const { active, over } = event
    if (over && active.id !== over.id) {
      setSteps((prev) => {
        const oldIndex = prev.findIndex((s) => s.id === active.id)
        const newIndex = prev.findIndex((s) => s.id === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }, [submitted])

  const doSubmit = useCallback(async () => {
    if (submitted) return
    setSubmitted(true)
    clearProgress()
    if (timerRef.current) clearInterval(timerRef.current)

    const correct = steps.every((step, idx) => step.correctPosition === idx + 1)
    setIsCorrect(correct)
    completeWithGamification(correct)

    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000)
    if (user) {
      try {
        await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedAnswer: steps.map((s) => s.id).join(','), correct, timeTaken }),
        })
      } catch { /* non-critical */ }
    }
  }, [submitted, steps, lab, authFetch, user])

  const handlePauseAndExit = useCallback(() => {
    saveProgress({ steps, timeLeft })
    setRoute('skill-labs')
  }, [steps, timeLeft])

  const handleCancelLab = useCallback(() => {
    clearProgress()
    setRoute('skill-labs')
  }, [])

  const correctOrder = [...lab.steps].sort((a, b) => a.correctPosition - b.correctPosition)

  return (
    <div className="flex flex-col h-full gap-4">
      {showConfirmModal && (
        <LabCompleteModal
          title={lab.title}
          timeTaken={lab.timeLimit - timeLeft}
          timed={timed}
          onConfirm={() => { setShowConfirmModal(false); doSubmit() }}
          onCancel={() => setShowConfirmModal(false)}
        />
      )}
      <LabHeader
        title={lab.title}
        timed={timed}
        timeLeft={timeLeft}
        subtitle={lab.scenario}
        labId={lab.id}
        onPauseChange={setLabPaused}
        onPauseAndExit={submitted ? undefined : handlePauseAndExit}
        onCancelLab={submitted ? undefined : handleCancelLab}
      />
      {resumeNotice && (
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
                  if (submitted) {
                    borderCls = step.correctPosition === idx + 1
                      ? 'border-green-500 bg-green-500/5'
                      : 'border-destructive bg-destructive/5'
                  }
                  return (
                    <SortableOrderItem key={step.id} id={step.id} disabled={submitted} className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${borderCls} bg-card transition`}>
                      <span className="text-muted-foreground">
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <span className="font-mono text-xs text-muted-foreground w-5">{idx + 1}.</span>
                      <span className="text-sm flex-1">{step.text}</span>
                      {submitted && step.correctPosition !== idx + 1 && (
                        <span className="text-xs text-muted-foreground">→ position {step.correctPosition}</span>
                      )}
                    </SortableOrderItem>
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Correct order (shown after submit) */}
        {submitted && (
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

      {/* Submit / Result */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        {!submitted ? (
          <button
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition"
            onClick={() => setShowConfirmModal(true)}
          >
            Submit Order
          </button>
        ) : (
          <div className="space-y-3">
            <div className={`font-semibold text-sm ${isCorrect ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {isCorrect ? '✓ Correct order!' : '✗ Incorrect order'}
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

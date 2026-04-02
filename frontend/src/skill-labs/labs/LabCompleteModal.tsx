/**
 * LabCompleteModal - confirmation dialog shown before a skill lab is submitted.
 * Mirrors the exam submit-confirmation pattern.
 */

import { X, Clock, Coffee } from 'lucide-react'
import { clarityEvent } from '@/clarity'

interface LabCompleteModalProps {
  title: string
  /** Seconds elapsed since the lab started (lab.timeLimit - timeLeft). */
  timeTaken: number
  timed: boolean
  onConfirm: () => void
  onCancel: () => void
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

export function LabCompleteModal({ title, timeTaken, timed, onConfirm, onCancel }: LabCompleteModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-sm mx-4 rounded-xl border border-border bg-card shadow-xl p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-muted/60 text-muted-foreground transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div>
          <h3 className="text-lg font-bold">Submit lab?</h3>
          <p className="text-sm text-muted-foreground mt-1">{title}</p>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {timed ? (
            <><Clock className="w-4 h-4 shrink-0" /> Time taken: {formatTime(timeTaken)}</>
          ) : (
            <><Coffee className="w-4 h-4 shrink-0" /> Casual mode</>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          Once submitted your answer will be scored. You can't change it after.
        </p>

        <div className="flex gap-3 pt-1">
          <button
            onClick={() => { clarityEvent('lab_completed'); onConfirm() }}
            className="flex-1 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition"
          >
            Submit
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-muted/50 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

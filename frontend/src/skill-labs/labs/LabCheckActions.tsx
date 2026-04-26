/**
 * Shared bottom-action component for Group A lab runners.
 *
 *  • Pre-check  → "Check Answer" (disabled until canCheck)
 *  • Checked + correct → "Complete Lab"
 *  • Checked + incorrect → "Retry Lab" + "Complete Lab"
 *  • Submitted → renders nothing (rating modal handles navigation)
 *
 * Sits inline in document flow (not sticky) — see log-analysis flow spec.
 */

import { Play, RotateCcw } from 'lucide-react'

interface Props {
  checked: boolean
  isCorrect: boolean
  submitted: boolean
  canCheck: boolean
  onCheck: () => void
  onComplete: () => void
  onRetry: () => void
  onCancel: () => void
}

export function LabCheckActions({ checked, isCorrect, submitted, canCheck, onCheck, onComplete, onRetry, onCancel }: Props) {
  if (submitted) return null

  return (
    <div className="flex items-center justify-end gap-2 flex-wrap pt-1">
      <button
        onClick={onCancel}
        className="px-3 py-2 rounded-md text-sm border border-border bg-card text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition"
      >
        Cancel Lab
      </button>
      {!checked && (
        <button
          onClick={onCheck}
          disabled={!canCheck}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50"
        >
          Check Answer
        </button>
      )}
      {checked && !isCorrect && (
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-md text-sm font-semibold border border-border bg-card hover:bg-muted/50 transition inline-flex items-center gap-1.5"
        >
          <RotateCcw className="w-4 h-4" />
          Retry Lab
        </button>
      )}
      {checked && (
        <button
          onClick={onComplete}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition inline-flex items-center gap-1.5"
        >
          <Play className="w-4 h-4" />
          Complete Lab
        </button>
      )}
    </div>
  )
}

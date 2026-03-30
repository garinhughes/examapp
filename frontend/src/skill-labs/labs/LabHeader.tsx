import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useExam } from '@/exam/ExamContext'
import { ArrowLeft, Heart, Flag, Star } from 'lucide-react'
import { clarityEvent, clarityTag } from '@/clarity'
import { getBookmarkedLabs, toggleBookmark } from './shared'
import { ReportIssueModal } from '@/components/ReportIssueModal'
import { RatingModal } from '@/feedback/RatingModal'

interface LabHeaderProps {
  title: string
  timed: boolean
  timeLeft: number
  subtitle?: string
  labId?: string
  onPauseChange?: (paused: boolean) => void
  /** Called instead of setRoute when leaving an in-progress lab — saves progress first. */
  onPauseAndExit?: () => void
  /** Called to discard saved progress and exit. When provided, a "Cancel Lab" option is shown. */
  onCancelLab?: () => void
}

export function LabHeader({ title, timed, timeLeft, subtitle, labId, onPauseChange, onPauseAndExit, onCancelLab }: LabHeaderProps) {
  const { setRoute, userTier } = useExam()
  const canReport = userTier !== 'visitor'
  const [isBookmarked, setIsBookmarked] = useState(() => labId ? getBookmarkedLabs().has(labId) : false)
  const [reporting, setReporting] = useState(false)
  const [rating, setRating] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  useEffect(() => {
    onPauseChange?.(reporting || rating)
  }, [reporting, rating])

  useEffect(() => {
    if (!confirmCancel) return
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') setConfirmCancel(false) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [confirmCancel])

  const handleBookmark = useCallback(() => {
    if (!labId) return
    const updated = toggleBookmark(labId)
    setIsBookmarked(updated.has(labId))
    clarityEvent('lab_bookmarked')
    clarityTag('lab_id', labId)
  }, [labId])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-2">
      {/* Back row */}
      <div className="flex items-center gap-3">
        <button
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
          onClick={() => onPauseAndExit ? onPauseAndExit() : setRoute('skill-labs')}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Skill Labs
        </button>
      </div>

      <p className="block sm:hidden text-[10px] text-muted-foreground text-right select-none">📐 Landscape mode recommended</p>
      {/* Header card */}
      <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm space-y-2">
        {/* Title row: title on left, timer/casual badge on right */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-lg leading-snug">{title}</h2>
            {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className="shrink-0">
          {timed ? (
            <div className={`font-mono text-sm font-semibold px-3 py-1 rounded-md ${timeLeft <= 30 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
              {formatTime(timeLeft)}
            </div>
          ) : (
            <span className="px-3 py-1 rounded-md bg-muted text-muted-foreground text-sm font-medium">Casual</span>
          )}
          </div>
        </div>
        {/* Action buttons row */}
        <div className="flex items-center gap-2 flex-wrap">
          {labId && canReport && (
            <button
              onClick={() => { setRating(true); clarityEvent('lab_rated'); if (labId) clarityTag('lab_id', labId) }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground border border-border hover:border-primary/50 transition-colors"
              title="Rate this lab"
            >
              <Star className="w-3 h-3" /> Rate
            </button>
          )}
          {labId && canReport && (
            <button
              onClick={() => setReporting(true)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground border border-border hover:border-primary/50 transition-colors"
              title="Report an issue with this lab"
            >
              <Flag className="w-3 h-3" /> Report
            </button>
          )}
          {onCancelLab && (
            <button
              onClick={() => { setConfirmCancel(true); clarityEvent('lab_cancel_initiated'); if (labId) clarityTag('lab_id', labId) }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-white bg-orange-500 hover:bg-orange-600 transition-colors"
              title="Cancel lab and discard progress"
            >
              Cancel Lab
            </button>
          )}
          {labId && (
            <button
              onClick={handleBookmark}
              className="p-1.5 rounded-md hover:bg-muted/60 transition"
              title={isBookmarked ? 'Remove bookmark' : 'Save for later'}
            >
              <Heart className={`w-4 h-4 transition ${isBookmarked ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
            </button>
          )}
          {reporting && labId && (
            <ReportIssueModal
              contentType="lab"
              contentId={labId}
              showPauseNotice={timed}
              onClose={() => setReporting(false)}
            />
          )}
          {rating && labId && (
            <RatingModal
              contentType="lab"
              contentId={labId}
              onClose={() => setRating(false)}
            />
          )}
          {confirmCancel && onCancelLab && createPortal(
            <div className="fixed inset-0 z-[9999] flex items-center justify-center">
              <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmCancel(false)} />
              <div className="relative bg-card p-6 rounded max-w-lg w-full mx-4">
                <h3 className="text-lg font-semibold mb-2">Cancel lab?</h3>
                <div className="text-sm text-muted-foreground mb-4">Your progress will be discarded and cannot be recovered.</div>
                <div className="flex items-center justify-end gap-3">
                  <button className="px-3 py-1 rounded-md bg-accent text-muted-foreground hover:bg-accent transition" onClick={() => setConfirmCancel(false)}>Keep going</button>
                  <button className="px-3 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 transition" onClick={onCancelLab}>Yes, cancel</button>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
      </div>
    </div>
  )
}

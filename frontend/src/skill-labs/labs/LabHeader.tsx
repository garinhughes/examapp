import { useCallback, useEffect, useState } from 'react'
import { useExam } from '@/exam/ExamContext'
import { ArrowLeft, Heart, Flag, Star } from 'lucide-react'
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
}

export function LabHeader({ title, timed, timeLeft, subtitle, labId, onPauseChange }: LabHeaderProps) {
  const { setRoute, userTier } = useExam()
  const canReport = userTier !== 'visitor'
  const [isBookmarked, setIsBookmarked] = useState(() => labId ? getBookmarkedLabs().has(labId) : false)
  const [reporting, setReporting] = useState(false)
  const [rating, setRating] = useState(false)

  useEffect(() => {
    onPauseChange?.(reporting || rating)
  }, [reporting, rating])

  const handleBookmark = useCallback(() => {
    if (!labId) return
    const updated = toggleBookmark(labId)
    setIsBookmarked(updated.has(labId))
  }, [labId])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-2">
      {/* Back link — sits above the card so it never competes with multi-line titles */}
      <button
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
        onClick={() => setRoute('skill-labs')}
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Skill Labs
      </button>

      {/* Header card */}
      <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <h2 className="font-semibold text-lg leading-snug">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {labId && canReport && (
            <button
              onClick={() => setRating(true)}
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
          {timed ? (
            <div className={`font-mono text-sm font-semibold px-3 py-1 rounded-md ${timeLeft <= 30 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
              {formatTime(timeLeft)}
            </div>
          ) : (
            <span className="px-3 py-1 rounded-md bg-muted text-muted-foreground text-sm font-medium">Casual</span>
          )}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, XCircle, Star, BookOpen, TrendingUp } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useExam } from './ExamContext'
import { apiUrl } from '@/apiBase'

/**
 * ExamCompleteModal — opens automatically when an exam transitions to finished
 * (dev-guide §16 / 15.11). Shows a clean pass/fail with score donut + optional
 * rating widget. Dismissing the modal leaves the user on the review page below.
 *
 * Auto-open is gated by sessionStorage attemptId so navigating back to a finished
 * attempt doesn't re-trigger the celebration.
 */
export function ExamCompleteModal() {
  const navigate = useNavigate()
  const { attemptData, selected, selectedMeta, user, authFetch } = useExam()
  const [open, setOpen] = useState(false)

  const score = typeof attemptData?.score === 'number' ? attemptData.score : 0
  const passMark = typeof selectedMeta?.passMark === 'number' ? selectedMeta.passMark : 70
  const passed = score >= passMark
  const correctCount = attemptData?.correctCount ?? 0
  const total = attemptData?.total ?? 0

  // Auto-open exactly once per attempt (per session)
  useEffect(() => {
    const aid = attemptData?.attemptId
    if (!aid || !attemptData?.finishedAt) return
    const key = `examCompleteShown:${aid}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {}
    setOpen(true)
  }, [attemptData?.attemptId, attemptData?.finishedAt])

  // Esc to close
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  if (!open || !attemptData?.finishedAt) return null

  // Donut math: 100→1, 0→0 of the circumference fills.
  const SIZE = 140
  const STROKE = 12
  const r = (SIZE - STROKE) / 2
  const c = 2 * Math.PI * r
  const dash = (score / 100) * c

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative bg-card rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header band */}
        <div className={`px-6 pt-6 pb-4 ${passed ? 'bg-emerald-500/10' : 'bg-destructive/10'}`}>
          <div className="flex items-center justify-center mb-3">
            {passed ? (
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            ) : (
              <XCircle className="w-10 h-10 text-destructive" />
            )}
          </div>
          <div className={`text-center text-sm font-semibold uppercase tracking-wide ${passed ? 'text-emerald-700 dark:text-emerald-300' : 'text-destructive'}`}>
            {passed ? 'Passed' : 'Did not pass'}
          </div>
          <div className="text-center text-xs text-muted-foreground mt-1">
            {selectedMeta?.title ?? selected}
          </div>
        </div>

        {/* Donut + stats */}
        <div className="px-6 py-5 flex items-center gap-5">
          <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
            <svg width={SIZE} height={SIZE} className="-rotate-90">
              <circle cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none" strokeWidth={STROKE} className="stroke-muted" />
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={r}
                fill="none"
                strokeWidth={STROKE}
                strokeDasharray={`${dash} ${c}`}
                strokeLinecap="round"
                className={passed ? 'stroke-emerald-500' : 'stroke-destructive'}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold tabular-nums">{score}%</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Score</span>
            </div>
          </div>
          <div className="flex-1 space-y-2 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Correct</div>
              <div className="font-semibold tabular-nums">{correctCount} / {total}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Pass mark</div>
              <div className="font-semibold tabular-nums">{passMark}%</div>
            </div>
            {attemptData?.earlyComplete && (
              <div className="text-[11px] text-primary">Completed early ({attemptData.answeredCount}/{attemptData.totalQuestions})</div>
            )}
          </div>
        </div>

        {/* Rating */}
        {user && selected && (
          <RatingPrompt examCode={selected} authFetch={authFetch} />
        )}

        {/* Actions */}
        <div className="px-6 pb-6 pt-2 flex flex-col sm:flex-row gap-2">
          <button
            onClick={() => { setOpen(false) }}
            className="flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition inline-flex items-center justify-center gap-2"
          >
            <BookOpen className="w-4 h-4" />
            Review questions
          </button>
          <button
            onClick={() => { setOpen(false); if (selected) navigate(`/exams/${selected}/history`) }}
            className="flex-1 px-4 py-2 rounded-md bg-accent text-foreground text-sm font-medium hover:bg-accent/80 transition inline-flex items-center justify-center gap-2"
          >
            <TrendingUp className="w-4 h-4" />
            View history
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function RatingPrompt({ examCode, authFetch }: { examCode: string; authFetch: (path: string, init?: any) => Promise<Response> }) {
  const [stars, setStars] = useState<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [showComment, setShowComment] = useState(false)
  const active = hovered ?? stars ?? 0

  async function submit() {
    if (!stars || submitting) return
    setSubmitting(true)
    try {
      // Difficulty derived from stars to keep parity with /ratings schema:
      //   1-2 → too-hard, 3 → just-right, 4-5 → too-easy
      const difficulty: 'too-hard' | 'just-right' | 'too-easy' =
        stars <= 2 ? 'too-hard' : stars === 3 ? 'just-right' : 'too-easy'
      await authFetch(apiUrl('/ratings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentType: 'exam',
          contentId: examCode,
          stars,
          difficulty,
          comment: comment.trim() || undefined,
        }),
      })
      setSubmitted(true)
    } catch {} finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="px-6 py-3 border-t border-border bg-muted/30 text-center text-xs text-muted-foreground">
        Thanks for the feedback!
      </div>
    )
  }

  return (
    <div className="px-6 py-3 border-t border-border bg-muted/30 space-y-2">
      <div className="text-xs text-muted-foreground">How was this exam?</div>
      <div className="flex items-center gap-1" onMouseLeave={() => setHovered(null)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setStars(n)}
            onMouseEnter={() => setHovered(n)}
            className="p-0.5 transition-transform hover:scale-110"
            aria-label={`${n} star${n !== 1 ? 's' : ''}`}
          >
            <Star className={`w-5 h-5 ${n <= active ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/40'}`} />
          </button>
        ))}
        {stars !== null && (
          <button
            type="button"
            onClick={() => setShowComment((v) => !v)}
            className="ml-auto text-[11px] text-muted-foreground hover:text-foreground transition"
          >
            {showComment ? 'Hide comment' : 'Add comment'}
          </button>
        )}
      </div>
      {showComment && (
        <textarea
          className="w-full rounded border border-border bg-background p-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary"
          rows={2}
          placeholder="Optional thoughts…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={500}
        />
      )}
      {stars !== null && (
        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={submitting}
            className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Submit'}
          </button>
        </div>
      )}
    </div>
  )
}

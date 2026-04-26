import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Star } from 'lucide-react'
import { useAuthFetch } from '../auth/useAuthFetch'

interface Props {
  contentType: 'question' | 'lab' | 'exam'
  contentId: string
  onClose: () => void
  onIgnoreAll?: () => void
}

type Difficulty = 'too-easy' | 'just-right' | 'too-hard'

const DIFFICULTY_LABELS: { value: Difficulty; label: string }[] = [
  { value: 'too-easy', label: 'Too Easy' },
  { value: 'just-right', label: 'Just Right' },
  { value: 'too-hard', label: 'Too Hard' },
]

export function RatingModal({ contentType, contentId, onClose, onIgnoreAll }: Props) {
  const authFetch = useAuthFetch()
  const [stars, setStars] = useState<number | null>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  useEffect(() => {
    authFetch(`/ratings/mine?contentType=${encodeURIComponent(contentType)}&contentId=${encodeURIComponent(contentId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.rating) {
          setStars(data.rating.stars)
          setDifficulty(data.rating.difficulty)
          setComment(data.rating.comment ?? '')
        }
      })
      .catch(() => {})
  }, [contentType, contentId])

  async function handleSubmit() {
    if (!stars || !difficulty) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await authFetch('/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType, contentId, stars, difficulty, comment: comment.trim() || undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as any).message ?? 'Something went wrong. Please try again.')
      } else {
        setSubmitted(true)
        setTimeout(onClose, 1500)
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const activeStar = hovered ?? stars ?? 0

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card p-6 rounded max-w-sm w-full mx-4">
        {submitted ? (
          <div className="text-center py-4">
            <div className="text-lg font-semibold mb-1">Thanks for the feedback!</div>
            <div className="text-sm text-muted-foreground">Your rating has been saved.</div>
          </div>
        ) : (
          <>
            <h3 className="text-lg font-semibold mb-1">Rate this {contentType === 'lab' ? 'lab' : contentType === 'exam' ? 'exam' : 'question'}</h3>
            <p className="text-sm text-muted-foreground mb-4">Your feedback is private and helps us improve content quality.</p>

            {/* Star rating */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Overall rating</label>
              <div className="flex items-center gap-1" onMouseLeave={() => setHovered(null)}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStars(n)}
                    onMouseEnter={() => setHovered(n)}
                    disabled={submitting}
                    className="p-0.5 transition-transform hover:scale-110 focus:outline-none"
                    aria-label={`${n} star${n !== 1 ? 's' : ''}`}
                  >
                    <Star
                      className={`w-7 h-7 transition-colors ${
                        n <= activeStar
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-muted-foreground/40'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty toggle */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Difficulty</label>
              <div className="flex gap-2">
                {DIFFICULTY_LABELS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDifficulty(value)}
                    disabled={submitting}
                    className={`flex-1 px-2 py-1.5 rounded text-xs font-medium border transition-colors ${
                      difficulty === value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Comment */}
            <div className="mb-1">
              <label className="block text-sm font-medium mb-1">Comment <span className="text-muted-foreground font-normal">(optional)</span></label>
              <textarea
                className="w-full rounded border border-border bg-background p-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                rows={3}
                placeholder="Any thoughts on how to improve this content…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={500}
                disabled={submitting}
              />
            </div>
            <div className="text-xs text-muted-foreground text-right mb-3">
              {comment.length}/500
            </div>

            {error && (
              <div className="text-sm text-red-500 mb-3">{error}</div>
            )}

            <div className="flex items-center justify-end gap-3">
              {onIgnoreAll && (
                <button
                  className="px-3 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground transition mr-auto"
                  onClick={onIgnoreAll}
                  disabled={submitting}
                >
                  Ignore all ratings
                </button>
              )}
              <button
                className="px-3 py-1 rounded-md bg-accent text-muted-foreground hover:bg-accent/80 transition text-sm"
                onClick={onClose}
                disabled={submitting}
              >
                Skip
              </button>
              <button
                className="px-3 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition text-sm disabled:opacity-50"
                onClick={handleSubmit}
                disabled={submitting || !stars || !difficulty}
              >
                {submitting ? 'Saving…' : 'Submit'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}

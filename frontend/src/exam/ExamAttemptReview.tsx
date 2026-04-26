import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useExam } from './ExamContext'
import { ExamReview } from './ExamReview'
import Loader from '@/components/Loader'
import { apiUrl } from '@/apiBase'

/**
 * Per-attempt review page — /exams/:code/attempt/:attemptId (dev-guide §16 / 15.4).
 * Fetches the stored attempt, hydrates ExamContext state, and renders ExamReview.
 * On unmount, clears the transient state so navigating away is clean.
 *
 * isFinished is derived from attemptData.finishedAt — setting that field is enough
 * to make ExamReview render in review mode.
 */
export function ExamAttemptReview() {
  const location = useLocation()
  const {
    authFetch, setAttemptData, setQuestions, setSelectedAnswers,
    setReviewIndex, setReviewDomains, setIncorrectOnly, selected, setRoute,
  } = useExam()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Extract attemptId from /exams/:code/attempt/:attemptId
  const attemptId = location.pathname.split('/attempt/')[1] ?? null

  useEffect(() => {
    if (!attemptId) { setError('No attempt ID in URL.'); setLoading(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const r = await authFetch(apiUrl(`/attempts/${encodeURIComponent(attemptId)}`))
        if (!r.ok) {
          setError(r.status === 404 ? 'Attempt not found.' : 'Failed to load attempt.')
          setLoading(false)
          return
        }
        const attempt = await r.json()
        if (cancelled) return

        // Questions are already normalised server-side by GET /attempts/:id
        const qs = Array.isArray(attempt.questions) ? attempt.questions : []

        setQuestions(qs)
        // Setting finishedAt makes isFinished=true which switches ExamReview into review mode
        setAttemptData({
          attemptId: attempt.attemptId,
          score: attempt.score ?? 0,
          correctCount: 0,
          total: qs.length,
          totalQuestions: qs.length,
          answeredCount: Array.isArray(attempt.answers) ? attempt.answers.length : 0,
          perDomain: attempt.perDomain ?? {},
          finishedAt: attempt.finishedAt ?? new Date().toISOString(),
          earlyComplete: !!attempt.earlyComplete,
          answers: Array.isArray(attempt.answers) ? attempt.answers : [],
          examCode: attempt.examCode,
        })
        setSelectedAnswers({})
        setReviewIndex(0)
        setReviewDomains(['All'])
        setIncorrectOnly(false)
        setLoading(false)
      } catch {
        if (!cancelled) { setError('Failed to load attempt.'); setLoading(false) }
      }
    })()
    return () => {
      cancelled = true
      // Clear transient state on unmount
      setAttemptData(null)
      setQuestions([])
      setSelectedAnswers({})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId])

  if (loading) return <Loader text="Loading attempt…" />

  if (error) return (
    <div className="flex flex-col items-start gap-3 p-4">
      <p className="text-destructive text-sm">{error}</p>
      <button
        onClick={() => selected ? setRoute('exam-history') : setRoute('practice')}
        className="px-4 py-2 rounded-md bg-accent text-sm font-medium hover:bg-accent/80 transition"
      >
        {selected ? 'Back to history' : 'Back to exams'}
      </button>
    </div>
  )

  return (
    <div id="exam-review-section">
      <ExamReview />
    </div>
  )
}

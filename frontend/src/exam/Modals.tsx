import { useEffect, useState } from 'react'
import { Flag, PauseCircle } from 'lucide-react'
import { Confetti, RewardModal } from '../components/Confetti'
import { useExam } from './ExamContext'

type AbandonReason = 'too-hard' | 'too-easy' | 'ran-out-of-time' | 'technical-issue' | 'something-else'

const REASON_CHIPS: { value: AbandonReason; label: string }[] = [
  { value: 'too-hard',         label: 'Too hard' },
  { value: 'too-easy',         label: 'Too easy' },
  { value: 'ran-out-of-time',  label: 'Ran out of time' },
  { value: 'technical-issue',  label: 'Technical issue' },
  { value: 'something-else',   label: 'Something else' },
]

const NOTE_MAX_LENGTH = 280


export function Modals({ onReviewAnswers }: { onReviewAnswers?: () => void }) {
  const {
    paused, setPaused, examStarted, timed,
    showCancelConfirm, setShowCancelConfirm,
    showSubmitConfirm, setShowSubmitConfirm,
    showCompleteEarlyConfirm, setShowCompleteEarlyConfirm,
    handleSubmitExam, toasts, setToasts,
    showConfetti, setShowConfetti, rewardModal, setRewardModal,
    displayQuestions, flaggedQuestions, selectedAnswers,
    selected, anySavedExam, attemptId, authFetch, showAttempts,
    setAttemptsList,
    setAttemptId, setAttemptData, setExamStarted, setSavedExamVersion,
    setSelectedAnswers, setMultiSelectPending,
    setFlaggedQuestions, setCurrentQuestionIndex,
    setTimeLeft, setServiceFilterText, setSelectedServices,
    setServerInProgress, serverInProgress,
  } = useExam()

  const [abandonReason, setAbandonReason] = useState<AbandonReason | null>(null)
  const [abandonNote, setAbandonNote] = useState<string>('')
  const [cancelling, setCancelling] = useState(false)

  // Reset chip + note whenever the modal opens
  useEffect(() => { if (showCancelConfirm) { setAbandonReason(null); setAbandonNote(''); setCancelling(false) } }, [showCancelConfirm])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (showCompleteEarlyConfirm) { setShowCompleteEarlyConfirm(false); return }
      if (showSubmitConfirm) { setShowSubmitConfirm(false); return }
      if (showCancelConfirm) { setShowCancelConfirm(false); return }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showCompleteEarlyConfirm, showSubmitConfirm, showCancelConfirm])

  return (
    <>
      {/* Pause overlay */}
      {paused && examStarted && timed && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative text-center">
            <PauseCircle className="w-16 h-16 text-primary mx-auto mb-3" />
            <div className="text-2xl font-bold text-primary mb-1">Paused</div>
            <div className="text-sm text-white/70 mb-6">Questions are hidden while paused</div>
            <button
              className="px-6 py-2 rounded-lg bg-primary text-white text-base font-semibold hover:bg-primary/80 transition-colors"
              onClick={() => setPaused(false)}
            >
              Resume
            </button>
          </div>
        </div>
      )}

      {/* Cancel confirmation modal — soft-abandon (dev-guide §16 / 15.13) */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !cancelling && setShowCancelConfirm(false)} />
          <div className="relative bg-card p-6 rounded max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">End this attempt?</h3>
            <div className="text-sm text-muted-foreground mb-4">
              Your answers won't be scored, but this attempt will still show in your history so you can review it later.
            </div>

            <div className="mb-4">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Mind sharing why? <span className="font-normal">(optional)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {REASON_CHIPS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    disabled={cancelling}
                    onClick={() => setAbandonReason((prev) => {
                      const next = prev === value ? null : value
                      if (next !== 'something-else') setAbandonNote('')
                      return next
                    })}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      abandonReason === value
                        ? 'bg-primary/10 text-primary border-primary/40'
                        : 'bg-background text-muted-foreground border-border hover:border-primary/40'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {abandonReason === 'something-else' && (
                <div className="mt-3">
                  <textarea
                    value={abandonNote}
                    onChange={(e) => setAbandonNote(e.target.value.slice(0, NOTE_MAX_LENGTH))}
                    disabled={cancelling}
                    rows={2}
                    maxLength={NOTE_MAX_LENGTH}
                    autoFocus
                    placeholder="Tell us more (optional)…"
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/40 disabled:opacity-50"
                  />
                  <div className="text-[10px] text-muted-foreground text-right mt-1">{abandonNote.length}/{NOTE_MAX_LENGTH}</div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                className="px-3 py-1 rounded-md bg-accent text-muted-foreground inline-flex items-center gap-2 hover:bg-accent transition disabled:opacity-50"
                disabled={cancelling}
                onClick={() => setShowCancelConfirm(false)}
              >
                Keep practising
              </button>
              <button
                className="px-3 py-1 rounded-md bg-red-600 text-white inline-flex items-center gap-2 hover:bg-red-700 transition disabled:opacity-50"
                disabled={cancelling}
                onClick={async () => {
                  setCancelling(true)
                  const bannerCode = anySavedExam?.code ?? selected
                  // attemptId may be null when the banner is rendered purely from cross-device
                  // serverInProgress (user hasn't resumed on this device yet) — fall back to that.
                  const fallbackIds = serverInProgress
                    .filter(s => !bannerCode || s.examCode === bannerCode)
                    .map(s => s.attemptId)
                  const idsToAbandon = Array.from(new Set([attemptId, ...fallbackIds].filter(Boolean) as string[]))
                  const noteTrimmed = abandonNote.trim()
                  const payload: Record<string, string> = {}
                  if (abandonReason) payload.reason = abandonReason
                  if (abandonReason === 'something-else' && noteTrimmed) payload.note = noteTrimmed
                  const reasonBody = Object.keys(payload).length ? JSON.stringify(payload) : '{}'
                  for (const id of idsToAbandon) {
                    try {
                      const res = await authFetch(`/attempts/${id}/abandon`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: reasonBody,
                      })
                      if (!res.ok && res.status !== 404) {
                        const msg = await res.text().catch(() => 'Could not cancel attempt')
                        alert(msg || 'Could not cancel attempt')
                        setCancelling(false)
                        return
                      }
                    } catch {
                      alert('Could not cancel attempt — check your connection and try again.')
                      setCancelling(false)
                      return
                    }
                  }
                  const codeToRemove = bannerCode
                  try { if (codeToRemove) localStorage.removeItem(`attempt:${codeToRemove}`) } catch {}
                  try { if (codeToRemove) localStorage.removeItem(`examProgress:${codeToRemove}`) } catch {}
                  setServerInProgress(prev => prev.filter(s => !idsToAbandon.includes(s.attemptId) && s.examCode !== codeToRemove))
                  setSavedExamVersion(v => v + 1)
                  setAttemptId(null)
                  setAttemptData(null)
                  setExamStarted(false)
                  setSelectedAnswers({})
                  setMultiSelectPending({})
                  setFlaggedQuestions(new Set())
                  setCurrentQuestionIndex(0)
                  setTimeLeft(null)
                  setPaused(false)
                  setShowCancelConfirm(false)
                  setShowSubmitConfirm(false)
                  setShowCompleteEarlyConfirm(false)
                  setServiceFilterText('')
                  setSelectedServices([])
                  if (showAttempts) {
                    try {
                      const r = await authFetch('/attempts')
                      const dd = await r.json()
                      setAttemptsList(dd.attempts ?? [])
                    } catch {}
                  }
                  setCancelling(false)
                }}
              >
                {cancelling ? 'Ending…' : 'End attempt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Exam confirmation modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSubmitConfirm(false)} />
          <div className="relative bg-card p-6 rounded max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Submit exam?</h3>
            <div className="text-sm text-muted-foreground mb-2">
              You have answered all {displayQuestions.length} questions.
            </div>
            {displayQuestions.filter(q => flaggedQuestions.has(q.id)).length > 0 && (
              <div className="text-sm text-primary mb-2">
                <Flag className="w-3.5 h-3.5 inline-block mr-1" />You have {displayQuestions.filter(q => flaggedQuestions.has(q.id)).length} flagged question(s). Review them before submitting?
              </div>
            )}
            <div className="text-sm text-muted-foreground mb-4">Once submitted, you cannot change your answers.</div>
            <div className="flex items-center justify-end gap-3">
              <button className="px-3 py-1 rounded bg-accent text-muted-foreground hover:bg-accent" onClick={() => { setShowSubmitConfirm(false); if (displayQuestions.some(q => flaggedQuestions.has(q.id))) onReviewAnswers?.() }}>Review answers</button>
              <button className="px-4 py-1.5 rounded bg-primary text-white font-semibold hover:bg-primary/80" onClick={() => handleSubmitExam(false)}>Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Early confirmation modal */}
      {showCompleteEarlyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCompleteEarlyConfirm(false)} />
          <div className="relative bg-card p-6 rounded max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Complete exam early?</h3>
            {(() => {
              const answered = Object.keys(selectedAnswers).filter(id => displayQuestions.some(q => q.id === id)).length
              const total = displayQuestions.length
              const unanswered = total - answered
              const flaggedCount = displayQuestions.filter(q => flaggedQuestions.has(q.id)).length
              return (
                <>
                  <div className="text-sm text-muted-foreground mb-2">
                    You have answered <strong>{answered}</strong> of <strong>{total}</strong> questions.
                    {unanswered > 0 && <span className="text-primary"> {unanswered} question{unanswered > 1 ? 's' : ''} will not be scored.</span>}
                  </div>
                  {flaggedCount > 0 && (
                    <div className="text-sm text-primary mb-2">
                      <Flag className="w-3.5 h-3.5 inline-block mr-1" />You have {flaggedCount} flagged question{flaggedCount > 1 ? 's' : ''}. Review them before completing?
                    </div>
                  )}
                  <div className="text-sm text-muted-foreground mb-4">
                    Your score will be calculated from the <strong>{answered}</strong> answered questions only - unanswered questions won't count against you.
                  </div>
                </>
              )
            })()}
            <div className="flex items-center justify-end gap-3">
              <button className="px-3 py-1 rounded bg-accent text-muted-foreground hover:bg-accent" onClick={() => { setShowCompleteEarlyConfirm(false); if (displayQuestions.some(q => flaggedQuestions.has(q.id))) onReviewAnswers?.() }}>{displayQuestions.some(q => flaggedQuestions.has(q.id)) ? 'Review Flagged' : 'Keep going'}</button>
              <button className="px-4 py-1.5 rounded bg-primary text-white font-semibold hover:bg-primary/80" onClick={() => handleSubmitExam(true)}>Complete &amp; Score</button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-60 flex flex-col items-center space-y-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              onClick={() => setToasts((s) => s.filter((x) => x.id !== t.id))}
              className={`max-w-sm w-full px-3 py-2 rounded shadow-lg cursor-pointer transition-opacity hover:opacity-90 ${t.type === 'error' ? 'bg-red-600 text-white' : 'bg-gray-900 text-gray-50 dark:bg-gray-100 dark:text-gray-900'}`}
            >
              <div className="text-sm">{t.msg}</div>
            </div>
          ))}
        </div>
      )}

      {/* Confetti overlay */}
      {showConfetti && <Confetti duration={3500} onDone={() => setShowConfetti(false)} />}

      {/* Reward modal */}
      {rewardModal && (
        <RewardModal
          title={rewardModal.title}
          subtitle={rewardModal.subtitle}
          xpGained={rewardModal.xpGained}
          badges={rewardModal.badges}
          onClose={() => setRewardModal(null)}
        />
      )}
    </>
  )
}

import { useState, useEffect } from 'react'
import { Check, Flag, Star } from 'lucide-react'
import { useExam } from './ExamContext'
import { ReportIssueModal } from '../components/ReportIssueModal'
import { RatingModal } from '@/feedback/RatingModal'
import { clarityEvent } from '@/clarity'

const PAGE_SIZE = 20

export function QuestionNav() {
  const {
    displayQuestions, selectedAnswers, flaggedQuestions, currentQuestionIndex,
    setCurrentQuestionIndex, setFlaggedQuestions, isFinished, revealAnswers,
    revealedQuestions, setShowSubmitConfirm, setShowCompleteEarlyConfirm,
    userTier, timed, setPaused, selected, selectedMeta, ratingTarget, setRatingTarget,
  } = useExam()

  const canReport = userTier !== 'visitor'
  const [reporting, setReporting] = useState(false)
  const [bankPage, setBankPage] = useState(0)

  const totalPages = Math.ceil(displayQuestions.length / PAGE_SIZE)
  const usePaging = totalPages > 1

  // Auto-follow the current question's bank when navigating
  useEffect(() => {
    const page = Math.floor(Math.min(currentQuestionIndex, displayQuestions.length - 1) / PAGE_SIZE)
    setBankPage(page)
  }, [currentQuestionIndex, displayQuestions.length])

  const visibleStart = bankPage * PAGE_SIZE
  const visibleQuestions = usePaging
    ? displayQuestions.slice(visibleStart, visibleStart + PAGE_SIZE)
    : displayQuestions

  const answeredCount = Object.keys(selectedAnswers).filter(id => displayQuestions.some(q => q.id === id)).length
  const pct = Math.round((answeredCount / Math.max(1, displayQuestions.length)) * 100)
  const allAnswered = answeredCount >= displayQuestions.length
  const flaggedCount = displayQuestions.filter(q => flaggedQuestions.has(q.id)).length
  const curQ = displayQuestions[Math.min(currentQuestionIndex, displayQuestions.length - 1)]
  const curAnswered = curQ && selectedAnswers[curQ.id] !== undefined
  const curShowFeedback = isFinished || (curQ && revealedQuestions.has(curQ.id))
  const immediateMode = revealAnswers === 'immediately'

  return (
    <>
    <div className="mb-2 space-y-2">
      <p className="block sm:hidden text-[10px] text-muted-foreground text-center select-none">📐 Landscape mode recommended</p>
      {/* Bank carousel controls — only shown when > PAGE_SIZE questions */}
      {usePaging && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <button
            onClick={() => setBankPage(p => Math.max(0, p - 1))}
            disabled={bankPage === 0}
            className="px-2.5 py-0.5 rounded border border-border hover:bg-muted/40 disabled:opacity-30 text-base leading-none"
          >‹</button>
          <span className="flex-1 text-center">
            Q{visibleStart + 1}–{Math.min(visibleStart + PAGE_SIZE, displayQuestions.length)} of {displayQuestions.length}
          </span>
          <button
            onClick={() => setBankPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={bankPage === totalPages - 1}
            className="px-2.5 py-0.5 rounded border border-border hover:bg-muted/40 disabled:opacity-30 text-base leading-none"
          >›</button>
        </div>
      )}

      {/* Question navigation grid */}
      <div className="flex flex-wrap gap-1">
        {visibleQuestions.map((qq, i) => {
          const idx = visibleStart + i
          const isAnswered = selectedAnswers[qq.id] !== undefined
          const isFlagged = flaggedQuestions.has(qq.id)
          const isCurrent = idx === Math.min(currentQuestionIndex, displayQuestions.length - 1)
          return (
            <button
              key={qq.id}
              onClick={() => setCurrentQuestionIndex(idx)}
              title={`Q${idx + 1}${isFlagged ? ' (flagged)' : ''}${isAnswered ? ' (answered)' : ''}`}
              className={`relative w-7 h-7 sm:w-9 sm:h-9 rounded-md text-xs sm:text-sm font-bold flex items-center justify-center transition-all focus:outline-none
                ${isCurrent ? 'ring-2 ring-primary ring-offset-1 ring-offset-transparent bg-primary text-white shadow' : ''}
                ${isAnswered && !isCurrent ? 'bg-primary text-white shadow-sm' : ''}
                ${!isAnswered && !isCurrent ? 'bg-card text-muted-foreground border border-border hover:bg-muted/40' : ''}`}
            >
              <span className="select-none">{idx + 1}</span>
              {isFlagged && <span className="absolute -top-1 -right-1 text-[9px]">🚩</span>}
            </button>
          )
        })}
      </div>

      {/* Progress + action bar */}
      <div>
        <div className="mb-1 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Question {Math.min(currentQuestionIndex + 1, displayQuestions.length)}/{displayQuestions.length}</span>
            <span className="text-xs text-muted-foreground">{answeredCount} answered · {pct}%</span>
            {flaggedCount > 0 && <span className="text-xs text-primary">🚩 {flaggedCount} flagged</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {flaggedCount > 0 && (
              <button className="px-2 py-1 rounded bg-accent text-primary text-xs font-medium hover:bg-accent transition-colors whitespace-nowrap" onClick={() => setFlaggedQuestions(new Set())}>
                🚩 Unflag All
              </button>
            )}
            {allAnswered && (
              <button className="px-3 py-1 rounded bg-primary text-white text-xs font-semibold animate-pulse whitespace-nowrap" onClick={() => setShowSubmitConfirm(true)}>
                Submit Exam
              </button>
            )}
          </div>
        </div>
        <div className="w-full h-2 bg-accent/60 rounded overflow-hidden">
          <div className="h-2 bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        {/* Prev / Next navigation */}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 justify-end w-full">
          {canReport && curQ && !isFinished && (
            <>
              <button
                onClick={() => { setReporting(true); setPaused(true) }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground border border-border hover:border-primary/50 transition-colors whitespace-nowrap"
              >
                <Flag className="w-3 h-3" /> Report Issue
              </button>
              <button
                onClick={() => { setRatingTarget(curQ.id); clarityEvent('question_rated') }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground border border-border hover:border-primary/50 transition-colors whitespace-nowrap"
                aria-label="Rate this question"
              >
                <Star className="w-3 h-3" /> Rate
              </button>
            </>
          )}
          <button
            onClick={() => setCurrentQuestionIndex((i) => Math.max(0, i - 1))}
            disabled={currentQuestionIndex <= 0}
            className="px-3 py-1 rounded-md bg-muted-foreground text-white text-sm disabled:opacity-40 whitespace-nowrap"
          >← Prev</button>
          {immediateMode && curShowFeedback && curAnswered ? (
            <button
              onClick={() => setCurrentQuestionIndex((i) => Math.min(displayQuestions.length - 1, i + 1))}
              disabled={currentQuestionIndex >= displayQuestions.length - 1}
              className="px-3 py-1 rounded-md bg-primary text-white text-sm font-semibold disabled:opacity-40 hover:bg-primary/80 transition-colors whitespace-nowrap"
            >Next →</button>
          ) : (
            <button
              onClick={() => setCurrentQuestionIndex((i) => Math.min(displayQuestions.length - 1, i + 1))}
              disabled={currentQuestionIndex >= displayQuestions.length - 1}
              className="px-3 py-1 rounded-md bg-muted-foreground text-white text-sm disabled:opacity-40 whitespace-nowrap"
            >Next →</button>
          )}
          {!allAnswered && answeredCount > 0 && (
            <button
              className="px-3 py-1 rounded-md bg-emerald-600 text-white text-sm font-semibold inline-flex items-center gap-1.5 shadow-sm hover:bg-emerald-700 transition-colors whitespace-nowrap"
              onClick={() => setShowCompleteEarlyConfirm(true)}
            >
              <Check className="w-4 h-4 shrink-0" aria-hidden />
              <span className="hidden sm:inline">Complete Early</span>
              <span className="sm:hidden">Complete</span>
            </button>
          )}
        </div>
      </div>
    </div>
    {ratingTarget && (
      <RatingModal
        contentType="question"
        contentId={ratingTarget}
        onClose={() => setRatingTarget(null)}
      />
    )}
    {reporting && curQ && (
      <ReportIssueModal
        contentType="question"
        contentId={String(curQ.id)}
        examCode={selected ?? undefined}
        provider={(selectedMeta as any)?.provider}
        showPauseNotice={timed}
        onClose={() => { setReporting(false); setPaused(false) }}
      />
    )}
    </>
  )
}

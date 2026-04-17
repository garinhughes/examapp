import { useState, useEffect } from 'react'
import { Flag, Star, ChevronLeft, ChevronRight, CircleCheck, Pause, Play } from 'lucide-react'
import { useExam } from './ExamContext'
import { ReportIssueModal } from '../components/ReportIssueModal'
import { RatingModal } from '@/feedback/RatingModal'
import { clarityEvent } from '@/clarity'

const PAGE_SIZE = 20

export function QuestionNav({ focusMode = false, showGrid = true, reviewingFlagged = false }: { focusMode?: boolean; showGrid?: boolean; reviewingFlagged?: boolean }) {
  const {
    displayQuestions, selectedAnswers, flaggedQuestions, currentQuestionIndex,
    setCurrentQuestionIndex, setFlaggedQuestions, isFinished, revealAnswers,
    revealedQuestions, setShowSubmitConfirm, setShowCompleteEarlyConfirm,
    userTier, timed, timeLeft, paused, setPaused, selected, selectedMeta, ratingTarget, setRatingTarget,
    visitedQuestions,
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
  const visitedCount = displayQuestions.filter(q => visitedQuestions.has(q.id)).length
  const pct = Math.round((answeredCount / Math.max(1, displayQuestions.length)) * 100)
  const visitedPct = Math.round((visitedCount / Math.max(1, displayQuestions.length)) * 100)
  const allAnswered = answeredCount >= displayQuestions.length
  const flaggedCount = displayQuestions.filter(q => flaggedQuestions.has(q.id)).length
  const curQ = displayQuestions[Math.min(currentQuestionIndex, displayQuestions.length - 1)]
  const curAnswered = curQ && selectedAnswers[curQ.id] !== undefined
  const curShowFeedback = isFinished || (curQ && revealedQuestions.has(curQ.id))
  const immediateMode = revealAnswers === 'immediately'

  function getNextIndex(current: number) {
    if (reviewingFlagged) {
      const next = displayQuestions.findIndex((q, idx) => idx > current && flaggedQuestions.has(q.id))
      if (next !== -1) return next
    }
    return Math.min(displayQuestions.length - 1, current + 1)
  }

  function getPrevIndex(current: number) {
    if (reviewingFlagged) {
      let prev = -1
      for (let i = current - 1; i >= 0; i--) {
        if (flaggedQuestions.has(displayQuestions[i].id)) { prev = i; break }
      }
      if (prev !== -1) return prev
    }
    return Math.max(0, current - 1)
  }

  return (
    <>
    <div className="mb-2 space-y-2">
      {/* Mobile-only timer strip */}
      {timed && timeLeft !== null && (
        <div className="flex sm:hidden items-center gap-2 py-0.5 justify-end">
          <button
            onClick={() => setPaused(p => !p)}
            className={`p-1 rounded transition-colors ${paused ? 'bg-primary/10 text-primary' : 'hover:bg-muted/40 text-muted-foreground'}`}
            title={paused ? 'Resume' : 'Pause'}
          >
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
          <span className={`text-sm tabular-nums font-medium ${paused ? 'text-yellow-500 animate-pulse' : 'text-muted-foreground'}`}>
            {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}
            {paused && <span className="ml-1 text-xs">(paused)</span>}
          </span>
        </div>
      )}

      {/* Bank carousel controls + question grid — hidden when progress bar strip replaces them */}
      {showGrid && (
        <>
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
          <div className="flex flex-wrap gap-2">
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
                    ${isCurrent ? 'ring-2 ring-primary ring-offset-2 ring-offset-background bg-primary text-white shadow' : ''}
                    ${isAnswered && !isCurrent ? 'bg-primary text-white shadow-sm' : ''}
                    ${!isAnswered && !isCurrent ? 'bg-card text-muted-foreground border border-border hover:bg-muted/40' : ''}`}
                >
                  <span className="select-none">{idx + 1}</span>
                  {isFlagged && (
                    <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full bg-white dark:bg-card border border-primary/50 shadow-sm">
                      <Flag className="w-2.5 h-2.5 text-primary" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                <span className="text-xs text-muted-foreground whitespace-nowrap">{answeredCount} answered · {pct}%</span>
                {flaggedCount > 0 && <span className="text-xs text-primary flex items-center gap-1 whitespace-nowrap"><Flag className="w-3 h-3" />{flaggedCount} flagged</span>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {flaggedCount > 0 && (
                  <button className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-primary/30 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/15 transition-colors whitespace-nowrap" onClick={() => setFlaggedQuestions(new Set())}>
                    <Flag className="w-3 h-3" /><span className="hidden sm:inline">Unflag All</span>
                  </button>
                )}
                <button
                  onClick={() => allAnswered ? setShowSubmitConfirm(true) : setShowCompleteEarlyConfirm(true)}
                  title="Finish Exam"
                  className={`rounded bg-primary text-white font-semibold inline-flex items-center justify-center ${focusMode ? 'p-1.5' : 'px-2.5 py-1 text-xs whitespace-nowrap'}`}
                >
                  {focusMode ? <CircleCheck className="w-4 h-4" /> : 'Finish Exam'}
                </button>
              </div>
            </div>
            <div className="w-full h-2 bg-accent/60 rounded overflow-hidden relative">
              <div className="absolute inset-y-0 left-0 bg-primary/20 transition-all duration-300" style={{ width: `${visitedPct}%` }} />
              <div className="absolute inset-y-0 left-0 bg-primary transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </>
      )}

      {/* Compact progress bar — shown when grid is hidden */}
      {!showGrid && (
        <div className="flex items-center gap-3 py-1">
          <span className="text-sm font-medium tabular-nums text-foreground whitespace-nowrap">
            {answeredCount}<span className="text-muted-foreground">/{displayQuestions.length}</span>
          </span>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden relative">
            <div className="absolute inset-y-0 left-0 bg-primary/20 rounded-full transition-all duration-300" style={{ width: `${visitedPct}%` }} />
            <div className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
          {flaggedCount > 0 && (
            <span className="text-xs text-primary flex items-center gap-1 whitespace-nowrap">
              <Flag className="w-3 h-3" />{flaggedCount}
            </span>
          )}
          <button
            onClick={() => allAnswered ? setShowSubmitConfirm(true) : setShowCompleteEarlyConfirm(true)}
            title="Finish Exam"
            className={`shrink-0 rounded-lg border border-primary text-primary font-semibold hover:bg-primary hover:text-white transition-colors ${focusMode ? 'p-1.5' : 'px-3 py-1.5 text-xs whitespace-nowrap'}`}
          >
            {focusMode ? <CircleCheck className="w-4 h-4" /> : 'Finish Exam'}
          </button>
        </div>
      )}

      {/* Prev / Next navigation */}
      <div className="flex flex-wrap items-center gap-2 justify-end w-full">
          {canReport && curQ && !isFinished && !focusMode && (
            <>
              <button
                onClick={() => { setReporting(true); setPaused(true) }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground border border-border hover:border-primary/50 transition-colors whitespace-nowrap"
              >
                <Flag className="w-3 h-3" /><span className="hidden sm:inline">Report Issue</span>
              </button>
              <button
                onClick={() => { setRatingTarget(curQ.id); clarityEvent('question_rated') }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground border border-border hover:border-primary/50 transition-colors whitespace-nowrap"
                aria-label="Rate this question"
              >
                <Star className="w-3 h-3" /><span className="hidden sm:inline">Rate</span>
              </button>
            </>
          )}
          <button
            onClick={() => setCurrentQuestionIndex((i) => getPrevIndex(i))}
            disabled={currentQuestionIndex <= 0}
            title="Previous question"
            className={`rounded-md bg-muted-foreground text-white text-sm disabled:opacity-40 whitespace-nowrap inline-flex items-center justify-center ${focusMode ? 'p-1.5' : 'px-3 py-1'}`}
          >
            {focusMode ? <ChevronLeft className="w-4 h-4" /> : '← Prev'}
          </button>
          {immediateMode && curShowFeedback && curAnswered ? (
            <button
              onClick={() => setCurrentQuestionIndex((i) => getNextIndex(i))}
              disabled={currentQuestionIndex >= displayQuestions.length - 1}
              title="Next question"
              className={`rounded-md bg-primary text-white text-sm font-semibold disabled:opacity-40 hover:bg-primary/80 transition-colors whitespace-nowrap inline-flex items-center justify-center ${focusMode ? 'p-1.5' : 'px-3 py-1'}`}
            >
              {focusMode ? <ChevronRight className="w-4 h-4" /> : 'Next →'}
            </button>
          ) : (
            <button
              onClick={() => setCurrentQuestionIndex((i) => getNextIndex(i))}
              disabled={currentQuestionIndex >= displayQuestions.length - 1}
              title="Next question"
              className={`rounded-md bg-muted-foreground text-white text-sm disabled:opacity-40 whitespace-nowrap inline-flex items-center justify-center ${focusMode ? 'p-1.5' : 'px-3 py-1'}`}
            >
              {focusMode ? <ChevronRight className="w-4 h-4" /> : 'Next →'}
            </button>
          )}
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

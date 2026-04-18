import { useState, useEffect, useRef } from 'react'
import { Flag, Star, ChevronLeft, ChevronRight, CircleCheck, Pause, Play } from 'lucide-react'
import { useExam } from './ExamContext'
import { ReportIssueModal } from '../components/ReportIssueModal'
import { RatingModal } from '@/feedback/RatingModal'
import { clarityEvent } from '@/clarity'

function ProgressTrack({
  displayQuestions, selectedAnswers, flaggedQuestions, currentQuestionIndex, onSelectQuestion,
}: {
  displayQuestions: any[]
  selectedAnswers: Record<string, any>
  flaggedQuestions: Set<string>
  currentQuestionIndex: number
  onSelectQuestion: (idx: number) => void
}) {
  const total = displayQuestions.length
  const scrollRef = useRef<HTMLDivElement>(null)
  const cellRef = useRef<HTMLButtonElement>(null)
  const dragged = useRef(false)

  useEffect(() => {
    if (scrollRef.current && cellRef.current) {
      const c = scrollRef.current
      const cell = cellRef.current
      const target = cell.offsetLeft + cell.offsetWidth / 2 - c.clientWidth / 2
      c.scrollTo({ left: target, behavior: 'smooth' })
    }
  }, [currentQuestionIndex])

  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const el = scrollRef.current
    if (!el || e.button !== 0) return
    const startX = e.clientX
    const startScroll = el.scrollLeft
    dragged.current = false

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX
      if (Math.abs(dx) > 4) {
        dragged.current = true
        el!.scrollLeft = startScroll - dx
        el!.style.cursor = 'grabbing'
      }
    }
    function onUp() {
      el!.style.cursor = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      // reset after click fires
      setTimeout(() => { dragged.current = false }, 0)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const MIN_CELL = 16
  const GAP = 3

  return (
    <div
      ref={scrollRef}
      className="overflow-x-auto -mx-1 px-1 cursor-grab select-none"
      style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      onMouseDown={onMouseDown}
    >
      <div
        className="flex items-stretch py-1.5"
        style={{ gap: `${GAP}px`, minWidth: `${total * (MIN_CELL + GAP)}px` }}
      >
        {displayQuestions.map((qq, idx) => {
          const isAnswered = selectedAnswers[qq.id] !== undefined
          const isFlagged = flaggedQuestions.has(qq.id)
          const isCurrent = idx === currentQuestionIndex

          return (
            <button
              key={qq.id}
              ref={isCurrent ? cellRef : undefined}
              onClick={() => { if (!dragged.current) onSelectQuestion(idx) }}
              title={`Q${idx + 1}${isFlagged ? ' · flagged' : ''}${isAnswered ? ' · answered' : ''}`}
              aria-label={`Question ${idx + 1}${isFlagged ? ', flagged' : ''}${isAnswered ? ', answered' : ''}${isCurrent ? ', current' : ''}`}
              aria-current={isCurrent ? 'step' : undefined}
              className={[
                'relative flex-1 h-5 rounded-sm shrink-0 transition-colors duration-150',
                isCurrent ? 'ring-2 ring-primary ring-offset-1 ring-offset-background z-10' : '',
                isFlagged
                  ? 'bg-amber-400 hover:bg-amber-300'
                  : isAnswered
                    ? 'bg-primary hover:bg-primary/80'
                    : 'bg-muted border border-border hover:bg-muted-foreground/20',
              ].join(' ')}
              style={{ minWidth: `${MIN_CELL}px` }}
            >
              {isFlagged && (
                <Flag className="absolute inset-0 m-auto w-2.5 h-2.5 pointer-events-none text-red-700 fill-red-700" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function QuestionNav({ focusMode = false, reviewingFlagged = false }: { focusMode?: boolean; showGrid?: boolean; reviewingFlagged?: boolean }) {
  const {
    displayQuestions, selectedAnswers, flaggedQuestions, currentQuestionIndex,
    setCurrentQuestionIndex, setFlaggedQuestions, isFinished, revealAnswers,
    revealedQuestions, setShowSubmitConfirm, setShowCompleteEarlyConfirm,
    userTier, timed, timeLeft, paused, setPaused, selected, selectedMeta, ratingTarget, setRatingTarget,
  } = useExam()

  const canReport = userTier !== 'visitor'
  const [reporting, setReporting] = useState(false)

  const answeredCount = Object.keys(selectedAnswers).filter(id => displayQuestions.some(q => q.id === id)).length
  const pct = Math.round((answeredCount / Math.max(1, displayQuestions.length)) * 100)
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

      {/* Modern progress bar — position, flags, answered state; no per-cell numbers */}
      {(() => {
        const total = displayQuestions.length
        const curIdx = Math.min(currentQuestionIndex, total - 1)
        return (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-xs min-w-0">
                <span className="font-semibold text-foreground tabular-nums whitespace-nowrap">
                  Q{curIdx + 1}<span className="text-muted-foreground">/{total}</span>
                </span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {answeredCount} answered · {pct}%
                </span>
                {flaggedCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 whitespace-nowrap font-medium">
                    <Flag className="w-3 h-3 fill-current" />{flaggedCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {flaggedCount > 0 && (
                  <button
                    onClick={() => setFlaggedQuestions(new Set())}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-primary/30 bg-primary/5 text-primary text-xs font-medium hover:bg-primary/15 transition-colors whitespace-nowrap"
                  >
                    <Flag className="w-3 h-3" /><span className="hidden sm:inline">Unflag All</span>
                  </button>
                )}
                <button
                  onClick={() => allAnswered ? setShowSubmitConfirm(true) : setShowCompleteEarlyConfirm(true)}
                  title="Finish Exam"
                  className={`rounded-md bg-primary text-white font-semibold hover:bg-primary/90 transition-colors inline-flex items-center justify-center ${focusMode ? 'p-1.5' : 'px-3 py-1 text-xs whitespace-nowrap'}`}
                >
                  {focusMode ? <CircleCheck className="w-4 h-4" /> : 'Finish Exam'}
                </button>
              </div>
            </div>
            <ProgressTrack
              displayQuestions={displayQuestions}
              selectedAnswers={selectedAnswers}
              flaggedQuestions={flaggedQuestions}
              currentQuestionIndex={curIdx}
              onSelectQuestion={setCurrentQuestionIndex}
            />
          </div>
        )
      })()}

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

import { useState } from 'react'
import { Check, Flag } from 'lucide-react'
import { useExam } from './ExamContext'
import { ReportIssueModal } from '../components/ReportIssueModal'

export function QuestionNav() {
  const {
    displayQuestions, selectedAnswers, flaggedQuestions, currentQuestionIndex,
    setCurrentQuestionIndex, setFlaggedQuestions, isFinished, revealAnswers,
    revealedQuestions, setShowSubmitConfirm, setShowCompleteEarlyConfirm,
    userTier, examTier, timed, setPaused, selected, selectedMeta,
  } = useExam()

  const isPaying = userTier === 'paying' || examTier === 'paying'
  const [reporting, setReporting] = useState(false)

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
      {/* Question navigation bar */}
      <div className="flex flex-wrap gap-1">
        {displayQuestions.map((qq, idx) => {
          const isAnswered = selectedAnswers[qq.id] !== undefined
          const isFlagged = flaggedQuestions.has(qq.id)
          const isCurrent = idx === Math.min(currentQuestionIndex, displayQuestions.length - 1)
          return (
            <button
              key={qq.id}
              onClick={() => setCurrentQuestionIndex(idx)}
              title={`Q${idx + 1}${isFlagged ? ' (flagged)' : ''}${isAnswered ? ' (answered)' : ''}`}
              className={`relative w-9 h-9 rounded-md text-sm font-bold flex items-center justify-center transition-all focus:outline-none
                ${isCurrent ? 'ring-2 ring-primary ring-offset-1 ring-offset-transparent bg-primary text-white shadow' : ''}
                ${isAnswered && !isCurrent ? 'bg-primary text-white shadow-sm' : ''}
                ${!isAnswered && !isCurrent ? 'bg-card text-muted-foreground border border-border hover:bg-muted/40' : ''}`}
            >
              <span className="select-none">{idx + 1}</span>
              {isFlagged && <span className="absolute -top-1 -right-1 text-[10px]">🚩</span>}
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
          <div className="h-2 bg-primary bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        {/* Prev / Next navigation */}
        <div className="mt-1.5 flex items-center gap-2 justify-between w-full">
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            {isPaying && curQ && !isFinished && (
              <button
                onClick={() => { setReporting(true); setPaused(true) }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground border border-border hover:border-primary/50 transition-colors whitespace-nowrap"
              >
                <Flag className="w-3 h-3" /> Report Issue
              </button>
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
              <button className="px-3 py-1 rounded-md bg-emerald-600 text-white text-sm font-semibold inline-flex items-center gap-2 shadow-sm hover:bg-emerald-700 transition-colors whitespace-nowrap" onClick={() => setShowCompleteEarlyConfirm(true)}>
                <Check className="w-4 h-4" aria-hidden />
                Complete Early
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
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

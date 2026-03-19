import { X, Check, ExternalLink, Lightbulb, Star } from 'lucide-react'
import { useState } from 'react'
import { RatingModal } from '@/feedback/RatingModal'
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useExam } from './ExamContext'
import { renderChoiceContent, renderWithParagraphs } from './utils'
import { SortableOrderItem } from './SortableOrderItem'
import type { QuestionType } from './types'

export function QuestionCard() {
  const {
    displayQuestions, currentQuestionIndex, selectedAnswers, multiSelectPending, setMultiSelectPending,
    matchingAnswers, setMatchingAnswers, orderingAnswers, setOrderingAnswers,
    flaggedQuestions, setFlaggedQuestions, revealedQuestions, setRevealedQuestions,
    stagedAnswer, setStagedAnswer, showTipMap, setShowTipMap,
    isFinished, revealAnswers, dndSensors,
    submitAnswer, submitMatchingAnswer, submitOrderingAnswer, setCurrentQuestionIndex,
    setSelectedAnswers,
  } = useExam()

  const clampedIdx = Math.min(currentQuestionIndex, displayQuestions.length - 1)
  const visible = displayQuestions.length > 0 ? [displayQuestions[Math.max(0, clampedIdx)]] : []
  const [ratingTarget, setRatingTarget] = useState<string | null>(null)

  return (
    <div className={`${displayQuestions.length > 0 ? '!mt-2' : ''} space-y-4`}>
      {visible.map((q) => {
        const chosen = selectedAnswers[q.id]
        const answered = chosen !== undefined
        const qType: QuestionType = q.type ?? 'single-choice'
        const isMultiSelect = qType === 'multiple-choice' || (typeof q.selectCount === 'number' && q.selectCount > 1)
        const pending = multiSelectPending[q.id] ?? []
        const showFeedback = isFinished || revealedQuestions.has(q.id)
        const staged = stagedAnswer[q.id]
        const hasStaged = staged !== undefined
        const immediateMode = revealAnswers === 'immediately'
        const questionLocked = showFeedback && answered

        return (
          <article key={q.id} className="p-4 rounded-lg border border-border bg-card/60">
            <div className="mb-2">
              <div className="font-semibold text-foreground">
                {renderWithParagraphs(q.question)}
                {qType === 'multiple-choice' && <span className="ml-2 text-xs font-medium text-primary">(Select {q.selectCount})</span>}
                {qType === 'matching' && <span className="ml-2 text-xs font-medium text-primary">(Match each item)</span>}
                {qType === 'ordering' && <span className="ml-2 text-xs font-medium text-primary">(Drag or use arrows to order)</span>}
              </div>
              {!isFinished && (
                <div className="mt-2 flex items-center justify-end gap-2">
                  {q.tip && (
                    <button
                      onClick={() => setShowTipMap((s) => ({ ...s, [q.id]: !s[q.id] }))}
                      className="text-sm px-2 py-1 rounded bg-muted/50 text-muted-foreground border border-border hover:bg-muted transition-colors inline-flex items-center gap-1"
                      aria-label={showTipMap[q.id] ? 'Hide Tip' : 'Show Tip'}
                    >
                      <Lightbulb className="w-3.5 h-3.5" /> {showTipMap[q.id] ? 'Hide Tip' : 'Show Tip'}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setFlaggedQuestions((prev) => {
                        const next = new Set(prev)
                        if (next.has(q.id)) next.delete(q.id)
                        else next.add(q.id)
                        return next
                      })
                      if (!flaggedQuestions.has(q.id)) {
                        setCurrentQuestionIndex((idx) => Math.min(displayQuestions.length - 1, idx + 1))
                      }
                    }}
                    className={`text-sm px-2 py-1 rounded font-medium transition-colors ${flaggedQuestions.has(q.id) ? 'bg-primary text-white' : 'bg-accent text-primary border border-border'}`}
                  >
                    🚩 {flaggedQuestions.has(q.id) ? 'Unflag' : 'Flag for Review'}
                  </button>
                  <button
                    onClick={() => setRatingTarget(q.id)}
                    className="text-sm px-2 py-1 rounded bg-muted/50 text-muted-foreground border border-border hover:bg-muted transition-colors inline-flex items-center gap-1"
                    aria-label="Rate this question"
                  >
                    <Star className="w-3.5 h-3.5" /> Rate
                  </button>
                </div>
              )}
              {q.tip && !isFinished && showTipMap[q.id] && (
                <div className="mt-2 p-2.5 rounded-lg bg-muted/50 border border-border text-sm text-foreground">
                  <strong>💡 Tip:</strong> {q.tip}
                </div>
              )}
            </div>

            {/* Matching question */}
            {qType === 'matching' && (() => {
              const slots = q.slots ?? []
              const curMappings = matchingAnswers[q.id] ?? {}
              const allMapped = slots.length > 0 && slots.every((s) => curMappings[s.id])
              return (
                <div className="space-y-3">
                  {slots.map((slot, si) => {
                    const selectedChoice = curMappings[slot.id]
                    const isCorrectMapping = showFeedback && answered && selectedChoice === slot.correctChoiceId
                    const isIncorrectMapping = showFeedback && answered && selectedChoice && selectedChoice !== slot.correctChoiceId
                    return (
                      <div key={slot.id} className={`p-3 rounded-lg border ${isCorrectMapping ? 'border-green-400/40 bg-green-50 dark:bg-green-900/25' : isIncorrectMapping ? 'border-red-400/40 bg-red-50 dark:bg-red-900/25' : 'border-border'}`}>
                        <div className="font-medium text-sm mb-2">{si + 1}. {slot.label}</div>
                        <select
                          value={selectedChoice ?? ''}
                          disabled={questionLocked}
                          onChange={(e) => {
                            const val = e.target.value
                            setMatchingAnswers((p) => ({
                              ...p,
                              [q.id]: { ...(p[q.id] ?? {}), [slot.id]: val }
                            }))
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                        >
                          <option value="">— Select —</option>
                          {q.choices.map((c) => (
                            <option key={c.id} value={c.id}>{c.text}</option>
                          ))}
                        </select>
                        {showFeedback && answered && isIncorrectMapping && (
                          <div className="mt-1 text-xs text-green-600 dark:text-green-400">
                            Correct: {q.choices.find((c) => c.id === slot.correctChoiceId)?.text}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {!answered && allMapped && (
                    <button
                      className="mt-2 px-4 py-2 rounded-md font-semibold text-sm bg-primary text-white hover:bg-primary/80 transition-colors"
                      onClick={async () => {
                        await submitMatchingAnswer(q, curMappings)
                        if (immediateMode) setRevealedQuestions((prev) => new Set(prev).add(q.id))
                      }}
                    >
                      Confirm Matching
                    </button>
                  )}
                  {showFeedback && answered && q.choices.map((c) => c.explanation && (
                    <div key={c.id} className="text-xs text-muted-foreground p-2 rounded bg-muted/30">
                      <strong>{c.text}:</strong> {c.explanation}
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Ordering question */}
            {qType === 'ordering' && (() => {
              const curOrder = orderingAnswers[q.id] ?? q.choices.map((c) => c.id)
              if (!orderingAnswers[q.id]) {
                setTimeout(() => setOrderingAnswers((p) => p[q.id] ? p : { ...p, [q.id]: q.choices.map((c) => c.id) }), 0)
              }
              const choiceMap = new Map(q.choices.map((c) => [c.id, c]))
              const correctOrder = [...q.choices]
                .filter((c) => typeof c.sequence === 'number')
                .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
                .map((c) => c.id)
              return (
                <div className="space-y-2">
                  <DndContext
                    sensors={dndSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(event: DragEndEvent) => {
                      const { active, over } = event
                      if (!over || active.id === over.id || questionLocked) return
                      setOrderingAnswers((p) => {
                        const arr = [...(p[q.id] ?? curOrder)]
                        const oldIdx = arr.indexOf(String(active.id))
                        const newIdx = arr.indexOf(String(over.id))
                        if (oldIdx < 0 || newIdx < 0) return p
                        return { ...p, [q.id]: arrayMove(arr, oldIdx, newIdx) }
                      })
                    }}
                  >
                    <SortableContext items={curOrder} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {curOrder.map((cid, idx) => {
                          const c = choiceMap.get(cid)
                          if (!c) return null
                          const isCorrectPos = showFeedback && answered && correctOrder[idx] === cid
                          const isIncorrectPos = showFeedback && answered && correctOrder[idx] !== cid
                          const correctIdx = correctOrder.indexOf(cid)
                          return (
                            <SortableOrderItem
                              key={cid}
                              id={cid}
                              disabled={questionLocked}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${isCorrectPos ? 'border-green-400/40 bg-green-50 dark:bg-green-900/25' : isIncorrectPos ? 'border-red-400/40 bg-red-50 dark:bg-red-900/25' : 'border-border'} ${!questionLocked ? 'cursor-grab active:cursor-grabbing select-none' : ''} transition-colors`}
                            >
                              <span className={`inline-flex flex-col items-center justify-center w-10 min-w-[2.5rem] rounded-md text-xs font-bold flex-shrink-0 py-0.5 ${isCorrectPos ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : isIncorrectPos ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' : 'bg-muted text-muted-foreground'}`}>
                                <span className="text-[10px] leading-none opacity-70">Step</span>
                                <span className="text-sm leading-tight">{idx + 1}</span>
                              </span>
                              <span className="flex-1 text-sm">{c.text}</span>
                              {!questionLocked && (
                                <div className="flex flex-col gap-0.5 shrink-0">
                                  <button className="text-xs px-1 rounded hover:bg-muted disabled:opacity-30" disabled={idx === 0} onClick={(e) => { e.stopPropagation(); setOrderingAnswers((p) => { const arr = [...(p[q.id] ?? curOrder)]; [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]]; return { ...p, [q.id]: arr } }) }}>▲</button>
                                  <button className="text-xs px-1 rounded hover:bg-muted disabled:opacity-30" disabled={idx === curOrder.length - 1} onClick={(e) => { e.stopPropagation(); setOrderingAnswers((p) => { const arr = [...(p[q.id] ?? curOrder)]; [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]]; return { ...p, [q.id]: arr } }) }}>▼</button>
                                </div>
                              )}
                              {showFeedback && answered && isCorrectPos && <span className="text-xs text-green-600 dark:text-green-400 font-medium shrink-0">✓ Correct</span>}
                              {showFeedback && answered && isIncorrectPos && <span className="text-xs text-red-600 dark:text-red-400 font-medium shrink-0">→ #{correctIdx + 1}</span>}
                            </SortableOrderItem>
                          )
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                  {showFeedback && answered && (
                    <div className="mt-3 p-3 rounded-lg border border-green-400/40 bg-green-50 dark:bg-green-900/20">
                      <div className="text-xs font-semibold text-green-700 dark:text-green-400 mb-2 uppercase tracking-wide">✓ Correct order:</div>
                      <div className="space-y-1">
                        {correctOrder.map((cid, idx) => {
                          const c = choiceMap.get(cid)
                          return (
                            <div key={cid} className="flex items-center gap-2 text-sm">
                              <span className="inline-flex flex-col items-center justify-center w-10 min-w-[2.5rem] rounded-md bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 py-0.5 flex-shrink-0">
                                <span className="text-[10px] leading-none opacity-70">Step</span>
                                <span className="text-xs font-bold leading-tight">{idx + 1}</span>
                              </span>
                              <span>{c?.text ?? cid}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {!answered && (
                    <button
                      className="mt-2 px-4 py-2 rounded-md font-semibold text-sm bg-primary text-white hover:bg-primary/80 transition-colors"
                      onClick={async () => {
                        await submitOrderingAnswer(q, curOrder)
                        if (immediateMode) setRevealedQuestions((prev) => new Set(prev).add(q.id))
                      }}
                    >
                      Confirm Order
                    </button>
                  )}
                  {showFeedback && answered && q.choices.map((c) => c.explanation && (
                    <div key={c.id} className="text-xs text-muted-foreground p-2 rounded bg-muted/30">
                      <strong>Step {c.sequence}:</strong> {c.explanation}
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Single/Multiple-choice */}
            {(qType === 'single-choice' || qType === 'multiple-choice') && (
              <ol className="list-none pl-0 space-y-2">
                {q.choices.map((c, i) => {
                  const isSelectedSingle = !isMultiSelect && chosen === c.id
                  const isSelectedMulti = isMultiSelect && (answered ? (Array.isArray(chosen) && (chosen as string[]).includes(c.id)) : pending.includes(c.id))
                  const isSelected = isSelectedSingle || isSelectedMulti
                  const isStagedChoice = !isMultiSelect && staged === c.id
                  const isCorrectChoice = !!c.isCorrect
                  let bg = 'bg-transparent'
                  if (showFeedback && answered) {
                    if (isCorrectChoice) bg = 'bg-green-50 dark:bg-green-900/25'
                    else if (isSelected && !isCorrectChoice) bg = 'bg-red-50 dark:bg-red-900/25'
                  } else if (isStagedChoice) {
                    bg = 'bg-primary text-primary-foreground'
                  } else if (answered && isSelected) {
                    bg = 'bg-primary text-primary-foreground'
                  } else if (isMultiSelect && isSelected) {
                    bg = 'bg-primary text-primary-foreground'
                  }
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => {
                          if (isFinished || questionLocked) return
                          if (isMultiSelect) {
                            if (answered && !multiSelectPending[q.id]) {
                              const prev = Array.isArray(chosen) ? (chosen as string[]) : []
                              setMultiSelectPending((p) => ({ ...p, [q.id]: prev }))
                              setSelectedAnswers((sa: any) => { const next = { ...sa }; delete next[q.id]; return next })
                              return
                            }
                            setMultiSelectPending((prev) => {
                              const cur = prev[q.id] ?? []
                              const next = cur.includes(c.id) ? cur.filter((x) => x !== c.id) : [...cur, c.id]
                              return { ...prev, [q.id]: next }
                            })
                            return
                          }
                          if (immediateMode && !answered) {
                            setStagedAnswer((prev) => ({ ...prev, [q.id]: c.id }))
                            return
                          }
                          submitAnswer(q, c.id)
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border ${showFeedback && answered ? (isCorrectChoice ? 'border-green-500/50 dark:border-green-500/30' : isSelected && !isCorrectChoice ? 'border-red-500/50 dark:border-red-500/30' : 'border-border/60 dark:border-border/60') : isStagedChoice ? 'border-primary dark:border-primary' : isSelected ? 'border-primary dark:border-primary' : 'border-border/60 dark:border-border/60'} ${bg} ${(isStagedChoice || isSelected) && !showFeedback ? 'hover:bg-primary/90' : 'hover:bg-muted'} flex items-start gap-2.5 transition-colors`}
                      >
                        {showFeedback && answered ? (
                          <span className="shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center">
                            {isCorrectChoice
                              ? <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                              : (isSelected && !isCorrectChoice)
                                ? <X className="w-4 h-4 text-red-600 dark:text-red-400" />
                                : <span className="text-muted-foreground text-xs font-mono">{String.fromCharCode(65 + i)}</span>
                            }
                          </span>
                        ) : (
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 mt-0.5 ${isStagedChoice ? 'bg-primary text-primary-foreground' : isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                            {String.fromCharCode(65 + i)}
                          </span>
                        )}
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-2 flex-wrap">
                            <span className={`${isSelected ? 'font-semibold' : ''}`}>{renderChoiceContent(c, q, true)}</span>
                            {showFeedback && answered && isSelected && !isCorrectChoice && <span className="ml-1 text-[10px] text-red-600 dark:text-red-400 font-medium">your answer</span>}
                            {showFeedback && answered && !isSelected && isCorrectChoice && <span className="ml-1 text-[10px] text-green-600 dark:text-green-400 font-medium">correct answer</span>}
                          </span>
                        </span>
                      </button>
                      {showFeedback && answered && c.explanation && (
                        <div className="mt-1 text-base text-muted-foreground p-2 rounded">
                          {c.explanation}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}

            {/* Single-select Submit Answer button (immediate reveal mode) */}
            {immediateMode && !isMultiSelect && qType !== 'matching' && qType !== 'ordering' && hasStaged && !answered && !isFinished && (
              <div className="mt-3">
                <button
                  className="px-4 py-2 rounded-md font-semibold text-sm bg-primary text-white hover:bg-primary/80 transition-colors"
                  onClick={async () => {
                    await submitAnswer(q, staged!)
                    setRevealedQuestions((prev) => new Set(prev).add(q.id))
                    setStagedAnswer((prev) => { const next = { ...prev }; delete next[q.id]; return next })
                  }}
                >
                  Submit Answer
                </button>
              </div>
            )}

            {/* Multi-select confirm button */}
            {isMultiSelect && qType !== 'matching' && qType !== 'ordering' && !answered && pending.length > 0 && (
              <div className="mt-3 flex items-center gap-3">
                <button
                  className={`px-4 py-2 rounded-md font-semibold text-sm ${pending.length === (q.selectCount ?? 2) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
                  disabled={pending.length !== (q.selectCount ?? 2)}
                  onClick={async () => {
                    await submitAnswer(q, pending)
                    if (immediateMode) {
                      setRevealedQuestions((prev) => new Set(prev).add(q.id))
                    }
                  }}
                >
                  Confirm ({pending.length}/{q.selectCount ?? 2} selected)
                </button>
                <button
                  className="px-3 py-1 rounded bg-muted text-sm text-muted-foreground"
                  onClick={() => setMultiSelectPending((p) => ({ ...p, [q.id]: [] }))}
                >Clear</button>
              </div>
            )}

            {showFeedback && answered && (
              <div className="mt-3 text-base space-y-2">
                {q.explanation && (
                  <div className="p-2 rounded bg-muted/50 dark:bg-card text-foreground">
                    <div className="flex items-start justify-between gap-4">
                      <div className="pr-2"><strong>Explanation:</strong> {q.explanation}</div>
                      {q.docs && (
                        <div className="flex-shrink-0">
                          <a href={q.docs} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-1 rounded bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors">
                            <ExternalLink className="w-4 h-4" />
                            <span>Docs</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </article>
        )
      })}
      {ratingTarget && (
        <RatingModal
          contentType="question"
          contentId={ratingTarget}
          onClose={() => setRatingTarget(null)}
        />
      )}
    </div>
  )
}

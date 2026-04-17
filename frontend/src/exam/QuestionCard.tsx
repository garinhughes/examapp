import { X, Check, ExternalLink, Lightbulb, Volume2, VolumeX, Flag, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, useRef } from 'react'
import { clarityEvent } from '@/clarity'
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useExam } from './ExamContext'
import { renderChoiceContent, MarkdownText } from './utils'
import { SortableOrderItem } from './SortableOrderItem'
import { QuestionImage } from './QuestionImage'
import type { QuestionType } from './types'

export function QuestionCard({ focusMode = false }: { focusMode?: boolean }) {
  const {
    displayQuestions, currentQuestionIndex, setCurrentQuestionIndex, selectedAnswers, multiSelectPending, setMultiSelectPending,
    matchingAnswers, setMatchingAnswers, orderingAnswers, setOrderingAnswers,
    flaggedQuestions, setFlaggedQuestions, revealedQuestions, setRevealedQuestions,
    stagedAnswer, setStagedAnswer, showTipMap, setShowTipMap,
    isFinished, revealAnswers, dndSensors, ttsEnabled,
    submitAnswer, submitMatchingAnswer, submitOrderingAnswer,
    setSelectedAnswers,
  } = useExam()

  const clampedIdx = Math.min(currentQuestionIndex, displayQuestions.length - 1)
  const visible = displayQuestions.length > 0 ? [displayQuestions[Math.max(0, clampedIdx)]] : []
  const [expandedExplanations, setExpandedExplanations] = useState<Set<string>>(new Set())
  const [speakingId, setSpeakingId] = useState<string | null>(null)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  function stripMarkdown(text: string) {
    return text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, ''))
      .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .trim()
  }

  function isTextChoice(text: string, format?: string) {
    if (format === 'json' || format === 'yaml' || format === 'cli') return false
    const s = text.trim()
    if (s.startsWith('{') || s.startsWith('[')) return false
    if (text.includes('\n') || /^\s*(?:\$|sudo\b)/.test(text) || /^\s*aws\s+[a-z0-9-]/.test(text)) return false
    return true
  }

  function toggleTTS(id: string, text: string) {
    if (speakingId === id) {
      window.speechSynthesis.cancel()
      setSpeakingId(null)
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(stripMarkdown(text))
    utterance.onend = () => setSpeakingId(null)
    utterance.onerror = () => setSpeakingId(null)
    utteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
    setSpeakingId(id)
  }
  const toggleExplanation = (key: string) => setExpandedExplanations(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

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
              <div className="font-medium text-foreground">
                <MarkdownText text={q.question} />
                {qType === 'multiple-choice' && <span className="ml-2 text-xs font-medium text-primary">(Select {q.selectCount})</span>}
                {qType === 'matching' && <span className="ml-2 text-xs font-medium text-primary">(Match each item)</span>}
                {qType === 'ordering' && <span className="ml-2 text-xs font-medium text-primary">(Drag or use arrows to order)</span>}
              </div>
              <div className="mt-2 flex items-center justify-end gap-2 flex-wrap">
                {ttsEnabled && (
                  <button
                    onClick={() => toggleTTS(q.id, q.question)}
                    className="h-8 min-w-[2rem] px-2 rounded bg-muted/50 text-muted-foreground border border-border hover:bg-muted transition-colors inline-flex items-center justify-center"
                    aria-label={speakingId === q.id ? 'Stop reading' : 'Read question aloud'}
                  >
                    {speakingId === q.id ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  </button>
                )}
                {!isFinished && q.tip && (
                  <button
                    onClick={() => { setShowTipMap((s) => ({ ...s, [q.id]: !s[q.id] })); if (!showTipMap[q.id]) clarityEvent('hint_revealed') }}
                    className="h-8 text-sm px-2 rounded bg-muted/50 text-muted-foreground border border-border hover:bg-muted transition-colors inline-flex items-center gap-1"
                    aria-label={showTipMap[q.id] ? 'Hide Tip' : 'Show Tip'}
                    title={showTipMap[q.id] ? 'Hide Tip' : 'Show Tip'}
                  >
                    <Lightbulb className="w-3.5 h-3.5" /> {!focusMode && (showTipMap[q.id] ? 'Hide Tip' : 'Show Tip')}
                  </button>
                )}
                {!isFinished && (
                  <>
                    <button
                      onClick={() => {
                        const wasFlagged = flaggedQuestions.has(q.id)
                        setFlaggedQuestions((prev) => {
                          const next = new Set(prev)
                          if (next.has(q.id)) next.delete(q.id)
                          else next.add(q.id)
                          return next
                        })
                        if (!wasFlagged) {
                          clarityEvent('question_flagged')
                        }
                      }}
                      title={flaggedQuestions.has(q.id) ? 'Unflag' : 'Flag for Review'}
                      className={`h-8 text-sm px-2 rounded font-medium transition-colors inline-flex items-center gap-1.5 ${flaggedQuestions.has(q.id) ? 'bg-primary text-white' : 'bg-accent text-primary border border-border'}`}
                    >
                      <Flag className="w-3.5 h-3.5 shrink-0" />{!focusMode && (flaggedQuestions.has(q.id) ? 'Unflag' : 'Flag for Review')}
                    </button>
                  </>
                )}
              </div>
              {q.tip && !isFinished && showTipMap[q.id] && (
                <div className="mt-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 text-sm">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-foreground"><span className="font-semibold text-amber-700 dark:text-amber-400">Tip:</span> {q.tip}</p>
                  </div>
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
                    const correctChoice = q.choices.find((c) => c.id === slot.correctChoiceId)
                    const explanationKey = `${q.id}:${correctChoice?.id}`
                    return (
                      <div key={slot.id}>
                        <div className={`p-3 rounded-lg border ${isCorrectMapping ? 'border-green-400/40 bg-green-50 dark:bg-green-900/25' : isIncorrectMapping ? 'border-red-400/40 bg-red-50 dark:bg-red-900/25' : 'border-border'}`}>
                          <div className="font-medium text-sm mb-2 flex items-center gap-1.5">
                            {isCorrectMapping && <Check className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />}
                            {isIncorrectMapping && <X className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />}
                            {si + 1}. {slot.label}
                          </div>
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
                            <option value="">- Select -</option>
                            {q.choices.map((c) => (
                              <option key={c.id} value={c.id}>{c.text}</option>
                            ))}
                          </select>
                          {showFeedback && answered && isIncorrectMapping && (
                            <div className="mt-1 text-xs text-green-600 dark:text-green-400">
                              Correct: {correctChoice?.text}
                            </div>
                          )}
                        </div>
                        {showFeedback && answered && correctChoice?.explanation && (
                          <div className="mt-1">
                            <button
                              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 py-0.5"
                              onClick={() => toggleExplanation(explanationKey)}
                            >
                              <span className="text-[10px]">{expandedExplanations.has(explanationKey) ? '▾' : '▸'}</span>
                              <span className="opacity-70">{expandedExplanations.has(explanationKey) ? 'Hide explanation' : 'Show explanation'}</span>
                            </button>
                            {expandedExplanations.has(explanationKey) && (
                              <div className="mt-1 text-base text-muted-foreground p-2 rounded bg-muted/30">
                                <MarkdownText text={correctChoice.explanation} />
                              </div>
                            )}
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
                              <span className="flex-1 min-w-0 text-sm break-words"><MarkdownText text={c.text} /></span>
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
                              <span>{c ? <MarkdownText text={c.text} /> : cid}</span>
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
                    <div key={c.id} className="text-xs mt-1">
                      <button
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 py-0.5"
                        onClick={() => toggleExplanation(`${q.id}:${c.id}`)}
                      >
                        <span className="text-[10px]">{expandedExplanations.has(`${q.id}:${c.id}`) ? '▾' : '▸'}</span>
                        <span className="font-medium">Step {c.sequence}:</span>
                        <span className="opacity-70">{expandedExplanations.has(`${q.id}:${c.id}`) ? 'hide' : 'show explanation'}</span>
                      </button>
                      {expandedExplanations.has(`${q.id}:${c.id}`) && (
                        <div className="mt-1 text-base text-muted-foreground p-2 rounded bg-muted/30">
                          <MarkdownText text={c.explanation} />
                        </div>
                      )}
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
                  } else if (answered && isSelected && !hasStaged) {
                    bg = 'bg-primary text-primary-foreground'
                  } else if (isMultiSelect && isSelected) {
                    bg = 'bg-primary text-primary-foreground'
                  }
                  return (
                    <li key={c.id}>
                      <div className="flex items-stretch gap-1">
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
                          setStagedAnswer((prev) => ({ ...prev, [q.id]: c.id }))
                        }}
                        className={`flex-1 text-left px-3 py-2.5 rounded-lg border ${showFeedback && answered ? (isCorrectChoice ? 'border-green-500/50 dark:border-green-500/30' : isSelected && !isCorrectChoice ? 'border-red-500/50 dark:border-red-500/30' : 'border-border/60 dark:border-border/60') : isStagedChoice ? 'border-primary dark:border-primary' : (isSelected && !hasStaged) ? 'border-primary dark:border-primary' : 'border-border/60 dark:border-border/60'} ${bg} ${(isStagedChoice || (isSelected && !hasStaged)) && !showFeedback ? 'hover:bg-primary/90' : 'hover:bg-muted'} flex items-start gap-2.5 transition-colors`}
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
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 mt-0.5 ${isStagedChoice ? 'bg-primary text-primary-foreground' : (isSelected && !hasStaged) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                            {String.fromCharCode(65 + i)}
                          </span>
                        )}
                        <span className="flex-1 min-w-0 overflow-hidden">
                          <span className={`block min-w-0 break-words ${(isSelected && !hasStaged) || isStagedChoice ? 'font-semibold' : ''}`}>{renderChoiceContent(c, q, true)}</span>
                          {showFeedback && answered && isSelected && !isCorrectChoice && <span className="text-[10px] text-red-600 dark:text-red-400 font-medium">your answer</span>}
                          {showFeedback && answered && !isSelected && isCorrectChoice && <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">correct answer</span>}
                        </span>
                      </button>
                      {ttsEnabled && isTextChoice(c.text, q.format) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleTTS(`${q.id}:choice:${c.id}`, c.text) }}
                          className="shrink-0 p-2 rounded-lg border border-border/60 bg-muted/50 text-muted-foreground hover:bg-muted transition-colors flex items-center justify-center"
                          aria-label={speakingId === `${q.id}:choice:${c.id}` ? 'Stop' : 'Read aloud'}
                        >
                          {speakingId === `${q.id}:choice:${c.id}` ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      </div>
                      {showFeedback && answered && c.explanation && (
                        <div className="mt-1">
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 py-0.5"
                            onClick={(e) => { e.stopPropagation(); toggleExplanation(`${q.id}:${c.id}`) }}
                          >
                            <span className="text-[10px]">{expandedExplanations.has(`${q.id}:${c.id}`) ? '▾' : '▸'}</span>
                            <span className="opacity-70">{expandedExplanations.has(`${q.id}:${c.id}`) ? 'Hide explanation' : 'Show explanation'}</span>
                          </button>
                          {expandedExplanations.has(`${q.id}:${c.id}`) && (
                            <div className="mt-1 text-base text-muted-foreground p-2 rounded">
                              <MarkdownText text={c.explanation} />
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}

            {/* Single-select Submit Answer button */}
            {!isMultiSelect && qType !== 'matching' && qType !== 'ordering' && hasStaged && !isFinished && !questionLocked && (
              <div className="mt-3">
                <button
                  className="px-4 py-2 rounded-md font-semibold text-sm bg-primary text-white hover:bg-primary/80 transition-colors"
                  onClick={async () => {
                    clarityEvent('answer_submitted')
                    await submitAnswer(q, staged!)
                    if (immediateMode) setRevealedQuestions((prev) => new Set(prev).add(q.id))
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
                    {(q.domain || (q.skills && q.skills.length > 0)) && (
                      <div className="mb-2 flex flex-col gap-0.5 text-sm">
                        {q.domain && <span><span className="font-medium text-orange-500">Domain:</span> <span className="text-gray-600 dark:text-gray-400">{q.domain}</span></span>}
                        {q.skills && q.skills.length > 0 && <span><span className="font-medium text-orange-500">Skill:</span> <span className="text-gray-600 dark:text-gray-400">{q.skills.join(', ')}</span></span>}
                      </div>
                    )}
                    {q.docs && (
                      <div className="mb-2">
                        <a href={q.docs} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-1 rounded bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors">
                          <ExternalLink className="w-4 h-4" />
                          <span>Docs</span>
                        </a>
                      </div>
                    )}
                    {(q.domain || (q.skills && q.skills.length > 0) || q.docs) && (
                      <hr className="border-border/50 mb-2" />
                    )}
                    <div className="flex items-start justify-between gap-4">
                      <div className="pr-2"><strong>Explanation:</strong> <MarkdownText text={q.explanation} /></div>
                      {ttsEnabled && (
                        <div className="flex-shrink-0">
                          <button
                            onClick={() => toggleTTS(`${q.id}:explanation`, q.explanation!)}
                            className="h-7 min-w-[1.75rem] px-1.5 rounded bg-muted/50 text-muted-foreground border border-border hover:bg-muted transition-colors inline-flex items-center justify-center"
                            aria-label={speakingId === `${q.id}:explanation` ? 'Stop' : 'Read explanation aloud'}
                          >
                            {speakingId === `${q.id}:explanation` ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )}
                    </div>
                    {q.image && <QuestionImage imageKey={q.image} />}
                  </div>
                )}
              </div>
            )}

            {/* Bottom prev/next — shown after answer revealed in casual mode */}
            {immediateMode && showFeedback && answered && !isFinished && (
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setCurrentQuestionIndex((i) => Math.max(0, i - 1))}
                  disabled={currentQuestionIndex <= 0}
                  className={`rounded-md bg-muted-foreground text-white text-sm disabled:opacity-40 inline-flex items-center gap-1 ${focusMode ? 'p-1.5' : 'px-3 py-1'}`}
                >
                  <ChevronLeft className="w-4 h-4" />{!focusMode && 'Prev'}
                </button>
                <button
                  onClick={() => setCurrentQuestionIndex((i) => Math.min(displayQuestions.length - 1, i + 1))}
                  disabled={currentQuestionIndex >= displayQuestions.length - 1}
                  className={`rounded-md bg-primary text-white text-sm font-semibold disabled:opacity-40 hover:bg-primary/80 transition-colors inline-flex items-center gap-1 ${focusMode ? 'p-1.5' : 'px-3 py-1'}`}
                >
                  {!focusMode && 'Next'}<ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

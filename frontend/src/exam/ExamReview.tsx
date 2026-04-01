import React, { useState } from 'react'
import { Play, X, Check, BarChart3, ExternalLink, ChevronDown } from 'lucide-react'
import { useExam } from './ExamContext'
import { isAnswerCorrect, renderChoiceContent, MarkdownText } from './utils'
import type { Question, QuestionType } from './types'
import { QuestionImage } from './QuestionImage'

export function ExamReview() {
  const {
    attemptData, questions, selectedAnswers, selectedMeta,
    reviewDomains, setReviewDomains, reviewDomainOpen, setReviewDomainOpen,
    reviewIndex, setReviewIndex, reviewDomainRef, reviewDomainToggleRef,
    incorrectOnly, setIncorrectOnly,
    createAttempt, setAttemptData, setAttemptId, setExamStarted, setRoute,
  } = useExam()

  const domains: string[] = attemptData?.perDomain ? Object.keys(attemptData.perDomain) : Array.from(new Set(questions.map((q) => (q as any).domain)))
  const allSelected = reviewDomains.includes('All')

  // Base questions — restrict to answered for early-complete
  const baseQuestions = (attemptData?.earlyComplete && Array.isArray(attemptData?.answers))
    ? questions.filter((q) => attemptData.answers.some((a: any) => String(a.questionId) === String(q.id)))
    : questions

  const domainFiltered = (reviewDomains.includes('All') || reviewDomains.length === 0)
    ? baseQuestions
    : baseQuestions.filter((q) => reviewDomains.includes((q as any).domain))

  const deriveRecord = (q: Question) => {
    let answerRecord: any = undefined
    if (Array.isArray(attemptData?.answers)) {
      const matches = attemptData.answers.filter((a: any) => a.questionId === q.id)
      if (matches.length === 1) answerRecord = matches[0]
      else if (matches.length > 1) {
        matches.sort((a: any, b: any) => {
          const ta = a?.createdAt ? String(a.createdAt) : ''
          const tb = b?.createdAt ? String(b.createdAt) : ''
          return ta.localeCompare(tb)
        })
        answerRecord = matches[matches.length - 1]
      }
    }
    const chosen = answerRecord?.selectedMappings ?? answerRecord?.selectedOrder ?? answerRecord?.selectedChoiceIds ?? answerRecord?.selectedChoiceId ?? selectedAnswers[q.id]
    const isCorrect = typeof answerRecord?.correct === 'boolean' ? answerRecord.correct : isAnswerCorrect(q, typeof chosen === 'object' && chosen !== null ? JSON.stringify(chosen) : chosen)
    return { answerRecord, chosen, isCorrect }
  }

  const visibleAll = domainFiltered.map((q) => ({ q, ...deriveRecord(q) }))
  const visible = incorrectOnly ? visibleAll.filter((v) => !v.isCorrect) : visibleAll

  const [expandedExplanations, setExpandedExplanations] = useState<Set<string>>(new Set())
  const toggleExplanation = (key: string) => setExpandedExplanations(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })

  return (
    <div className="mb-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
        <h3 className="font-semibold">Review</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-sm inline-flex items-center gap-2 shadow-sm hover:bg-primary/90 transition-colors"
            onClick={async () => { try { await createAttempt() } catch {} }}
            title="Start another attempt with the same settings"
          >
            <Play className="w-4 h-4" />
            Repeat Exam
          </button>
          <button
            className="px-3 py-1 rounded-md bg-accent text-foreground text-sm inline-flex items-center gap-2 hover:bg-accent/80 transition-colors"
            onClick={() => { try { setAttemptData(null); setAttemptId(null); setExamStarted(false) } catch {} }}
            title="Return to the exam start form"
          >
            Return to Exam
          </button>
          <button
            className="px-3 py-1 rounded-md bg-accent text-foreground text-sm inline-flex items-center gap-2 hover:bg-accent/80 transition-colors"
            onClick={() => setRoute('analytics')}
            title="View your analytics"
          >
            <BarChart3 className="w-4 h-4" />
            Analytics
          </button>
        </div>
      </div>

      {/* Domain filter dropdown */}
      <div className="mb-3">
        <div className="w-full md:w-96">
          <label className="block text-xs text-muted-foreground mb-1">Domains</label>
          <div className="relative">
            <button
              ref={reviewDomainToggleRef}
              onClick={() => setReviewDomainOpen((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 border border-border/50 text-sm text-left hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring transition"
            >
              <span className={!allSelected && reviewDomains.length > 0 ? 'text-foreground' : 'text-muted-foreground'}>
                {allSelected ? 'All domains' : reviewDomains.length === 0 ? 'Select domains…' : `${reviewDomains.length} domain${reviewDomains.length > 1 ? 's' : ''} selected`}
              </span>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${reviewDomainOpen ? 'rotate-180' : ''}`} />
            </button>

            {reviewDomainOpen && (
              <div ref={reviewDomainRef} className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg bg-card border border-border/60 shadow-xl">
                <div className="flex gap-2 px-2 py-1.5 border-b border-border/40">
                  <button className="text-[10px] text-primary hover:text-primary dark:hover:text-primary transition" onClick={() => { setReviewDomains([...domains]); setReviewDomainOpen(false); setReviewIndex(0) }}>Select all individually</button>
                  <button className="text-[10px] text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground transition" onClick={() => { setReviewDomains(['All']); setReviewDomainOpen(false); setReviewIndex(0) }}>All (default)</button>
                </div>
                <button
                  onClick={() => { setReviewDomains(['All']); setReviewDomainOpen(false); setReviewIndex(0) }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/50 transition ${allSelected ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${allSelected ? 'bg-primary border-primary text-white' : 'border-border'}`}>
                    {allSelected && '✓'}
                  </span>
                  All domains
                </button>
                {domains.map((d) => {
                  const checked = !allSelected && reviewDomains.includes(d)
                  return (
                    <button
                      key={d}
                      onClick={() => {
                        if (allSelected) { setReviewDomains([d]) }
                        else { setReviewDomains((prev) => { const next = prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]; return next.length === 0 ? ['All'] : next }) }
                        setReviewIndex(0)
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/50 transition ${checked ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                      <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${checked ? 'bg-primary border-primary text-white' : 'border-border'}`}>
                        {checked && '✓'}
                      </span>
                      {d}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {!allSelected && reviewDomains.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {reviewDomains.map((d) => (
                <span key={d}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 dark:bg-primary/20 text-primary text-xs font-medium border border-primary/30 dark:border-primary/30 cursor-pointer hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-300 hover:border-red-300 dark:hover:border-red-400/40 transition"
                  onClick={() => { setReviewDomains((prev) => { const next = prev.filter((x) => x !== d); return next.length === 0 ? ['All'] : next }); setReviewIndex(0) }}
                  title={`Remove ${d}`}
                >
                  {d}
                  <X className="w-3 h-3" />
                </span>
              ))}
              <button className="text-[10px] text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground ml-1 transition" onClick={() => { setReviewDomains(['All']); setReviewIndex(0) }}>Clear all</button>
            </div>
          )}
        </div>
      </div>

      {/* Review questions */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 mb-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={incorrectOnly} onChange={(e) => setIncorrectOnly(e.target.checked)} />
            <span className="text-sm text-muted-foreground">Show incorrect only</span>
          </label>
          <div className="ml-auto text-sm text-muted-foreground">{baseQuestions.length} total{attemptData?.earlyComplete ? ` (${questions.length} in bank)` : ''}</div>
        </div>

        {visible.length === 0 ? <div className="text-sm text-muted-foreground p-3">No questions to review.</div> : (() => {
          const idx = Math.max(0, Math.min(reviewIndex, visible.length - 1))
          const item = visible[idx]
          const chosenIds: string[] = Array.isArray(item.chosen) ? item.chosen : (typeof item.chosen === 'string' ? [item.chosen] : [])

          return (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm text-muted-foreground">Question {idx + 1} / {visible.length}</div>
                <div className="flex items-center gap-2">
                  <button className="px-2 py-1 rounded bg-accent text-sm" onClick={() => setReviewIndex((i) => Math.max(0, i - 1))} disabled={idx === 0}>Prev</button>
                  <button className="px-2 py-1 rounded bg-accent text-sm" onClick={() => setReviewIndex((i) => Math.min(visible.length - 1, i + 1))} disabled={idx >= visible.length - 1}>Next</button>
                </div>
              </div>

              <div className={`p-4 rounded-lg border-l-4 ${item.isCorrect ? 'border-l-green-500' : 'border-l-red-500'} border border-border bg-card`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="font-medium text-base flex-1"><MarkdownText text={item.q.question} /></div>
                  <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${item.isCorrect ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
                    {item.isCorrect ? '✓ Correct' : '✗ Incorrect'}
                  </span>
                </div>


                {/* Type-specific rendering */}
                {(() => {
                  const reviewType: QuestionType = item.q.type ?? 'single-choice'

                  if (reviewType === 'matching') {
                    const slots = item.q.slots ?? []
                    const userMappings: Record<string, string> = item.answerRecord?.selectedMappings ?? (typeof item.chosen === 'string' ? (() => { try { return JSON.parse(item.chosen) } catch { return {} } })() : (typeof item.chosen === 'object' && item.chosen !== null ? item.chosen : {}))
                    const choiceMap = new Map((item.q.choices ?? []).map((c: any) => [c.id, c]))
                    return (
                      <div className="mt-3 space-y-2">
                        {slots.map((slot: any, si: number) => {
                          const userChoice = userMappings[slot.id]
                          const isCorrectSlot = userChoice === slot.correctChoiceId
                          const bg = isCorrectSlot ? 'bg-green-50 dark:bg-green-900/25 border-green-400/50' : 'bg-red-50 dark:bg-red-900/25 border-red-400/50'
                          return (
                            <div key={slot.id} className={`px-3 py-2 rounded-lg border text-sm ${bg}`}>
                              <div className="font-medium">{si + 1}. {slot.label}</div>
                              <div className="mt-1">Your answer: <strong>{choiceMap.get(userChoice)?.text ?? '—'}</strong></div>
                              {!isCorrectSlot && <div className="mt-0.5 text-green-600 dark:text-green-400 text-xs">Correct: {choiceMap.get(slot.correctChoiceId)?.text}</div>}
                            </div>
                          )
                        })}
                        {(item.q.choices ?? []).map((c: any) => c.explanation && (
                          <div key={c.id} className="mt-1">
                            <button
                              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 py-0.5"
                              onClick={() => toggleExplanation(`${item.q.id}:${c.id}`)}
                            >
                              <span className="text-[10px]">{expandedExplanations.has(`${item.q.id}:${c.id}`) ? '▾' : '▸'}</span>
                              <span className="opacity-70">{expandedExplanations.has(`${item.q.id}:${c.id}`) ? 'Hide explanation' : 'Show explanation'} ({c.text})</span>
                            </button>
                            {expandedExplanations.has(`${item.q.id}:${c.id}`) && (
                              <div className="mt-1 text-base text-muted-foreground p-2 rounded bg-muted/30">
                                <MarkdownText text={c.explanation} />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  }

                  if (reviewType === 'ordering') {
                    const userOrder: string[] = item.answerRecord?.selectedOrder ?? (typeof item.chosen === 'string' ? (() => { try { return JSON.parse(item.chosen) } catch { return [] } })() : [])
                    const correctOrder = [...(item.q.choices ?? [])]
                      .filter((c: any) => typeof c.sequence === 'number')
                      .sort((a: any, b: any) => (a.sequence ?? 0) - (b.sequence ?? 0))
                      .map((c: any) => c.id)
                    const choiceMap = new Map((item.q.choices ?? []).map((c: any) => [c.id, c]))
                    return (
                      <div className="mt-3 space-y-1.5">
                        {userOrder.map((cid: string, idx: number) => {
                          const c = choiceMap.get(cid)
                          const isCorrectPos = correctOrder[idx] === cid
                          const bg = isCorrectPos ? 'bg-green-50 dark:bg-green-900/25 border-green-400/50' : 'bg-red-50 dark:bg-red-900/25 border-red-400/50'
                          return (
                            <div key={cid} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border text-sm ${bg}`}>
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${isCorrectPos ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{idx + 1}</span>
                              <span className="flex-1 min-w-0 break-words">{c ? <MarkdownText text={c.text} /> : cid}</span>
                              {!isCorrectPos && <span className="text-xs text-green-600 dark:text-green-400 shrink-0">Should be #{correctOrder.indexOf(cid) + 1}</span>}
                            </div>
                          )
                        })}
                        {(item.q.choices ?? []).map((c: any) => c.explanation && (
                          <div key={c.id} className="text-xs mt-1">
                            <button
                              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 py-0.5"
                              onClick={() => toggleExplanation(`${item.q.id}:${c.id}`)}
                            >
                              <span className="text-[10px]">{expandedExplanations.has(`${item.q.id}:${c.id}`) ? '▾' : '▸'}</span>
                              <span className="font-medium">Step {c.sequence}:</span>
                              <span className="opacity-70">{expandedExplanations.has(`${item.q.id}:${c.id}`) ? 'hide' : 'show explanation'}</span>
                            </button>
                            {expandedExplanations.has(`${item.q.id}:${c.id}`) && (
                              <div className="mt-1 text-base text-muted-foreground p-2 rounded bg-muted/30">
                                <MarkdownText text={c.explanation} />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  }

                  // single-choice / multiple-choice
                  return (
                    <div className="mt-3 space-y-1.5">
                      {(item.q.choices ?? []).map((c: any, ci: number) => {
                        const cid = typeof c === 'string' ? String(ci) : (c?.id ?? String(ci))
                        const isChosen = chosenIds.includes(cid)
                        const isCorrectChoice = typeof c === 'object' && !!c?.isCorrect
                        const letter = String.fromCharCode(65 + ci)
                        let bg = 'bg-muted/50 border-border/40'
                        let icon: React.ReactNode = <span className="text-muted-foreground text-xs font-mono">{letter}</span>
                        if (isChosen && isCorrectChoice) {
                          bg = 'bg-green-50 dark:bg-green-900/25 border-green-400/50 dark:border-green-600/40'
                          icon = <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                        } else if (isChosen && !isCorrectChoice) {
                          bg = 'bg-red-50 dark:bg-red-900/25 border-red-400/50 dark:border-red-600/40'
                          icon = <X className="w-4 h-4 text-red-500" />
                        } else if (isCorrectChoice) {
                          bg = 'bg-green-50 dark:bg-green-900/25 border-green-400/50 dark:border-green-600/40'
                          icon = <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                        }
                        return (
                          <div key={cid} className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border text-sm ${bg}`}>
                            <span className="shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center">{icon}</span>
                            <div className="flex-1 min-w-0 overflow-hidden">
                              <span className={`block min-w-0 ${isChosen ? 'font-semibold' : ''}`}>{renderChoiceContent(c, item.q, true)}</span>
                              {isChosen && !isCorrectChoice && <span className="text-[10px] text-red-500 font-medium">your answer</span>}
                              {!isChosen && isCorrectChoice && <span className="text-[10px] text-green-600 dark:text-green-400 font-medium">correct answer</span>}
                              {typeof c === 'object' && c?.explanation && (
                                <div className="mt-1">
                                  <button
                                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 py-0.5"
                                    onClick={(e) => { e.stopPropagation(); toggleExplanation(`${item.q.id}:${cid}`) }}
                                  >
                                    <span className="text-[10px]">{expandedExplanations.has(`${item.q.id}:${cid}`) ? '▾' : '▸'}</span>
                                    <span className="opacity-70">{expandedExplanations.has(`${item.q.id}:${cid}`) ? 'Hide explanation' : 'Show explanation'}</span>
                                  </button>
                                  {expandedExplanations.has(`${item.q.id}:${cid}`) && (
                                    <div className="mt-1 text-base text-muted-foreground p-2 rounded bg-muted/30">
                                      <MarkdownText text={c.explanation} />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}

                {/* Explanation */}
                {item.q.explanation && (
                  <div className="mt-3 text-base">
                    <div className="p-2 rounded bg-muted/50 dark:bg-card text-foreground">
                      <div className="flex items-start justify-between gap-2 sm:gap-4 flex-wrap">
                        <div className="flex-1 min-w-0 pr-0 sm:pr-2"><strong>Explanation:</strong> <MarkdownText text={item.q.explanation} /></div>
                        {item.q.docs && (
                          <a href={item.q.docs} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 inline-flex items-center gap-2 px-3 py-1 rounded bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors">
                            <ExternalLink className="w-4 h-4" />
                            <span>Docs</span>
                          </a>
                        )}
                      </div>
                      {(item.q.domain || (Array.isArray(item.q.skills) && item.q.skills.length > 0)) && (
                        <div className="mt-3 pt-2 border-t border-border/50 flex flex-col gap-0.5 text-xs">
                          {item.q.domain && <span><span className="font-medium text-orange-500">Domain:</span> <span className="text-gray-600 dark:text-gray-400">{item.q.domain}</span></span>}
                          {Array.isArray(item.q.skills) && item.q.skills.length > 0 && <span><span className="font-medium text-orange-500">Skill:</span> <span className="text-gray-600 dark:text-gray-400">{item.q.skills.join(', ')}</span></span>}
                        </div>
                      )}
                      {(item.q as any).image && <QuestionImage imageKey={(item.q as any).image} />}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { X, Brain, Eye, Lock, ChevronDown, ChevronLeft, Volume2, Settings2, Coffee, Hourglass } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useExam } from './ExamContext'
import { useTourContext } from '@/components/TourProvider'
import { clarityEvent, clarityTag } from '@/clarity'

export function ExamSetup() {
  const {
    selected, selectedMeta, exams, questions, examTier, examTotalAvailable, examLimited, examShowcase,
    examMode, setExamMode, revealAnswers, setRevealAnswers, ttsEnabled, setTtsEnabled, timed, setTimed,
    durationMinutes, setDurationMinutes, numQuestions, setNumQuestions,
    availableFilteredCount, attemptId, isFinished, user,
    takeDomains, setTakeDomains, domainOpen, setDomainOpen, domainRef, domainToggleRef,
    selectedServices, setSelectedServices, availableServices,
    serviceDropOpen, setServiceDropOpen, serviceSearchText, setServiceSearchText,
    serviceDropRef, serviceDropToggleRef,
    serviceFilterText, setServiceFilterText,
    lastError, savedProgress, loadingWeakestLink,
    analyticsDomains, attemptData,
    createAttempt, resumeExam, setRoute, setSelected,
    setAttemptId, setAttemptData, setSelectedAnswers, setMultiSelectPending,
    setFlaggedQuestions, setCurrentQuestionIndex, setTimeLeft, setPaused,
    setExamStarted, setShowSubmitConfirm, setShowCompleteEarlyConfirm, setShowCancelConfirm,
    setWeakestLinkInfo, setRevealedQuestions, setStagedAnswer, setLastError,
    setShowAttempts, setAttemptsList,
  } = useExam()

  const navigate = useNavigate()
  const tour = useTourContext()
  const locked = !!attemptId && !isFinished
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [qInputVal, setQInputVal] = useState(String(numQuestions))
  const [durInputVal, setDurInputVal] = useState(String(durationMinutes))

  // Keep local string inputs in sync when slider or external state changes
  useEffect(() => { setQInputVal(String(numQuestions)) }, [numQuestions])
  useEffect(() => { setDurInputVal(String(durationMinutes)) }, [durationMinutes])

  const domainsList: string[] = attemptData?.perDomain
    ? Object.keys(attemptData.perDomain)
    : Array.from(new Set(questions.map((q) => (q as any).domain)))
  const allDomainsSelected = takeDomains.includes('All')

  const PRACTICE_DEFAULT_QUESTIONS = 40
  const defaultQuestions = selectedMeta?.defaultQuestions ?? selectedMeta?.defaultQuestionCount ?? questions.length

  const passMark: number | null = typeof selectedMeta?.passMark === 'number' ? selectedMeta.passMark : null

  // Card stat counts: show user's custom numQuestions if set, otherwise show mode defaults
  const accessibleCount = questions.length
  const practiceCardQuestions = numQuestions > 0 ? numQuestions : Math.min(PRACTICE_DEFAULT_QUESTIONS, accessibleCount || PRACTICE_DEFAULT_QUESTIONS)
  const examCardQuestions = numQuestions > 0 ? numQuestions : Math.min(defaultQuestions || accessibleCount, accessibleCount || defaultQuestions)

  const formatDuration = (mins: number | null) => {
    if (!mins) return 'None'
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ''}` : `${m}min`
  }

  const isExamMode = examMode === 'timed' || examMode === 'weakest-link-timed'
  const isWeakestLink = examMode === 'weakest-link' || examMode === 'weakest-link-timed'

  const selectCasualMode = () => {
    if (locked) return
    setExamMode(isWeakestLink ? 'weakest-link' : 'casual')
    setTimed(false)
    setRevealAnswers('immediately')
    setNumQuestions(Math.min(PRACTICE_DEFAULT_QUESTIONS, availableFilteredCount || PRACTICE_DEFAULT_QUESTIONS))
    clarityTag('exam_mode_selected', isWeakestLink ? 'weakest-link' : 'casual')
  }

  const selectTimedMode = () => {
    if (locked) return
    setExamMode(isWeakestLink ? 'weakest-link-timed' : 'timed')
    setTimed(true)
    setRevealAnswers('on-completion')
    if (selected) {
      try {
        const meta = exams.find((e: any) => e.code === selected)
        if (typeof meta?.defaultDuration === 'number') setDurationMinutes(meta.defaultDuration)
        const defQ = meta?.defaultQuestions ?? meta?.defaultQuestionCount ?? availableFilteredCount
        if (defQ) setNumQuestions(availableFilteredCount > 0 ? Math.min(defQ, availableFilteredCount) : defQ)
      } catch {}
    }
    clarityTag('exam_mode_selected', isWeakestLink ? 'weakest-link-timed' : 'timed')
  }

  const handleReset = () => {
    try { if (selected) localStorage.removeItem(`attempt:${selected}`) } catch {}
    try { if (selected) localStorage.removeItem(`examProgress:${selected}`) } catch {}
    setAttemptId(null); setAttemptData(null); setSelectedAnswers({}); setMultiSelectPending({})
    setFlaggedQuestions(new Set()); setCurrentQuestionIndex(0); setTimeLeft(null); setPaused(false)
    setExamStarted(false); setShowSubmitConfirm(false); setShowCompleteEarlyConfirm(false); setShowCancelConfirm(false)
    setTakeDomains(['All']); setTimed(false); setExamMode('casual')
    setWeakestLinkInfo(null); setRevealAnswers('immediately'); setRevealedQuestions(new Set<string>()); setStagedAnswer({})
    setServiceFilterText(''); setSelectedServices([]); setLastError(null)
    try {
      const meta = exams.find((e: any) => e.code === selected)
      const def = meta?.defaultQuestions ?? meta?.defaultQuestionCount ?? (meta?.provider === 'AWS' ? 65 : (questions.length || 10))
      setNumQuestions(def)
      const defDur = typeof meta?.defaultDuration === 'number' ? meta.defaultDuration : 15
      setDurationMinutes(defDur)
    } catch { setNumQuestions(10) }
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => { setRoute('practice'); setSelected(null); setShowAttempts(false); setAttemptsList(null) }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ChevronLeft className="w-4 h-4" />
          Practice Exams
        </button>
      </div>

      <div className="mb-6 p-4 rounded-lg border border-border bg-card shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Choose an exam mode</h3>

        {/* Tier-limit banner */}
        {examLimited && (
          <div className="mb-4 p-3 rounded-lg border border-primary/30 dark:border-primary/30 bg-primary/10 text-sm">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-primary">
                {examTier === 'visitor' && (
                  <>
                    You're seeing <strong>{questions.length}</strong> of <strong>{examTotalAvailable}</strong> questions as a guest.
                    {' '}Create a <strong>free account</strong> to unlock {PRACTICE_DEFAULT_QUESTIONS} questions and track your progress.
                  </>
                )}
                {examTier === 'registered' && (
                  <>
                    Your free account includes <strong>{questions.length}</strong> of <strong>{examTotalAvailable}</strong> questions.
                    {' '}Upgrade to unlock the full question bank.
                  </>
                )}
              </span>
              <button
                onClick={() => examTier === 'visitor' ? navigate('/login') : setRoute('pricing')}
                className="shrink-0 px-3 py-1 rounded text-xs font-semibold bg-primary text-white hover:bg-primary/80"
              >
                {examTier === 'visitor' ? 'Sign up free' : 'View plans'}
              </button>
            </div>
          </div>
        )}

        {/* Mode cards */}
        <div ref={(el) => tour.registerTarget('mode-buttons', el)} className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-5">
          {/* Practice mode */}
          <button
            type="button"
            onClick={selectCasualMode}
            disabled={locked}
            className={`text-left p-4 rounded-xl border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              !isExamMode
                ? 'border-primary bg-primary/5 dark:bg-primary/10'
                : 'border-border hover:border-primary/40'
            } ${locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className="flex items-start gap-3 mb-3">
              <div className={`p-2 rounded-lg shrink-0 ${!isExamMode ? 'bg-primary/10' : 'bg-muted/50'}`}>
                <Coffee className={`w-5 h-5 ${!isExamMode ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">Casual exam</span>
                  {isWeakestLink && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">Weakest Link</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Work through questions at your own pace with instant feedback and detailed explanations after every answer.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/40">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Questions</div>
                <div className="text-sm font-semibold">{practiceCardQuestions}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Duration</div>
                <div className="text-sm font-semibold">None</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Passing score</div>
                <div className="text-sm font-semibold">{passMark != null ? `${passMark}% correct` : '—'}</div>
              </div>
            </div>
          </button>

          {/* Exam mode */}
          <button
            type="button"
            onClick={selectTimedMode}
            disabled={locked}
            className={`text-left p-4 rounded-xl border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isExamMode
                ? 'border-primary bg-primary/5 dark:bg-primary/10'
                : 'border-border hover:border-primary/40'
            } ${locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <div className="flex items-start gap-3 mb-3">
              <div className={`p-2 rounded-lg shrink-0 ${isExamMode ? 'bg-primary/10' : 'bg-muted/50'}`}>
                <Hourglass className={`w-5 h-5 ${isExamMode ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm">Timed exam</span>
                  {examMode === 'weakest-link-timed' && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">Weakest Link</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Sit a full timed run under real exam conditions. Answers stay hidden until you submit and get your score.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/40">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Questions</div>
                <div className="text-sm font-semibold">{examCardQuestions || '—'}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Duration</div>
                <div className="text-sm font-semibold">{formatDuration(durationMinutes)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Passing score</div>
                <div className="text-sm font-semibold">{passMark != null ? `${passMark}% correct` : '—'}</div>
              </div>
            </div>
          </button>
        </div>

        {/* Advanced options toggle */}
        <div>
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <Settings2 className="w-4 h-4" />
            Advanced options
            <ChevronDown className={`w-4 h-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
          </button>
          {!advancedOpen && (
            <p className="mt-1 text-[11px] text-orange-500">
              Change question limit, target specific domains &amp; more.
            </p>
          )}
        </div>

        {advancedOpen && (
          <div className="mt-4 space-y-4 pt-4 border-t border-border/40">

            {/* Number of questions */}
            <div>
              <label className="block text-sm font-medium mb-1">
                Questions <span className="text-xs text-muted-foreground font-normal">({availableFilteredCount} available)</span>
              </label>
              <div className="flex items-center gap-3">
                {(() => {
                  const examMax = selectedMeta?.defaultQuestions ?? availableFilteredCount
                  const maxQ = Math.max(Math.min(availableFilteredCount, examMax), 1)
                  const clampedVal = Math.min(numQuestions, maxQ)
                  return <>
                    <input type="range" min={1} max={maxQ} step={1} value={clampedVal} onChange={(e) => setNumQuestions(Math.min(Number(e.target.value) || 1, maxQ))} className="flex-1" disabled={locked} />
                    <input type="number" min={1} max={maxQ} step={1} value={qInputVal} onChange={(e) => { setQInputVal(e.target.value); const n = parseInt(e.target.value); if (!isNaN(n) && n >= 1) setNumQuestions(Math.min(n, maxQ)) }} onBlur={(e) => { const n = parseInt(e.target.value); const v = isNaN(n) ? 1 : Math.min(Math.max(1, n), maxQ); setNumQuestions(v); setQInputVal(String(v)) }} className="w-28 px-2 py-1 rounded bg-muted/40 text-foreground border border-border dark:border-transparent" disabled={locked} />
                    {clampedVal >= maxQ && <span className="text-xs font-semibold text-orange-500">max</span>}
                  </>
                })()}
              </div>
            </div>

            {/* Duration (exam mode only) */}
            {isExamMode && (
              <div>
                <label className="block text-sm font-medium mb-1">Duration (mins)</label>
                <div className="flex items-center gap-3">
                  <input type="range" min={1} max={300} step={5} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value) || 1)} className="flex-1" disabled={locked} />
                  <input type="number" min={1} step={5} value={durInputVal} onChange={(e) => { setDurInputVal(e.target.value); const n = parseInt(e.target.value); if (!isNaN(n) && n >= 1) setDurationMinutes(n) }} onBlur={(e) => { const n = parseInt(e.target.value); const v = isNaN(n) ? 1 : Math.max(1, n); setDurationMinutes(v); setDurInputVal(String(v)) }} className="w-28 px-2 py-1 rounded bg-muted/40 text-foreground border border-border dark:border-transparent" disabled={locked} />
                </div>
              </div>
            )}

            {/* Show answers */}
            <div ref={(el) => tour.registerTarget('answer-reveal', el)}>
              <label className="block text-xs text-muted-foreground mb-1.5">Show answers</label>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setRevealAnswers('immediately')}
                  disabled={locked}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition ${
                    revealAnswers === 'immediately'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-transparent bg-transparent hover:bg-muted/20 text-muted-foreground dark:text-muted-foreground'
                  }`}
                >
                  <Eye className="w-4 h-4" />
                  <span>Immediately</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRevealAnswers('on-completion')}
                  disabled={locked}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition ${
                    revealAnswers === 'on-completion'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-transparent bg-transparent hover:bg-muted/20 text-muted-foreground dark:text-muted-foreground'
                  }`}
                >
                  <Lock className="w-4 h-4" />
                  <span>On completion</span>
                </button>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {revealAnswers === 'immediately'
                  ? 'You\'ll see the correct answer and explanation after submitting each question.'
                  : 'Answers and explanations are only revealed after you finish the exam.'}
              </p>
            </div>

            {/* Domains & Services side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Domain filter */}
              <div ref={(el) => tour.registerTarget('domain-dropdown', el)}>
                <label className="block text-xs text-muted-foreground mb-1">Domains</label>
                <div className="relative">
                  <button
                    ref={domainToggleRef}
                    onClick={() => setDomainOpen((v) => !v)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 border border-border/50 text-sm text-left hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring transition ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={locked}
                  >
                    <span className={!allDomainsSelected && takeDomains.length > 0 ? 'text-foreground' : 'text-muted-foreground'}>
                      {allDomainsSelected ? 'All domains' : takeDomains.length === 0 ? 'Select domains…' : `${takeDomains.length} domain${takeDomains.length > 1 ? 's' : ''} selected`}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${domainOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {domainOpen && !locked && (
                    <div ref={domainRef} className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg bg-white dark:bg-zinc-900 border border-border/60 shadow-xl">
                      <div className="flex gap-2 px-2 py-1.5 border-b border-border/40">
                        <button className="text-[10px] text-primary hover:text-primary transition" onClick={() => { setTakeDomains([...domainsList]); setDomainOpen(false) }}>Select all individually</button>
                        <button className="text-[10px] text-muted-foreground hover:text-foreground transition" onClick={() => { setTakeDomains(['All']); setDomainOpen(false) }}>All (default)</button>
                      </div>
                      <button
                        onClick={() => { setTakeDomains(['All']); setDomainOpen(false) }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/50 transition ${allDomainsSelected ? 'text-primary' : 'text-muted-foreground'}`}
                      >
                        <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${allDomainsSelected ? 'bg-primary border-primary text-white' : 'border-border'}`}>
                          {allDomainsSelected && '✓'}
                        </span>
                        All domains
                      </button>
                      {domainsList.map((d) => {
                        const checked = !allDomainsSelected && takeDomains.includes(d)
                        return (
                          <button
                            key={d}
                            onClick={() => {
                              if (allDomainsSelected) { setTakeDomains([d]) }
                              else { setTakeDomains((prev) => { const next = prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]; return next.length === 0 ? ['All'] : next }) }
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
                {!allDomainsSelected && takeDomains.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {takeDomains.map((d) => (
                      <span key={d}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 dark:bg-primary/20 text-primary text-xs font-medium border border-primary/30 dark:border-primary/30 cursor-pointer hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-300 hover:border-red-300 dark:hover:border-red-400/40 transition"
                        onClick={() => !locked && setTakeDomains((prev) => { const next = prev.filter((x) => x !== d); return next.length === 0 ? ['All'] : next })}
                        title={`Remove ${d}`}
                      >
                        {d}
                        <X className="w-3 h-3" />
                      </span>
                    ))}
                    {!locked && <button className="text-[10px] text-muted-foreground hover:text-foreground ml-1 transition" onClick={() => setTakeDomains(['All'])}>Clear all</button>}
                  </div>
                )}
              </div>

              {/* Service filter */}
              {availableServices.length > 0 && (
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Services</label>
                  <div className="relative">
                    <button
                      ref={serviceDropToggleRef}
                      onClick={() => { setServiceDropOpen((v) => !v); setServiceSearchText('') }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 border border-border/50 text-sm text-left hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring transition"
                    >
                      <span className={selectedServices.length ? 'text-foreground' : 'text-muted-foreground'}>
                        {selectedServices.length ? `${selectedServices.length} service${selectedServices.length > 1 ? 's' : ''} selected` : 'Select services…'}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${serviceDropOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {serviceDropOpen && (
                      <div ref={serviceDropRef} className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg bg-card border border-border/60 shadow-xl">
                        <div className="sticky top-0 bg-card p-2 border-b border-border/60">
                          <input
                            autoFocus
                            value={serviceSearchText}
                            onChange={(e) => setServiceSearchText(e.target.value)}
                            placeholder="Search services…"
                            className="w-full px-2 py-1.5 rounded bg-muted/60 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground"
                          />
                        </div>
                        <div className="flex gap-2 px-2 py-1.5 border-b border-border/40">
                          <button className="text-[10px] text-primary hover:text-primary transition" onClick={() => { setSelectedServices([...availableServices]); setServiceDropOpen(false) }}>Select all</button>
                          <button className="text-[10px] text-muted-foreground hover:text-foreground transition" onClick={() => setSelectedServices([])}>Clear</button>
                        </div>
                        {availableServices
                          .filter((svc) => !serviceSearchText || svc.toLowerCase().includes(serviceSearchText.toLowerCase()))
                          .map((svc) => {
                            const checked = selectedServices.includes(svc)
                            return (
                              <button
                                key={svc}
                                onClick={() => setSelectedServices((prev) => checked ? prev.filter((s) => s !== svc) : [...prev, svc])}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/50 transition ${checked ? 'text-primary' : 'text-muted-foreground'}`}
                              >
                                <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${checked ? 'bg-primary border-primary text-white' : 'border-border'}`}>
                                  {checked && '✓'}
                                </span>
                                {svc}
                              </button>
                            )
                          })
                        }
                        {availableServices.filter((svc) => !serviceSearchText || svc.toLowerCase().includes(serviceSearchText.toLowerCase())).length === 0 && (
                          <div className="px-3 py-2 text-xs text-muted-foreground">No matching services</div>
                        )}
                      </div>
                    )}
                  </div>
                  {selectedServices.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {selectedServices.map((svc) => (
                        <span key={svc}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 dark:bg-primary/20 text-primary text-xs font-medium border border-primary/30 dark:border-primary/30 cursor-pointer hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-300 hover:border-red-300 dark:hover:border-red-400/40 transition"
                          onClick={() => setSelectedServices((prev) => prev.filter((s) => s !== svc))}
                          title={`Remove ${svc}`}
                        >
                          {svc}
                          <X className="w-3 h-3" />
                        </span>
                      ))}
                      <button className="text-[10px] text-muted-foreground hover:text-foreground ml-1 transition" onClick={() => setSelectedServices([])}>Clear all</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Keyword filter */}
            <div className="w-full md:w-[32rem]">
              <label className="block text-xs text-muted-foreground mb-1">Keywords (comma-separated)</label>
              <input
                value={serviceFilterText}
                onChange={(e) => setServiceFilterText(e.target.value)}
                placeholder="e.g. getObject, iam:PassRole, NotAction"
                className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground dark:placeholder:text-muted-foreground transition"
              />
            </div>

            {/* Text-to-speech */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Text-to-speech</label>
              <button
                type="button"
                onClick={() => setTtsEnabled(!ttsEnabled)}
                disabled={locked}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition ${
                  ttsEnabled
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-transparent bg-transparent hover:bg-muted/20 text-muted-foreground dark:text-muted-foreground'
                }`}
                aria-pressed={ttsEnabled}
              >
                <Volume2 className="w-4 h-4" />
                <span>{ttsEnabled ? 'Enabled' : 'Disabled'}</span>
              </button>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {ttsEnabled ? 'Audio buttons will appear on questions and answers.' : 'Enable to read questions and answers aloud on-demand.'}
              </p>
            </div>

            {/* Weakest Link */}
            {user && (
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Smart prioritisation</label>
                <button
                  type="button"
                  onClick={() => {
                    if (isWeakestLink) {
                      const next = isExamMode ? 'timed' : 'casual'
                      setExamMode(next)
                      if (next === 'casual') { setTimed(false); setRevealAnswers('immediately') }
                      clarityTag('exam_mode_selected', next)
                    } else {
                      const next = isExamMode ? 'weakest-link-timed' : 'weakest-link'
                      setExamMode(next)
                      setRevealAnswers('immediately')
                      clarityTag('exam_mode_selected', next)
                    }
                  }}
                  disabled={locked}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition ${
                    isWeakestLink
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-transparent bg-transparent hover:bg-muted/20 text-muted-foreground dark:text-muted-foreground'
                  }`}
                  aria-pressed={isWeakestLink}
                  title="Weakest Link — prioritises your weakest domains and previously wrong questions"
                >
                  <Brain className="w-4 h-4" />
                  <span>Weakest Link — prioritise weak domains</span>
                </button>
                <p className="mt-1 text-[11px] text-muted-foreground">Questions are weighted toward your historically weakest domains and previously wrong answers.</p>
                {isWeakestLink && analyticsDomains && Object.keys(analyticsDomains).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(analyticsDomains)
                      .sort(([, a], [, b]) => a.avgScore - b.avgScore)
                      .map(([domain, stats]) => (
                        <span
                          key={domain}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                            stats.avgScore < 50
                              ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700/40'
                              : stats.avgScore < 70
                              ? 'bg-primary/10 text-primary border-primary/20 dark:border-primary/30'
                              : 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700/40'
                          }`}
                        >
                          {domain}: {stats.avgScore}%
                        </span>
                      ))}
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {lastError && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 size-4 shrink-0">
              <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
            </svg>
            {lastError}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-4 flex items-center justify-end gap-3 flex-wrap">
          <button className="px-3 py-2 rounded-md bg-accent text-foreground hover:bg-accent/80 transition" onClick={handleReset}>Reset</button>
          {savedProgress && (
            <button className="px-4 py-2 rounded-md bg-primary/100 hover:bg-primary text-white font-semibold transition-colors" onClick={() => resumeExam()}>
              Resume ({savedProgress.answeredCount}/{savedProgress.total} answered)
            </button>
          )}
          <button
            ref={(el) => tour.registerTarget('start-exam-btn', el)}
            className={`px-4 py-2 rounded-md text-white font-semibold transition-all bg-primary ${loadingWeakestLink ? 'opacity-70 cursor-wait' : ''}`}
            onClick={() => { createAttempt(); clarityEvent('exam_start_clicked'); clarityTag('exam_code', selected ?? '') }}
            disabled={loadingWeakestLink}
          >
            {loadingWeakestLink ? 'Preparing…' : savedProgress ? 'Start new' : 'Start exam'}
          </button>
        </div>
      </div>
    </>
  )
}

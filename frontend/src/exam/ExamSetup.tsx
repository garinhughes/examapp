import { X, Coffee, Timer, Brain, Eye, Lock, ChevronDown } from 'lucide-react'
import { useExam } from './ExamContext'
import { useTourContext } from '@/components/TourProvider'

export function ExamSetup() {
  const {
    selected, selectedMeta, exams, questions, examTier, examTotalAvailable, examLimited, examShowcase, trialDaysRemaining,
    examMode, setExamMode, revealAnswers, setRevealAnswers, timed, setTimed,
    durationMinutes, setDurationMinutes, numQuestions, setNumQuestions,
    availableFilteredCount, attemptId, isFinished, user, login,
    takeDomains, setTakeDomains, domainOpen, setDomainOpen, domainRef, domainToggleRef,
    selectedServices, setSelectedServices, availableServices,
    serviceDropOpen, setServiceDropOpen, serviceSearchText, setServiceSearchText,
    serviceDropRef, serviceDropToggleRef,
    serviceFilterText, setServiceFilterText,
    lastError, savedProgress, loadingWeakestLink,
    analyticsDomains, attemptData, weakestLinkInfo,
    createAttempt, resumeExam, setRoute, setSelected,
    setAttemptId, setAttemptData, setSelectedAnswers, setMultiSelectPending,
    setFlaggedQuestions, setCurrentQuestionIndex, setTimeLeft, setPaused,
    setExamStarted, setShowSubmitConfirm, setShowCompleteEarlyConfirm, setShowCancelConfirm,
    setWeakestLinkInfo, setRevealedQuestions, setStagedAnswer, setLastError,
    setShowAttempts, setAttemptsList,
  } = useExam()

  const tour = useTourContext()
  const locked = !!attemptId && !isFinished

  const domainsList: string[] = attemptData?.perDomain ? Object.keys(attemptData.perDomain) : Array.from(new Set(questions.map((q) => (q as any).domain)))
  const allDomainsSelected = takeDomains.includes('All')

  return (
    <>
      <div className="mb-6 p-4 rounded-lg border border-border bg-card shadow-sm flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Start exam</h3>
          </div>
        </div>

        {/* Tier-limit banner */}
        {examLimited && (
          <div className="mb-4 p-3 rounded-lg border border-primary/30 dark:border-primary/30 bg-primary/10 text-sm">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-primary">
                {examTier === 'visitor' && (
                  <>
                    {examShowcase
                      ? <>These <strong>{questions.length}</strong> questions are hand-picked and the same for all visitors — they don't change between sessions.</>
                      : <>You have access to <strong>{questions.length}</strong> of <strong>{examTotalAvailable}</strong> questions.</>
                    }
                    {' '}Sign in for more.
                  </>
                )}
                {examTier === 'registered' && (
                  <>
                    {examShowcase
                      ? <>These <strong>{questions.length}</strong> questions are hand-picked and the same for your account — they don't rotate.</>
                      : <>You have access to <strong>{questions.length}</strong> of <strong>{examTotalAvailable}</strong> questions.</>
                    }
                    {' '}
                    {trialDaysRemaining !== null && trialDaysRemaining > 0
                      ? <>{trialDaysRemaining} day{trialDaysRemaining !== 1 ? 's' : ''} left on your free trial. </>
                      : trialDaysRemaining === 0
                        ? <>Your free trial has ended. </>
                        : null
                    }
                    Upgrade to unlock the full question bank.
                  </>
                )}
              </span>
              <button
                onClick={() => examTier === 'visitor' ? login() : setRoute('pricing')}
                className="px-3 py-1 rounded text-xs font-semibold bg-primary text-white hover:bg-primary/80"
              >
                {examTier === 'visitor' ? 'Sign in' : 'View plans'}
              </button>
            </div>
          </div>
        )}

        {/* Domain dropdown */}
        <div className="mb-4">
          <div ref={(el) => tour.registerTarget('domain-dropdown', el)} className="w-full md:w-96">
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
                <div ref={domainRef} className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg bg-card border border-border/60 shadow-xl">
                  <div className="flex gap-2 px-2 py-1.5 border-b border-border/40">
                    <button className="text-[10px] text-primary hover:text-primary dark:hover:text-primary transition" onClick={() => { setTakeDomains([...domainsList]); setDomainOpen(false) }}>Select all individually</button>
                    <button className="text-[10px] text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground transition" onClick={() => { setTakeDomains(['All']); setDomainOpen(false) }}>All (default)</button>
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
                {!locked && <button className="text-[10px] text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground ml-1 transition" onClick={() => setTakeDomains(['All'])}>Clear all</button>}
              </div>
            )}
          </div>
        </div>

        {/* Mode selection + settings */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
          <div className="md:col-span-2">
            <div ref={(el) => tour.registerTarget('mode-buttons', el)} className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => { setExamMode('casual'); setTimed(false); setRevealAnswers('immediately') }}
                disabled={locked}
                className={`inline-flex items-center gap-3 px-3 py-2 rounded-lg border ${examMode === 'casual' ? 'border-primary bg-primary/10' : 'border-transparent bg-transparent hover:bg-muted/20'} text-sm`}
                aria-pressed={examMode === 'casual'}
                title="Casual mode"
              >
                <Coffee className="w-5 h-5 text-primary" />
                <span>Casual</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setExamMode('timed'); setTimed(true); setRevealAnswers('on-completion')
                  if (!selected) return
                  try { const meta = exams.find((e: any) => e.code === selected); if (typeof meta?.defaultDuration === 'number') setDurationMinutes(meta.defaultDuration) } catch {}
                }}
                disabled={locked}
                className={`inline-flex items-center gap-3 px-3 py-2 rounded-lg border ${examMode === 'timed' ? 'border-primary bg-primary/10' : 'border-transparent bg-transparent hover:bg-muted/20'} text-sm`}
                aria-pressed={examMode === 'timed'}
                title="Timed mode"
              >
                <Timer className="w-5 h-5 text-primary" />
                <span>Timed</span>
              </button>

              <button
                type="button"
                onClick={() => { setExamMode('weakest-link'); setTimed(false); setRevealAnswers('immediately') }}
                disabled={locked || !user}
                className={`inline-flex items-center gap-3 px-3 py-2 rounded-lg border ${examMode === 'weakest-link' ? 'border-primary bg-primary/10' : 'border-transparent bg-transparent hover:bg-muted/20'} text-sm ${!user ? 'opacity-40 cursor-not-allowed' : ''}`}
                aria-pressed={examMode === 'weakest-link'}
                title={user ? 'Weakest Link — prioritises your weakest domains and previously wrong questions' : 'Sign in to use Weakest Link mode'}
              >
                <Brain className="w-5 h-5 text-primary" />
                <span>Weakest Link</span>
              </button>
            </div>

            {/* Mode descriptions */}
            {examMode === 'casual' && (
              <div className="mt-3 p-3 rounded-lg border border-border bg-muted/30 text-sm text-foreground">
                <div className="flex items-start gap-2">
                  <Coffee className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Casual Mode</p>
                    <p className="text-xs mt-1 text-muted-foreground">No time pressure - work through questions at your own pace. Perfect for learning, reviewing explanations, and building confidence.</p>
                  </div>
                </div>
              </div>
            )}

            {examMode === 'timed' && (
              <div className="mt-3 p-3 rounded-lg border border-border bg-muted/30 text-sm text-foreground">
                <div className="flex items-start gap-2">
                  <Timer className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Timed Mode</p>
                    <p className="text-xs mt-1 text-muted-foreground">Simulate real exam conditions with a countdown timer. The exam auto-submits when time runs out. Great for building time management skills.</p>
                  </div>
                </div>
              </div>
            )}

            {examMode === 'weakest-link' && (
              <div className="mt-3 p-3 rounded-lg border border-border bg-muted/30 text-sm text-foreground">
                <div className="flex items-start gap-2">
                  <Brain className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Weakest Link Mode</p>
                    <p className="text-xs mt-1 text-muted-foreground">
                      Questions are weighted toward your historically weakest domains. Previously wrong questions appear more frequently.
                      {analyticsDomains ? '' : ' Complete at least one attempt first for best results.'}
                    </p>
                    {analyticsDomains && Object.keys(analyticsDomains).length > 0 && (
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
                </div>
              </div>
            )}

            {/* Show Answers toggle */}
            <div className="mt-3">
              <label className="block text-xs text-muted-foreground mb-1.5">Show answers</label>
              <div ref={(el) => tour.registerTarget('answer-reveal', el)} className="flex items-center gap-2">
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

            {examMode === 'timed' && (
              <div className="mt-3">
                <label className="block text-sm font-medium mb-1">Duration (mins)</label>
                <div className="flex items-center gap-3">
                  <input type="range" min={1} max={300} step={5} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value) || 1)} className="flex-1" disabled={locked} />
                  <input type="number" min={1} step={5} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value) || 1)} className="w-28 px-2 py-1 rounded bg-muted/40 text-foreground border border-border dark:border-transparent" disabled={locked} />
                </div>
              </div>
            )}

            <div className="mt-3">
              <label className="block text-sm font-medium mb-1">Questions <span className="text-xs text-muted-foreground font-normal">({availableFilteredCount} available)</span></label>
              <div className="flex items-center gap-3">
                <input type="range" min={1} max={Math.max(availableFilteredCount, 1)} step={1} value={Math.min(numQuestions, availableFilteredCount || 1)} onChange={(e) => setNumQuestions(Math.min(Number(e.target.value) || 1, availableFilteredCount || 1))} className="flex-1" disabled={locked} />
                <input type="number" min={1} max={availableFilteredCount || 1} step={1} value={Math.min(numQuestions, availableFilteredCount || 1)} onChange={(e) => setNumQuestions(Math.min(Math.max(1, Number(e.target.value) || 1), availableFilteredCount || 1))} className="w-28 px-2 py-1 rounded bg-muted/40 text-foreground border border-border dark:border-transparent" disabled={locked} />
              </div>
            </div>
          </div>
        </div>

        {/* Filter section */}
        <div className="mt-4 space-y-3">
          <label className="block text-sm font-semibold">Filter questions</label>

          <div className="flex flex-col md:flex-row md:items-start md:gap-4">
            {/* Service multi-select */}
            {availableServices.length > 0 && (
              <div className="w-full md:w-96">
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
                        <button className="text-[10px] text-primary hover:text-primary dark:hover:text-primary transition" onClick={() => { setSelectedServices([...availableServices]); setServiceDropOpen(false) }}>Select all</button>
                        <button className="text-[10px] text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground transition" onClick={() => setSelectedServices([])}>Clear</button>
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
                    <button className="text-[10px] text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground ml-1 transition" onClick={() => setSelectedServices([])}>Clear all</button>
                  </div>
                )}
              </div>
            )}

            {/* Keyword inputs */}
            <div className="md:hidden mt-3">
              <label className="block text-xs text-muted-foreground mb-1">Keywords (comma-separated)</label>
              <input value={serviceFilterText} onChange={(e) => setServiceFilterText(e.target.value)} placeholder="e.g. getObject, iam:PassRole, NotAction" className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground dark:placeholder:text-muted-foreground transition" />
            </div>
            <div className="hidden md:flex-1 md:block mt-3 md:mt-0">
              <label className="block text-xs text-muted-foreground mb-1">Keywords (comma-separated)</label>
              <input value={serviceFilterText} onChange={(e) => setServiceFilterText(e.target.value)} placeholder="e.g. getObject, iam:PassRole, NotAction" className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground dark:placeholder:text-muted-foreground transition" />
            </div>
          </div>

          <div className="text-xs text-muted-foreground">Filters narrow down which questions appear. Leave blank for all questions.</div>

        </div>

        {lastError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 size-4 shrink-0">
              <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z" clipRule="evenodd" />
            </svg>
            {lastError}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-4 flex items-center justify-end gap-3 md:self-end">
          <button className="px-3 py-2 rounded-md bg-accent text-foreground hover:bg-accent/80 transition" onClick={() => {
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
          }}>Reset</button>
          {savedProgress && (
            <button className="px-4 py-2 rounded-md bg-primary/100 hover:bg-primary text-white font-semibold transition-colors" onClick={() => resumeExam()}>
              Resume ({savedProgress.answeredCount}/{savedProgress.total} answered)
            </button>
          )}
          <button
            ref={(el) => tour.registerTarget('start-exam-btn', el)}
            className={`px-4 py-2 rounded-md text-white font-semibold transition-all ${
              examMode === 'weakest-link' ? 'bg-gradient-to-r bg-primary ' : 'bg-primary'
            } ${loadingWeakestLink ? 'opacity-70 cursor-wait' : ''}`}
            onClick={() => createAttempt()}
            disabled={loadingWeakestLink}
          >
            {loadingWeakestLink ? 'Preparing…' : savedProgress ? 'Start new' : 'Start exam'}
          </button>
        </div>
      </div>

      {/* Return to Practice Exams button */}
      <div className="container px-4 mt-3 md:col-span-4">
        <div className="mb-6 flex justify-center">
          <button className="px-4 py-2 rounded bg-accent text-sm" onClick={() => { setRoute('practice'); setSelected(null); setShowAttempts(false); setAttemptsList(null) }}>
            Return to Practice Exams
          </button>
        </div>
      </div>
    </>
  )
}

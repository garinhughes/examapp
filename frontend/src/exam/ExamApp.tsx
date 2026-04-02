import { Save, X, Play, Pause, Info, BarChart3, BookOpen, Terminal, Minimize2, Maximize2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useRef, useEffect, useState } from 'react'
import { clarityEvent, clarityTag } from '@/clarity'
import { Sidebar } from '@/components/Sidebar'
import { TourProvider, useTourContext } from '@/components/TourProvider'
import { TourBubble } from '@/components/TourBubble'
import { ThemeToggle } from '@/components/ThemeToggle'
import { PageMeta } from '@/components/PageMeta'
import { CookieConsent } from '@/components/CookieConsent'
import Loader from '@/components/Loader'
import { useRouteSync } from '@/hooks/useRouteSync'
import AccountPage from '../components/AccountPage'
import Leaderboard from '../components/Leaderboard'
import AdminPanel from '../components/AdminPanel'
import { MetricsView } from './MetricsView'
import PricingPage from '../components/PricingPage'
import { DiagramsView } from '../components/DiagramsView'
import { SkillLabsPage } from '../skill-labs/SkillLabsPage'
import { SkillLabRunnerPage } from '../skill-labs/SkillLabRunnerPage'
import BasketPage from '../basket/BasketPage'
import { FeedbackProvider } from '../feedback/FeedbackContext'
import { PollWidget } from '../components/PollWidget'
import { FeedbackPage } from '../feedback/FeedbackPage'
import { useExam } from './ExamContext'
import { computeDerivedAttempt } from './utils'
import { PracticeExams } from './PracticeExams'
import { AnalyticsView } from './AnalyticsView'
import { ExamReview } from './ExamReview'
import { ExamSetup } from './ExamSetup'
import { QuestionNav } from './QuestionNav'
import { QuestionCard } from './QuestionCard'
import { Modals } from './Modals'
import Footer from '@/components/Footer'
import { HomePage } from '@/components/HomePage'
import PrivacyPolicy from '@/components/PrivacyPolicy'
import TermsOfService from '@/components/TermsOfService'
import RefundPolicy from '@/components/RefundPolicy'

export default function ExamApp() {
  return (
    <TourProvider>
      <ExamAppInner />
    </TourProvider>
  )
}

function ExamAppInner() {
  useRouteSync()
  const navigate = useNavigate()
  const tour = useTourContext()
  const {
    route, setRoute, selected, setSelected, selectedMeta, exams, questions, setQuestions,
    examTier, examStarted, setExamStarted, isFinished, attemptId, attemptData, setAttemptData,
    setAttemptId, showAttempts, setShowAttempts, attemptsList, setAttemptsList,
    paused, setPaused, timed, timeLeft, displayQuestions,
    anySavedExam, savedProgress, lastError, setLastError,
    selectedAnswers, flaggedQuestions,
    user, login, logout, gamState, gamLevel,
    authFetch, showToast, resumeExam, setupExamFromMeta, saveExamProgress,
    setShowCancelConfirm, isAdmin,
  } = useExam()

  const userIsAdmin = isAdmin()

  const [focusMode, setFocusMode] = useState(false)

  // Exit focus mode when the exam ends
  useEffect(() => {
    if (!examStarted || isFinished) setFocusMode(false)
  }, [examStarted, isFinished])

  // Auto-advance tour from "click Setup Exam" step when visitor navigates to exam setup
  const prevRouteRef = useRef(route)
  useEffect(() => {
    if (tour.active && tour.step === 2 && prevRouteRef.current === 'practice' && route === 'home') {
      tour.goToStep(3)
    }
    prevRouteRef.current = route
  }, [route, tour.active, tour.step])

  // Clarity: track exam lifecycle
  useEffect(() => {
    if (examStarted && selected) {
      clarityEvent('exam_started')
      clarityTag('exam_code', selected)
      clarityTag('exam_mode', timed ? 'timed' : 'casual')
    }
  }, [examStarted]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isFinished && selected) {
      clarityEvent('exam_completed')
      clarityTag('exam_code', selected)
    }
  }, [isFinished]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (paused) {
      clarityEvent('exam_timer_paused')
    }
  }, [paused])

  return (
    <FeedbackProvider authFetch={authFetch} isAdmin={userIsAdmin}>
    <div className="flex flex-col h-screen w-full overflow-hidden bg-background text-foreground">
      <PageMeta route={route} />
      <CookieConsent />
      {/* Work-in-progress banner */}
      <div className={`shrink-0 bg-amber-500 text-amber-950 text-xs font-medium text-center py-1.5 px-4${focusMode ? ' hidden' : ''}`}>
        This site is a work in progress and is not ready for use. Features may be incomplete or change without notice.
      </div>
      <div className="flex flex-1 overflow-hidden">
      <div className={focusMode ? 'hidden' : ''}>
      <Sidebar
        currentRoute={route}
        onNavigate={(key) => {
          if (examStarted && !isFinished && selected && key !== 'home') {
            saveExamProgress()
            setExamStarted(false)
          }
          setRoute(key as any)
          if (key === 'home') { setSelected(null); setExamStarted(false); setAttemptData(null); setShowAttempts(false); setAttemptsList(null) }
        }}
        logout={logout}
        login={login}
        user={user}
        xp={gamState.xp}
        level={gamLevel.level}
        streak={gamState.streak}
        showAdmin={userIsAdmin}
      />
      </div>

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <div className="absolute top-4 right-4 z-10 hidden md:flex gap-2">
          <ThemeToggle />
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="container mx-auto max-w-6xl space-y-8">
            {/* Header */}
            <header className={`flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6${focusMode ? ' hidden' : ''}`}>
              <div className="flex flex-col">
                {selected && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                    <span>{selected}</span>
                    {examTier && <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs capitalize">{examTier}</span>}
                  </div>
                )}
                {['practice', 'analytics', 'account', 'admin', 'metrics', 'diagrams', 'skill-labs', 'basket', 'feedback'].includes(route) && (
                  <h1 className="text-3xl font-bold tracking-tight">
                    {route === 'practice' && 'Practice Exams'}
                    {route === 'analytics' && 'Analytics'}
                    {route === 'account' && 'Account Settings'}
                    {route === 'admin' && 'Admin Console'}
                    {route === 'metrics' && 'Metrics'}
                    {route === 'diagrams' && 'Architecture Diagrams'}
                    {route === 'skill-labs' && 'Skill Labs'}
                    {route === 'basket' && 'Basket'}
                    {route === 'feedback' && 'Feedback'}
                  </h1>
                )}
              </div>
            </header>

            {/* Diagrams page */}
            {route === 'diagrams' && <DiagramsView />}

            {/* Skill Labs pages */}
            {route === 'skill-labs' && <SkillLabsPage />}
            {route.startsWith('skill-lab:') && (() => {
              const parts = route.slice('skill-lab:'.length)
              const lastColon = parts.lastIndexOf(':')
              const labId = lastColon > 0 ? parts.slice(0, lastColon) : parts
              const mode = lastColon > 0 ? parts.slice(lastColon + 1) : 'timed'
              return <SkillLabRunnerPage labId={labId} timed={mode !== 'casual'} />
            })()}

            {/* Practice Exams page */}
            {route === 'practice' && <PracticeExams />}

            {/* Analytics page */}
            {route === 'analytics' && <AnalyticsView />}

            {/* Account / Achievements page */}
            {route === 'account' && (
              <div className="mb-6">
                <ResumeBanner />
                <AccountPage />
                <div className="mt-6">
                  <Leaderboard />
                </div>
              </div>
            )}

            {route === 'admin' && userIsAdmin && (
              <div className="mb-6">
                <AdminPanel />
              </div>
            )}

            {route === 'admin' && !userIsAdmin && (
              <div className="p-8 text-center text-muted-foreground">
                You do not have permission to access this page.
              </div>
            )}

            {route === 'metrics' && userIsAdmin && (
              <div className="mb-6">
                <MetricsView />
              </div>
            )}

            {route === 'metrics' && !userIsAdmin && (
              <div className="p-8 text-center text-muted-foreground">
                You do not have permission to access this page.
              </div>
            )}

            {route === 'feedback' && userIsAdmin && (
              <div className="mb-6">
                <FeedbackPage />
              </div>
            )}

            {route === 'feedback' && !userIsAdmin && (
              <div className="p-8 text-center text-muted-foreground">
                You do not have permission to access this page.
              </div>
            )}

            {route === 'pricing' && (
              <div className="mb-6">
                <ResumeBanner />
                <PricingPage />
              </div>
            )}

            {route === 'basket' && (
              <div className="mb-6">
                <BasketPage />
              </div>
            )}

            {route === 'privacy' && <PrivacyPolicy />}
            {route === 'terms' && <TermsOfService />}
            {route === 'refund' && <RefundPolicy />}

            {/* Resume banner on homepage when no exam selected */}
            {route === 'home' && !selected && anySavedExam && (
              <div className="mb-4 p-4 rounded-md bg-muted/40 border border-border shadow-sm flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-md flex items-center justify-center bg-primary/10 text-primary flex-shrink-0">
                    <Play className="w-5 h-5" aria-hidden />
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">Exam in progress</div>
                    <div className="text-sm text-muted-foreground">{anySavedExam.title} - {anySavedExam.answeredCount}/{anySavedExam.total} answered</div>
                  </div>
                </div>
                <div>
                  <button
                    className="px-3 py-1 rounded-md bg-primary text-white text-sm inline-flex items-center gap-2 shadow-sm hover:opacity-95 transition"
                    onClick={() => resumeExam(anySavedExam.code)}
                  >
                    <Play className="w-4 h-4" aria-hidden />
                    Resume
                  </button>
                </div>
              </div>
            )}

            {/* Homepage when no exam selected */}
            {route === 'home' && !selected && <HomePage />}

            {/* ExamHeader bar */}
            {route === 'home' && selected ? (
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <h2 className="text-lg font-semibold">Questions</h2>
                <div className="flex min-w-0 flex-1 flex-col gap-2 lg:items-end">
                  <div className="text-sm text-muted-foreground break-words lg:text-right">{selected}{selectedMeta?.title ? ` - ${selectedMeta.title}` : ''}</div>
                  <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:justify-end">
                    {/* Focus Mode: own centered row on mobile, inline on desktop */}
                    {examStarted && !isFinished && (
                      <div className="flex justify-center lg:contents">
                        <button
                          className="px-3 py-1 rounded-md bg-accent text-foreground text-sm inline-flex items-center gap-1.5 whitespace-nowrap"
                          onClick={() => setFocusMode((f) => !f)}
                          title={focusMode ? 'Exit Focus Mode' : 'Enter Focus Mode'}
                        >
                          {focusMode ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
                          {focusMode ? 'Exit Focus' : 'Focus Mode'}
                        </button>
                      </div>
                    )}
                    {/* Attempts / Save / Cancel: always one row */}
                    <div className="flex flex-nowrap justify-center items-center gap-2 lg:justify-end">
                      <button
                        className="px-3 py-1 rounded-md bg-muted-foreground text-white text-sm whitespace-nowrap"
                        onClick={async () => {
                          setShowAttempts((s) => !s)
                          if (!attemptsList) {
                            try {
                              const res = await authFetch('/attempts')
                              const d = await res.json()
                              setAttemptsList(d.attempts ?? [])
                            } catch (err) {
                              console.error(err)
                              setLastError(String(err))
                            }
                          }
                        }}
                      >
                        Attempts
                      </button>
                      {attemptId && !isFinished && examStarted && (
                        <>
                          <button
                            className="px-3 py-1 rounded-md bg-primary text-white text-sm inline-flex items-center gap-2 shadow-sm hover:opacity-95 transition-colors whitespace-nowrap"
                            onClick={() => {
                              saveExamProgress()
                              setExamStarted(false)
                              setRoute('practice')
                              clarityEvent('exam_saved_for_later')
                            }}
                            title="Save progress and exit - resume later"
                          >
                            <Save className="w-4 h-4" />
                            Save for Later
                          </button>
                          <button
                            className="px-3 py-1 rounded-md bg-red-600 text-white text-sm inline-flex items-center gap-2 shadow-sm hover:bg-red-700 transition-colors whitespace-nowrap"
                            onClick={() => { setShowCancelConfirm(true); clarityEvent('exam_cancel_initiated') }}
                          >
                            <X className="w-4 h-4" />
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                    {examStarted && timed && timeLeft !== null && (
                      <div className="flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1">
                        <button
                          className={`px-2 py-1 rounded text-sm ${paused ? 'bg-primary/90 text-white' : 'bg-accent'}`}
                          onClick={() => setPaused((p) => !p)}
                          title={paused ? 'Resume timer' : 'Pause timer'}
                        >
                          {paused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                        </button>
                        <div className={`text-sm whitespace-nowrap ${paused ? 'text-yellow-500 animate-pulse' : 'text-muted-foreground'}`}>
                          {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:{(timeLeft % 60).toString().padStart(2, '0')}{paused ? ' (paused)' : ''}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Attempts list panel */}
            {showAttempts && selected && (
              <div className="mb-4 p-3 rounded bg-card/60 dark:bg-card">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold mb-2">Attempts</h3>
                  <div>
                    <button
                      className="px-2 py-1 rounded bg-red-600 text-white text-sm"
                      onClick={async () => {
                        if (!attemptsList) return
                        if (!confirm('Delete ALL attempts? This will remove all attempts permanently.')) return
                        try {
                          const r = await authFetch('/attempts/all', { method: 'DELETE' })
                          if (r.ok) {
                            const d = await r.json()
                            setAttemptsList([])
                            showToast(`Deleted ${d.deleted || 0} attempts`, 'info')
                          } else {
                            const txt = await r.text().catch(() => '')
                            showToast(`Delete failed: ${r.status} ${txt}`, 'error')
                          }
                        } catch (e) {
                          showToast(String(e), 'error')
                        }
                      }}
                    >
                      Delete all attempts
                    </button>
                  </div>
                </div>
                {attemptsList ? (
                  <ul className="space-y-2 text-sm">
                    {attemptsList.map((a) => (
                      <li key={a.attemptId} className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{a.examCode}</div>
                          <div className="text-xs text-muted-foreground">{a.attemptId} - {a.startedAt ? new Date(a.startedAt).toLocaleString() : '-'}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {a.score !== null && <div className="text-sm font-semibold">{a.score}%</div>}
                          <button
                            className="px-2 py-1 rounded bg-accent text-sm"
                            onClick={async () => {
                              try {
                                const res = await authFetch(`/attempts/${a.attemptId}`)
                                const d = await res.json()
                                const computed = computeDerivedAttempt(d, Array.isArray(d.questions) ? d.questions : undefined)
                                setAttemptData(computed)
                                if (Array.isArray(computed.questions)) setQuestions(computed.questions)
                                setSelected(d.examCode)
                                setShowAttempts(false)
                              } catch (err) {
                                console.error(err)
                                setLastError(String(err))
                              }
                            }}
                          >
                            View
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Loader />
                )}
              </div>
            )}

            {/* Results */}
            {attemptData && typeof attemptData.score === 'number' && route === 'home' && (
              <div className="mb-4 p-4 rounded bg-card/60 dark:bg-card">
                <div className="flex items-start gap-4">
                  {(() => {
                    const score = Number(attemptData.score) || 0
                    const pm = typeof selectedMeta?.passMark === 'number' ? selectedMeta.passMark : 70
                    const passed = score >= pm
                    const bg = passed
                      ? `linear-gradient(45deg, var(--color-correct), var(--color-correct-2))`
                      : `linear-gradient(45deg, var(--color-incorrect), var(--color-incorrect-2))`
                    const shadow = passed ? 'var(--color-correct-shadow)' : 'var(--color-incorrect-shadow)'
                    const textColor = passed ? 'var(--color-correct-text)' : 'var(--color-incorrect-text)'
                    return (
                      <div style={{ background: bg, boxShadow: `0 0 18px ${shadow}`, color: textColor }} className="flex items-center justify-center w-20 h-20 rounded-full text-2xl font-bold">
                        <span style={{ color: textColor }}>{score}%</span>
                      </div>
                    )
                  })()}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-muted-foreground">
                          {attemptData.correctCount ?? 0} / {attemptData.total ?? 0} correct
                          {attemptData.earlyComplete && <span className="ml-2 text-primary">(completed early - {attemptData.answeredCount} of {attemptData.totalQuestions} questions)</span>}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">Completed: {attemptData.finishedAt ? new Date(attemptData.finishedAt).toLocaleString() : '-'}</div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {attemptData.perDomain && (() => {
                        const pm = typeof selectedMeta?.passMark === 'number' ? selectedMeta.passMark : 70
                        const entries = Object.entries(attemptData.perDomain)
                          .map(([domain, vals]: any) => ({ domain, score: Number(vals.score) || 0, correct: vals.correct, total: vals.total }))
                          .sort((a: any, b: any) => a.score - b.score)
                        return entries.map(({ domain, score: vscore, correct, total }: any) => {
                          const label = vscore >= pm ? 'Strong' : vscore >= 40 ? 'Needs Work' : 'Weak'
                          const labelColor = vscore >= pm
                            ? 'var(--color-correct-2)'
                            : vscore >= 40
                              ? '#f59e0b'
                              : 'var(--color-incorrect-2)'
                          const barBg = vscore >= pm
                            ? 'linear-gradient(90deg, var(--color-correct), var(--color-correct-2))'
                            : vscore >= 40
                              ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                              : 'linear-gradient(90deg, var(--color-incorrect), var(--color-incorrect-2))'
                          return (
                            <div key={domain}>
                              <div className="flex items-center justify-between text-sm mb-1">
                                <div className="font-medium flex items-center gap-2">
                                  <span>{domain}</span>
                                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ color: labelColor, backgroundColor: `color-mix(in srgb, ${labelColor} 15%, transparent)` }}>{label}</span>
                                </div>
                                <div className="text-xs text-muted-foreground">{vscore}% ({correct}/{total})</div>
                              </div>
                              <div className="w-full h-3 bg-accent/60 rounded overflow-hidden">
                                <div className="h-full rounded transition-all" style={{ width: `${vscore}%`, background: barBg }} />
                              </div>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  </div>

                </div>
              </div>
            )}

            {/* Review mode (after exam finished) */}
            {isFinished && route === 'home' ? <ExamReview /> : null}

            {/* Pre-start form (when exam selected but not started and not finished) */}
            {!examStarted && selected && !isFinished && route === 'home' && <ExamSetup />}

            {/* Question navigation (during exam) */}
            {!isFinished && examStarted && displayQuestions.length > 0 && route === 'home' && <QuestionNav />}

            {/* Question card (during exam) */}
            {!isFinished && examStarted && route === 'home' && <QuestionCard />}

            {/* Return to Practice Exams button removed here (kept inside ExamSetup) */}

          </div>
          {!focusMode && <Footer />}
        </div>

        {/* Modals, toasts, confetti, etc. */}
        <Modals />
      </main>
      </div>
    </div>
    <TourBubble />
    </FeedbackProvider>
  )
}

/** Shared resume banner used on account, pricing pages */
function ResumeBanner() {
  const { anySavedExam, examStarted, resumeExam } = useExam()
  if (!anySavedExam || examStarted) return null
  return (
    <div className="mb-4 p-4 rounded-md bg-muted/40 border border-border shadow-sm flex items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-md flex items-center justify-center bg-primary/10 text-primary flex-shrink-0">
          <Play className="w-5 h-5" aria-hidden />
        </div>
        <div>
          <div className="font-semibold text-foreground">Exam in progress</div>
          <div className="text-sm text-muted-foreground">{anySavedExam.title} - {anySavedExam.answeredCount}/{anySavedExam.total} answered</div>
        </div>
      </div>
      <div>
        <button
          className="px-3 py-1 rounded-md bg-primary text-white text-sm inline-flex items-center gap-2 shadow-sm hover:opacity-95 transition"
          onClick={() => resumeExam(anySavedExam.code)}
        >
          <Play className="w-4 h-4" aria-hidden />
          Resume
        </button>
      </div>
    </div>
  )
}

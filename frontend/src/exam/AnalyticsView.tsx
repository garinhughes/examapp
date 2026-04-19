import { useState, useCallback, useEffect } from 'react'
import { ProviderLogo } from '@/components/ProviderLogo'
import { Trash2, ChevronDown, ChevronRight, Search, ChevronLeft, Eye, CalendarDays, BookOpen, TrendingUp, BarChart2 } from 'lucide-react'
import { useExam } from './ExamContext'
import { computeDerivedAttempt } from './utils'
import { ScoreHistoryChart } from './ScoreHistoryChart'

export function AnalyticsView() {
  const {
    selected, selectedMeta, exams, providers, scoreHistory, loadingScoreHistory,
    analyticsAttempts, analyticsDomains, deletingAttemptId, setDeletingAttemptId,
    gamState, fetchScoreHistory, setupExamFromMeta,
    setRoute, authFetch, setAttemptData, setSelected, questions, setQuestions,
    attemptId, setAttemptId, showToast, setExamStarted,
    examStarted, anySavedExam, savedProgress, user,
  } = useExam()

  const passMark = typeof selectedMeta?.passMark === 'number' ? selectedMeta.passMark : 70

  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [showScores, setShowScores] = useState(false)
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({})
  const [scoresPage, setScoresPage] = useState(0)
  const [deleteTarget, setDeleteTarget] = useState<{ attemptId: string; label: string } | null>(null)
  const SCORES_PAGE_SIZE = 20

  useEffect(() => {
    if (!user) return
    authFetch('/analytics/summary').then(async res => {
      if (res.ok) {
        const d = await res.json()
        if (d.counts && typeof d.counts === 'object') setAttemptCounts(d.counts)
      }
    }).catch(() => {})
  }, [user])

  function toggleProvider(name: string) {
    setCollapsedProviders(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function allCollapsed() {
    return providers.length > 0 && providers.every((p: any) => collapsedProviders.has(p.provider))
  }

  // Previous version analytics state
  const [showPrev, setShowPrev] = useState(false)
  const [prevLoading, setPrevLoading] = useState(false)
  const [prevAttempts, setPrevAttempts] = useState<any[] | null>(null)
  const [prevScores, setPrevScores] = useState<any[]>([])

  const predecessorCode: string | undefined = selectedMeta?.predecessorCode ?? (exams.find((e: any) => e.code === selected) as any)?.predecessorCode

  // Reset previous version state whenever the selected exam changes
  const [prevSelectedKey, setPrevSelectedKey] = useState(selected)
  if (prevSelectedKey !== selected) {
    setPrevSelectedKey(selected)
    setShowPrev(false)
    setPrevAttempts(null)
    setPrevScores([])
  }

  const loadPrevVersions = useCallback(async (code: string) => {
    setPrevLoading(true)
    try {
      const res = await authFetch(`/analytics/exam/${encodeURIComponent(code)}/scores`)
      if (res.ok) {
        const d = await res.json()
        setPrevAttempts(Array.isArray(d.attempts) ? d.attempts : [])
        setPrevScores(Array.isArray(d.scores) ? d.scores : [])
      } else {
        setPrevAttempts([])
        setPrevScores([])
      }
    } catch {
      setPrevAttempts([])
      setPrevScores([])
    } finally {
      setPrevLoading(false)
    }
  }, [authFetch])

  return (
    <div className="mb-6">
      <div className="flex items-start gap-0 mb-4 -mx-1">
        {[
          { icon: BookOpen,   label: 'Pick an exam',  desc: 'Choose a certification below'  },
          { icon: TrendingUp, label: 'Score history', desc: 'See pass/fail over time'        },
          { icon: BarChart2,  label: 'Domains',       desc: 'Spot strengths & weak areas'   },
          { icon: Eye,        label: 'Review',        desc: 'Replay any past attempt'        },
        ].map(({ icon: Icon, label, desc }, i, arr) => (
          <div key={label} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center flex-1 min-w-0 px-1">
              <Icon className="w-6 h-6 text-primary flex-shrink-0" />
              <span className="mt-1.5 text-sm font-semibold text-foreground text-center leading-tight">{label}</span>
              <span className="text-xs text-muted-foreground text-center leading-tight mt-0.5 hidden sm:block">{desc}</span>
            </div>
            {i < arr.length - 1 && (
              <div className="flex-shrink-0 flex flex-col items-center">
                <ChevronRight className="w-3.5 h-3.5 text-primary" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            {selected && (
              <>
                {selectedMeta?.title ?? selected}
                {selectedMeta?.code ? ` (${selectedMeta.code})` : ''}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selected ? (
            <button className="inline-flex items-center gap-1 px-3 py-1 rounded bg-accent text-sm" onClick={() => setSelected(null)}>
              <ChevronLeft className="w-3.5 h-3.5" /> Analytics
            </button>
          ) : (
            <button className="inline-flex items-center gap-1 px-3 py-1 rounded bg-accent text-sm" onClick={() => setRoute('practice')}>
              <ChevronLeft className="w-3.5 h-3.5" /> Exams
            </button>
          )}
          {selected && (
            <>

              {(() => {
                const blocked = !!(examStarted || anySavedExam || (selected && savedProgress))
                return (
                  <button
                    className="px-3 py-1 rounded bg-primary text-white text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={blocked}
                    title={blocked ? 'Complete or cancel your current exam first' : undefined}
                    onClick={() => {
                      if (blocked) return
                      const meta = selectedMeta || exams.find((e) => String(e.code).toLowerCase() === String(selected).toLowerCase())
                      if (meta) setupExamFromMeta(meta)
                      else setRoute('home')
                    }}
                  >
                    Setup Exam
                  </button>
                )
              })()}
            </>
          )}
        </div>
      </div>

      {!selected && providers.length > 0 && (
        <div className="mt-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search by title or code…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-center justify-end -mt-2">
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => {
                if (allCollapsed()) setCollapsedProviders(new Set())
                else setCollapsedProviders(new Set(providers.map((p: any) => p.provider)))
              }}
            >
              {allCollapsed() ? 'Expand all' : 'Collapse all'}
            </button>
          </div>
          {providers.map((p: any) => {
            const q = searchQuery.toLowerCase()
            const filteredExams = q
              ? p.exams.filter((ex: any) => (ex.title ?? '').toLowerCase().includes(q) || ex.code.toLowerCase().includes(q))
              : p.exams
            if (filteredExams.length === 0) return null
            const collapsed = !q && collapsedProviders.has(p.provider)
            return (
              <div key={p.provider}>
                <button
                  className="flex items-center gap-1 font-semibold mb-2 hover:text-primary transition-colors w-full text-left"
                  onClick={() => toggleProvider(p.provider)}
                  aria-expanded={!collapsed}
                >
                  {collapsed ? <ChevronRight className="w-4 h-4 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
                  {p.provider}
                </button>
                {!collapsed && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {filteredExams.map((ex: any) => {
                      const attempts = attemptCounts[ex.code.toUpperCase()] ?? 0
                      return (
                      <div
                        key={ex.code}
                        role="button"
                        tabIndex={0}
                        onClick={() => { setSelected(ex.code); void fetchScoreHistory(ex.code) }}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(ex.code); void fetchScoreHistory(ex.code) } }}
                        className="rounded-lg border border-border bg-card text-card-foreground shadow-sm overflow-hidden flex flex-col cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      >
                        <ProviderLogo provider={ex.provider} size="md" />
                        <div className="p-4 flex-1 flex flex-col">
                          <div className="font-medium leading-tight">{ex.title ?? ex.code}</div>
                          <div className="text-xs text-muted-foreground mt-1">{ex.code}</div>
                          {attempts > 0 && (
                            <div className="mt-auto pt-3">
                              <span className="bg-primary text-primary-foreground text-xs font-semibold px-2 py-0.5 rounded-full shadow-sm">
                                {attempts} attempt{attempts !== 1 ? 's' : ''}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <div className="mt-4 space-y-4">
          {/* Score history chart */}
          <div className="p-4 rounded-lg bg-card/60 dark:bg-card">
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold">Score history</div>
              <button
                className="px-2 py-1 rounded bg-accent text-sm"
                onClick={() => void fetchScoreHistory(selected)}
              >
                Refresh
              </button>
            </div>
            {loadingScoreHistory ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : (
              <ScoreHistoryChart data={scoreHistory || []} passMark={passMark} showEmptyText={false} />
            )}
            <div className="mt-2 text-xs text-muted-foreground flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--color-correct)' }} />Pass</span>
              <span className="inline-flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--color-incorrect)' }} />Fail</span>
              <span className="inline-flex items-center gap-2"><span className="inline-block w-7 border-t" style={{ borderTopStyle: 'dashed', borderTopColor: 'var(--color-correct-2)', borderTopWidth: 2 }} />Pass mark ({passMark}%)</span>
              <span className="opacity-80">Hover points for % and score/total</span>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(() => {
              const atts = analyticsAttempts || []
              const scores = atts
                .map((a: any) => (typeof a.score === 'number' ? a.score : (a.score === null ? null : Number(a.score))))
                .filter((v: any) => typeof v === 'number' && Number.isFinite(v)) as number[]
              const finished = scores.length
              const total = atts.length
              const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
              const scoresClamped = scores.map(clamp)
              const avg = finished ? Math.round(scoresClamped.reduce((s, x) => s + x, 0) / finished) : null
              const best = finished ? Math.max(...scoresClamped) : null
              const lastScore = (scoreHistory && scoreHistory.length > 0) ? Number(scoreHistory[scoreHistory.length - 1].score) : null
              const passed = finished ? scoresClamped.filter((s) => s >= passMark).length : 0
              const passRate = finished ? Math.round((passed / finished) * 100) : null

              const stat = (label: string, value: any) => (
                <div className="p-3 rounded-lg bg-card/60 dark:bg-card border border-border/60 dark:border-border/60">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-lg font-semibold">{value ?? '-'}</div>
                </div>
              )

              return (
                <>
                  {stat('Attempts / Finished', `${total} / ${finished}`)}
                  {stat('Avg score', avg !== null ? `${avg}%` : null)}
                  {stat('Best / Last', (best !== null || lastScore !== null) ? `${best ?? '-'}% / ${Number.isFinite(lastScore) ? `${lastScore}%` : '-'}` : null)}
                  {stat('Pass rate', passRate !== null ? `${passRate}%` : null)}
                </>
              )
            })()}
          </div>

          {/* Domain Performance */}
          {analyticsDomains && Object.keys(analyticsDomains).length > 0 && (() => {
            const entries = Object.entries(analyticsDomains)
              .map(([domain, v]) => ({ domain, ...v }))
              .sort((a, b) => a.avgScore - b.avgScore)
            return (
              <div className="p-4 rounded-lg bg-card/60 dark:bg-card">
                <div className="font-semibold mb-3">Domain Performance</div>
                <div className="space-y-3">
                  {entries.map(({ domain, avgScore, correct, total, attemptCount }) => {
                    const label = avgScore >= passMark ? 'Strong' : avgScore >= 40 ? 'Needs Work' : 'Weak'
                    const isStrong = avgScore >= passMark
                    const isWarn = !isStrong && avgScore >= 40
                    const labelColor = isStrong ? 'var(--color-correct-2)' : isWarn ? '#f59e0b' : 'var(--color-incorrect-2)'
                    const barBg = isStrong
                      ? 'linear-gradient(90deg, var(--color-correct), var(--color-correct-2))'
                      : isWarn
                        ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                        : 'linear-gradient(90deg, var(--color-incorrect), var(--color-incorrect-2))'
                    return (
                      <div key={domain}>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm mb-1 gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="font-medium truncate text-sm" style={{ minWidth: 0 }}>{domain}</div>
                            <div className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: labelColor, backgroundColor: `${labelColor}26` }}>{label}</div>
                          </div>
                          <div className="text-xs text-muted-foreground sm:ml-4">{avgScore}% ({correct}/{total} across {attemptCount} attempt{attemptCount !== 1 ? 's' : ''})</div>
                        </div>
                        <div className="w-full h-2 sm:h-3 bg-accent/60 rounded overflow-hidden">
                          <div className="h-full rounded transition-all" style={{ width: `${avgScore}%`, background: barBg }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Previous version attempts */}
          {predecessorCode && (
            <div className="p-4 rounded-lg bg-card/60 dark:bg-card">
              <button
                className="flex items-center gap-2 text-sm font-semibold w-full text-left"
                onClick={() => {
                  const next = !showPrev
                  setShowPrev(next)
                  if (next && prevAttempts === null) void loadPrevVersions(predecessorCode)
                }}
              >
                <span className={`transition-transform ${showPrev ? 'rotate-90' : ''}`}>▶</span>
                Show previous version attempts ({predecessorCode})
              </button>
              {showPrev && (
                <div className="mt-3">
                  {prevLoading ? (
                    <div className="text-sm text-muted-foreground">Loading…</div>
                  ) : prevAttempts === null ? null : prevAttempts.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No attempts for {predecessorCode}.</div>
                  ) : (
                    <>
                      <ScoreHistoryChart data={prevScores} passMark={passMark} showEmptyText={false} />
                      <ul className="space-y-2 text-sm mt-3">
                        {prevAttempts
                          .slice()
                          .sort((a: any, b: any) => String(b.finishedAt || b.startedAt || '').localeCompare(String(a.finishedAt || a.startedAt || '')))
                          .map((a: any) => (
                            <li key={a.attemptId} className="flex items-center justify-between gap-3 opacity-80">
                              <div className="min-w-0">
                                <div className="font-medium truncate">
                                  {a.finishedAt
                                    ? `Finished: ${new Date(a.finishedAt).toLocaleString()}`
                                    : `Started: ${a.startedAt ? new Date(a.startedAt).toLocaleString() : '-'}`}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {typeof a.score === 'number'
                                    ? (() => {
                                        const ratio = (typeof a.correctCount === 'number' && typeof a.total === 'number') ? ` (${a.correctCount}/${a.total})` : ''
                                        return `${a.score}%${ratio} - ${a.score >= passMark ? 'pass' : 'fail'}`
                                      })()
                                    : (a.finishedAt ? '-' : `${a.answersCount ?? 0} answers`)}
                                </div>
                              </div>
                              <button
                                className="px-2 py-1 rounded bg-accent text-sm flex-shrink-0"
                                onClick={async () => {
                                  try {
                                    const res = await authFetch(`/attempts/${a.attemptId}`)
                                    if (res.ok) {
                                      const d = await res.json()
                                      const computed = computeDerivedAttempt(d, Array.isArray(d.questions) ? d.questions : questions)
                                      setAttemptData(computed)
                                      if (Array.isArray(computed.questions)) setQuestions(computed.questions)
                                      setSelected(d.examCode)
                                      setRoute('home')
                                    } else {
                                      showToast(await res.text(), 'error')
                                    }
                                  } catch (err) {
                                    showToast(String(err), 'error')
                                  }
                                }}
                              >
                                View
                              </button>
                            </li>
                          ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Previous Scores — collapsible */}
          <div className="rounded-lg bg-card/60 dark:bg-card overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/20 transition-colors"
              onClick={() => setShowScores(s => !s)}
              aria-expanded={showScores}
            >
              <span className="font-semibold text-sm">Previous Scores</span>
              <div className="flex items-center gap-2">
                {analyticsAttempts !== null && analyticsAttempts.length > 0 && (
                  <span className="text-xs text-muted-foreground">{analyticsAttempts.length} attempt{analyticsAttempts.length !== 1 ? 's' : ''} — click to {showScores ? 'hide' : 'expand'}</span>
                )}
                {showScores ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </div>
            </button>
            {showScores && (
              <div className="px-4 pb-4">
                {analyticsAttempts === null ? (
                  <div className="text-sm text-muted-foreground">Loading…</div>
                ) : analyticsAttempts.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No attempts yet for this exam.</div>
                ) : (() => {
                  const sorted = analyticsAttempts.slice().sort((a: any, b: any) => {
                    const ta = a.finishedAt || a.startedAt || ''
                    const tb = b.finishedAt || b.startedAt || ''
                    return String(tb).localeCompare(String(ta))
                  })
                  const totalPages = Math.ceil(sorted.length / SCORES_PAGE_SIZE)
                  const page = Math.min(scoresPage, totalPages - 1)
                  const pageItems = sorted.slice(page * SCORES_PAGE_SIZE, (page + 1) * SCORES_PAGE_SIZE)
                  const gridCols = '5rem minmax(0,1fr) 3.5rem 2rem 4.5rem'
                  return (
                    <>
                      {/* Desktop header — hidden on mobile */}
                      <div
                        className="hidden sm:grid items-center gap-x-3 pb-1.5 mb-1 border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wide"
                        style={{ gridTemplateColumns: gridCols }}
                      >
                        <span>Result</span>
                        <span>Date</span>
                        <span className="text-center">Correct</span>
                        <span className="text-center">Del</span>
                        <span className="text-center">View</span>
                      </div>
                      <ul className="divide-y divide-border">
                        {pageItems.map((a: any) => {
                          const finished = !!a.finishedAt
                          const hasScore = typeof a.score === 'number'
                          const pass = hasScore && a.score >= passMark
                          const ratio = (hasScore && typeof a.correctCount === 'number' && typeof a.total === 'number')
                            ? `${a.correctCount}/${a.total}`
                            : null
                          const dateStr = finished
                            ? new Date(a.finishedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                            : a.startedAt
                              ? new Date(a.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                              : '-'

                          const canDelete = Number(a.answersCount) === 0

                          const scorePill = hasScore ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums whitespace-nowrap w-fit
                              ${pass ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'}`}>
                              {a.score}% <span className="opacity-70">{pass ? 'pass' : 'fail'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground whitespace-nowrap w-fit">
                              {finished ? '—' : 'in progress'}
                            </span>
                          )

                          const dateEl = (
                            <span className="min-w-0 text-sm text-foreground truncate flex items-center gap-1.5">
                              <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="truncate">{dateStr}</span>
                            </span>
                          )

                          const ratioEl = (
                            <span className="text-xs text-muted-foreground tabular-nums text-center">{ratio ?? '—'}</span>
                          )

                          const deleteBtn = (
                            <button
                              className={`p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-40 justify-self-center ${canDelete ? '' : 'invisible'}`}
                              disabled={!canDelete || deletingAttemptId === a.attemptId}
                              title="Delete attempt"
                              onClick={() => {
                                if (!canDelete) return
                                const label = finished
                                  ? `Finished ${new Date(a.finishedAt).toLocaleString()}`
                                  : `Started ${a.startedAt ? new Date(a.startedAt).toLocaleString() : ''}`
                                setDeleteTarget({ attemptId: a.attemptId, label })
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )

                          const viewBtn = (
                            <button
                              className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary/80 transition-colors justify-self-center w-full"
                              title="View attempt"
                              onClick={async () => {
                                try {
                                  const res = await authFetch(`/attempts/${a.attemptId}`)
                                  if (res.ok) {
                                    const d = await res.json()
                                    const computed = computeDerivedAttempt(d, Array.isArray(d.questions) ? d.questions : questions)
                                    setAttemptData(computed)
                                    if (Array.isArray(computed.questions)) setQuestions(computed.questions)
                                    setSelected(d.examCode)
                                    setRoute('home')
                                  } else {
                                    const t = await res.text()
                                    showToast(t, 'error')
                                  }
                                } catch (err) {
                                  console.error(err)
                                  showToast(String(err), 'error')
                                }
                              }}
                            >
                              <Eye className="w-3.5 h-3.5" />View
                            </button>
                          )

                          return (
                            <li key={a.attemptId} className="py-2.5 first:pt-0">
                              {/* Desktop row */}
                              <div className="hidden sm:grid items-center gap-x-3" style={{ gridTemplateColumns: gridCols }}>
                                {scorePill}
                                {dateEl}
                                {ratioEl}
                                {deleteBtn}
                                {viewBtn}
                              </div>
                              {/* Mobile row — two rows stacked */}
                              <div className="sm:hidden flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {scorePill}
                                  {dateEl}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <span className="text-xs text-muted-foreground tabular-nums mr-1">{ratio ?? ''}</span>
                                  {deleteBtn}
                                  {viewBtn}
                                </div>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                          <button
                            onClick={() => setScoresPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted/40 disabled:opacity-30"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />Prev
                          </button>
                          <span>{page + 1} / {totalPages}</span>
                          <button
                            onClick={() => setScoresPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={page === totalPages - 1}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-muted/40 disabled:opacity-30"
                          >
                            Next<ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete attempt confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteTarget(null)} />
          <div className="relative bg-card p-6 rounded max-w-sm w-full mx-4 shadow-lg">
            <h3 className="text-lg font-semibold mb-2">Delete attempt?</h3>
            <p className="text-sm text-muted-foreground mb-1">{deleteTarget.label}</p>
            <p className="text-sm text-muted-foreground mb-4">This attempt has 0 answers and cannot be recovered.</p>
            <div className="flex items-center justify-end gap-3">
              <button
                className="px-3 py-1 rounded bg-accent text-muted-foreground hover:bg-accent transition"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700 transition inline-flex items-center gap-2"
                disabled={deletingAttemptId === deleteTarget.attemptId}
                onClick={async () => {
                  if (!selected) return
                  const { attemptId: aid } = deleteTarget
                  setDeleteTarget(null)
                  setDeletingAttemptId(aid)
                  try {
                    const res = await authFetch(`/attempts/${aid}`, { method: 'DELETE' })
                    if (!res.ok) {
                      const t = await res.text().catch(() => 'delete failed')
                      if (res.status === 404) { await fetchScoreHistory(selected); return }
                      showToast(t, 'error')
                      return
                    }
                    if (attemptId === aid) {
                      try { localStorage.removeItem(`attempt:${selected}`) } catch {}
                      setAttemptId(null)
                      setAttemptData(null)
                      setExamStarted(false)
                    }
                    await fetchScoreHistory(selected)
                  } catch (err) {
                    console.error(err)
                    showToast(String(err), 'error')
                  } finally {
                    setDeletingAttemptId(null)
                  }
                }}
              >
                <Trash2 className="w-4 h-4" />Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

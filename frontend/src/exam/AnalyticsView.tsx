import { useState, useCallback } from 'react'
import { Download, Trash2, ChevronDown, ChevronRight, Search } from 'lucide-react'
import { useExam } from './ExamContext'
import { computeDerivedAttempt } from './utils'
import { ScoreHistoryChart } from './ScoreHistoryChart'

export function AnalyticsView() {
  const {
    selected, selectedMeta, exams, providers, scoreHistory, loadingScoreHistory,
    analyticsAttempts, analyticsDomains, deletingAttemptId, setDeletingAttemptId,
    gamState, fetchScoreHistory, downloadAnalyticsCSV, setupExamFromMeta,
    setRoute, authFetch, setAttemptData, setSelected, questions, setQuestions,
    attemptId, setAttemptId, showToast, setExamStarted, userTier,
    examStarted, anySavedExam, savedProgress,
  } = useExam()

  const passMark = typeof selectedMeta?.passMark === 'number' ? selectedMeta.passMark : 70

  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

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
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            {selected ? (
              <>
                {selectedMeta?.title ?? selected}
                {selectedMeta?.code ? ` (${selectedMeta.code})` : ''}
              </>
            ) : (
              'Select an exam below to view analytics'
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selected ? (
            <button className="px-3 py-1 rounded bg-accent text-sm" onClick={() => setSelected(null)}>
              ← All exams
            </button>
          ) : (
            <button className="px-3 py-1 rounded bg-accent text-sm" onClick={() => setRoute('practice')}>
              Back
            </button>
          )}
          {selected && (
            <>
              {userTier && userTier !== 'visitor' && (
              <button
                className="px-3 py-1 rounded bg-accent text-sm inline-flex items-center gap-1.5 hover:bg-accent transition-colors"
                onClick={downloadAnalyticsCSV}
                title="Download analytics as CSV"
              >
                <Download className="w-3.5 h-3.5" />
                CSV
              </button>
              )}
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
              {allCollapsed() ? 'Show all' : 'Hide all'}
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
                    {filteredExams.map((ex: any) => (
                      <div
                        key={ex.code}
                        className="p-4 rounded-lg border border-border bg-card text-card-foreground shadow-sm relative flex flex-col cursor-pointer hover:border-primary transition-colors"
                        onClick={() => {
                          setSelected(ex.code)
                          void fetchScoreHistory(ex.code)
                        }}
                      >
                        <div className="flex-1">
                          <div className="font-medium">{ex.title ?? ex.code}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">{ex.code}</span>
                          </div>
                        </div>
                        {ex.logo && (
                          ex.logoHref ? (
                            <a href={ex.logoHref} title="Amazon.com Inc., Apache License 2.0 <http://www.apache.org/licenses/LICENSE-2.0>, via Wikimedia Commons" target="_blank" rel="noopener noreferrer" className="absolute bottom-2 right-2 inline-flex items-center justify-center bg-background rounded-full p-1 shadow-sm" aria-label={`${ex.provider ?? 'Provider'} logo link`} onClick={e => e.stopPropagation()}>
                              <img src={ex.logo} alt={`${ex.provider ?? 'Provider'} logo`} className="h-6 w-auto" style={{ objectFit: 'contain' }} />
                            </a>
                          ) : (
                            <div className="absolute bottom-2 right-2 inline-flex items-center justify-center bg-background rounded-full p-1 shadow-sm" aria-hidden>
                              <img src={ex.logo} alt={`${ex.provider ?? 'Provider'} logo`} className="h-6 w-auto" style={{ objectFit: 'contain' }} />
                            </div>
                          )
                        )}
                      </div>
                    ))}
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
          <div className="p-4 rounded bg-card/60 dark:bg-card">
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
                <div className="p-3 rounded bg-card/60 dark:bg-card border border-border/60 dark:border-border/60">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-lg font-semibold">{value ?? '—'}</div>
                </div>
              )

              return (
                <>
                  {stat('Attempts / Finished', `${total} / ${finished}`)}
                  {stat('Avg score', avg !== null ? `${avg}%` : null)}
                  {stat('Best / Last', (best !== null || lastScore !== null) ? `${best ?? '—'}% / ${Number.isFinite(lastScore) ? `${lastScore}%` : '—'}` : null)}
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
              <div className="p-4 rounded bg-card/60 dark:bg-card">
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
                    const mastery = gamState.domainMastery[domain]
                    const tierIcon = mastery?.tier === 'gold' ? '🥇' : mastery?.tier === 'silver' ? '🥈' : mastery?.tier === 'bronze' ? '🥉' : null
                    return (
                      <div key={domain}>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm mb-1 gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {tierIcon && <span className="text-sm" title={`${mastery?.tier} mastery`}>{tierIcon}</span>}
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
            <div className="p-4 rounded bg-card/60 dark:bg-card">
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
                                    : `Started: ${a.startedAt ? new Date(a.startedAt).toLocaleString() : '—'}`}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {typeof a.score === 'number'
                                    ? (() => {
                                        const ratio = (typeof a.correctCount === 'number' && typeof a.total === 'number') ? ` (${a.correctCount}/${a.total})` : ''
                                        return `${a.score}%${ratio} — ${a.score >= passMark ? 'pass' : 'fail'}`
                                      })()
                                    : (a.finishedAt ? '—' : `${a.answersCount ?? 0} answers`)}
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

          {/* Attempts list */}
          <div className="p-4 rounded bg-card/60 dark:bg-card">
            <div className="font-semibold mb-2">Attempts</div>
            {analyticsAttempts === null ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : analyticsAttempts.length === 0 ? (
              <div className="text-sm text-muted-foreground">No attempts yet for this exam.</div>
            ) : (
              <ul className="space-y-2 text-sm">
                {analyticsAttempts
                  .slice()
                  .sort((a: any, b: any) => {
                    const ta = a.finishedAt || a.startedAt || ''
                    const tb = b.finishedAt || b.startedAt || ''
                    return String(tb).localeCompare(String(ta))
                  })
                  .map((a: any) => (
                    <li key={a.attemptId} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {a.finishedAt
                            ? `Finished: ${new Date(a.finishedAt).toLocaleString()}`
                            : `Started: ${a.startedAt ? new Date(a.startedAt).toLocaleString() : '—'}`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {typeof a.score === 'number'
                            ? (() => {
                              const ratio = (typeof a.correctCount === 'number' && typeof a.total === 'number') ? ` (${a.correctCount}/${a.total})` : ''
                              const pass = a.score >= passMark
                              return `${a.score}%${ratio} — ${pass ? 'pass' : 'fail'}`
                            })()
                            : (a.finishedAt ? '—' : `${a.answersCount ?? 0} answers`)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {(Number(a.answersCount) === 0) && (
                          <button
                            className="px-2 py-1 rounded bg-red-600 text-white text-sm disabled:opacity-50 inline-flex items-center gap-2"
                            disabled={deletingAttemptId === a.attemptId}
                            title="Delete attempt"
                            onClick={async () => {
                              if (!selected) return
                              const ok = window.confirm('Delete this attempt? It has 0 answers and cannot be recovered.')
                              if (!ok) return
                              setDeletingAttemptId(a.attemptId)
                              try {
                                const res = await authFetch(`/attempts/${a.attemptId}`, { method: 'DELETE' })
                                if (!res.ok) {
                                  const t = await res.text().catch(() => 'delete failed')
                                  if (res.status === 404) { await fetchScoreHistory(selected); return }
                                  showToast(t, 'error')
                                  return
                                }
                                if (attemptId === a.attemptId) {
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
                            <Trash2 className="w-4 h-4" aria-hidden />
                            <span className="sr-only">Delete</span>
                          </button>
                        )}
                        <button
                          className="px-2 py-1 rounded bg-accent text-sm"
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
                          View
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

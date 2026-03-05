import { Download, Trash2 } from 'lucide-react'
import { useExam } from './ExamContext'
import { computeDerivedAttempt } from './utils'
import { ScoreHistoryChart } from './ScoreHistoryChart'

export function AnalyticsView() {
  const {
    selected, selectedMeta, exams, scoreHistory, loadingScoreHistory,
    analyticsAttempts, analyticsDomains, deletingAttemptId, setDeletingAttemptId,
    gamState, fetchScoreHistory, downloadAnalyticsCSV, setupExamFromMeta,
    setRoute, authFetch, setAttemptData, setSelected, questions, setQuestions,
    attemptId, setAttemptId, showToast, setExamStarted,
  } = useExam()

  const passMark = typeof selectedMeta?.passMark === 'number' ? selectedMeta.passMark : 70

  return (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Analytics</h2>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            {selected ? (
              <>
                {selectedMeta?.title ?? selected}
                {selectedMeta?.code ? ` (${selectedMeta.code})` : ''}
              </>
            ) : (
              'Choose an exam from Practice Exams'
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-1 rounded bg-accent text-sm" onClick={() => setRoute('practice')}>
            Back
          </button>
          {selected && (
            <>
              <button
                className="px-3 py-1 rounded bg-accent text-sm inline-flex items-center gap-1.5 hover:bg-accent transition-colors"
                onClick={downloadAnalyticsCSV}
                title="Download analytics as CSV"
              >
                <Download className="w-3.5 h-3.5" />
                CSV
              </button>
              <button
                className="px-3 py-1 rounded bg-primary text-white text-sm"
                onClick={() => {
                  const meta = selectedMeta || exams.find((e) => String(e.code).toLowerCase() === String(selected).toLowerCase())
                  if (meta) setupExamFromMeta(meta)
                  else setRoute('home')
                }}
              >
                Setup Exam
              </button>
            </>
          )}
        </div>
      </div>

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

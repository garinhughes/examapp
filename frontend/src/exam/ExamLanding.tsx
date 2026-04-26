import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp } from 'lucide-react'
import { useExam } from './ExamContext'
import { ExamSetup } from './ExamSetup'
import { apiUrl } from '@/apiBase'

type AttemptSummary = {
  examCode: string
  lastScore: number | null
  bestScore: number | null
  avgScore: number | null
  lastAttemptAt: string | null
  attemptCount: number
}

type ScoreEntry = {
  attemptId: string
  finishedAt: string | null
  startedAt: string | null
  score: number
  correctCount: number | null
  total: number | null
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - Date.parse(iso)
  const day = 24 * 60 * 60 * 1000
  if (diff < 60 * 60 * 1000) return 'just now'
  if (diff < day) return `${Math.round(diff / (60 * 60 * 1000))}h ago`
  if (diff < 7 * day) return `${Math.round(diff / day)}d ago`
  return new Date(iso).toLocaleDateString()
}

function MiniDonut({ score, passed, size = 52 }: { score: number; passed: boolean; size?: number }) {
  const stroke = 6
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = (score / 100) * c
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
          className={passed ? 'stroke-emerald-500' : 'stroke-destructive'}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-[11px] font-bold tabular-nums ${passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
          {score}%
        </span>
      </div>
    </div>
  )
}

export function ExamLanding() {
  const navigate = useNavigate()
  const { selected, selectedMeta, user, authFetch, setRoute } = useExam()

  const [summary, setSummary] = useState<AttemptSummary | null>(null)
  const [recentScores, setRecentScores] = useState<ScoreEntry[]>([])

  useEffect(() => {
    if (!user || !selected) return
    let cancelled = false
    ;(async () => {
      try {
        const [summaryRes, scoresRes] = await Promise.all([
          authFetch(apiUrl('/attempts?summary=1')),
          authFetch(apiUrl(`/analytics/exam/${encodeURIComponent(selected)}/scores`)),
        ])
        if (cancelled) return

        if (summaryRes.ok) {
          const d = await summaryRes.json()
          const list: AttemptSummary[] = Array.isArray(d?.summaries) ? d.summaries : []
          setSummary(list.find((s) => s.examCode?.toLowerCase() === selected.toLowerCase()) ?? null)
        }

        if (scoresRes.ok) {
          const d = await scoresRes.json()
          // scores are chronological ascending — reverse to get latest first
          const scores: ScoreEntry[] = Array.isArray(d?.scores) ? [...d.scores].reverse() : []
          setRecentScores(scores.slice(0, 3))
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [user, selected])

  if (!selected) return null

  const passMark = typeof selectedMeta?.passMark === 'number' ? selectedMeta.passMark : 70

  return (
    <div className="space-y-6">
      <ExamSetup />

      {summary && summary.attemptCount > 0 && (
        <div className="p-4 rounded-lg border border-border bg-card space-y-4">
          {/* Header with badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <TrendingUp className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-semibold">Score history</span>
            <span className="text-xs text-muted-foreground">{summary.attemptCount} attempt{summary.attemptCount !== 1 ? 's' : ''}</span>
            <div className="flex items-center gap-2 ml-auto">
              {summary.lastScore !== null && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${summary.lastScore >= passMark ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' : 'bg-destructive/10 text-destructive border-destructive/30'}`}>
                  Last {summary.lastScore}%
                </span>
              )}
              {summary.bestScore !== null && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${summary.bestScore >= passMark ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' : 'bg-destructive/10 text-destructive border-destructive/30'}`}>
                  Best {summary.bestScore}%
                </span>
              )}
              {summary.avgScore !== null && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full border bg-muted text-muted-foreground border-border">
                  Avg {summary.avgScore}%
                </span>
              )}
            </div>
          </div>

          {/* Latest 3 attempts */}
          {recentScores.length > 0 && (
            <div className="space-y-1.5">
              {recentScores.map((s) => {
                const passed = s.score >= passMark
                const date = s.finishedAt ?? s.startedAt ?? null
                return (
                  <button
                    key={s.attemptId}
                    onClick={() => selected && navigate(`/exams/${selected}/attempt/${s.attemptId}`)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md bg-muted/40 hover:bg-muted/70 transition-colors text-left"
                  >
                    <MiniDonut score={s.score} passed={passed} size={44} />
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-semibold ${passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
                        {passed ? 'Passed' : 'Failed'}
                        {s.correctCount !== null && s.total !== null && (
                          <span className="ml-1.5 font-normal text-muted-foreground">{s.correctCount}/{s.total}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{formatDate(date)}</div>
                    </div>
                    <span className="text-muted-foreground text-xs">›</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* View all scores */}
          <button
            onClick={() => setRoute('exam-history')}
            className="w-full py-1.5 rounded-md bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
          >
            View all scores
          </button>
        </div>
      )}
    </div>
  )
}

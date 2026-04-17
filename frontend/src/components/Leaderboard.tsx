import { useEffect, useState } from 'react'
import { Trophy, Flame } from 'lucide-react'
import { useAuthFetch } from '../auth/useAuthFetch'
import { useGamification } from '../gamification/GamificationContext'

interface LeaderboardEntry {
  rank: number
  name: string
  username?: string
  xp: number
  level: number
  streak: number
  isYou: boolean
}

export default function Leaderboard() {
  const { state } = useGamification()
  const authFetch = useAuthFetch()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'xp' | 'streak'>('xp')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 10

  useEffect(() => {
    setLoading(true)
    authFetch('/gamification/leaderboard')
      .then((r) => {
        if (!r.ok) throw new Error('not available')
        return r.json()
      })
      .then((data) => setEntries(Array.isArray(data.entries) ? data.entries : []))
      .catch(() => {
        // generate mock leaderboard from local state when backend is unavailable
        setEntries([
          { rank: 1, name: 'You', xp: state.xp, level: state.level, streak: state.streak, isYou: true },
        ])
      })
      .finally(() => setLoading(false))
  }, [authFetch, state.xp, state.level, state.streak])

  const sorted = [...entries].sort((a, b) => (tab === 'xp' ? b.xp - a.xp : b.streak - a.streak))
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
  const pageEntries = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div className="p-4 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
          <Trophy size={14} className="text-amber-500" />
          Leaderboard
        </h3>
        <div className="flex gap-1 bg-muted p-0.5 rounded">
          <button
            onClick={() => { setTab('xp'); setPage(0) }}
            className={`px-2 py-0.5 rounded text-xs font-medium ${tab === 'xp' ? 'bg-card shadow-sm' : ''}`}
          >
            XP
          </button>
          <button
            onClick={() => { setTab('streak'); setPage(0) }}
            className={`px-2 py-0.5 rounded text-xs font-medium ${tab === 'streak' ? 'bg-card shadow-sm' : ''}`}
          >
            Streak
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-4">Loading…</div>
      ) : !state.leaderboardOptIn ? (
        <div className="text-sm text-muted-foreground text-center py-4">
          Enable leaderboard in your Account page to participate.
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-4">No entries yet. Complete exams to appear!</div>
      ) : (
        <div className="space-y-1.5">
          {pageEntries.map((e) => {
            const globalIdx = sorted.indexOf(e)
            return (
              <div
                key={globalIdx}
                className={`flex items-center gap-3 p-2 rounded-lg text-sm ${
                  e.isYou ? 'bg-primary/10 ring-1 ring-primary/40' : 'bg-muted/50'
                }`}
              >
                <span className="w-6 flex justify-center">
                  {globalIdx <= 2 ? (
                    <span
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white"
                      style={{ background: ['#f59e0b', '#9ca3af', '#cd7f32'][globalIdx] }}
                    >
                      {globalIdx + 1}
                    </span>
                  ) : (
                    <span className="font-bold text-muted-foreground text-xs">{globalIdx + 1}</span>
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="font-medium truncate block">{e.name}{e.isYou ? ' (you)' : ''}</span>
                  {e.username && <span className="text-xs text-muted-foreground truncate block">@{e.username}</span>}
                </span>
                {tab === 'xp' ? (
                  <span className="text-primary font-semibold">{e.xp.toLocaleString()} XP</span>
                ) : (
                  <span className="text-primary font-semibold flex items-center gap-1"><Flame size={13} className="text-orange-500" />{e.streak}d</span>
                )}
                <span className="text-xs text-muted-foreground">Lv{e.level}</span>
              </div>
            )
          })}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-2.5 py-1 rounded text-xs font-medium bg-muted hover:bg-muted/80 disabled:opacity-40 transition-colors"
              >
                ← Prev
              </button>
              <span className="text-xs text-muted-foreground">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="px-2.5 py-1 rounded text-xs font-medium bg-muted hover:bg-muted/80 disabled:opacity-40 transition-colors"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

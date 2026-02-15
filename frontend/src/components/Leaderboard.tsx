import { useEffect, useState } from 'react'
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

  return (
    <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">🏆 Leaderboard</h3>
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 p-0.5 rounded">
          <button
            onClick={() => setTab('xp')}
            className={`px-2 py-0.5 rounded text-xs font-medium ${tab === 'xp' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''}`}
          >
            XP
          </button>
          <button
            onClick={() => setTab('streak')}
            className={`px-2 py-0.5 rounded text-xs font-medium ${tab === 'streak' ? 'bg-white dark:bg-slate-600 shadow-sm' : ''}`}
          >
            Streak
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 text-center py-4">Loading…</div>
      ) : !state.leaderboardOptIn ? (
        <div className="text-sm text-slate-400 text-center py-4">
          Enable leaderboard in your Account page to participate.
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-sm text-slate-400 text-center py-4">No entries yet. Complete exams to appear!</div>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((e, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 p-2 rounded-lg text-sm ${
                e.isYou ? 'bg-sky-50 dark:bg-sky-900/20 ring-1 ring-sky-300 dark:ring-sky-700' : 'bg-slate-50 dark:bg-slate-700/30'
              }`}
            >
              <span className="w-6 text-center font-bold text-slate-400">
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
              </span>
              <span className="flex-1 min-w-0">
                <span className="font-medium truncate block">{e.name}{e.isYou ? ' (you)' : ''}</span>
                {e.username && <span className="text-xs text-slate-400 truncate block">@{e.username}</span>}
              </span>
              {tab === 'xp' ? (
                <span className="text-amber-500 font-semibold">{e.xp.toLocaleString()} XP</span>
              ) : (
                <span className="text-orange-500 font-semibold">🔥 {e.streak}d</span>
              )}
              <span className="text-xs text-slate-400">Lv{e.level}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

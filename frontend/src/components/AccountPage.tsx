import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useGamification } from '../gamification/GamificationContext'
import { levelFromXP } from '../gamification/types'
import { BADGES } from '../gamification/badges'
import { useEntitlements } from '../hooks/useEntitlements'

const CATEGORY_LABELS: Record<string, string> = {
  milestone: '📚 Milestones',
  score: '🎯 Score',
  streak: '🔥 Streaks',
  mastery: '🏅 Mastery',
  special: '✨ Special',
}

const TIER_COLORS: Record<string, string> = {
  none: 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
  bronze: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  silver: 'bg-slate-100 dark:bg-slate-500/20 text-slate-600 dark:text-slate-300',
  gold: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
}

export default function AccountPage() {
  const { user } = useAuth()
  const { state, toggleLeaderboard } = useGamification()
  const [tab, setTab] = useState<'overview' | 'badges' | 'mastery' | 'purchases'>('overview')
  const { level, currentXP, nextLevelXP, progress: levelProgress } = levelFromXP(state.xp)
  const { tier, tierConfig, entitlements, products, loading: entLoading } = useEntitlements()

  const earnedIds = new Set(state.badges.map((b) => b.id))

  // group badges by category
  const categories = Object.entries(
    BADGES.reduce<Record<string, typeof BADGES>>((acc, b) => {
      ;(acc[b.category] ??= []).push(b)
      return acc
    }, {})
  )

  const domainEntries = Object.values(state.domainMastery).sort((a, b) => {
    const tierOrder = { gold: 0, silver: 1, bronze: 2, none: 3 }
    return (tierOrder[a.tier] ?? 4) - (tierOrder[b.tier] ?? 4)
  })

  return (
    <div className="space-y-6">
      {/* Profile header */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-white text-2xl font-bold">
            {user?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold">{user?.name ?? 'Guest'}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{user?.email ?? ''}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-extrabold text-sky-500">Level {level}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{state.xp.toLocaleString()} XP total</div>
          </div>
        </div>

        {/* XP progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Level {level}</span>
            <span>{currentXP} / {nextLevelXP} XP</span>
            <span>Level {level + 1}</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-500 transition-all duration-500"
              style={{ width: `${levelProgress}%` }}
            />
          </div>
        </div>

        {/* Quick stats row */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="text-center p-2 rounded-lg bg-slate-50 dark:bg-slate-700/40">
            <div className="text-xl font-bold text-amber-500">🔥 {state.streak}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Day Streak</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-slate-50 dark:bg-slate-700/40">
            <div className="text-xl font-bold text-emerald-500">{state.badges.length}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Badges</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-slate-50 dark:bg-slate-700/40">
            <div className="text-xl font-bold text-purple-500">
              {Object.values(state.domainMastery).filter((d) => d.tier !== 'none').length}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Domains Mastered</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
        {(['overview', 'badges', 'mastery', 'purchases'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {t === 'overview' ? '📊 Overview' : t === 'badges' ? '🏅 Badges' : t === 'mastery' ? '🎓 Mastery' : '💳 Purchases'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Recent badges */}
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60">
            <h3 className="text-sm font-semibold mb-3 text-slate-600 dark:text-slate-300">Recent Badges</h3>
            {state.badges.length === 0 ? (
              <p className="text-sm text-slate-400">Complete exams to earn badges!</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {state.badges.slice(-6).reverse().map((eb) => {
                  const def = BADGES.find((b) => b.id === eb.id)
                  if (!def) return null
                  return (
                    <div key={eb.id} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-50 dark:bg-slate-700/40 text-sm" title={def.description}>
                      <span>{def.icon}</span>
                      <span className="font-medium">{def.name}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Leaderboard opt-in */}
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300">Leaderboard</h3>
                <p className="text-xs text-slate-400 mt-0.5">Share your XP and streak on the public leaderboard</p>
              </div>
              <button
                onClick={toggleLeaderboard}
                className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${
                  state.leaderboardOptIn ? 'bg-sky-500' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <span
                  className={`inline-block w-4 h-4 rounded-full bg-white shadow transform transition-transform mt-1 ${
                    state.leaderboardOptIn ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'badges' && (
        <div className="space-y-4">
          {categories.map(([cat, badges]) => (
            <div key={cat} className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60">
              <h3 className="text-sm font-semibold mb-3 text-slate-600 dark:text-slate-300">
                {CATEGORY_LABELS[cat] ?? cat}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {badges.map((b) => {
                  const earned = earnedIds.has(b.id)
                  const eb = state.badges.find((x) => x.id === b.id)
                  return (
                    <div
                      key={b.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
                        earned
                          ? 'border-amber-300 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-900/10'
                          : 'border-slate-200 dark:border-slate-700 opacity-50 grayscale'
                      }`}
                    >
                      <span className="text-2xl">{b.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{b.name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{b.description}</div>
                        {earned && eb && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Earned {new Date(eb.earnedAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      {earned && <span className="text-green-500 text-lg">✓</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'mastery' && (
        <div className="space-y-3">
          {domainEntries.length === 0 ? (
            <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-center">
              <p className="text-sm text-slate-400">Complete exams with domain questions to track mastery.</p>
            </div>
          ) : (
            domainEntries.map((d) => (
              <div key={d.domain} className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold truncate flex-1">{d.domain}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${TIER_COLORS[d.tier]}`}>
                    {d.tier === 'none' ? 'Unranked' : d.tier}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      d.tier === 'gold'
                        ? 'bg-yellow-400'
                        : d.tier === 'silver'
                          ? 'bg-slate-400'
                          : d.tier === 'bronze'
                            ? 'bg-amber-500'
                            : 'bg-sky-400'
                    }`}
                    style={{ width: `${d.progress}%` }}
                  />
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {d.recentScores.length} attempt{d.recentScores.length !== 1 ? 's' : ''} tracked
                  {d.recentScores.length > 0 &&
                    ` · Avg ${Math.round(d.recentScores.reduce((a, b) => a + b, 0) / d.recentScores.length)}%`}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'purchases' && (
        <div className="space-y-4">
          {/* Current tier */}
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60">
            <h3 className="text-sm font-semibold mb-2 text-slate-600 dark:text-slate-300">Your Plan</h3>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-bold capitalize ${
                tier === 'paying'
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                  : tier === 'registered'
                    ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
              }`}>
                {tier}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {tierConfig.questionLimit === null
                  ? 'Unlimited questions'
                  : `Up to ${tierConfig.questionLimit} questions per exam`}
              </span>
            </div>
            {tier !== 'paying' && (
              <p className="text-xs text-slate-400 mt-2">
                Upgrade to unlock all questions, exports, leaderboard, and more.
              </p>
            )}
          </div>

          {/* Feature access summary */}
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60">
            <h3 className="text-sm font-semibold mb-3 text-slate-600 dark:text-slate-300">Feature Access</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                { label: 'Review & explanations', on: tierConfig.reviewEnabled },
                { label: 'CSV / PDF export', on: tierConfig.exportEnabled },
                { label: 'Leaderboard', on: tierConfig.leaderboardEnabled },
                { label: 'Domain mastery history', on: tierConfig.domainMasteryEnabled },
              ].map((f) => (
                <div key={f.label} className="flex items-center gap-2">
                  <span className={f.on ? 'text-emerald-500' : 'text-slate-400'}>
                    {f.on ? '✓' : '—'}
                  </span>
                  <span className={f.on ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}>
                    {f.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Active entitlements */}
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60">
            <h3 className="text-sm font-semibold mb-3 text-slate-600 dark:text-slate-300">Purchases</h3>
            {entLoading ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : entitlements.length === 0 ? (
              <p className="text-sm text-slate-400">No purchases yet.</p>
            ) : (
              <div className="space-y-2">
                {entitlements.map((pid) => {
                  const prod = products.find((p) => p.productId === pid)
                  return (
                    <div key={pid} className="flex items-center justify-between p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10">
                      <div>
                        <div className="text-sm font-medium">{prod?.label ?? pid}</div>
                        {prod?.description && (
                          <div className="text-xs text-slate-400">{prod.description}</div>
                        )}
                      </div>
                      <span className="text-emerald-500 text-sm font-semibold">Active</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Manage / Stripe portal stub */}
          <div className="flex flex-wrap gap-3">
            {entitlements.some((id) => id.startsWith('sub:')) && (
              <button
                onClick={() => alert('Stripe Customer Portal will be available soon.')}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Manage Subscription
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

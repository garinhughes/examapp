import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useAuthFetch } from '../auth/useAuthFetch'
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
  journey: '🗺️ Journey',
}


export default function AccountPage() {
  const { user } = useAuth()
  const authFetch = useAuthFetch()
  const { state, toggleLeaderboard } = useGamification()
  const [tab, setTab] = useState<'overview' | 'badges' | 'purchases'>('overview')
  const { level, currentXP, nextLevelXP, progress: levelProgress } = levelFromXP(state.xp)
  const { tier, tierConfig, entitlements, products, loading: entLoading } = useEntitlements()

  // ── Username state ──
  const [currentUsername, setCurrentUsername] = useState<string | null>(null)
  const [usernameInput, setUsernameInput] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'saving' | 'saved' | 'error'>('idle')
  const [usernameMessage, setUsernameMessage] = useState('')
  const [editingUsername, setEditingUsername] = useState(false)

  // Fetch current username on mount
  useEffect(() => {
    authFetch('/username')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.username) {
          setCurrentUsername(data.username)
          setUsernameInput(data.username)
        } else {
          // If the user has no username yet, enter edit mode so they can claim one
          setEditingUsername(true)
        }
      })
      .catch(() => {})
  }, [authFetch])

  // Debounced availability check
  useEffect(() => {
    // If the user already has a username and is not actively editing, skip checks
    if (!editingUsername && currentUsername) {
      setUsernameStatus('idle')
      setUsernameMessage('')
      return
    }

    const trimmed = usernameInput.trim()
    if (!trimmed || trimmed === currentUsername) {
      setUsernameStatus('idle')
      setUsernameMessage('')
      return
    }
    if (trimmed.length < 3) {
      setUsernameStatus('invalid')
      setUsernameMessage('Username must be at least 3 characters.')
      return
    }

    setUsernameStatus('checking')
    const timer = setTimeout(() => {
      authFetch(`/username/check/${encodeURIComponent(trimmed)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.available) {
            setUsernameStatus('available')
            setUsernameMessage('Username is available!')
          } else {
            setUsernameStatus(data.reason?.includes('taken') ? 'taken' : 'invalid')
            setUsernameMessage(data.reason || 'Not available.')
          }
        })
        .catch(() => {
          setUsernameStatus('error')
          setUsernameMessage('Could not check availability.')
        })
    }, 400)

    return () => clearTimeout(timer)
  }, [usernameInput, editingUsername, currentUsername, authFetch])

  const saveUsername = useCallback(async () => {
    const trimmed = usernameInput.trim()
    if (!trimmed || trimmed === currentUsername) return
    setUsernameStatus('saving')
    try {
      const res = await authFetch('/username', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: trimmed }),
      })
      if (res.ok) {
        const data = await res.json()
        setCurrentUsername(data.username)
        setUsernameStatus('saved')
        setUsernameMessage('Username saved!')
        setEditingUsername(false)
      } else {
        const err = await res.json().catch(() => ({ message: 'Failed to save.' }))
        setUsernameStatus('error')
        setUsernameMessage(err.message || 'Failed to save.')
      }
    } catch {
      setUsernameStatus('error')
      setUsernameMessage('Network error.')
    }
  }, [usernameInput, currentUsername, authFetch])

  const earnedIds = new Set(state.badges.map((b) => b.id))

  // group badges by category
  const categories = Object.entries(
    BADGES.reduce<Record<string, typeof BADGES>>((acc, b) => {
      ;(acc[b.category] ??= []).push(b)
      return acc
    }, {})
  )

  return (
    <div className="space-y-6">
      {/* Profile header */}
      <div className="p-5 rounded-xl border border-border bg-card">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-white text-2xl font-bold">
            {user?.name?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold">{currentUsername ?? user?.name ?? 'Guest'}</h2>
            <p className="text-sm text-muted-foreground">{user?.email ?? ''}</p>
            {currentUsername && (
              <p className="text-xs text-muted-foreground mt-0.5">@{currentUsername}</p>
            )}
          </div>
          <div className="text-right">
            <div className="text-2xl font-extrabold text-primary">Level {level}</div>
            <div className="text-xs text-muted-foreground">{state.xp.toLocaleString()} XP total</div>
          </div>
        </div>

        {/* XP progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Level {level}</span>
            <span>{currentXP} / {nextLevelXP} XP</span>
            <span>Level {level + 1}</span>
          </div>
          <div className="h-2.5 rounded-full bg-accent overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${levelProgress}%` }}
            />
          </div>
        </div>

        {/* Quick stats row */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <div className="text-xl font-bold text-primary">🔥 {state.streak}</div>
            <div className="text-xs text-muted-foreground">Day Streak</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <div className="text-xl font-bold text-emerald-500">{state.badges.length}</div>
            <div className="text-xs text-muted-foreground">Achievements</div>
          </div>
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <div className="text-xl font-bold text-purple-500">
              {Object.values(state.domainMastery).filter((d) => d.tier !== 'none').length}
            </div>
            <div className="text-xs text-muted-foreground">Domains Mastered</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg">
        {(['overview', 'badges', 'purchases'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-card shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground dark:hover:text-foreground'
            }`}
          >
            {t === 'overview' ? '📊 Overview' : t === 'badges' ? '🏅 Achievements' : '💳 Purchases'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Username */}
          <div className="p-4 rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground">Username</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your public display name on the leaderboard. 3–20 characters, letters/numbers/underscores/hyphens.
                </p>
              </div>
              {currentUsername && !editingUsername && (
                <button
                  onClick={() => setEditingUsername(true)}
                  className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground hover:text-foreground dark:hover:text-foreground"
                >
                  Edit
                </button>
              )}
            </div>

            {(!currentUsername || editingUsername) ? (
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      placeholder="Choose a username…"
                      maxLength={20}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                    />
                    {usernameStatus === 'checking' && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">checking…</span>
                    )}
                    {usernameStatus === 'available' && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">✓</span>
                    )}
                    {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-red-500">✗</span>
                    )}
                  </div>
                  <button
                    onClick={saveUsername}
                    disabled={usernameStatus !== 'available' || usernameInput.trim() === currentUsername}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/80 transition-colors"
                  >
                    {usernameStatus === 'saving' ? 'Saving…' : currentUsername ? 'Update' : 'Claim'}
                  </button>
                  {editingUsername && (
                    <button
                      onClick={() => {
                        setEditingUsername(false)
                        setUsernameInput(currentUsername ?? '')
                        setUsernameStatus('idle')
                        setUsernameMessage('')
                      }}
                      className="px-3 py-2 rounded-lg bg-accent text-sm text-muted-foreground"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                {usernameMessage && (
                  <p className={`text-xs ${
                    usernameStatus === 'available' || usernameStatus === 'saved'
                      ? 'text-green-500'
                      : usernameStatus === 'checking' || usernameStatus === 'idle'
                        ? 'text-muted-foreground'
                        : 'text-red-500'
                  }`}>
                    {usernameMessage}
                  </p>
                )}
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm font-mono font-semibold text-primary">@{currentUsername}</span>
                {usernameStatus === 'saved' && (
                  <span className="text-xs text-green-500">✓ Saved</span>
                )}
              </div>
            )}
          </div>

          {/* Recent badges */}
          <div className="p-4 rounded-lg border border-border bg-card">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Recent Achievements</h3>
            {state.badges.length === 0 ? (
              <p className="text-sm text-muted-foreground">Complete exams to earn achievements!</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {state.badges.slice(-6).reverse().map((eb) => {
                  const def = BADGES.find((b) => b.id === eb.id)
                  if (!def) return null
                  return (
                    <div key={eb.id} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50 text-sm" title={def.description}>
                      <span>{def.icon}</span>
                      <span className="font-medium">{def.name}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Leaderboard opt-in */}
          <div className="p-4 rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground">Leaderboard</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Share your XP and streak on the public leaderboard</p>
              </div>
              <button
                onClick={toggleLeaderboard}
                className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${
                  state.leaderboardOptIn ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span
                  className={`inline-block w-4 h-4 rounded-full bg-card shadow transform transition-transform mt-1 ${
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
            <div key={cat} className="p-4 rounded-lg border border-border bg-card">
              <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
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
                          ? 'border-primary/30 dark:border-primary/30 bg-primary/5'
                          : 'border-border opacity-50 grayscale'
                      }`}
                    >
                      <span className="text-2xl">{b.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{b.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{b.description}</div>
                        {earned && eb && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
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

      {tab === 'purchases' && (
        <div className="space-y-4">
          {/* Current tier */}
          <div className="p-4 rounded-lg border border-border bg-card">
            <h3 className="text-sm font-semibold mb-2 text-muted-foreground">Your Plan</h3>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-bold capitalize ${
                tier === 'paying'
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                  : tier === 'registered'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
              }`}>
                {tier}
              </span>
              <span className="text-sm text-muted-foreground">
                {tierConfig.questionLimit === null
                  ? 'Unlimited questions'
                  : `Up to ${tierConfig.questionLimit} questions per exam`}
              </span>
            </div>
            {tier !== 'paying' && (
              <p className="text-xs text-muted-foreground mt-2">
                Upgrade to unlock all questions, exports, leaderboard, and more.
              </p>
            )}
          </div>

          {/* Feature access summary */}
          <div className="p-4 rounded-lg border border-border bg-card">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Feature Access</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                { label: 'Review & explanations', on: tierConfig.reviewEnabled },
                { label: 'CSV / PDF export', on: tierConfig.exportEnabled },
                { label: 'Leaderboard', on: tierConfig.leaderboardEnabled },
                { label: 'Domain mastery history', on: tierConfig.domainMasteryEnabled },
              ].map((f) => (
                <div key={f.label} className="flex items-center gap-2">
                  <span className={f.on ? 'text-emerald-500' : 'text-muted-foreground'}>
                    {f.on ? '✓' : '—'}
                  </span>
                  <span className={f.on ? 'text-foreground' : 'text-muted-foreground dark:text-muted-foreground'}>
                    {f.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Active entitlements */}
          <div className="p-4 rounded-lg border border-border bg-card">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Purchases</h3>
            {entLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : entitlements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No purchases yet.</p>
            ) : (
              <div className="space-y-2">
                {entitlements.map((pid) => {
                  const prod = products.find((p) => p.productId === pid)
                  return (
                    <div key={pid} className="flex items-center justify-between p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10">
                      <div>
                        <div className="text-sm font-medium">{prod?.label ?? pid}</div>
                        {prod?.description && (
                          <div className="text-xs text-muted-foreground">{prod.description}</div>
                        )}
                      </div>
                      <span className="text-emerald-500 text-sm font-semibold">Active</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

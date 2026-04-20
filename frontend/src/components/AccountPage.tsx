import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { User, Trophy, Award, CreditCard, Flame } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { useAuthFetch } from '../auth/useAuthFetch'
import { useGamification } from '../gamification/GamificationContext'
import { levelFromXP } from '../gamification/types'
import { BADGES } from '../gamification/badges'
import { useEntitlements, isPaidTier } from '../hooks/useEntitlements'
import CertificatesTab from './CertificatesTab'
import { BadgeIcon } from '../gamification/BadgeIcon'

const CATEGORY_LABELS: Record<string, string> = {
  milestone: 'Milestones',
  score: 'Score',
  streak: 'Streaks',
  mastery: 'Mastery',
  special: 'Special',
  journey: 'Journey',
}


export default function AccountPage() {
  const { user, refreshToken, updateUserName } = useAuth()
  const authFetch = useAuthFetch()
  const { state, toggleLeaderboard } = useGamification()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = (searchParams.get('tab') as 'overview' | 'badges' | 'certificates' | 'purchases' | null) ?? 'overview'
  const [tab, setTabState] = useState<'overview' | 'badges' | 'certificates' | 'purchases'>(
    initialTab === 'overview' || initialTab === 'badges' || initialTab === 'certificates' || initialTab === 'purchases' ? initialTab : 'overview'
  )
  const setTab = (t: 'overview' | 'badges' | 'certificates' | 'purchases') => {
    setTabState(t)
    const next = new URLSearchParams(searchParams)
    if (t === 'overview') next.delete('tab')
    else next.set('tab', t)
    setSearchParams(next, { replace: true })
  }
  const { level, currentXP, nextLevelXP, progress: levelProgress } = levelFromXP(state.xp)
  const { tier, entitlements, entitlementDetails, products, loading: entLoading, refresh: refreshEntitlements } = useEntitlements()

  // ── Name state ──
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameMessage, setNameMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // ── Email opt-in state ──
  const [emailOptIn, setEmailOptIn] = useState(true)
  const [emailOptInSaving, setEmailOptInSaving] = useState(false)

  // ── Cancel subscription state ──
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [cancelDone, setCancelDone] = useState(false)
  const [cancelAccessUntil, setCancelAccessUntil] = useState<string | null>(null)

  // ── Manage billing (Stripe Customer Portal) state ──
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)
  const openBillingPortal = async () => {
    setPortalLoading(true)
    setPortalError(null)
    try {
      const res = await authFetch('/payments/portal-session', { method: 'POST' })
      const data = await res.json().catch(() => ({})) as any
      if (res.ok && data?.url) {
        window.location.href = data.url
        return
      }
      setPortalError(data?.message || 'Could not open billing portal')
    } catch (e: any) {
      setPortalError(e?.message || 'Could not open billing portal')
    } finally {
      setPortalLoading(false)
    }
  }

  // ── Change plan state ──
  const [changePlanConfirm, setChangePlanConfirm] = useState<'up' | 'down' | null>(null)
  const [changingPlan, setChangingPlan] = useState(false)
  const [changePlanError, setChangePlanError] = useState<string | null>(null)
  const [changePlanDone, setChangePlanDone] = useState<'up' | 'down' | null>(null)
  const [changePlanIsPayPal, setChangePlanIsPayPal] = useState(false)

  const changePlan = useCallback(async (targetProductId: 'sub:pro' | 'sub:pro-plus') => {
    setChangingPlan(true)
    setChangePlanError(null)
    try {
      const res = await authFetch('/payments/upgrade-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetProductId }),
      })
      if (res.ok) {
        const data = await res.json() as any
        setChangePlanDone(data.isUpgrade ? 'up' : 'down')
        setChangePlanConfirm(null)
        refreshEntitlements()
        return
      }
      const data = await res.json().catch(() => ({}))
      if (res.status === 404 && (data as any).message?.includes('No active Stripe')) {
        setChangePlanIsPayPal(true)
      } else {
        setChangePlanError((data as any).message ?? 'Could not change plan')
      }
    } catch {
      setChangePlanError('Network error — please try again')
    } finally {
      setChangingPlan(false)
    }
  }, [authFetch, refreshEntitlements])

  const cancelSubscription = useCallback(async () => {
    setCancelling(true)
    setCancelError(null)
    // Try Stripe first, fall back to PayPal
    try {
      const res = await authFetch('/payments/cancel-subscription', { method: 'POST' })
      if (res.ok) {
        const data = await res.json().catch(() => ({})) as any
        setCancelAccessUntil(data.accessUntil ?? null)
        setCancelDone(true); setCancelConfirm(false); return
      }
      const data = await res.json().catch(() => ({}))
      if ((data as any).message?.includes('No active Stripe')) {
        // No Stripe sub — try PayPal
        const ppRes = await authFetch('/payments/paypal/cancel-subscription', { method: 'POST' })
        if (ppRes.ok) {
          const ppData = await ppRes.json().catch(() => ({})) as any
          setCancelAccessUntil(ppData.accessUntil ?? null)
          setCancelDone(true); setCancelConfirm(false); return
        }
        const ppData = await ppRes.json().catch(() => ({}))
        setCancelError((ppData as any).message ?? 'Could not cancel subscription')
      } else {
        setCancelError((data as any).message ?? 'Could not cancel subscription')
      }
    } catch {
      setCancelError('Network error — please try again')
    } finally {
      setCancelling(false)
    }
  }, [authFetch])

  useEffect(() => {
    authFetch('/auth/me')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && typeof data.emailOptIn === 'boolean') {
          setEmailOptIn(data.emailOptIn)
        }
      })
      .catch(() => {})
  }, [authFetch])

  const toggleEmailOptIn = useCallback(async () => {
    const next = !emailOptIn
    setEmailOptIn(next)
    setEmailOptInSaving(true)
    try {
      await authFetch('/auth/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOptIn: next }),
      })
    } catch {
      setEmailOptIn(!next)
    } finally {
      setEmailOptInSaving(false)
    }
  }, [emailOptIn, authFetch])

  useEffect(() => {
    if (user?.name) {
      const parts = user.name.trim().split(/\s+/)
      setFirstName(parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0] ?? '')
      setLastName(parts.length > 1 ? parts[parts.length - 1] : '')
    }
  }, [user?.name])

  const saveName = useCallback(async () => {
    const f = firstName.trim()
    const l = lastName.trim()
    if (!f) return
    setNameSaving(true)
    setNameMessage(null)
    try {
      const res = await authFetch('/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName: f, lastName: l || undefined }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed to save.' }))
        setNameMessage({ type: 'err', text: err.message || 'Failed to save.' })
        return
      }
      const data = await res.json().catch(() => ({}))
      // Update sidebar immediately, then refresh token in background so next reload also reflects it
      if (data.name) updateUserName(data.name)
      refreshToken().catch(() => {})
      setNameMessage({ type: 'ok', text: 'Name updated!' })
    } catch {
      setNameMessage({ type: 'err', text: 'Network error.' })
    } finally {
      setNameSaving(false)
    }
  }, [firstName, lastName, authFetch, refreshToken])

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
          <div className="text-right shrink-0">
            <div className="text-xl sm:text-2xl font-extrabold text-primary leading-tight">Level {level}</div>
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
            <div className="flex items-center justify-center gap-1 text-xl font-bold text-primary">
              <Flame className="w-5 h-5 text-orange-500" />{state.streak}
            </div>
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
            <div className="text-[10px] leading-tight text-muted-foreground">Domains<br/>Mastered</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg">
        {([['overview', 'Overview', User], ['badges', 'Achievements', Trophy], ['certificates', 'Certificates', Award], ['purchases', 'Purchases', CreditCard]] as const).map(([t, label, Icon]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-card shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground dark:hover:text-foreground'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Name */}
          <div className="p-4 rounded-lg border border-border bg-card">
            <h3 className="text-sm font-semibold text-muted-foreground mb-3">Name</h3>
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  required
                  placeholder="First name"
                  value={firstName}
                  onChange={e => { setFirstName(e.target.value); setNameMessage(null) }}
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
                <input
                  type="text"
                  placeholder="Last name"
                  value={lastName}
                  onChange={e => { setLastName(e.target.value); setNameMessage(null) }}
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={saveName}
                  disabled={nameSaving || !firstName.trim()}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/80 transition-colors"
                >
                  {nameSaving ? 'Saving…' : 'Save name'}
                </button>
                {nameMessage && (
                  <p className={`text-xs ${nameMessage.type === 'ok' ? 'text-green-500' : 'text-red-500'}`}>
                    {nameMessage.text}
                  </p>
                )}
              </div>
            </div>
          </div>

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
                      <BadgeIcon id={eb.id} size={16} />
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
                  state.leaderboardOptIn ? 'bg-primary' : 'bg-gray-300 dark:bg-zinc-600'
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

          {/* Marketing emails opt-in */}
          <div className="p-4 rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground">Marketing &amp; update emails</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Receive emails about new content and exam updates</p>
              </div>
              <button
                onClick={toggleEmailOptIn}
                disabled={emailOptInSaving}
                aria-label={emailOptIn ? 'Unsubscribe from marketing emails' : 'Subscribe to marketing emails'}
                className={`relative inline-flex h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${
                  emailOptIn ? 'bg-primary' : 'bg-gray-300 dark:bg-zinc-600'
                }`}
              >
                <span
                  className={`inline-block w-4 h-4 rounded-full bg-white shadow transform transition-transform mt-1 ${
                    emailOptIn ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Transactional emails (receipt, welcome, subscription reminders) are always sent.
            </p>
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
                      <span className="flex-shrink-0"><BadgeIcon id={b.id} size={24} /></span>
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

      {tab === 'certificates' && <CertificatesTab />}

      {tab === 'purchases' && (
        <div className="space-y-4">
          {/* Current tier */}
          <div className="p-4 rounded-lg border border-border bg-card">
            <h3 className="text-sm font-semibold mb-2 text-muted-foreground">Your Plan</h3>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                isPaidTier(tier)
                  ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                  : tier === 'registered'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
              }`}>
                {tier === 'pro_plus' ? 'Pro Plus' : tier === 'pro' ? 'Pro' : tier === 'registered' ? 'Free' : 'Visitor'}
              </span>
              <span className="text-sm text-muted-foreground">
                {tier === 'pro_plus'
                  ? 'Full question banks · All 200+ skill labs'
                  : tier === 'pro'
                    ? 'Full question banks · 80+ skill labs'
                    : tier === 'registered'
                      ? '40 questions per exam · 40+ skill labs'
                      : 'Guest access'}
              </span>
            </div>
            {!isPaidTier(tier) && (
              <p className="text-xs text-muted-foreground mt-2">
                Upgrade to Pro or Pro Plus to unlock all questions, leaderboard, certificates, and more.
              </p>
            )}
          </div>

          {/* Active entitlements */}
          <div className="p-4 rounded-lg border border-border bg-card">
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">Active plan</h3>
            {entLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : entitlements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active subscription.</p>
            ) : (
              <div className="space-y-2">
                {entitlements.map((pid) => {
                  const prod = products.find((p) => p.productId === pid)
                  const detail = entitlementDetails.find((d) => d.productId === pid)
                  const renewsAt = detail?.expiresAt
                    ? new Date(detail.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
                    : null
                  const sourceLabel = detail?.source === 'paypal' ? 'PayPal' : detail?.source === 'admin' ? 'Admin grant' : 'Card'
                  return (
                    <div key={pid} className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold">{prod?.label ?? pid}</div>
                        <span className="text-emerald-500 text-xs font-semibold uppercase tracking-wide">Active</span>
                      </div>
                      <div className="text-xs font-mono text-muted-foreground">{pid}</div>
                      {renewsAt && (
                        <div className="text-xs text-muted-foreground">
                          {detail?.status === 'cancelled' ? 'Access until' : 'Renews on'}: <span className="font-medium text-foreground">{renewsAt}</span>
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">Via {sourceLabel}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Change plan */}
          {isPaidTier(tier) && !cancelDone && (
            <div className="p-4 rounded-lg border border-border bg-card">
              <h3 className="text-sm font-semibold mb-1 text-muted-foreground">Change plan</h3>
              {changePlanDone ? (
                <p className="text-sm text-muted-foreground">
                  {changePlanDone === 'up'
                    ? 'Upgraded to Pro Plus — your new plan is now active.'
                    : 'Downgrade scheduled. Your Pro Plus access continues until the end of your current billing period, then switches to Pro.'}
                </p>
              ) : changePlanIsPayPal ? (
                <p className="text-sm text-muted-foreground">
                  PayPal subscribers can't swap plans inline. Cancel your current plan first, then re-subscribe from the{' '}
                  <a href="/pricing" className="text-primary underline">pricing page</a>.
                </p>
              ) : changePlanConfirm ? (
                <div className="space-y-3">
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    {changePlanConfirm === 'up'
                      ? "Upgrade to Pro Plus? You'll be charged the prorated difference immediately."
                      : "Downgrade to Pro? Your Pro Plus access continues until the end of your billing period."}
                  </p>
                  {changePlanError && <p className="text-xs text-red-500">{changePlanError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => changePlan(changePlanConfirm === 'up' ? 'sub:pro-plus' : 'sub:pro')}
                      disabled={changingPlan}
                      className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 hover:bg-primary/80 transition-colors"
                    >
                      {changingPlan ? 'Processing…' : 'Confirm'}
                    </button>
                    <button
                      onClick={() => { setChangePlanConfirm(null); setChangePlanError(null) }}
                      disabled={changingPlan}
                      className="px-4 py-2 rounded-lg bg-muted text-sm font-medium hover:bg-muted/80 transition-colors"
                    >
                      Back
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {tier === 'pro' && (
                    <>
                      <p className="text-xs text-muted-foreground mb-2">Unlock all skill labs. Charged prorated immediately.</p>
                      <button
                        onClick={() => setChangePlanConfirm('up')}
                        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/80 transition-colors"
                      >
                        Upgrade to Pro Plus
                      </button>
                    </>
                  )}
                  {tier === 'pro_plus' && (
                    <>
                      <p className="text-xs text-muted-foreground mb-2">Downgrade takes effect at your next billing cycle.</p>
                      <button
                        onClick={() => setChangePlanConfirm('down')}
                        className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/80 transition-colors"
                      >
                        Downgrade to Pro
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Manage billing */}
          {isPaidTier(tier) && entitlementDetails.some((e) => e.source === 'stripe' && e.status === 'active') && (
            <div className="p-4 rounded-lg border border-border bg-card">
              <h3 className="text-sm font-semibold mb-1 text-muted-foreground">Manage billing</h3>
              <p className="text-xs text-muted-foreground mb-2">
                Update your card, view invoices, or cancel on Stripe's secure billing portal.
              </p>
              {portalError && <p className="text-xs text-red-500 mb-2">{portalError}</p>}
              <button
                onClick={openBillingPortal}
                disabled={portalLoading}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40 hover:bg-primary/80 transition-colors"
              >
                {portalLoading ? 'Opening…' : 'Manage billing'}
              </button>
            </div>
          )}

          {/* Cancel subscription */}
          {isPaidTier(tier) && (
            <div className="p-4 rounded-lg border border-border bg-card">
              <h3 className="text-sm font-semibold mb-1 text-muted-foreground">Cancel subscription</h3>
              {cancelDone ? (
                <p className="text-sm text-muted-foreground">
                  Your subscription has been cancelled.{' '}
                  {cancelAccessUntil
                    ? <>You'll retain access until <strong>{new Date(cancelAccessUntil).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</>
                    : "You'll retain access until the end of your current billing period."
                  }
                </p>
              ) : cancelConfirm ? (
                <div className="space-y-3">
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    Are you sure? You'll lose access to Pro features at the end of your billing period.
                  </p>
                  {cancelError && (
                    <p className="text-xs text-red-500">{cancelError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={cancelSubscription}
                      disabled={cancelling}
                      className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold disabled:opacity-40 hover:bg-red-600 transition-colors"
                    >
                      {cancelling ? 'Cancelling…' : 'Yes, cancel'}
                    </button>
                    <button
                      onClick={() => { setCancelConfirm(false); setCancelError(null) }}
                      disabled={cancelling}
                      className="px-4 py-2 rounded-lg bg-muted text-sm font-medium hover:bg-muted/80 transition-colors"
                    >
                      Keep subscription
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground mb-2">
                    You can cancel at any time. Access continues until your billing period ends.
                  </p>
                  <button
                    onClick={() => setCancelConfirm(true)}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/80 transition-colors"
                  >
                    Cancel subscription
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  )
}

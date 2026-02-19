import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { Save, X, Flag, Pause, Play, Plus, Download, FileText, Check, Info, BarChart3, Trash2, Trophy, Filter, ChevronDown, ExternalLink, Zap, Clock, Lightbulb } from 'lucide-react'
import { Sidebar } from '@/components/Sidebar'
import { ThemeToggle } from '@/components/ThemeToggle'
import CodeBlock from './components/CodeBlock'
import { Confetti, RewardModal } from './components/Confetti'
import AccountPage from './components/AccountPage'
import Leaderboard from './components/Leaderboard'
import AdminPanel from './components/AdminPanel'
import PricingPage from './components/PricingPage'
import { useIsAdmin } from './auth/useIsAdmin'
import { useAuth } from './auth/AuthContext'
import { useAuthFetch } from './auth/useAuthFetch'
import { apiUrl } from './apiBase'
import { useGamification } from './gamification/GamificationContext'
import { levelFromXP } from './gamification/types'
import { BADGES } from './gamification/badges'

type Exam = {
  code: string
  title?: string
  provider?: string
  version?: string
  logo?: string
  logoHref?: string
  passMark?: number
  defaultQuestions?: number
  defaultQuestionCount?: number
  defaultDuration?: number
  questions?: unknown[]
}
type Choice = {
  id: string
  text: string
  isCorrect: boolean
  explanation?: string
}
type Question = {
  id: string
  question: string
  choices: Choice[]
  selectCount?: number
  format?: string
  domain?: string
  skills?: string[]
  tip?: string
  explanation?: string
  docs?: string
}

export default function App() {
  const { user, loading: authLoading, login, logout } = useAuth()
  const authFetch = useAuthFetch()
  const { state: gamState, recordAttemptFinish, recordPracticeDay } = useGamification()
  const gamLevel = levelFromXP(gamState.xp)
  const isAdmin = useIsAdmin()

  // Confetti / reward modal state
  const [showConfetti, setShowConfetti] = useState(false)
  const [rewardModal, setRewardModal] = useState<{ title: string; subtitle?: string; xpGained: number; badges: { icon: string; name: string }[] } | null>(null)

  // simple client-side route: 'home' | 'practice' | 'analytics' | 'account'
  const [route, setRoute] = useState<'home' | 'practice' | 'analytics' | 'account' | 'admin' | 'pricing'>('home')
  const [exams, setExams] = useState<Exam[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  // Tier gating info from backend
  const [examTier, setExamTier] = useState<string | null>(null)
  const [examTotalAvailable, setExamTotalAvailable] = useState<number>(0)
  const [examLimited, setExamLimited] = useState<boolean>(false)
  const selectedMeta = useMemo(() => {
    if (!selected) return null
    const sel = String(selected).toLowerCase()
    return (exams.find((e) => String(e.code).toLowerCase() === sel) as any) || null
  }, [exams, selected])

  // UI state
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('theme')
      if (stored) return stored === 'dark'
    } catch {}
    return true
  })

  // Theme presets: 'dark'|'light'|'colourblind'|'custom'
  const [themePreset, setThemePreset] = useState<string>(() => {
    try {
      const raw = localStorage.getItem('themePrefs')
      if (raw) return JSON.parse(raw).preset || 'dark'
    } catch {}
    return 'dark'
  })
  const [customCorrect, setCustomCorrect] = useState<string>(() => {
    try { const raw = localStorage.getItem('themePrefs'); if (raw) return JSON.parse(raw).customCorrect || '#10b981' } catch {}
    return '#10b981'
  })
  const [customCorrect2, setCustomCorrect2] = useState<string>(() => {
    try { const raw = localStorage.getItem('themePrefs'); if (raw) return JSON.parse(raw).customCorrect2 || '#059669' } catch {}
    return '#059669'
  })
  const [customIncorrect, setCustomIncorrect] = useState<string>(() => {
    try { const raw = localStorage.getItem('themePrefs'); if (raw) return JSON.parse(raw).customIncorrect || '#ef4444' } catch {}
    return '#ef4444'
  })
  const [customIncorrect2, setCustomIncorrect2] = useState<string>(() => {
    try { const raw = localStorage.getItem('themePrefs'); if (raw) return JSON.parse(raw).customIncorrect2 || '#dc2626' } catch {}
    return '#dc2626'
  })

  // apply theme preset to dark flag and CSS variables
  useEffect(() => {
    // map presets to defaults
    let presetCorrect = customCorrect
    let presetCorrect2 = customCorrect2
    let presetIncorrect = customIncorrect
    let presetIncorrect2 = customIncorrect2
    let useDark = dark

    if (themePreset === 'dark') {
      useDark = true
      presetCorrect = '#10b981'
      presetCorrect2 = '#059669'
      presetIncorrect = '#ef4444'
      presetIncorrect2 = '#dc2626'
    } else if (themePreset === 'light') {
      useDark = false
      // light mode uses the same semantic colours but slightly adjusted variants
      presetCorrect = '#059669'
      presetCorrect2 = '#047857'
      presetIncorrect = '#ef4444'
      presetIncorrect2 = '#b91c1c'
    } else if (themePreset === 'colourblind') {
      useDark = true
      presetCorrect = '#2dd4bf' // teal
      presetCorrect2 = '#14b8a6'
      presetIncorrect = '#ffb020' // amber
      presetIncorrect2 = '#fb923c'
    } else if (themePreset === 'custom') {
      useDark = true
      presetCorrect = customCorrect
      presetCorrect2 = customCorrect2
      presetIncorrect = customIncorrect
      presetIncorrect2 = customIncorrect2
    }

    // apply dark class
    if (useDark) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
    try { localStorage.setItem('theme', useDark ? 'dark' : 'light') } catch {}

    // compute shadow rgba values
    const toRgba = (hex: string, a = 0.45) => {
      const h = hex.replace('#','')
      const bigint = parseInt(h.length===3? h.split('').map(c=>c+c).join(''): h, 16)
      const r = (bigint >> 16) & 255
      const g = (bigint >> 8) & 255
      const b = bigint & 255
      return `rgba(${r},${g},${b},${a})`
    }

    document.documentElement.style.setProperty('--color-correct', presetCorrect)
    document.documentElement.style.setProperty('--color-correct-2', presetCorrect2)
    document.documentElement.style.setProperty('--color-correct-shadow', toRgba(presetCorrect, 0.45))
    document.documentElement.style.setProperty('--color-correct-text', '#ffffff')
    document.documentElement.style.setProperty('--color-correct-muted', toRgba(presetCorrect, 0.18))

    document.documentElement.style.setProperty('--color-incorrect', presetIncorrect)
    document.documentElement.style.setProperty('--color-incorrect-2', presetIncorrect2)
    document.documentElement.style.setProperty('--color-incorrect-shadow', toRgba(presetIncorrect, 0.45))
    document.documentElement.style.setProperty('--color-incorrect-text', '#ffffff')
    document.documentElement.style.setProperty('--color-incorrect-muted', toRgba(presetIncorrect, 0.18))

    try { localStorage.setItem('themePrefs', JSON.stringify({ preset: themePreset, customCorrect, customCorrect2, customIncorrect, customIncorrect2 })) } catch {}
  }, [themePreset, customCorrect, customCorrect2, customIncorrect, customIncorrect2, dark])

  // map of questionId -> selectedChoiceId(s)
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string | string[]>>({})
  // pending multi-select choices (not yet confirmed)
  const [multiSelectPending, setMultiSelectPending] = useState<Record<string, string[]>>({})
  // Flag questions for review (like real AWS exams)
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(new Set())
  // Navigate to specific question by index
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0)
  // Opt-in submission / complete-early confirmation
  const [showSubmitConfirm, setShowSubmitConfirm] = useState<boolean>(false)
  const [showCompleteEarlyConfirm, setShowCompleteEarlyConfirm] = useState<boolean>(false)
  // map of questionId -> whether tip is visible (tips shown before answering when user requests)
  const [showTipMap, setShowTipMap] = useState<Record<string, boolean>>({})
  // attempt id for current exam (persist per exam in localStorage)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  // paused state for timed exams
  const [paused, setPaused] = useState<boolean>(false)
  // attempt acknowledgement state removed — we only show Correct/Incorrect after finish

  const [lastError, setLastError] = useState<string | null>(null)
  // transient non-modal toasts
  const [toasts, setToasts] = useState<Array<{ id: string; msg: string; type?: 'info' | 'error' }>>([])
  const showToast = (msg: string, type: 'info' | 'error' = 'info') => {
    const id = String(Date.now()) + Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, msg, type }])
    // auto-dismiss
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500)
  }
  const [attemptData, setAttemptData] = useState<any | null>(null)
  const [showAttempts, setShowAttempts] = useState(false)
  const [attemptsList, setAttemptsList] = useState<any[] | null>(null)
  // domain filter for review view (select one or more domains; 'All' means every domain)
  const [reviewDomains, setReviewDomains] = useState<string[]>(['All'])
  const [reviewDomainOpen, setReviewDomainOpen] = useState<boolean>(false)
  const [reviewIndex, setReviewIndex] = useState<number>(0)
  const reviewDomainRef = React.useRef<HTMLDivElement | null>(null)
  const reviewDomainToggleRef = React.useRef<HTMLButtonElement | null>(null)
  React.useEffect(() => {
    if (!reviewDomainOpen) return
    function onDocMouse(e: MouseEvent) {
      const t = e.target as Node | null
      if (!t) return
      if (reviewDomainRef.current && reviewDomainRef.current.contains(t)) return
      if (reviewDomainToggleRef.current && reviewDomainToggleRef.current.contains(t)) return
      setReviewDomainOpen(false)
    }
    document.addEventListener('mousedown', onDocMouse)
    return () => document.removeEventListener('mousedown', onDocMouse)
  }, [reviewDomainOpen])
  const [incorrectOnly, setIncorrectOnly] = useState<boolean>(false)
  // domains selected when taking the exam (filters which questions are presented)
  const [takeDomains, setTakeDomains] = useState<string[]>(['All'])
  const [domainOpen, setDomainOpen] = useState<boolean>(false)
  const domainRef = React.useRef<HTMLDivElement | null>(null)
  const domainToggleRef = React.useRef<HTMLButtonElement | null>(null)
  React.useEffect(() => {
    if (!domainOpen) return
    function onDocMouse(e: MouseEvent) {
      const t = e.target as Node | null
      if (!t) return
      if (domainRef.current && domainRef.current.contains(t)) return
      if (domainToggleRef.current && domainToggleRef.current.contains(t)) return
      setDomainOpen(false)
    }
    document.addEventListener('mousedown', onDocMouse)
    return () => document.removeEventListener('mousedown', onDocMouse)
  }, [domainOpen])
  // mobile menu state
  const [mobileOpen, setMobileOpen] = useState<boolean>(false)
  // exam start state and mode
  const [examStarted, setExamStarted] = useState<boolean>(false)
  const [timed, setTimed] = useState<boolean>(false)
  const [durationMinutes, setDurationMinutes] = useState<number>(15)
  // Exam mode: 'casual' | 'timed' | 'weakest-link'
  const [examMode, setExamMode] = useState<'casual' | 'timed' | 'weakest-link'>('casual')
  // When to reveal correct answers: immediately after each question or on exam completion
  const [revealAnswers, setRevealAnswers] = useState<'immediately' | 'on-completion'>('immediately')
  // Set of question IDs whose answers have been revealed (for immediate mode)
  const [revealedQuestions, setRevealedQuestions] = useState<Set<string>>(new Set())
  // Staged single-select answer (not yet submitted, used in immediate mode)
  const [stagedAnswer, setStagedAnswer] = useState<Record<string, string>>({})
  // Weakest-link metadata returned from the backend (domain weights, etc.)
  const [weakestLinkInfo, setWeakestLinkInfo] = useState<{
    domainWeights: Record<string, number>
    domainStats: Record<string, { total: number; correct: number; avgScore: number; attemptCount: number }>
    wrongQuestionCount: number
  } | null>(null)
  const [loadingWeakestLink, setLoadingWeakestLink] = useState<boolean>(false)
  // (no persisted per-exam prefs) duration is a single value used for pre-start form
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [numQuestions, setNumQuestions] = useState<number>(0)
  const [showCancelConfirm, setShowCancelConfirm] = useState<boolean>(false)
  // Beta: service/keyword filter (comma-separated)
  const [serviceFilterText, setServiceFilterText] = useState<string>('')
  const [homeExamFilter, setHomeExamFilter] = useState<string>('')
  // Service multi-select state
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [availableServices, setAvailableServices] = useState<string[]>([])
  const [serviceDropOpen, setServiceDropOpen] = useState<boolean>(false)
  const [serviceSearchText, setServiceSearchText] = useState<string>('')
  const serviceDropRef = React.useRef<HTMLDivElement | null>(null)
  const serviceDropToggleRef = React.useRef<HTMLButtonElement | null>(null)
  // Guard: when resuming from saved progress, prevent the [selected] effect from resetting state
  const resumingRef = React.useRef<boolean>(false)
  React.useEffect(() => {
    if (!serviceDropOpen) return
    function onDocMouse(e: MouseEvent) {
      const t = e.target as Node | null
      if (!t) return
      if (serviceDropRef.current && serviceDropRef.current.contains(t)) return
      if (serviceDropToggleRef.current && serviceDropToggleRef.current.contains(t)) return
      setServiceDropOpen(false)
    }
    document.addEventListener('mousedown', onDocMouse)
    return () => document.removeEventListener('mousedown', onDocMouse)
  }, [serviceDropOpen])

  // Score history for selected exam (for analytics chart)
  const [scoreHistory, setScoreHistory] = useState<any[] | null>(null)
  const [loadingScoreHistory, setLoadingScoreHistory] = useState<boolean>(false)
  const [analyticsAttempts, setAnalyticsAttempts] = useState<any[] | null>(null)
  const [analyticsDomains, setAnalyticsDomains] = useState<Record<string, { total: number; correct: number; avgScore: number; attemptCount: number }> | null>(null)
  const [deletingAttemptId, setDeletingAttemptId] = useState<string | null>(null)

  function setupExamFromMeta(ex: any) {
    setSelected(ex.code)
    setSelectedAnswers({})
    setAttemptData(null)
    setWeakestLinkInfo(null)
    setExamMode('casual')
    setRevealAnswers('immediately')
    setRevealedQuestions(new Set<string>())
    setStagedAnswer({})
    try {
      const def = ex.defaultQuestions ?? ex.defaultQuestionCount ?? (ex.provider === 'AWS' ? 65 : (ex.questions?.length || 10))
      setNumQuestions(def)
      if (typeof ex.defaultDuration === 'number') {
        setDurationMinutes(ex.defaultDuration)
        setTimed(false)
        setTakeDomains(['All'])
      }
    } catch {
      setNumQuestions(10)
    }
    setRoute('home')
  }

  async function fetchScoreHistory(code: string) {
    setLoadingScoreHistory(true)
    try {
      const res = await authFetch(`/analytics/exam/${encodeURIComponent(code)}/scores`)
      if (!res.ok) {
        // fallback to /attempts when analytics endpoint is unavailable (e.g., proxy misconfig)
        try {
          const r2 = await authFetch('/attempts')
          if (r2.ok) {
            const dd = await r2.json()
            const all = Array.isArray(dd.attempts) ? dd.attempts : []
            const filtered = all.filter((a: any) => String(a.examCode || '').toLowerCase() === String(code || '').toLowerCase())
            setAnalyticsAttempts(filtered.map((a: any) => ({
              attemptId: a.attemptId,
              startedAt: a.startedAt,
              finishedAt: a.finishedAt,
              score: (typeof a.score === 'number' ? Math.max(0, Math.min(100, Math.round(a.score))) : null),
              answersCount: Array.isArray(a.answers) ? a.answers.length : 0
            })))
            const scoresFallback = filtered
              .filter((a: any) => a.finishedAt && typeof a.score === 'number')
              .map((a: any) => ({
                attemptId: a.attemptId,
                startedAt: a.startedAt,
                finishedAt: a.finishedAt,
                score: Math.max(0, Math.min(100, Math.round(a.score)))
              }))
              .sort((x: any, y: any) => String(x.finishedAt || x.startedAt || '').localeCompare(String(y.finishedAt || y.startedAt || '')))
            setScoreHistory(scoresFallback)
          } else {
            setScoreHistory([])
            setAnalyticsAttempts([])
            setAnalyticsDomains(null)
          }
        } catch (err) {
          console.error('fallback /attempts fetch failed', err)
          setScoreHistory([])
          setAnalyticsAttempts([])
          setAnalyticsDomains(null)
        }
        return
      }
      const d = await res.json()
      setScoreHistory(Array.isArray(d.scores) ? d.scores : [])
      setAnalyticsAttempts(Array.isArray(d.attempts) ? d.attempts : [])
      setAnalyticsDomains(d.domains && typeof d.domains === 'object' ? d.domains : null)
    } catch (err) {
      console.error('fetchScoreHistory', err)
      setScoreHistory([])
      setAnalyticsAttempts([])
      setAnalyticsDomains(null)
    } finally {
      setLoadingScoreHistory(false)
    }
  }

  // fetch available services whenever user selects an exam
  useEffect(() => {
    if (!selected) { setAvailableServices([]); setSelectedServices([]); return }
    fetch(`/exams/${selected}/services`)
      .then((r) => (r.ok ? r.json() : []))
      .then((svcs: string[]) => {
        setAvailableServices(Array.isArray(svcs) ? svcs : [])
        setSelectedServices([])
      })
      .catch(() => setAvailableServices([]))
  }, [selected])

  // fetch score history whenever user selects an exam
  useEffect(() => {
    if (selected) fetchScoreHistory(selected)
    else setScoreHistory(null)
  }, [selected])

  // When entering the analytics page, ensure we have both score history and attempts for the selected exam.
  useEffect(() => {
    if (route !== 'analytics') return
    if (!selected) return
    setAnalyticsAttempts(null)
    setAnalyticsDomains(null)
    void fetchScoreHistory(selected)
  }, [route, selected])

  // Inline SVG chart renderer for score history (no external deps)
  function ScoreHistoryChart({ data, passMark, showEmptyText }: { data: any[]; passMark: number; showEmptyText?: boolean }) {
    const w = 560
    const h = 140
    const padL = 36
    const padR = 16
    const padT = 18
    const padB = 26
    const innerW = w - padL - padR
    const innerH = h - padT - padB

    const clampPct = (n: any) => {
      const v = Number(n)
      if (!Number.isFinite(v)) return 0
      return Math.max(0, Math.min(100, v))
    }
    const toY = (pct: number) => padT + (1 - (pct / 100)) * innerH
    const toX = (i: number, n: number) => padL + (i / Math.max(1, n - 1)) * innerW

    const normalized = Array.isArray(data)
      ? data.map((d) => {
        const pct = clampPct(d.score)
        const correctCount = (d.correctCount === null || d.correctCount === undefined) ? null : Number(d.correctCount)
        const total = (d.total === null || d.total === undefined) ? null : Number(d.total)
        return { ...d, pct, correctCount: Number.isFinite(correctCount as any) ? correctCount : null, total: Number.isFinite(total as any) ? total : null }
      })
      : []

    const points = normalized.map((d, i) => {
      const x = toX(i, normalized.length)
      const y = toY(d.pct)
      return { x, y, d }
    })

    // tooltip state for mobile/tap: index of active point
    const [activeIdx, setActiveIdx] = useState<number | null>(null)

    const passY = toY(clampPct(passMark))
    const empty = normalized.length === 0
    if (empty && showEmptyText) {
      return <div className="text-sm text-muted-foreground">No finished scores yet</div>
    }

    const dateLabel = (v: any) => {
      try { return new Date(v).toLocaleDateString() } catch { return '—' }
    }

    return (
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="rounded">
        <rect x={0} y={0} width={w} height={h} fill="transparent" />

        {/* grid */}
        <g stroke="#334155" strokeOpacity="0.12">
          <line x1={padL} x2={w - padR} y1={padT} y2={padT} />
          <line x1={padL} x2={w - padR} y1={padT + innerH / 2} y2={padT + innerH / 2} />
          <line x1={padL} x2={w - padR} y1={padT + innerH} y2={padT + innerH} />
        </g>

        {/* pass mark */}
        <g>
          <line x1={padL} x2={w - padR} y1={passY} y2={passY} stroke="var(--color-correct-2)" strokeOpacity="0.55" strokeWidth={1.5} strokeDasharray="5 4" />
          <text x={w - padR} y={passY - 4} fontSize={10} fill="var(--color-correct-2)" textAnchor="end">Pass {clampPct(passMark)}%</text>
        </g>

        {/* series */}
        {points.length > 1 && (
          <g fill="none" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
            {points.slice(0, -1).map((p, i) => {
              const n = points[i + 1]
              const pPass = p.d.pct >= clampPct(passMark)
              const nPass = n.d.pct >= clampPct(passMark)
              const stroke = (pPass && nPass) ? 'var(--color-correct)' : (!pPass && !nPass) ? 'var(--color-incorrect)' : 'rgba(148,163,184,0.8)'
              return <line key={i} x1={p.x} y1={p.y} x2={n.x} y2={n.y} stroke={stroke} />
            })}
          </g>
        )}

        {/* points */}
        <g>
          {points.map((p, i) => {
            const pass = p.d.pct >= clampPct(passMark)
            const fill = pass ? 'var(--color-correct)' : 'var(--color-incorrect)'
            const outline = pass ? 'var(--color-correct-2)' : 'var(--color-incorrect-2)'
            const when = p.d.finishedAt || p.d.startedAt
            const ratio = (typeof p.d.correctCount === 'number' && typeof p.d.total === 'number') ? `${p.d.correctCount}/${p.d.total}` : null
            return (
              <g key={p.d.attemptId || i}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={6}
                  fill={fill}
                  stroke={outline}
                  strokeWidth={1}
                  style={{ cursor: 'pointer' }}
                  onClick={(ev: any) => { ev.stopPropagation(); setActiveIdx(i === activeIdx ? null : i) }}
                  onTouchStart={(ev: any) => { ev.stopPropagation(); setActiveIdx(i === activeIdx ? null : i) }}
                />
                <title>{`${when ? new Date(when).toLocaleString() : '—'} ${p.d.pct}%${ratio ? ` (${ratio})` : ''}`}</title>
              </g>
            )
          })}
        </g>

        {/* axis labels */}
        <text x={padL} y={h - 8} fontSize={10} fill="#94a3b8">{points[0]?.d ? dateLabel(points[0].d.finishedAt || points[0].d.startedAt) : ''}</text>
        <text x={w - padR} y={h - 8} fontSize={10} fill="#94a3b8" textAnchor="end">{points[points.length - 1]?.d ? dateLabel(points[points.length - 1].d.finishedAt || points[points.length - 1].d.startedAt) : ''}</text>

        {/* tooltip for active point (mobile tap) rendered inside SVG */}
        {activeIdx !== null && points[activeIdx] && (
          (() => {
            const p = points[activeIdx]
            const tx = Math.min(w - padR - 8, Math.max(padL + 8, p.x + 8))
            const ty = Math.max(padT + 8, p.y - 28)
            const when = p.d.finishedAt || p.d.startedAt
            const ratio = (typeof p.d.correctCount === 'number' && typeof p.d.total === 'number') ? `${p.d.correctCount}/${p.d.total}` : null
            const lines = [`${p.d.pct}%${ratio ? ` (${ratio})` : ''}`, when ? new Date(when).toLocaleString() : '—']
            return (
              <g>
                <rect x={tx - 6} y={ty - 18} rx={6} ry={6} width={140} height={36} fill="#0f172a" stroke="#475569" strokeWidth={0.5} opacity={0.95} />
                <text x={tx + 4} y={ty - 2} fontSize={11} fill="#e2e8f0">{lines[0]}</text>
                <text x={tx + 4} y={ty + 12} fontSize={9} fill="#94a3b8">{lines[1]}</text>
              </g>
            )
          })()
        )}
      </svg>
    )
  }

  // consider attempt finished when server provides finishedAt OR when we have a computed score
  // (earlyComplete attempts will have total < questions.length, so we just check for score)
  const isFinished = !!attemptData?.finishedAt || (
    typeof attemptData?.score === 'number' &&
    typeof attemptData?.total === 'number' &&
    attemptData.total > 0
  )

  // ——— Download helpers ———

  /** Build a CSV string for a finished attempt and trigger download */
  function downloadAttemptCSV() {
    if (!attemptData) return
    const examTitle = selectedMeta?.title ?? attemptData.examCode ?? 'Exam'
    const examCode = selectedMeta?.code ?? attemptData.examCode ?? ''
    const score = attemptData.score ?? ''
    const correctCount = attemptData.correctCount ?? ''
    const total = attemptData.total ?? ''
    const finishedAt = attemptData.finishedAt ? new Date(attemptData.finishedAt).toLocaleString() : ''

    const esc = (v: any) => {
      const s = String(v ?? '').replace(/"/g, '""')
      return `"${s}"`
    }

    const rows: string[] = []
    // header info
    rows.push(`Exam,${esc(examTitle)} (${examCode})`)
    rows.push(`Score,${score}%`)
    rows.push(`Result,${correctCount} / ${total} correct`)
    rows.push(`Completed,${esc(finishedAt)}`)
    rows.push('')

    // per-domain breakdown
    if (attemptData.perDomain && typeof attemptData.perDomain === 'object') {
      rows.push('Domain,Score,Correct,Total')
      for (const [domain, vals] of Object.entries(attemptData.perDomain) as [string, any][]) {
        rows.push(`${esc(domain)},${vals.score ?? 0}%,${vals.correct ?? 0},${vals.total ?? 0}`)
      }
      rows.push('')
    }

    // per-question detail (include per-question explanation)
    rows.push('Question,Domain,Your Answer,Correct Answer,Result,Explanation')
    const qs = Array.isArray(attemptData.questions) && attemptData.questions.length > 0 ? attemptData.questions : questions
    for (const q of qs as Question[]) {
      const ansRec = Array.isArray(attemptData.answers) ? attemptData.answers.find((a: any) => a.questionId === q.id) : undefined
      const chosenIds: string[] = ansRec?.selectedChoiceIds ?? (ansRec?.selectedChoiceId ? [ansRec.selectedChoiceId] : ansRec?.selectedIndices ?? (typeof ansRec?.selectedIndex === 'number' ? [ansRec.selectedIndex] : []))
      const yourAnswer = chosenIds.map((cid: any) => { const ch = q.choices?.find((c: any) => c.id === cid); return ch?.text ?? (typeof cid === 'number' ? q.choices?.[cid] ?? '' : cid) }).join('; ')
      const correctAnswer = q.choices?.filter((c: any) => c.isCorrect).map((c: any) => c.text).join('; ') ?? ''
      const result = ansRec ? (ansRec.correct ? 'Correct' : 'Incorrect') : 'Unanswered'
      rows.push(`${esc(q.question)},${esc(q.domain ?? '')},${esc(yourAnswer)},${esc(correctAnswer)},${result},${esc(q.explanation ?? '')}`)
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${examCode || 'exam'}-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  /** Open a printable report in a new window (user can Save as PDF via browser print) */
  function downloadAttemptPDF() {
    if (!attemptData) return
    const examTitle = selectedMeta?.title ?? attemptData.examCode ?? 'Exam'
    const examCode = selectedMeta?.code ?? attemptData.examCode ?? ''
    const score = Number(attemptData.score) || 0
    const correctCount = attemptData.correctCount ?? 0
    const total = attemptData.total ?? 0
    const pm = typeof selectedMeta?.passMark === 'number' ? selectedMeta.passMark : 70
    const passed = score >= pm
    const finishedAt = attemptData.finishedAt ? new Date(attemptData.finishedAt).toLocaleString() : '—'

    const qs = Array.isArray(attemptData.questions) && attemptData.questions.length > 0 ? attemptData.questions : questions

    let domainHTML = ''
    if (attemptData.perDomain && typeof attemptData.perDomain === 'object') {
      domainHTML = `<h2>Domain Performance</h2><table><thead><tr><th>Domain</th><th>Score</th><th>Correct</th><th>Total</th></tr></thead><tbody>`
      for (const [domain, vals] of Object.entries(attemptData.perDomain) as [string, any][]) {
        domainHTML += `<tr><td>${domain}</td><td>${vals.score ?? 0}%</td><td>${vals.correct ?? 0}</td><td>${vals.total ?? 0}</td></tr>`
      }
      domainHTML += `</tbody></table>`
    }

    let questionsHTML = '<h2>Questions</h2>'
    for (const q of qs as Question[]) {
      const ansRec = Array.isArray(attemptData.answers) ? attemptData.answers.find((a: any) => a.questionId === q.id) : undefined
      const chosenIds: string[] = ansRec?.selectedChoiceIds ?? (ansRec?.selectedChoiceId ? [ansRec.selectedChoiceId] : ansRec?.selectedIndices ?? (typeof ansRec?.selectedIndex === 'number' ? [ansRec.selectedIndex] : []))
      const isCorrect = ansRec ? !!ansRec.correct : false
      const statusIcon = ansRec ? (isCorrect ? '✅' : '❌') : '⬜'

      questionsHTML += `<div class="q"><div class="q-header">${statusIcon} <strong>${q.question.replace(/</g, '&lt;')}</strong></div>`
      if (q.domain) questionsHTML += `<div class="q-domain">Domain: ${q.domain}</div>`

      questionsHTML += `<ol>`
      for (let ci = 0; ci < (q.choices?.length ?? 0); ci++) {
        const ch = q.choices[ci]
        const choiceText = typeof ch === 'string' ? ch : (ch?.text ?? '')
        const choiceId = typeof ch === 'string' ? String(ci) : (ch?.id ?? String(ci))
        const isChosen = chosenIds.includes(choiceId) || chosenIds.includes(ci as any)
        const isCorrectChoice = typeof ch === 'object' && !!ch?.isCorrect
        const cls = isChosen && isCorrectChoice ? 'correct' : isChosen ? 'wrong' : isCorrectChoice ? 'correct-not-chosen' : ''
        questionsHTML += `<li class="${cls}">${choiceText.replace(/</g, '&lt;')}${isChosen ? ' ◀ your answer' : ''}${isCorrectChoice && !isChosen ? ' ◀ correct' : ''}</li>`
        // include per-choice explanation when available
        if (typeof ch === 'object' && ch?.explanation) {
          questionsHTML += `<div class="choice-expl">${String(ch.explanation).replace(/</g, '&lt;')}</div>`
        }
      }
      questionsHTML += `</ol>`
      if (q.explanation) questionsHTML += `<div class="explanation">💡 ${q.explanation.replace(/</g, '&lt;')}</div>`
      questionsHTML += `</div>`
    }

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${examTitle} — Report</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:0 auto;padding:24px;color:#1e293b;font-size:13px;}
  h1{font-size:22px;margin-bottom:4px;} h2{font-size:16px;margin-top:28px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;}
  .meta{color:#64748b;font-size:13px;margin-bottom:20px;}
  .badge{display:inline-block;padding:4px 12px;border-radius:6px;font-weight:700;font-size:14px;color:#fff;}
  .pass{background:#059669;} .fail{background:#dc2626;}
  table{width:100%;border-collapse:collapse;margin:12px 0;} th,td{text-align:left;padding:6px 10px;border:1px solid #e2e8f0;}
  th{background:#f1f5f9;font-size:12px;}
  .q{margin:16px 0;padding:12px;border:1px solid #e2e8f0;border-radius:8px;page-break-inside:avoid;}
  .q-header{font-size:13px;} .q-domain{color:#64748b;font-size:11px;margin:2px 0 6px;}
  ol{padding-left:20px;margin:6px 0;} li{margin:3px 0;padding:2px 4px;border-radius:3px;}
  li.correct{background:#d1fae5;} li.wrong{background:#fee2e2;} li.correct-not-chosen{background:#dbeafe;}
  .explanation{margin-top:8px;padding:8px;background:#fefce8;border-radius:4px;font-size:12px;}
  .choice-expl{margin-left:18px;margin-top:4px;font-size:12px;color:#334155;background:#f8fafc;padding:6px;border-radius:4px;}
  @media print{body{padding:0;} .no-print{display:none;}}
</style></head><body>
<h1>${examTitle} <span style="color:#94a3b8;font-weight:400;font-size:14px">${examCode}</span></h1>
<div class="meta">
  <span class="badge ${passed ? 'pass' : 'fail'}">${score}% — ${passed ? 'PASS' : 'FAIL'}</span>
  &nbsp;&nbsp;${correctCount} / ${total} correct &nbsp;|&nbsp; Completed: ${finishedAt}
</div>
${domainHTML}
${questionsHTML}
<div class="no-print" style="margin-top:24px;text-align:center;">
  <button onclick="window.print()" style="padding:10px 28px;font-size:14px;cursor:pointer;border:none;background:#0ea5e9;color:#fff;border-radius:6px;">Print / Save as PDF</button>
</div>
</body></html>`

    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
    }
  }

  // Recompute attempt-level derived stats (score, correctCount, total, perDomain)
  function computeDerivedAttempt(attemptObj: any, suppliedQuestions?: Question[]) {
    const qSet: Question[] = Array.isArray(attemptObj.questions) && attemptObj.questions.length > 0
      ? attemptObj.questions
      : (Array.isArray(suppliedQuestions) && suppliedQuestions.length > 0 ? suppliedQuestions : questions)

    const latestByQ = new Map<string, any>()
    if (Array.isArray(attemptObj.answers)) {
      for (const ans of attemptObj.answers) {
        const qid = String(ans?.questionId)
        if (!qid) continue
        const prev = latestByQ.get(qid)
        const prevT = prev?.createdAt ? String(prev.createdAt) : ''
        const currT = ans?.createdAt ? String(ans.createdAt) : ''
        if (!prev || currT >= prevT) latestByQ.set(qid, ans)
      }
    }

    const isEarlyComplete = !!attemptObj.earlyComplete
    let total = 0
    let correctCount = 0
    const perDomain: Record<string, { total: number; correct: number; score: number }> = {}
    for (const q of qSet) {
      const latestAns = latestByQ.get(q.id)
      // For early-completed exams, skip unanswered questions
      if (isEarlyComplete && !latestAns) continue
      const domain = q.domain ?? 'General'
      if (!perDomain[domain]) perDomain[domain] = { total: 0, correct: 0, score: 0 }
      perDomain[domain].total += 1
      total += 1
      if (latestAns && latestAns.correct) {
        perDomain[domain].correct += 1
        correctCount += 1
      }
    }
    for (const k of Object.keys(perDomain)) {
      const entry = perDomain[k]
      entry.score = entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : 0
    }

    const score = total > 0 ? Math.round((correctCount / total) * 100) : 0
    return {
      ...attemptObj,
      total,
      correctCount,
      score,
      perDomain,
      ...(isEarlyComplete ? { totalQuestions: qSet.length, answeredCount: latestByQ.size } : {})
    }
  }

  /** Download analytics summary as CSV */
  function downloadAnalyticsCSV() {
    if (!selected) return
    const examTitle = selectedMeta?.title ?? selected
    const examCode = selectedMeta?.code ?? selected
    const pm = typeof selectedMeta?.passMark === 'number' ? selectedMeta.passMark : 70
    const esc = (v: any) => { const s = String(v ?? '').replace(/"/g, '""'); return `"${s}"` }

    const rows: string[] = []
    rows.push(`Analytics Report — ${examTitle} (${examCode})`)
    rows.push('')

    // stats summary
    const atts = analyticsAttempts || []
    const scores = atts
      .map((a: any) => (typeof a.score === 'number' ? a.score : null))
      .filter((v: any) => typeof v === 'number' && Number.isFinite(v)) as number[]
    const finished = scores.length
    const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
    const avg = finished ? Math.round(scores.map(clamp).reduce((s, x) => s + x, 0) / finished) : null
    const best = finished ? Math.max(...scores.map(clamp)) : null
    const passed = finished ? scores.map(clamp).filter((s) => s >= pm).length : 0
    const passRate = finished ? Math.round((passed / finished) * 100) : null

    rows.push('Metric,Value')
    rows.push(`Total attempts,${atts.length}`)
    rows.push(`Finished,${finished}`)
    rows.push(`Average score,${avg !== null ? avg + '%' : '—'}`)
    rows.push(`Best score,${best !== null ? best + '%' : '—'}`)
    rows.push(`Pass rate,${passRate !== null ? passRate + '%' : '—'}`)
    rows.push('')

    // domain breakdown
    if (analyticsDomains && Object.keys(analyticsDomains).length > 0) {
      rows.push('Domain,Avg Score,Correct,Total,Attempts')
      for (const [domain, v] of Object.entries(analyticsDomains)) {
        rows.push(`${esc(domain)},${v.avgScore}%,${v.correct},${v.total},${v.attemptCount}`)
      }
      rows.push('')
    }

    // attempts list
    rows.push('Attempt,Started,Finished,Score,Correct,Total')
    for (const a of atts) {
      rows.push(`${a.attemptId},${a.startedAt ? new Date(a.startedAt).toLocaleString() : ''},${a.finishedAt ? new Date(a.finishedAt).toLocaleString() : ''},${typeof a.score === 'number' ? a.score + '%' : ''},${a.correctCount ?? ''},${a.total ?? ''}`)
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${examCode || 'exam'}-analytics-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // questions presented to the user while taking the exam (filtered by `takeDomains`)
  const filteredByDomain = (takeDomains.includes('All') || takeDomains.length === 0)
    ? questions
    : questions.filter((q) => takeDomains.includes((q as any).domain))

  // Compute the total available questions after ALL filters (domain + service + keyword)
  const availableFilteredCount = useMemo(() => {
    let pool = filteredByDomain
    // service filter
    if (selectedServices.length > 0) {
      const lowerServices = selectedServices.map((s) => s.toLowerCase())
      pool = pool.filter((q: any) => {
        const qServices: string[] = Array.isArray(q.services) ? q.services.map((s: string) => s.toLowerCase()) : []
        return lowerServices.some((s) => qServices.includes(s))
      })
    }
    // keyword filter
    const keywords = serviceFilterText.split(',').map((s) => s.trim()).filter(Boolean)
    if (keywords.length > 0) {
      pool = pool.filter((q: any) => {
        const text = String(q.question || '').toLowerCase()
        if (keywords.some((kw) => text.includes(kw.toLowerCase()))) return true
        if (Array.isArray(q.choices)) {
          for (const c of q.choices) {
            const ct = typeof c === 'string' ? c : (c?.text ?? '')
            if (keywords.some((kw) => String(ct).toLowerCase().includes(kw.toLowerCase()))) return true
          }
        }
        return false
      })
    }
    return pool.length
  }, [filteredByDomain, selectedServices, serviceFilterText])

  // Auto-cap numQuestions when filtered availability drops below current value
  useEffect(() => {
    if (examStarted || isFinished) return
    if (availableFilteredCount > 0 && numQuestions > availableFilteredCount) {
      setNumQuestions(availableFilteredCount)
    }
  }, [availableFilteredCount, examStarted, isFinished])

  // Respect user's selected `numQuestions` by slicing the filtered list.
  const displayQuestions = (typeof numQuestions === 'number' && numQuestions > 0)
    ? filteredByDomain.slice(0, numQuestions)
    : filteredByDomain

  // create an attempt (called when user starts the exam)
  async function createAttempt() {
    if (!selected) return
    // reset client state for a fresh attempt
    setSelectedAnswers({})
    setAttemptData(null)
    setLastError(null)
    setFlaggedQuestions(new Set<string>())
    setCurrentQuestionIndex(0)
    setShowSubmitConfirm(false)
    setShowCompleteEarlyConfirm(false)
    setRevealedQuestions(new Set<string>())
    setStagedAnswer({})
    try { localStorage.removeItem(`examProgress:${selected}`) } catch {}
    const key = `attempt:${selected}`

      // ── Visitor (unauthenticated) — run exam entirely client-side ──
      if (!user) {
        if (examMode === 'weakest-link') {
          setLastError('Sign in to use Weakest Link mode — it needs your attempt history.')
          return
        }
        const localId = `visitor-${Date.now()}`
        setAttemptId(localId)
        setExamStarted(true)
        if (examMode === 'timed') setTimeLeft(durationMinutes * 60)
        return
      }

      try {
        // do not persist pre-start prefs; start with current form values

      // ── Weakest Link mode: fetch weighted questions from backend ──
      if (examMode === 'weakest-link') {
        setLoadingWeakestLink(true)
        try {
          const wlRes = await authFetch(`/exams/${encodeURIComponent(selected)}/weakest-link?count=${numQuestions}`)
          if (!wlRes.ok) {
            const errText = await wlRes.text().catch(() => 'weakest-link fetch failed')
            setLastError(errText)
            return
          }
          const wlData = await wlRes.json()
          const wlQuestions = wlData.questions || []
          if (wlQuestions.length === 0) {
            setLastError('No questions available for Weakest Link mode. Complete some attempts first!')
            return
          }
          setWeakestLinkInfo({
            domainWeights: wlData.domainWeights,
            domainStats: wlData.domainStats,
            wrongQuestionCount: wlData.wrongQuestionCount,
          })

          // Create a server-side attempt with the exact weakest-link questions
          // so the server scores against the same set the user sees
          const res = await authFetch('/attempts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              examCode: selected,
              questionIds: wlQuestions.map((q: any) => q.id),
              questions: wlQuestions,
              metadata: { mode: 'weakest-link', domainWeights: wlData.domainWeights, wrongQuestionCount: wlData.wrongQuestionCount }
            })
          })
          if (!res.ok) {
            const text = await res.text().catch(() => 'create attempt failed')
            setLastError(text)
            return
          }
          const data = await res.json()
          if (data?.attemptId) {
            recordPracticeDay()
            // fetch the full attempt to obtain examVersion and canonical questions
            try {
              const r2 = await authFetch(`/attempts/${data.attemptId}`)
              if (r2.ok) {
                const attemptFull = await r2.json()
                setAttemptId(data.attemptId)
                try { localStorage.setItem(key, JSON.stringify({ attemptId: data.attemptId, examVersion: attemptFull?.examVersion ?? attemptFull?.version ?? null, attemptSchemaVersion: 1 })) } catch {}
                setQuestions(attemptFull.questions ?? wlQuestions)
                setAttemptData(attemptFull)
                setNumQuestions((attemptFull.questions || wlQuestions).length)
                setExamStarted(true)
                return
              }
            } catch (err) {
              // fallback to previous behaviour
            }
            // fallback: if fetching attemptFull failed, continue with provided weakest-link questions
            setAttemptId(data.attemptId)
            try { localStorage.setItem(key, JSON.stringify({ attemptId: data.attemptId, examVersion: null, attemptSchemaVersion: 1 })) } catch {}
            setQuestions(wlQuestions)
            setAttemptData({ questions: wlQuestions, attemptId: data.attemptId, examCode: selected })
            setNumQuestions(wlQuestions.length)
            setExamStarted(true)
          }
        } finally {
          setLoadingWeakestLink(false)
        }
        return
      }

      // ── Normal (casual / timed) mode ──
      // prepare metadata (service keywords) from Beta input
      const keywords = serviceFilterText.split(',').map((s) => s.trim()).filter(Boolean)

      // quick client-side validation: apply keyword, domain, and service filters to avoid creating an empty attempt
      const domainFilterList = (takeDomains.includes('All') || takeDomains.length === 0) ? [] : takeDomains
      const hasAnyFilter = keywords.length > 0 || domainFilterList.length > 0 || selectedServices.length > 0
      if (hasAnyFilter) {
        const lowerServices = selectedServices.map((s) => s.toLowerCase())
        const localMatches = (questions || []).filter((q: any) => {
          // domain must match when domain filter present
          if (domainFilterList.length > 0 && !domainFilterList.includes((q as any).domain)) return false
          // service filter: question must tag at least one selected service
          if (lowerServices.length > 0) {
            const qServices: string[] = Array.isArray(q.services) ? q.services.map((s: string) => s.toLowerCase()) : []
            if (!lowerServices.some((s) => qServices.includes(s))) return false
          }
          // keyword filter (text match in question or choices)
          if (keywords.length > 0) {
            const text = String(q.question || '').toLowerCase()
            if (keywords.some((kw) => text.includes(kw))) return true
            if (Array.isArray(q.choices)) {
              for (const c of q.choices) {
                const ct = typeof c === 'string' ? c : (c?.text ?? '')
                if (keywords.some((kw) => String(ct).toLowerCase().includes(kw))) return true
              }
            }
            return false
          }
          return true
        })
        if (!localMatches || localMatches.length === 0) {
          setLastError('No questions match the requested filters')
          return
        }
      }

      const res = await authFetch('/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examCode: selected,
          numQuestions,
          metadata: { serviceKeywords: keywords, domains: domainFilterList, services: selectedServices }
        })
      })
      if (!res.ok) {
        const text = await res.text().catch(() => 'create attempt failed')
        setLastError(text)
        return
      }
      const data = await res.json()
      if (data?.attemptId) {
        // Record practice day for streak tracking
        recordPracticeDay()
        // fetch the full attempt (includes per-attempt questions)
        try {
          const r2 = await authFetch(`/attempts/${data.attemptId}`)
          if (r2.ok) {
            const attemptFull = await r2.json()
            setAttemptId(data.attemptId)
            try { localStorage.setItem(key, JSON.stringify({ attemptId: data.attemptId, examVersion: attemptFull?.examVersion ?? attemptFull?.version ?? null, attemptSchemaVersion: 1 })) } catch {}
            setAttemptData(attemptFull)
            // if attempt contains questions (filtered set), use them
            if (Array.isArray(attemptFull.questions)) setQuestions(attemptFull.questions)
            setExamStarted(true)
            if (examMode === 'timed') setTimeLeft(durationMinutes * 60)
          } else {
            // fallback: set attempt id and start
            setAttemptId(data.attemptId)
            try { localStorage.setItem(key, JSON.stringify({ attemptId: data.attemptId, examVersion: null, attemptSchemaVersion: 1 })) } catch {}
            setExamStarted(true)
            if (examMode === 'timed') setTimeLeft(durationMinutes * 60)
          }
        } catch (err) {
          // if follow-up fetch fails, still start with attempt id
          setAttemptId(data.attemptId)
          try { localStorage.setItem(key, JSON.stringify({ attemptId: data.attemptId, examVersion: null, attemptSchemaVersion: 1 })) } catch {}
          setExamStarted(true)
          if (examMode === 'timed') setTimeLeft(durationMinutes * 60)
        }
      }
    } catch (err) {
      console.error('createAttempt error', err)
      setLastError(String(err))
    }
  }

  // helper to submit an answer programmatically (used by buttons and keyboard shortcuts)
  // i is a choice ID (string) or array of choice IDs (string[]) for multi-select
  async function submitAnswer(q: Question, i: string | string[]) {
    if (isFinished) return
    if (!examStarted) {
      setLastError('Start the exam before answering')
      return
    }
    let aid = attemptId
    if (!aid) {
      setLastError('No active attempt. Click Start to begin the exam.')
      return
    }

    const isReAnswer = selectedAnswers[q.id] !== undefined
    const newSelected = { ...selectedAnswers, [q.id]: i }
    setSelectedAnswers(newSelected)
    // clear any pending multi-select state
    setMultiSelectPending((p) => { const next = { ...p }; delete next[q.id]; return next })

    // Auto-advance to next unanswered question (skip when re-answering or in immediate-reveal mode)
    if (!isReAnswer && revealAnswers !== 'immediately') {
      const nextIdx = displayQuestions.findIndex((qq, idx) => idx > currentQuestionIndex && newSelected[qq.id] === undefined)
      if (nextIdx >= 0) setCurrentQuestionIndex(nextIdx)
      else {
        const wrap = displayQuestions.findIndex((qq) => newSelected[qq.id] === undefined)
        if (wrap >= 0) setCurrentQuestionIndex(wrap)
      }
    }

    // ── Visitor (unauthenticated) — no server round-trips ──
    if (!user) return

    // ── Authenticated — save answer to server (no auto-finish; user must opt-in) ──
    const isMulti = Array.isArray(i)
    try {
      const res = await authFetch(`/attempts/${aid}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: q.id,
          ...(isMulti ? { selectedChoiceIds: i } : { selectedChoiceId: i }),
          timeMs: 0,
          showTip: !!showTipMap[q.id]
        })
      })
      if (!res.ok) {
        const text = await res.text()
        console.error('save answer failed', text)
        setLastError(text)
      }
    } catch (err) {
      console.error('submit answer error', err)
      setLastError(String(err))
    }
  }

  // finish attempt helper
  async function finishAttempt(aid: string) {
    // ── Visitor — finish locally ──
    if (!user) {
      setExamStarted(false)
      setTimeLeft(null)
      return
    }
    try {
      const fin = await authFetch(`/attempts/${aid}/finish`, { method: 'PATCH' })
      const finData = await fin.json()
      if ('attemptId' in finData) {
        // Re-fetch full attempt to get the answers array (PATCH response may omit it)
        let fullAttempt = finData
        try {
          const r2 = await authFetch(`/attempts/${finData.attemptId}`)
          if (r2.ok) fullAttempt = await r2.json()
        } catch {}
        const computed = computeDerivedAttempt(fullAttempt, Array.isArray(fullAttempt.questions) ? fullAttempt.questions : undefined)
        setAttemptData(computed)
        if (Array.isArray(fullAttempt.questions)) setQuestions(fullAttempt.questions)
        setExamStarted(false)
        setTimeLeft(null)
        handleGamificationReward(computed)
      } else {
        setLastError(JSON.stringify(finData))
      }
    } catch (err) {
      console.error('finishAttempt error', err)
      setLastError(String(err))
    }
  }

  /** Process gamification rewards after an attempt finishes */
  function handleGamificationReward(finData: any) {
    if (typeof finData?.score !== 'number') return
    try {
      // Collect context for badge checks
      const allAttemptScores = (attemptsList ?? [])
        .filter((a: any) => a.finishedAt && typeof a.score === 'number')
        .map((a: any) => a.score as number)
      allAttemptScores.push(finData.score)
      const finCount = allAttemptScores.length

      const pm = selectedMeta?.passMark ?? 70
      const event = recordAttemptFinish({
        examCode: finData.examCode ?? selected ?? '',
        score: finData.score,
        correctCount: finData.correctCount ?? 0,
        total: finData.total ?? 0,
        perDomain: finData.perDomain,
        allScores: allAttemptScores,
        finishedCount: finCount,
        passMark: pm,
      })

      // Show rewards
      const passed = finData.score >= pm
      if (passed || event.newLevel !== null || event.newBadges.length > 0) {
        setShowConfetti(true)
        const badgeInfo = event.newBadges.map((eb) => {
          const def = BADGES.find((b) => b.id === eb.id)
          return { icon: def?.icon ?? '🏅', name: def?.name ?? eb.id }
        })
        const title = event.newLevel !== null
          ? `Level Up! Level ${event.newLevel}`
          : passed
            ? 'Exam Passed! 🎉'
            : 'New Badges Unlocked!'
        const subtitle = passed && event.newLevel === null
          ? `You scored ${finData.score}%`
          : event.newLevel !== null
            ? `You scored ${finData.score}%`
            : undefined
        setRewardModal({ title, subtitle, xpGained: event.xpGained, badges: badgeInfo })
      } else if (event.xpGained > 0) {
        showToast(`+${event.xpGained} XP earned!`, 'info')
      }

      // Sync to backend (fire and forget)
      authFetch('/gamification/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          xp: gamState.xp + event.xpGained,
          level: event.newLevel ?? gamState.level,
          streak: gamState.streak,
          leaderboardOptIn: gamState.leaderboardOptIn,
          displayName: user?.name ?? 'Anonymous',
        }),
      }).catch(() => {})
    } catch (err) {
      console.error('gamification reward error', err)
    }
  }

  useEffect(() => {
    if (dark) document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
    try {
      localStorage.setItem('theme', dark ? 'dark' : 'light')
    } catch {}
  }, [dark])

  useEffect(() => {
    fetch(apiUrl('/exams'))
      .then((r) => r.json())
      .then(setExams)
      .catch((e) => {
        console.error(e)
        setLastError(String(e))
      })
  }, [])

  // derive providers and latest-version exam cards
  const providers = React.useMemo(() => {
    // exams may include provider and version fields; provide sensible fallbacks
    const byProvider: Record<string, any[]> = {}
    exams.forEach((e: any) => {
      // prefer explicit provider field
      let prov = e.provider
      if (!prov) {
        const title = (e.title || '').toUpperCase()
        const code = (e.code || '').toUpperCase()
        // detect common provider names from title or code
        if (title.includes('AWS') || code.startsWith('AWS')) prov = 'AWS'
        else if (title.includes('AZURE') || code.startsWith('AZ')) prov = 'AZURE'
        else if (title.includes('GCP') || title.includes('GOOGLE') || code.startsWith('GCP')) prov = 'GCP'
        else if (typeof e.code === 'string' && e.code.includes('-')) prov = e.code.split('-')[0].toUpperCase()
        else prov = 'OTHER'
      }
      const version = e.version ?? (e.code ? String(e.code) : '0')
      const item = { ...e, provider: prov, version }
      byProvider[prov] = byProvider[prov] || []
      byProvider[prov].push(item)
    })
    // for each provider, group by exam title (or base code) and pick latest version
    const result: { provider: string; exams: any[] }[] = []
    for (const prov of Object.keys(byProvider)) {
      const list = byProvider[prov]
      const byName: Record<string, any[]> = {}
      list.forEach((it) => {
        const name = it.title ?? it.code
        byName[name] = byName[name] || []
        byName[name].push(it)
      })
      const cards = Object.entries(byName).map(([name, arr]) => {
        // pick latest by numeric version when possible
        const sorted = arr.slice().sort((a: any, b: any) => {
          const va = parseFloat(String(a.version).replace(/[^0-9.]/g, '')) || 0
          const vb = parseFloat(String(b.version).replace(/[^0-9.]/g, '')) || 0
          return vb - va
        })
        return sorted[0]
      })
      result.push({ provider: prov, exams: cards })
    }
    // sort exams within each provider by level
    const levelOrder: Record<string, number> = {
      Foundational: 0, Fundamentals: 0,
      Associate: 1,
      Professional: 2, Expert: 2,
      Specialty: 3,
    }
    for (const p of result) {
      p.exams.sort((a: any, b: any) => (levelOrder[a.level] ?? 99) - (levelOrder[b.level] ?? 99))
    }
    return result
  }, [exams])

  useEffect(() => {
    if (!selected) return
    // If the current attempt already carries its own questions, skip the fetch
    if (Array.isArray(attemptData?.questions) && attemptData.questions.length > 0) return
    authFetch(`/exams/${selected}/questions`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load questions (${r.status})`)
        return r.json()
      })
      .then((data) => {
        // Handle both old (array) and new (wrapped) response shapes
        if (Array.isArray(data)) {
          setQuestions(data)
          setExamTier(null)
          setExamTotalAvailable(data.length)
          setExamLimited(false)
        } else if (data && Array.isArray(data.questions)) {
          setQuestions(data.questions)
          setExamTier(data.tier ?? null)
          setExamTotalAvailable(data.totalAvailable ?? data.questions.length)
          setExamLimited(!!data.limited)
        }
      })
      .catch((e) => {
        console.error(e)
        setLastError(String(e))
      })
  }, [selected, user])

  // Ensure when navigating to the Home pre-start view for a selected exam
  // we apply per-exam duration defaults (or saved prefs) deterministically.
  // Skip when exam is already started or we're resuming — otherwise this
  // overwrites the saved numQuestions with the exam's defaultQuestions.
  useEffect(() => {
    if (route !== 'home' || !selected) return
    if (examStarted || resumingRef.current) return
    try {
      const meta = exams.find((e: any) => e.code === selected)
      const defDur = typeof meta?.defaultDuration === 'number' ? meta.defaultDuration : 15
      const defQ = meta?.defaultQuestions ?? meta?.defaultQuestionCount ?? (meta?.provider === 'AWS' ? 65 : (questions.length || 10))
      setTakeDomains(['All'])
      setTimed(false)
      setDurationMinutes(defDur)
      setNumQuestions(defQ)
    } catch {}
  }, [route, selected, exams])

  // timer effect for timed exams (respects paused state)
  useEffect(() => {
    if (!examStarted || examMode !== 'timed') return
    if (timeLeft === null) return
    if (paused) return // don't tick while paused
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (!t || t <= 1) {
          clearInterval(id)
          handleSubmitExam(false)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [examStarted, examMode, timeLeft, attemptId, paused])

  // Auto-save exam progress to localStorage for Save & Resume
  useEffect(() => {
    if (!examStarted || !selected || isFinished) return
    const key = `examProgress:${selected}`
    try {
      localStorage.setItem(key, JSON.stringify({
        answers: selectedAnswers,
        flagged: Array.from(flaggedQuestions),
        currentIndex: currentQuestionIndex,
        numQuestions,
        timed,
        timeLeft,
        durationMinutes,
        attemptId: attemptId ?? null,
        examMode: examMode ?? 'casual',
        revealAnswers: revealAnswers ?? 'immediately',
        timestamp: Date.now(),
      }))
    } catch {}
  }, [selectedAnswers, flaggedQuestions, currentQuestionIndex, examStarted, selected, isFinished, timeLeft])

  // Check if saved exam progress exists for the selected exam
  const savedProgress = useMemo(() => {
    if (!selected || examStarted) return null
    try {
      const raw = localStorage.getItem(`examProgress:${selected}`)
      if (!raw) return null
      const saved = JSON.parse(raw)
      const answeredCount = Object.keys(saved.answers || {}).length
      if (answeredCount === 0) return null
      const age = Date.now() - (saved.timestamp || 0)
      if (age > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(`examProgress:${selected}`)
        return null
      }
      return { answeredCount, timestamp: saved.timestamp, total: saved.numQuestions || 0 }
    } catch { return null }
  }, [selected, examStarted])

  // Scan for any saved exam progress across all exams (for resume banners)
  const anySavedExam = useMemo(() => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key || !key.startsWith('examProgress:')) continue
        const code = key.replace('examProgress:', '')
        const raw = localStorage.getItem(key)
        if (!raw) continue
        const saved = JSON.parse(raw)
        const answeredCount = Object.keys(saved.answers || {}).length
        if (answeredCount === 0) continue
        const age = Date.now() - (saved.timestamp || 0)
        if (age > 24 * 60 * 60 * 1000) { localStorage.removeItem(key); continue }
        const meta = exams.find((e: any) => e.code === code)
        return { code, title: meta?.title ?? code, answeredCount, total: saved.numQuestions || 0 }
      }
    } catch {}
    return null
  }, [selected, examStarted, savedProgress, exams])

  // Resume a saved exam from localStorage
  function resumeExam(examCode?: string) {
    const code = examCode ?? selected
    if (!code) return
    const key = `examProgress:${code}`
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return
      const saved = JSON.parse(raw)
      // Set guard so the [selected] useEffect doesn't reset our state
      resumingRef.current = true
      // Set selected first (may trigger effect, but guard protects us)
      if (code !== selected) setSelected(code)
      setRoute('home')
      setSelectedAnswers(saved.answers || {})
      setFlaggedQuestions(new Set(saved.flagged || []))
      setCurrentQuestionIndex(saved.currentIndex || 0)
      if (typeof saved.numQuestions === 'number') setNumQuestions(saved.numQuestions)
      if (typeof saved.timed === 'boolean') setTimed(saved.timed)
      if (typeof saved.durationMinutes === 'number') setDurationMinutes(saved.durationMinutes)
      if (saved.timed && typeof saved.timeLeft === 'number') setTimeLeft(saved.timeLeft)
      if (saved.examMode) setExamMode(saved.examMode)
      if (saved.revealAnswers) setRevealAnswers(saved.revealAnswers)
      // Restore attemptId so Cancel / Complete & Score buttons work
      if (saved.attemptId) {
        setAttemptId(saved.attemptId)
      } else if (!user) {
        setAttemptId(`visitor-${Date.now()}`)
      }
      setExamStarted(true)
      // Clear guard after a tick so effect has run
      setTimeout(() => { resumingRef.current = false }, 100)
    } catch (err) {
      console.error('resumeExam error', err)
      resumingRef.current = false
    }
  }

  // Submit the exam (opt-in) or complete early with partial scoring
  async function handleSubmitExam(earlyComplete = false) {
    if (!selected || !attemptId) return
    const answeredCount = Object.keys(selectedAnswers).filter(id => displayQuestions.some(q => q.id === id)).length
    const totalQuestions = displayQuestions.length
    // Clear saved progress
    try { localStorage.removeItem(`examProgress:${selected}`) } catch {}

    // Visitor (unauthenticated) — compute locally
    if (!user) {
      const qs = displayQuestions as Question[]
      let correct = 0
      const perDomain: Record<string, { correct: number; total: number; score?: number }> = {}
      for (const qn of qs) {
        const sel = selectedAnswers[qn.id]
        const dom = (qn as any).domain || 'General'
        if (!perDomain[dom]) perDomain[dom] = { correct: 0, total: 0 }
        if (sel === undefined) { if (!earlyComplete) perDomain[dom].total++; continue }
        perDomain[dom].total++
        // Check correctness using isCorrect field on choice objects
        let isRight = false
        const correctIds = qn.choices.filter((c) => c.isCorrect).map((c) => c.id)
        if (Array.isArray(sel)) {
          isRight = sel.length === correctIds.length && sel.every((v) => correctIds.includes(v))
        } else {
          isRight = correctIds.length === 1 && correctIds[0] === sel
        }
        if (isRight) { correct++; perDomain[dom].correct++ }
      }
      for (const k of Object.keys(perDomain)) { const e = perDomain[k]; e.score = e.total > 0 ? Math.round((e.correct / e.total) * 100) : 0 }
      const denom = earlyComplete ? answeredCount : totalQuestions
      const score = denom > 0 ? Math.round((correct / denom) * 100) : 0
      setAttemptData({
        attemptId, examCode: selected, score, correctCount: correct,
        total: denom, answeredCount, totalQuestions, earlyComplete,
        perDomain, finishedAt: new Date().toISOString(),
        questions: qs.map((qn) => ({ ...qn, selectedChoiceId: Array.isArray(selectedAnswers[qn.id]) ? undefined : selectedAnswers[qn.id] as string, selectedChoiceIds: Array.isArray(selectedAnswers[qn.id]) ? selectedAnswers[qn.id] : undefined })),
      })
      setExamStarted(false); setTimeLeft(null)
      setShowSubmitConfirm(false); setShowCompleteEarlyConfirm(false)
      return
    }

    // Authenticated — call server finish
    try {
      const finOpts: RequestInit = { method: 'PATCH' }
      if (earlyComplete) {
        finOpts.headers = { 'Content-Type': 'application/json' }
        finOpts.body = JSON.stringify({ earlyComplete: true })
      }
      const fin = await authFetch(`/attempts/${attemptId}/finish`, finOpts)
      const finData = await fin.json()
      if ('attemptId' in finData) {
        // Re-fetch full attempt to get the answers array (PATCH response may omit it)
        let fullAttempt = finData
        try {
          const r2 = await authFetch(`/attempts/${finData.attemptId}`)
          if (r2.ok) fullAttempt = await r2.json()
        } catch {}
        const computed = computeDerivedAttempt(fullAttempt, Array.isArray(fullAttempt.questions) ? fullAttempt.questions : undefined)
        setAttemptData(computed)
        if (Array.isArray(fullAttempt.questions)) setQuestions(fullAttempt.questions)
        handleGamificationReward(computed)
        setExamStarted(false); setTimeLeft(null)
        if (showAttempts) { try { const r3 = await authFetch('/attempts'); const dd = await r3.json(); setAttemptsList(dd.attempts ?? []) } catch {} }
      } else { setLastError(JSON.stringify(finData)) }
    } catch (err) { console.error('handleSubmitExam error', err); setLastError(String(err)) }
    setShowSubmitConfirm(false); setShowCompleteEarlyConfirm(false)
  }

  // when exam selected, check for an existing attempt but DO NOT auto-create one — user must Start
  useEffect(() => {
    // If we're in the middle of a resume, don't interfere
    if (resumingRef.current) return
    if (!selected) {
      setAttemptId(null)
      setExamStarted(false)
      return
    }
    const key = `attempt:${selected}`
    const existingRaw = (() => {
      try { return localStorage.getItem(key) } catch { return null }
    })()
    // support legacy value (plain attemptId string) and new JSON value
    const existing = (() => {
      if (!existingRaw) return null
      try {
        const parsed = JSON.parse(existingRaw)
        if (parsed && parsed.attemptId) return parsed.attemptId
      } catch {}
      return existingRaw
    })()

    if (!existing) {
      setAttemptId(null)
      setExamStarted(false)
      return
    }

    ;(async () => {
      try {
        const r = await authFetch(`/attempts/${existing}`)
        if (!r.ok) {
          try { localStorage.removeItem(key) } catch {}
          setAttemptId(null)
          setExamStarted(false)
          return
        }
        const data = await r.json()
        if (data?.finishedAt) {
          try { localStorage.removeItem(key) } catch {}
          setAttemptId(null)
          setExamStarted(false)
          return
        }
        // active attempt — resume
        setAttemptId(existing)
        setAttemptData(data)
        // if attempt contains a per-attempt question set, use it
        if (Array.isArray(data.questions)) setQuestions(data.questions)
        setExamStarted(true)
      } catch (err) {
        console.error('validate existing attempt error', err)
        setAttemptId(null)
        setExamStarted(false)
      }
    })()

    // ensure pre-start form is fresh for this exam when there is no active attempt
    try {
      if (!existing) {
        const meta = exams.find((e: any) => e.code === selected)
        const def = meta?.defaultQuestions ?? meta?.defaultQuestionCount ?? (meta?.provider === 'AWS' ? 65 : (questions.length || 10))
        const defDur = typeof meta?.defaultDuration === 'number' ? meta.defaultDuration : 15
        setTakeDomains(['All'])
        setTimed(false)
        setNumQuestions(def)
        setDurationMinutes(defDur)
      }
    } catch {}
  }, [selected])

  // helper to render choice content (plain text, JSON, YAML, or CLI snippets)
  const renderChoiceContent = (val: any, q?: Question, inline = false) => {
    // handle Choice objects — extract text
    const s = typeof val === 'string' ? val : (val?.text != null ? String(val.text) : (val == null ? '' : String(val)))
    const isLikelyJson = (q?.format === 'json') || s.trim().startsWith('{') || s.trim().startsWith('[')
    const isLikelyYaml = (q?.format === 'yaml')
    // CLI detection: require either explicit format, multiple tokens with typical CLI patterns,
    // or a leading shell prompt. Avoid matching plain titles like 'AWS Config'.
    const isLikelyCli = (q?.format === 'cli') || s.includes('\n') || /^\s*(?:\$|sudo\b)/.test(s) || /^\s*aws\s+[a-z0-9-]/.test(s)

    // For JSON or multi-line/CLI snippets, prefer block rendering so syntax highlighting is applied.
    if (isLikelyJson) {
      try {
        const parsed = JSON.parse(s)
        const pretty = JSON.stringify(parsed, null, 2)
        return <CodeBlock code={pretty} language="json" inline={false} />
      } catch {
        // fallthrough to plain
      }
    }

    if (isLikelyYaml) {
      return <CodeBlock code={s} language="yaml" inline={false} />
    }

    if (isLikelyCli) {
      return <CodeBlock code={s} language="bash" inline={false} />
    }

    // otherwise respect inline preference for compact one-line choices
    return inline ? <code className="text-sm font-mono">{s}</code> : <span>{s}</span>
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      <Sidebar 
        currentRoute={route} 
        onNavigate={(key) => {
          setRoute(key as any); 
          if(key === 'home') { setSelected(null); setExamStarted(false); setAttemptData(null); setShowAttempts(false); setAttemptsList(null); }
        }}
        logout={logout}
        login={login}
        user={user}
        xp={gamState.xp}
        level={gamLevel.level}
        streak={gamState.streak}
      />

      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <div className="absolute top-4 right-4 z-10 hidden md:flex gap-2">
           <ThemeToggle />
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="container mx-auto max-w-6xl space-y-8">
            {/* Header (Legacy Header Partial Replacement) */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
               <div className="flex flex-col">
                  {selected && (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                       <span>{selected}</span>
                       {examTier && <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs capitalize">{examTier}</span>}
                    </div>
                  )}
                  <h1 className="text-3xl font-bold tracking-tight">
                    {route === 'home' && 'Overview'}
                    {route === 'practice' && 'Practice Exams'}
                    {route === 'analytics' && 'Analytics'}
                    {route === 'account' && 'Account Settings'}
                    {route === 'pricing' && 'Plans & Pricing'}
                    {route === 'admin' && 'Admin Console'}
                  </h1>
               </div>
            </header>

            {route === 'practice' && (
              <div className="mb-6">
                {/* Resume banner when an exam is in progress or has saved progress */}
                {anySavedExam && !examStarted && (
                  <div className="mb-4 p-4 rounded-lg bg-card border border-border shadow-sm flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-md flex items-center justify-center bg-primary/10 text-primary text-lg flex-shrink-0">
                        <Play className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">Exam in progress</div>
                        <div className="text-sm text-muted-foreground">{anySavedExam.title} — {anySavedExam.answeredCount}/{anySavedExam.total} answered</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        className="px-3 py-1 rounded-md bg-primary text-white text-sm inline-flex items-center gap-2 shadow-sm hover:opacity-95 transition"
                        onClick={() => resumeExam(anySavedExam.code)}
                      >
                        <Play className="w-4 h-4" />
                        Resume
                      </button>
                    </div>
                  </div>
                )}
                <h2 className="text-xl font-semibold mb-4">Practice Exams</h2>
                <div role="note" className="mb-4 p-3 rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground flex items-start gap-3">
                  <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-primary" aria-hidden />
                  <div className="leading-snug">This product is not affiliated with or endorsed by any certification provider. All questions are original and created for practice purposes only.</div>
                </div>
                <div className="space-y-6">
                  {providers.map((p) => (
                    <div key={p.provider}>
                      <h3 className="font-semibold mb-2">{p.provider}</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {p.exams.map((ex: any) => (
                          <div key={ex.code} className="p-4 rounded-lg border border-border bg-card text-card-foreground shadow-sm relative">
                            <div>
                              <div className="font-medium">{ex.title ?? ex.code}</div>
                              <div className="flex items-center gap-2 mt-1">
                                {/* level badge removed — levels are numeric 0..3 in the schema */}
                                <span className="text-xs text-muted-foreground">{ex.code}</span>
                              </div>
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              <button
                                className={`px-3 py-1 rounded font-medium transition-colors ${examStarted || anySavedExam || (selected && savedProgress) ? 'bg-muted/60 text-muted-foreground/60 border border-border cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
                                disabled={!!(examStarted || anySavedExam || (selected && savedProgress))}
                                title={examStarted || anySavedExam || (selected && savedProgress) ? 'Complete or cancel your current exam first' : 'Setup this exam'}
                                onClick={() => {
                                  if (examStarted || anySavedExam || (selected && savedProgress)) return
                                  setupExamFromMeta(ex)
                                }}
                              >
                                Setup Exam
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelected(ex.code); setRoute('analytics') }}
                                title={`View analytics for ${ex.title ?? ex.code}`}
                                className="px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm inline-flex items-center gap-2"
                                aria-label={`Analytics for ${ex.title ?? ex.code}`}
                              >
                                <BarChart3 className="w-4 h-4" aria-hidden />
                                <span className="sr-only">Analytics</span>
                              </button>
                            </div>

                            {ex.logo && (
                              ex.logoHref ? (
                                <a
                                  href={ex.logoHref}
                                  title="Amazon.com Inc., Apache License 2.0 <http://www.apache.org/licenses/LICENSE-2.0>, via Wikimedia Commons"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="absolute bottom-2 right-2 inline-flex items-center justify-center bg-background rounded-full p-1 shadow-sm"
                                  aria-label={`${ex.provider ?? 'Provider'} logo link`}
                                >
                                  <img
                                    src={ex.logo}
                                    alt={`${ex.provider ?? 'Provider'} logo`}
                                    className="h-6 w-auto"
                                    style={{ objectFit: 'contain' }}
                                  />
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
                    </div>
                  ))}

                </div>
              </div>
            )}

            {route === 'analytics' && (
              <div className="mb-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">Analytics</h2>
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      {selected ? (
                        <>
                          {selectedMeta?.title ?? selected}
                          {/* level badge removed from analytics header — levels are numeric 0..3 */}
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
                    {(() => {
                      const passMark = typeof selectedMeta?.passMark === 'number' ? selectedMeta.passMark : 70
                      return (
                        <>
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

                    {/* Domain Performance (detailed bars) */}
                    {analyticsDomains && Object.keys(analyticsDomains).length > 0 && (() => {
                      const entries = Object.entries(analyticsDomains)
                        .map(([domain, v]) => ({ domain, ...v }))
                        .sort((a, b) => a.avgScore - b.avgScore) // worst-first
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
                                <div key={domain} className="">
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
                                            // If server says attempt not found, refresh data and don't surface a global error
                                            if (res.status === 404) {
                                              await fetchScoreHistory(selected)
                                              return
                                            }
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
                                          // ensure UI displays derived (latest) stats rather than possibly stale stored ones
                                          const computed = computeDerivedAttempt(d, Array.isArray(d.questions) ? d.questions : undefined)
                                          setAttemptData(computed)
                                          if (Array.isArray(computed.questions)) setQuestions(computed.questions)
                                          setSelected(d.examCode)
                                          setRoute('home')
                                        } else {
                                          const t = await res.text()
                                          setLastError(t)
                                        }
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
                      )}
                    </div>
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* Account / Achievements page */}
            {route === 'account' && (
              <div className="mb-6">
                {/* Resume banner when an exam is in progress or has saved progress */}
                {anySavedExam && !examStarted && (
                  <div className="mb-4 p-4 rounded-md bg-muted/40 border border-border shadow-sm flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-md flex items-center justify-center bg-primary/10 text-primary flex-shrink-0">
                        <Play className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">Exam in progress</div>
                        <div className="text-sm text-muted-foreground">{anySavedExam.title} — {anySavedExam.answeredCount}/{anySavedExam.total} answered</div>
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
                <AccountPage />
                <div className="mt-6">
                  <Leaderboard />
                </div>
              </div>
            )}

            {route === 'admin' && (
              <div className="mb-6">
                <AdminPanel />
              </div>
            )}

            {route === 'pricing' && (
              <div className="mb-6">
                {/* Resume banner when an exam is in progress or has saved progress */}
                {anySavedExam && !examStarted && (
                  <div className="mb-4 p-4 rounded-md bg-muted/40 border border-border shadow-sm flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-md flex items-center justify-center bg-primary/10 text-primary flex-shrink-0">
                        <Play className="w-5 h-5" aria-hidden />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground">Exam in progress</div>
                        <div className="text-sm text-muted-foreground">{anySavedExam.title} — {anySavedExam.answeredCount}/{anySavedExam.total} answered</div>
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
                <PricingPage />
              </div>
            )}

            {/* Resume banner on homepage when no exam is currently selected */}
            {route === 'home' && !selected && anySavedExam && (
              <div className="mb-4 p-4 rounded-md bg-muted/40 border border-border shadow-sm flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-md flex items-center justify-center bg-primary/10 text-primary flex-shrink-0">
                    <Play className="w-5 h-5" aria-hidden />
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">Exam in progress</div>
                    <div className="text-sm text-muted-foreground">{anySavedExam.title} — {anySavedExam.answeredCount}/{anySavedExam.total} answered</div>
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

            {/* Homepage hero when no exam selected */}
            {route === 'home' && !selected && (
              <div className="mb-8 p-8 rounded-lg bg-card border border-border shadow-sm">
                <div className="max-w-4xl mx-auto text-center">
                  <h2 className="text-3xl sm:text-4xl font-extrabold mb-3">Practice smarter. Pass faster.</h2>
                  <p className="text-muted-foreground mb-6">Timed or casual practice exams, focused by domain, with per-question explanations and review sessions to help you improve.</p>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="p-4 rounded-lg bg-muted/50 dark:bg-card/5 border border-border/60 dark:border-transparent">
                      <div className="text-2xl">⏱️</div>
                      <div className="font-semibold mt-2">Timed & Casual</div>
                      <div className="text-sm text-muted-foreground">Practice under exam-like timing or take a relaxed walkthrough.</div>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50 dark:bg-card/5 border border-border/60 dark:border-transparent">
                      <div className="text-2xl">
                        <svg role="img" aria-label="Exam checklist" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className="w-7 h-7 inline-block">
                          <defs>
                            <linearGradient id="g1" x1="0" x2="1" y1="0" y2="1">
                              <stop offset="0" stopColor="#06b6d4"/>
                              <stop offset="1" stopColor="#8b5cf6"/>
                            </linearGradient>
                          </defs>
                          <rect x="6" y="8" width="40" height="48" rx="3" className="fill-muted" stroke="url(#g1)" strokeWidth="2.5" />
                          <path d="M16 18h20M16 26h20M16 34h20" className="stroke-muted-foreground" strokeWidth="3" strokeLinecap="round" />
                          <rect x="44" y="4" width="16" height="16" rx="3" fill="url(#g1)" />
                          <path d="M48 10l3 3L58 6" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        </svg>
                      </div>
                      <div className="font-semibold mt-2">Exam Checklists</div>
                      <div className="text-sm text-muted-foreground">Organise your study with focused checklists and topic goals.</div>
                    </div>
                    <div className="p-4 rounded-lg bg-muted/50 dark:bg-card/5 border border-border/60 dark:border-transparent">
                      <div className="text-2xl">📈</div>
                      <div className="font-semibold mt-2">Review & Insights</div>
                      <div className="text-sm text-muted-foreground">View per-domain scores and detailed explanations after each attempt.</div>
                    </div>
                    <button onClick={() => setRoute('account')} className="p-4 rounded-lg bg-muted/50 dark:bg-card/5 border border-border/60 dark:border-transparent hover:border-primary transition-colors text-left">
                      <div className="text-2xl">
                        <Trophy className="w-7 h-7 inline-block text-primary" />
                      </div>
                      <div className="font-semibold mt-2">Leaderboard</div>
                      <div className="text-sm text-muted-foreground">Compete with fellow learners and climb the ranks.</div>
                    </button>
                  </div>

                  <div className="flex items-center justify-center gap-4">
                    <button onClick={() => setRoute('practice')} className="px-4 py-2 rounded bg-primary text-white font-semibold">Browse Practice Exams</button>
                    {/* Get Started removed per design */}
                  </div>
                </div>
                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-muted/50 dark:bg-card/5 border border-border/60 dark:border-transparent">
                    <div className="text-2xl">🧭</div>
                    <div className="font-semibold mt-2">Domain Focus</div>
                    <div className="text-sm text-muted-foreground">Choose specific domains to drill into weaker areas.</div>
                  </div>

                    <div className="p-4 rounded-lg bg-muted/50 dark:bg-card/5 border border-border/60 dark:border-transparent">
                      <div className="text-2xl">
                        <Filter className="w-7 h-7 inline-block text-muted-foreground" />
                      </div>
                      <div className="font-semibold mt-2">Advanced Question Filtering</div>
                      <div className="text-sm text-muted-foreground">Filter question sets by services or keywords.</div>
                    </div>
                </div>
              </div>
            )}
            {route === 'home' && selected ? (
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Questions</h2>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-muted-foreground">{selected}{selectedMeta?.title ? ` — ${selectedMeta.title}` : ''}</div>
                  <button
                    className="px-3 py-1 rounded bg-muted-foreground text-white text-sm"
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
                        className="px-3 py-1 rounded-md bg-primary text-white text-sm inline-flex items-center gap-2 shadow-sm hover:opacity-95 transition-colors"
                        onClick={() => {
                          // Save progress is already handled by the auto-save effect.
                          // Just exit the exam view so user can navigate freely and resume later.
                          setExamStarted(false)
                          showToast('Progress saved — resume any time', 'info')
                        }}
                        title="Save progress and exit — resume later"
                      >
                        <Save className="w-4 h-4" />
                        Save for Later
                      </button>
                      <button
                        className="px-3 py-1 rounded-md bg-red-600 text-white text-sm inline-flex items-center gap-2 shadow-sm hover:bg-red-700 transition-colors"
                        onClick={() => setShowCancelConfirm(true)}
                      >
                        <X className="w-4 h-4" />
                        Cancel
                      </button>
                    </>
                  )}
                  {examStarted && timed && timeLeft !== null && (
                    <div className="flex items-center gap-2">
                      <button
                        className={`px-2 py-1 rounded text-sm ${paused ? 'bg-primary/90 text-white' : 'bg-accent'}`}
                        onClick={() => setPaused((p) => !p)}
                        title={paused ? 'Resume timer' : 'Pause timer'}
                      >
                        {paused ? (
                          <Play className="w-4 h-4" />
                        ) : (
                          <Pause className="w-4 h-4" />
                        )}
                      </button>
                      <div className={`text-sm ${paused ? 'text-yellow-500 animate-pulse' : 'text-muted-foreground'}`}>{Math.floor(timeLeft/60).toString().padStart(2,'0')}:{(timeLeft%60).toString().padStart(2,'0')}{paused ? ' (paused)' : ''}</div>
                    </div>
                  )}
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
                          <div className="text-xs text-muted-foreground">{a.attemptId} — {a.startedAt ? new Date(a.startedAt).toLocaleString() : '—'}</div>
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
                                // if attempt contains its own question set, use it
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
                  <div className="text-sm text-muted-foreground">Loading…</div>
                )}
              </div>
            )}

            {/* Results moved here (top) */}
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
                      <div style={{ background: bg, boxShadow: `0 0 18px ${shadow}`, color: textColor }} className={`flex items-center justify-center w-20 h-20 rounded-full text-2xl font-bold`}>
                        <span style={{ color: textColor }}>{score}%</span>
                      </div>
                    )
                  })()}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-muted-foreground">
                          {attemptData.correctCount ?? 0} / {attemptData.total ?? 0} correct
                          {attemptData.earlyComplete && <span className="ml-2 text-primary">(completed early — {attemptData.answeredCount} of {attemptData.totalQuestions} questions)</span>}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">Completed: {attemptData.finishedAt ? new Date(attemptData.finishedAt).toLocaleString() : '—'}</div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {attemptData.perDomain && (() => {
                        const pm = typeof selectedMeta?.passMark === 'number' ? selectedMeta.passMark : 70
                        const entries = Object.entries(attemptData.perDomain)
                          .map(([domain, vals]: any) => ({ domain, score: Number(vals.score) || 0, correct: vals.correct, total: vals.total }))
                          .sort((a: any, b: any) => a.score - b.score) // worst-first
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
                  <div className="flex flex-col gap-2">
                    <button
                      className="px-3 py-1.5 rounded bg-accent text-sm inline-flex items-center gap-2 hover:bg-accent transition-colors"
                      onClick={downloadAttemptCSV}
                      title="Download report as CSV"
                    >
                      <Download className="w-4 h-4" />
                      CSV
                    </button>
                    <button
                      className="px-3 py-1.5 rounded bg-accent text-sm inline-flex items-center gap-2 hover:bg-accent transition-colors"
                      onClick={downloadAttemptPDF}
                      title="Open printable report (Save as PDF)"
                    >
                      <FileText className="w-4 h-4" />
                      PDF
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* If attempt finished, show domain dropdown filter and hide Q&A */}
            {isFinished && route === 'home' ? (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold">Review</h3>
                  <div className="flex items-center gap-2">
                    <button
                      className="px-3 py-1 rounded-md bg-primary text-primary-foreground text-sm inline-flex items-center gap-2 shadow-sm hover:bg-primary/90 transition-colors"
                      onClick={async () => { try { await createAttempt(); } catch {} }}
                      title="Start another attempt with the same settings"
                    >
                      <Play className="w-4 h-4" />
                      Repeat Exam
                    </button>
                    <button
                      className="px-3 py-1 rounded-md bg-accent text-foreground text-sm inline-flex items-center gap-2 hover:bg-accent/80 transition-colors"
                      onClick={() => { try { setAttemptData(null); setAttemptId(null); setExamStarted(false); } catch {} }}
                      title="Return to the exam start form"
                    >
                      Return to Exam
                    </button>
                  </div>
                </div>

                <div className="mb-3">
                  {(() => {
                    const domains: string[] = attemptData?.perDomain ? Object.keys(attemptData.perDomain) : Array.from(new Set(questions.map((q) => (q as any).domain)))
                    const allSelected = reviewDomains.includes('All')
                    return (
                      <div className="w-full md:w-96">
                        <label className="block text-xs text-muted-foreground mb-1">Domains</label>
                        {/* Dropdown toggle */}
                        <div className="relative">
                          <button
                            ref={reviewDomainToggleRef}
                            onClick={() => setReviewDomainOpen((v) => !v)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 border border-border/50 text-sm text-left hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring transition"
                          >
                            <span className={!allSelected && reviewDomains.length > 0 ? 'text-foreground' : 'text-muted-foreground'}>
                              {allSelected ? 'All domains' : reviewDomains.length === 0 ? 'Select domains…' : `${reviewDomains.length} domain${reviewDomains.length > 1 ? 's' : ''} selected`}
                            </span>
                            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${reviewDomainOpen ? 'rotate-180' : ''}`} />
                          </button>

                          {/* Dropdown panel */}
                          {reviewDomainOpen && (
                            <div ref={reviewDomainRef} className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg bg-card border border-border/60 shadow-xl">
                              {/* Quick actions */}
                              <div className="flex gap-2 px-2 py-1.5 border-b border-border/40">
                                <button className="text-[10px] text-primary hover:text-primary dark:hover:text-primary transition" onClick={() => { setReviewDomains([...domains]); setReviewDomainOpen(false); setReviewIndex(0) }}>Select all individually</button>
                                <button className="text-[10px] text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground transition" onClick={() => { setReviewDomains(['All']); setReviewDomainOpen(false); setReviewIndex(0) }}>All (default)</button>
                              </div>
                              {/* All option */}
                              <button
                                onClick={() => { setReviewDomains(['All']); setReviewDomainOpen(false); setReviewIndex(0) }}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/50 transition ${allSelected ? 'text-primary' : 'text-muted-foreground'}`}
                              >
                                <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${allSelected ? 'bg-primary border-primary text-white' : 'border-border'}`}>
                                  {allSelected && '✓'}
                                </span>
                                All domains
                              </button>
                              {/* Domain options */}
                              {domains.map((d) => {
                                const checked = !allSelected && reviewDomains.includes(d)
                                return (
                                  <button
                                    key={d}
                                    onClick={() => {
                                      if (allSelected) {
                                        setReviewDomains([d])
                                      } else {
                                        setReviewDomains((prev) => {
                                          const next = prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
                                          return next.length === 0 ? ['All'] : next
                                        })
                                      }
                                      setReviewIndex(0)
                                    }}
                                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/50 transition ${checked ? 'text-primary' : 'text-muted-foreground'}`}
                                  >
                                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${checked ? 'bg-primary border-primary text-white' : 'border-border'}`}>
                                      {checked && '✓'}
                                    </span>
                                    {d}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                        {/* Selected chips below */}
                        {!allSelected && reviewDomains.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {reviewDomains.map((d) => (
                              <span key={d}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 dark:bg-primary/20 text-primary text-xs font-medium border border-primary/30 dark:border-primary/30 cursor-pointer hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-300 hover:border-red-300 dark:hover:border-red-400/40 transition"
                                onClick={() => { setReviewDomains((prev) => { const next = prev.filter((x) => x !== d); return next.length === 0 ? ['All'] : next }); setReviewIndex(0) }}
                                title={`Remove ${d}`}
                              >
                                {d}
                                <X className="w-3 h-3" />
                              </span>
                            ))}
                            <button className="text-[10px] text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground ml-1 transition" onClick={() => { setReviewDomains(['All']); setReviewIndex(0) }}>Clear all</button>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>

                <div className="space-y-3">
                  {(() => {
                    // If the attempt was completed early, restrict review to answered questions only
                    const baseQuestions = (attemptData?.earlyComplete && Array.isArray(attemptData?.answers))
                      ? questions.filter((q) => attemptData.answers.some((a: any) => String(a.questionId) === String(q.id)))
                      : questions

                    const domainFiltered = (reviewDomains.includes('All') || reviewDomains.length === 0)
                      ? baseQuestions
                      : baseQuestions.filter((q) => reviewDomains.includes((q as any).domain))
                    const deriveRecord = (q: Question) => {
                      // pick the latest answer for this question (answers may contain history)
                      let answerRecord: any = undefined
                      if (Array.isArray(attemptData?.answers)) {
                        const matches = attemptData.answers.filter((a: any) => a.questionId === q.id)
                        if (matches.length === 1) answerRecord = matches[0]
                        else if (matches.length > 1) {
                          // pick one with latest createdAt
                          matches.sort((a: any, b: any) => {
                            const ta = a?.createdAt ? String(a.createdAt) : ''
                            const tb = b?.createdAt ? String(b.createdAt) : ''
                            return ta.localeCompare(tb)
                          })
                          answerRecord = matches[matches.length - 1]
                        }
                      }
                      const chosen = answerRecord?.selectedChoiceIds ?? answerRecord?.selectedChoiceId ?? answerRecord?.selectedIndices ?? answerRecord?.selectedIndex ?? selectedAnswers[q.id]
                      const isCorrect = typeof answerRecord?.correct === 'boolean' ? answerRecord.correct : (
                        Array.isArray(chosen)
                          ? (Array.isArray(q.choices) && q.choices.filter((c: any) => c.isCorrect).length === chosen.length && q.choices.filter((c: any) => c.isCorrect).every((c: any) => chosen.includes(c.id)))
                          : (typeof chosen === 'string' && q.choices?.some((c: any) => c.id === chosen && c.isCorrect))
                      )
                      return { answerRecord, chosen, isCorrect }
                    }

                    // apply incorrectOnly filter
                    const visibleAll = domainFiltered.map((q) => ({ q, ...deriveRecord(q) }))
                    const visible = incorrectOnly ? visibleAll.filter((v) => !v.isCorrect) : visibleAll

                    return (
                      <>
                        <div className="flex items-center gap-3 mb-2">
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={incorrectOnly} onChange={(e) => setIncorrectOnly(e.target.checked)} />
                            <span className="text-sm text-muted-foreground">Show incorrect only</span>
                          </label>
                          <div className="ml-auto text-sm text-muted-foreground">{baseQuestions.length} total{attemptData?.earlyComplete ? ` (${questions.length} in bank)` : ''}</div>
                        </div>

                        {visible.length === 0 ? <div className="text-sm text-muted-foreground p-3">No questions to review.</div> : (() => {
                          const idx = Math.max(0, Math.min(reviewIndex, visible.length - 1))
                          const item = visible[idx]
                          const chosenIds: string[] = Array.isArray(item.chosen) ? item.chosen : (typeof item.chosen === 'string' ? [item.chosen] : [])

                          return (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <div className="text-sm text-muted-foreground">Question {idx + 1} / {visible.length}</div>
                                <div className="flex items-center gap-2">
                                  <button className="px-2 py-1 rounded bg-accent text-sm" onClick={() => setReviewIndex((i) => Math.max(0, i - 1))} disabled={idx === 0}>Prev</button>
                                  <button className="px-2 py-1 rounded bg-accent text-sm" onClick={() => setReviewIndex((i) => Math.min(visible.length - 1, i + 1))} disabled={idx >= visible.length - 1}>Next</button>
                                </div>
                              </div>

                              {/* Redesigned review card */}
                              <div className={`p-4 rounded-lg border-l-4 ${item.isCorrect ? 'border-l-green-500' : 'border-l-red-500'} border border-border bg-card`}>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="font-medium text-base flex-1">{item.q.question}</div>
                                  <span className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${item.isCorrect ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>
                                    {item.isCorrect ? '✓ Correct' : '✗ Incorrect'}
                                  </span>
                                </div>

                                {item.q.domain && <div className="mt-1.5 text-xs text-muted-foreground">Domain: {item.q.domain}</div>}
                                {Array.isArray(item.q.skills) && item.q.skills.length > 0 && (
                                  <div className="mt-0.5 text-xs text-muted-foreground">
                                    <span className="font-medium">Skills tested: </span>{item.q.skills.join(' · ')}
                                  </div>
                                )}

                                {/* All choices list */}
                                <div className="mt-3 space-y-1.5">
                                  {(item.q.choices ?? []).map((c: any, ci: number) => {
                                    const cid = typeof c === 'string' ? String(ci) : (c?.id ?? String(ci))
                                    const cText = typeof c === 'string' ? c : (c?.text ?? '')
                                    const isChosen = chosenIds.includes(cid)
                                    const isCorrectChoice = typeof c === 'object' && !!c?.isCorrect
                                    const letter = String.fromCharCode(65 + ci)
                                    // determine visual style
                                    let bg = 'bg-muted/50 border-border/40'
                                    let icon: React.ReactNode = <span className="text-muted-foreground text-xs font-mono">{letter}</span>
                                    if (isChosen && isCorrectChoice) {
                                      bg = 'bg-green-50 dark:bg-green-900/25 border-green-400/50 dark:border-green-600/40'
                                      icon = <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                                    } else if (isChosen && !isCorrectChoice) {
                                      bg = 'bg-red-50 dark:bg-red-900/25 border-red-400/50 dark:border-red-600/40'
                                      icon = <X className="w-4 h-4 text-red-500" />
                                    } else if (isCorrectChoice) {
                                      bg = 'bg-green-50 dark:bg-green-900/25 border-green-400/50 dark:border-green-600/40'
                                      icon = <Check className="w-4 h-4 text-green-600 dark:text-green-400" />
                                    }
                                    return (
                                      <div key={cid} className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border text-sm ${bg}`}>
                                        <span className="shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center">{icon}</span>
                                        <div className="flex-1">
                                          <span className={`${isChosen ? 'font-semibold' : ''}`}>{renderChoiceContent(c, item.q, true)}</span>
                                          {isChosen && !isCorrectChoice && <span className="ml-2 text-[10px] text-red-500 font-medium">your answer</span>}
                                          {!isChosen && isCorrectChoice && <span className="ml-2 text-[10px] text-green-600 dark:text-green-400 font-medium">correct answer</span>}
                                          {typeof c === 'object' && c?.explanation && (
                                            <div className="mt-1 text-xs text-muted-foreground">{c.explanation}</div>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>

                                {/* Explanation */}
                                {item.q.explanation && (
                                  <div className="mt-3 text-sm p-3 rounded-lg bg-primary/5 border border-primary/20 dark:border-border/30">
                                    <div className="flex items-start justify-between gap-4">
                                      <div><span className="font-semibold">Explanation:</span> {item.q.explanation}</div>
                                      {item.q.docs && (
                                        <a href={item.q.docs} target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-accent text-foreground dark:text-white text-xs hover:bg-accent transition">
                                          <ExternalLink className="w-3.5 h-3.5" />
                                          Docs
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })()}
                      </>
                    )
                  })()}
                </div>
              </div>
            ) : null}

            {/* progress bar intentionally only shown on the Analytics page now */}
            {/* Hide pre-start form when an attempt is finished (we're in Review mode) */}
            {!examStarted && selected && !isFinished && route === 'home' && (
              <div className="mb-6 p-4 rounded-lg border border-border bg-card shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">Start exam</h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold">
                      ⚡ Lv{gamLevel.level} · {gamState.xp} XP
                    </span>
                  </div>
                  {/* removed available count */}
                </div>

                {/* Tier-limit banner */}
                {examLimited && (
                  <div className="mb-4 p-3 rounded-lg border border-primary/30 dark:border-primary/30 bg-primary/10 text-sm">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-primary">
                        🔒 You have access to <strong>{questions.length}</strong> of <strong>{examTotalAvailable}</strong> questions
                        {examTier === 'visitor' && ' (sign in to unlock more)'}
                        {examTier === 'registered' && ' (upgrade to unlock all)'}
                      </span>
                      <button
                        onClick={() => examTier === 'visitor' ? login() : setRoute('pricing')}
                        className="px-3 py-1 rounded text-xs font-semibold bg-primary text-white hover:bg-primary/80"
                      >
                        {examTier === 'visitor' ? 'Sign in' : 'View plans'}
                      </button>
                    </div>
                  </div>
                )}

                <div className="mb-4">
                  {(() => {
                    const domains: string[] = attemptData?.perDomain ? Object.keys(attemptData.perDomain) : Array.from(new Set(questions.map((q) => (q as any).domain)))
                    const allSelected = takeDomains.includes('All')
                    const locked = !!attemptId && !isFinished
                    return (
                      <div className="w-full md:w-96">
                        <label className="block text-xs text-muted-foreground mb-1">Domains</label>
                        {/* Dropdown toggle */}
                        <div className="relative">
                          <button
                            ref={domainToggleRef}
                            onClick={() => setDomainOpen((v) => !v)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 border border-border/50 text-sm text-left hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring transition ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={locked}
                          >
                            <span className={!allSelected && takeDomains.length > 0 ? 'text-foreground' : 'text-muted-foreground'}>
                              {allSelected ? 'All domains' : takeDomains.length === 0 ? 'Select domains…' : `${takeDomains.length} domain${takeDomains.length > 1 ? 's' : ''} selected`}
                            </span>
                            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${domainOpen ? 'rotate-180' : ''}`} />
                          </button>

                          {/* Dropdown panel */}
                          {domainOpen && !locked && (
                            <div ref={domainRef} className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg bg-card border border-border/60 shadow-xl">
                              {/* Quick actions */}
                              <div className="flex gap-2 px-2 py-1.5 border-b border-border/40">
                                <button className="text-[10px] text-primary hover:text-primary dark:hover:text-primary transition" onClick={() => { setTakeDomains([...domains]); setDomainOpen(false) }}>Select all individually</button>
                                <button className="text-[10px] text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground transition" onClick={() => { setTakeDomains(['All']); setDomainOpen(false) }}>All (default)</button>
                              </div>
                              {/* All option */}
                              <button
                                onClick={() => { setTakeDomains(['All']); setDomainOpen(false) }}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/50 transition ${allSelected ? 'text-primary' : 'text-muted-foreground'}`}
                              >
                                <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${allSelected ? 'bg-primary border-primary text-white' : 'border-border'}`}>
                                  {allSelected && '✓'}
                                </span>
                                All domains
                              </button>
                              {/* Domain options */}
                              {domains.map((d) => {
                                const checked = !allSelected && takeDomains.includes(d)
                                return (
                                  <button
                                    key={d}
                                    onClick={() => {
                                      if (allSelected) {
                                        setTakeDomains([d])
                                      } else {
                                        setTakeDomains((prev) => {
                                          const next = prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
                                          return next.length === 0 ? ['All'] : next
                                        })
                                      }
                                    }}
                                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/50 transition ${checked ? 'text-primary' : 'text-muted-foreground'}`}
                                  >
                                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${checked ? 'bg-primary border-primary text-white' : 'border-border'}`}>
                                      {checked && '✓'}
                                    </span>
                                    {d}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                        {/* Selected chips below */}
                        {!allSelected && takeDomains.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {takeDomains.map((d) => (
                              <span key={d}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 dark:bg-primary/20 text-primary text-xs font-medium border border-primary/30 dark:border-primary/30 cursor-pointer hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-300 hover:border-red-300 dark:hover:border-red-400/40 transition"
                                onClick={() => !locked && setTakeDomains((prev) => { const next = prev.filter((x) => x !== d); return next.length === 0 ? ['All'] : next })}
                                title={`Remove ${d}`}
                              >
                                {d}
                                <X className="w-3 h-3" />
                              </span>
                            ))}
                            {!locked && <button className="text-[10px] text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground ml-1 transition" onClick={() => setTakeDomains(['All'])}>Clear all</button>}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                  <div className="md:col-span-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        type="button"
                        onClick={() => { setExamMode('casual'); setTimed(false); setRevealAnswers('immediately') }}
                        disabled={!!attemptId && !isFinished}
                        className={`inline-flex items-center gap-3 px-3 py-2 rounded-lg border ${examMode === 'casual' ? 'border-primary bg-primary/10' : 'border-transparent bg-transparent hover:bg-muted/20'} text-sm`}
                        aria-pressed={examMode === 'casual'}
                        title="Casual mode"
                      >
                        <Zap className="w-5 h-5 text-primary" />
                        <span>Casual</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setExamMode('timed')
                          setTimed(true)
                          setRevealAnswers('on-completion')
                          if (!selected) return
                          try {
                            const meta = exams.find((e: any) => e.code === selected)
                            if (typeof meta?.defaultDuration === 'number') setDurationMinutes(meta.defaultDuration)
                          } catch {}
                        }}
                        disabled={!!attemptId && !isFinished}
                        className={`inline-flex items-center gap-3 px-3 py-2 rounded-lg border ${examMode === 'timed' ? 'border-primary bg-primary/10' : 'border-transparent bg-transparent hover:bg-muted/20'} text-sm`}
                        aria-pressed={examMode === 'timed'}
                        title="Timed mode"
                      >
                        <Clock className="w-5 h-5 text-primary" />
                        <span>Timed</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setExamMode('weakest-link'); setTimed(false); setRevealAnswers('immediately') }}
                        disabled={(!!attemptId && !isFinished) || !user}
                        className={`inline-flex items-center gap-3 px-3 py-2 rounded-lg border ${examMode === 'weakest-link' ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/30' : 'border-transparent bg-transparent hover:bg-muted/20'} text-sm ${!user ? 'opacity-40 cursor-not-allowed' : ''}`}
                        aria-pressed={examMode === 'weakest-link'}
                        title={user ? 'Weakest Link — prioritises your weakest domains and previously wrong questions' : 'Sign in to use Weakest Link mode'}
                      >
                        <span className="text-lg">🧠</span>
                        <span>Weakest Link</span>
                      </button>
                    </div>

                    {/* Mode descriptions */}
                    {examMode === 'casual' && (
                      <div className="mt-3 p-3 rounded-lg border border-primary/30 bg-primary/5 text-sm text-primary">
                        <div className="flex items-start gap-2">
                          <Zap className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                          <div>
                            <p className="font-medium">Casual Mode</p>
                            <p className="text-xs mt-1 text-primary/80">
                              No time pressure - work through questions at your own pace. Perfect for learning, reviewing explanations, and building confidence.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {examMode === 'timed' && (
                      <div className="mt-3 p-3 rounded-lg border border-primary/20 dark:border-primary/30 bg-primary/5 dark:bg-primary/5 text-sm text-primary dark:text-primary">
                        <div className="flex items-start gap-2">
                          <Clock className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                          <div>
                            <p className="font-medium">Timed Mode</p>
                            <p className="text-xs mt-1 text-primary dark:text-primary">
                              Simulate real exam conditions with a countdown timer. The exam auto-submits when time runs out. Great for building time management skills.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {examMode === 'weakest-link' && (
                      <div className="mt-3 p-3 rounded-lg border border-purple-200 dark:border-purple-700/50 bg-purple-50/50 dark:bg-purple-900/10 text-sm text-purple-800 dark:text-purple-200">
                        <div className="flex items-start gap-2">
                          <span className="text-lg mt-0.5">🧠</span>
                          <div>
                            <p className="font-medium">Weakest Link Mode</p>
                            <p className="text-xs mt-1 text-purple-600 dark:text-purple-300/80">
                              Questions are weighted toward your historically weakest domains. Previously wrong questions appear more frequently.
                              {analyticsDomains ? '' : ' Complete at least one attempt first for best results.'}
                            </p>
                            {analyticsDomains && Object.keys(analyticsDomains).length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {Object.entries(analyticsDomains)
                                  .sort(([, a], [, b]) => a.avgScore - b.avgScore)
                                  .map(([domain, stats]) => (
                                    <span
                                      key={domain}
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                                        stats.avgScore < 50
                                          ? 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700/40'
                                          : stats.avgScore < 70
                                          ? 'bg-primary/10 text-primary border-primary/20 dark:border-primary/30'
                                          : 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700/40'
                                      }`}
                                    >
                                      {domain}: {stats.avgScore}%
                                    </span>
                                  ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Show Answers toggle */}
                    <div className="mt-3">
                      <label className="block text-xs text-muted-foreground mb-1.5">Show answers</label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setRevealAnswers('immediately')}
                          disabled={!!attemptId && !isFinished}
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition ${
                            revealAnswers === 'immediately'
                              ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                              : 'border-transparent bg-transparent hover:bg-muted/20 text-muted-foreground dark:text-muted-foreground'
                          }`}
                        >
                          <span className="text-sm">👁️</span>
                          <span>Immediately</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRevealAnswers('on-completion')}
                          disabled={!!attemptId && !isFinished}
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition ${
                            revealAnswers === 'on-completion'
                              ? 'border-primary/40 bg-primary/10 text-primary'
                              : 'border-transparent bg-transparent hover:bg-muted/20 text-muted-foreground dark:text-muted-foreground'
                          }`}
                        >
                          <span className="text-sm">🔒</span>
                          <span>On completion</span>
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {revealAnswers === 'immediately'
                          ? 'You\'ll see the correct answer and explanation after submitting each question.'
                          : 'Answers and explanations are only revealed after you finish the exam.'}
                      </p>
                    </div>

                    {examMode === 'timed' && (
                      <div className="mt-3">
                        <label className="block text-sm font-medium mb-1">Duration (mins)</label>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={1}
                            max={300}
                            step={5}
                            value={durationMinutes}
                            onChange={(e) => setDurationMinutes(Number(e.target.value) || 1)}
                            className="flex-1"
                            disabled={!!attemptId && !isFinished}
                          />
                          <input
                            type="number"
                            min={1}
                            step={5}
                            value={durationMinutes}
                            onChange={(e) => setDurationMinutes(Number(e.target.value) || 1)}
                            className="w-28 px-2 py-1 rounded bg-muted/40 text-foreground border border-border dark:border-transparent"
                            disabled={!!attemptId && !isFinished}
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-3">
                      <label className="block text-sm font-medium mb-1">Questions <span className="text-xs text-muted-foreground font-normal">({availableFilteredCount} available)</span></label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={1}
                          max={Math.max(availableFilteredCount, 1)}
                          step={1}
                          value={Math.min(numQuestions, availableFilteredCount || 1)}
                          onChange={(e) => setNumQuestions(Math.min(Number(e.target.value) || 1, availableFilteredCount || 1))}
                          className="flex-1"
                          disabled={!!attemptId && !isFinished}
                        />
                        <input
                          type="number"
                          min={1}
                          max={availableFilteredCount || 1}
                          step={1}
                          value={Math.min(numQuestions, availableFilteredCount || 1)}
                          onChange={(e) => setNumQuestions(Math.min(Math.max(1, Number(e.target.value) || 1), availableFilteredCount || 1))}
                          className="w-28 px-2 py-1 rounded bg-muted/40 text-foreground border border-border dark:border-transparent"
                          disabled={!!attemptId && !isFinished}
                        />
                      </div>
                    </div>
                  </div>

                </div>

                {/* Combined filter: keyword search + service multi-select */}
                <div className="mt-4 space-y-3">
                  <label className="block text-sm font-semibold">Filter questions</label>

                  {/* mobile keyword input will render after services (inserted below) */}

                  <div className="flex flex-col md:flex-row md:items-start md:gap-4">
                    {/* Service multi-select */}
                    {availableServices.length > 0 && (
                      <div className="w-full md:w-96">
                      <label className="block text-xs text-muted-foreground mb-1">Services</label>
                      {/* Dropdown toggle */}
                      <div className="relative">
                        <button
                          ref={serviceDropToggleRef}
                          onClick={() => { setServiceDropOpen((v) => !v); setServiceSearchText('') }}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 border border-border/50 text-sm text-left hover:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring transition"
                        >
                          <span className={selectedServices.length ? 'text-foreground' : 'text-muted-foreground'}>
                            {selectedServices.length ? `${selectedServices.length} service${selectedServices.length > 1 ? 's' : ''} selected` : 'Select services…'}
                          </span>
                          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${serviceDropOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Dropdown panel */}
                        {serviceDropOpen && (
                          <div ref={serviceDropRef} className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg bg-card border border-border/60 shadow-xl">
                            {/* Search inside dropdown */}
                            <div className="sticky top-0 bg-card p-2 border-b border-border/60">
                              <input
                                autoFocus
                                value={serviceSearchText}
                                onChange={(e) => setServiceSearchText(e.target.value)}
                                placeholder="Search services…"
                                className="w-full px-2 py-1.5 rounded bg-muted/60 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground"
                              />
                            </div>
                            {/* Quick actions */}
                            <div className="flex gap-2 px-2 py-1.5 border-b border-border/40">
                              <button className="text-[10px] text-primary hover:text-primary dark:hover:text-primary transition" onClick={() => { setSelectedServices([...availableServices]); setServiceDropOpen(false) }}>Select all</button>
                              <button className="text-[10px] text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground transition" onClick={() => setSelectedServices([])}>Clear</button>
                            </div>
                            {/* Options */}
                            {availableServices
                              .filter((svc) => !serviceSearchText || svc.toLowerCase().includes(serviceSearchText.toLowerCase()))
                              .map((svc) => {
                                const checked = selectedServices.includes(svc)
                                return (
                                  <button
                                    key={svc}
                                    onClick={() => setSelectedServices((prev) => checked ? prev.filter((s) => s !== svc) : [...prev, svc])}
                                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/50 transition ${checked ? 'text-primary' : 'text-muted-foreground'}`}
                                  >
                                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${checked ? 'bg-primary border-primary text-white' : 'border-border'}`}>
                                      {checked && '✓'}
                                    </span>
                                    {svc}
                                  </button>
                                )
                              })
                            }
                            {availableServices.filter((svc) => !serviceSearchText || svc.toLowerCase().includes(serviceSearchText.toLowerCase())).length === 0 && (
                              <div className="px-3 py-2 text-xs text-muted-foreground">No matching services</div>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Selected chips below */}
                      {selectedServices.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {selectedServices.map((svc) => (
                            <span key={svc}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 dark:bg-primary/20 text-primary text-xs font-medium border border-primary/30 dark:border-primary/30 cursor-pointer hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-300 hover:border-red-300 dark:hover:border-red-400/40 transition"
                              onClick={() => setSelectedServices((prev) => prev.filter((s) => s !== svc))}
                              title={`Remove ${svc}`}
                            >
                              {svc}
                              <X className="w-3 h-3" />
                            </span>
                          ))}
                          <button className="text-[10px] text-muted-foreground hover:text-foreground dark:hover:text-muted-foreground ml-1 transition" onClick={() => setSelectedServices([])}>Clear all</button>
                        </div>
                      )}
                      </div>
                    )}

                    {/* Keyword input (mobile: shown below services) */}
                    <div className="md:hidden mt-3">
                      <label className="block text-xs text-muted-foreground mb-1">Keywords (comma-separated)</label>
                      <input
                        value={serviceFilterText}
                        onChange={(e) => setServiceFilterText(e.target.value)}
                        placeholder="e.g. getObject, iam:PassRole, NotAction"
                        className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground dark:placeholder:text-muted-foreground transition"
                      />
                    </div>

                    {/* Keyword input (md+) */}
                    <div className="hidden md:flex-1 md:block mt-3 md:mt-0">
                      <label className="block text-xs text-muted-foreground mb-1">Keywords (comma-separated)</label>
                      <input
                        value={serviceFilterText}
                        onChange={(e) => setServiceFilterText(e.target.value)}
                        placeholder="e.g. getObject, iam:PassRole, NotAction"
                        className="w-full px-3 py-2 rounded-lg bg-muted/40 border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground dark:placeholder:text-muted-foreground transition"
                      />
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">Filters narrow down which questions appear. Leave blank for all questions.</div>

                  {lastError && (
                    <div className="mt-1 text-sm text-red-400">{lastError}</div>
                  )}
                </div>

                <div className="mt-4 md:mt-0 flex items-center justify-end gap-3 md:self-end">
                  
                  <button className="px-3 py-2 rounded-md bg-accent text-foreground hover:bg-accent/80 transition" onClick={() => { 
                    // Clear transient attempt state and reset form values to defaults
                    try { if (selected) localStorage.removeItem(`attempt:${selected}`) } catch {}
                    try { if (selected) localStorage.removeItem(`examProgress:${selected}`) } catch {}
                    setAttemptId(null)
                    setAttemptData(null)
                    setSelectedAnswers({})
                    setMultiSelectPending({})
                    setFlaggedQuestions(new Set())
                    setCurrentQuestionIndex(0)
                    setTimeLeft(null)
                    setPaused(false)
                    setExamStarted(false)
                    setShowSubmitConfirm(false)
                    setShowCompleteEarlyConfirm(false)
                    setShowCancelConfirm(false)
                    // Reset filters and form fields
                    setTakeDomains(['All']); setTimed(false);
                    setExamMode('casual')
                    setWeakestLinkInfo(null)
                    setRevealAnswers('immediately')
                    setRevealedQuestions(new Set<string>())
                    setStagedAnswer({})
                    setServiceFilterText('')
                    setSelectedServices([])
                    setLastError(null)
                    try {
                      const meta = exams.find((e: any) => e.code === selected)
                      const def = meta?.defaultQuestions ?? meta?.defaultQuestionCount ?? (meta?.provider === 'AWS' ? 65 : (questions.length || 10))
                      setNumQuestions(def)
                      const defDur = typeof meta?.defaultDuration === 'number' ? meta.defaultDuration : 15
                      setDurationMinutes(defDur)
                    } catch { setNumQuestions(10) }
                  }}>Reset</button>
                  {savedProgress && (
                    <button className="px-4 py-2 rounded-md bg-primary/100 hover:bg-primary text-white font-semibold transition-colors" onClick={() => resumeExam()}>
                      Resume ({savedProgress.answeredCount}/{savedProgress.total} answered)
                    </button>
                  )}
                  <button
                    className={`px-4 py-2 rounded-md text-white font-semibold transition-all ${
                      examMode === 'weakest-link'
                        ? 'bg-gradient-to-r bg-primary '
                        : 'bg-primary'
                    } ${loadingWeakestLink ? 'opacity-70 cursor-wait' : ''}`}
                    onClick={() => createAttempt()}
                    disabled={loadingWeakestLink}
                  >
                    {loadingWeakestLink ? '🧠 Preparing…' : examMode === 'weakest-link' ? '🧠 Start Weakest Link' : savedProgress ? 'Start new' : 'Start exam'}
                  </button>
                </div>
              </div>
            )}
            {!isFinished && examStarted && displayQuestions.length > 0 && route === 'home' && (
              <div className="mb-3 space-y-2">
                {/* Question navigation bar */}
                <div className="flex flex-wrap gap-1">
                  {displayQuestions.map((qq, idx) => {
                    const isAnswered = selectedAnswers[qq.id] !== undefined
                    const isFlagged = flaggedQuestions.has(qq.id)
                    const isCurrent = idx === Math.min(currentQuestionIndex, displayQuestions.length - 1)
                    return (
                      <button
                        key={qq.id}
                        onClick={() => setCurrentQuestionIndex(idx)}
                        title={`Q${idx + 1}${isFlagged ? ' (flagged)' : ''}${isAnswered ? ' (answered)' : ''}`}
                        className={`relative w-9 h-9 rounded-md text-sm font-bold flex items-center justify-center transition-all focus:outline-none
                          ${isCurrent ? 'ring-2 ring-primary ring-offset-1 ring-offset-transparent bg-primary text-white shadow' : ''}
                          ${isAnswered && !isCurrent ? 'bg-primary text-white shadow-sm' : ''}
                          ${!isAnswered && !isCurrent ? 'bg-card text-muted-foreground border border-border hover:bg-muted/40' : ''}`}
                      >
                        <span className="select-none">{idx + 1}</span>
                        {isFlagged && <span className="absolute -top-1 -right-1 text-[10px]">🚩</span>}
                      </button>
                    )
                  })}
                </div>
                {/* Progress + action bar */}
                {(() => {
                  const answeredCount = Object.keys(selectedAnswers).filter(id => displayQuestions.some(q => q.id === id)).length
                  const pct = Math.round((answeredCount / Math.max(1, displayQuestions.length)) * 100)
                  const allAnswered = answeredCount >= displayQuestions.length
                  const flaggedCount = displayQuestions.filter(q => flaggedQuestions.has(q.id)).length
                  return (
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <div className="flex items-center gap-3">
                          <span>Question {Math.min(currentQuestionIndex + 1, displayQuestions.length)}/{displayQuestions.length}</span>
                          <span className="text-xs text-muted-foreground">{answeredCount} answered · {pct}%</span>
                          {flaggedCount > 0 && <span className="text-xs text-primary">🚩 {flaggedCount} flagged</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {!allAnswered && answeredCount > 0 && (
                            <button className="px-3 py-1 rounded-md bg-emerald-600 text-white text-sm font-semibold inline-flex items-center gap-2 shadow-sm hover:bg-emerald-700 transition-colors" onClick={() => setShowCompleteEarlyConfirm(true)}>
                              <Check className="w-4 h-4" aria-hidden />
                              Complete Early
                            </button>
                          )}
                          {flaggedCount > 0 && (
                            <button className="px-2 py-1 rounded bg-accent text-primary text-xs font-medium hover:bg-accent transition-colors" onClick={() => setFlaggedQuestions(new Set())}>
                              🚩 Unflag All
                            </button>
                          )}
                          {allAnswered && (
                            <button className="px-3 py-1 rounded bg-primary text-white text-xs font-semibold animate-pulse" onClick={() => setShowSubmitConfirm(true)}>
                              Submit Exam
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="w-full h-2 bg-accent/60 rounded overflow-hidden">
                        <div className="h-2 bg-primary bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {!isFinished && examStarted && route === 'home' && (
            <div className="space-y-4">
              {(() => {
                const clampedIdx = Math.min(currentQuestionIndex, displayQuestions.length - 1)
                const visible = displayQuestions.length > 0 ? [displayQuestions[Math.max(0, clampedIdx)]] : []
                return visible.map((q) => {
                  const chosen = selectedAnswers[q.id]
                  const answered = chosen !== undefined
                  const isMultiSelect = typeof q.selectCount === 'number' && q.selectCount > 1
                  const pending = multiSelectPending[q.id] ?? []
                  const correct = answered && (
                    isMultiSelect
                      ? (Array.isArray(chosen) && Array.isArray(q.choices) && q.choices.filter((c) => c.isCorrect).length === (chosen as string[]).length && q.choices.filter((c) => c.isCorrect).every((c) => (chosen as string[]).includes(c.id)))
                      : (typeof chosen === 'string' && q.choices?.some((c) => c.id === chosen && c.isCorrect))
                  )
                  // Should we show correct/incorrect feedback for this question?
                  const showFeedback = isFinished || revealedQuestions.has(q.id)
                  // Staged single-select answer (not yet submitted, for immediate reveal mode)
                  const staged = stagedAnswer[q.id]
                  const hasStaged = staged !== undefined
                  // In immediate mode, is the question still open for interaction?
                  const immediateMode = revealAnswers === 'immediately'
                  const questionLocked = showFeedback && answered
                  return (
                    <article
                      key={q.id}
                      className="p-4 rounded-lg border border-border bg-card/60"
                    >
                      <div className="mb-2">
                        <div className="font-semibold text-foreground">
                          {q.question}
                          {isMultiSelect && <span className="ml-2 text-xs font-medium text-primary">(Select {q.selectCount})</span>}
                        </div>
                        {/* Tip toggle + Flag for Review — right-aligned row under the question */}
                        {!isFinished && (
                          <div className="mt-2 flex items-center justify-end gap-2">
                            {q.tip && (
                              <button
                                onClick={() => setShowTipMap((s) => ({ ...s, [q.id]: !s[q.id] }))}
                                className="text-sm px-2 py-1 rounded bg-muted/50 text-muted-foreground border border-border hover:bg-muted transition-colors inline-flex items-center gap-1"
                                aria-label={showTipMap[q.id] ? 'Hide Tip' : 'Show Tip'}
                              >
                                <Lightbulb className="w-3.5 h-3.5" /> {showTipMap[q.id] ? 'Hide Tip' : 'Show Tip'}
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setFlaggedQuestions((prev) => {
                                  const next = new Set(prev)
                                  if (next.has(q.id)) next.delete(q.id)
                                  else next.add(q.id)
                                  return next
                                })
                                if (!flaggedQuestions.has(q.id)) {
                                  setCurrentQuestionIndex((idx) => Math.min(displayQuestions.length - 1, idx + 1))
                                }
                              }}
                              className={`text-sm px-2 py-1 rounded font-medium transition-colors ${flaggedQuestions.has(q.id) ? 'bg-primary text-white' : 'bg-accent text-primary border border-border'}`}
                            >
                              🚩 {flaggedQuestions.has(q.id) ? 'Unflag' : 'Flag for Review'}
                            </button>
                          </div>
                        )}
                        {q.tip && !isFinished && showTipMap[q.id] && (
                          <div className="mt-2 p-2.5 rounded-lg bg-muted/50 border border-border text-sm text-foreground">
                            <strong>💡 Tip:</strong> {q.tip}
                          </div>
                        )}
                      </div>

                      <ol className="list-none pl-0 space-y-2">
                        {q.choices.map((c, i) => {
                          const isSelectedSingle = !isMultiSelect && chosen === c.id
                          const isSelectedMulti = isMultiSelect && (answered ? (Array.isArray(chosen) && (chosen as string[]).includes(c.id)) : pending.includes(c.id))
                          const isSelected = isSelectedSingle || isSelectedMulti
                          const isStagedChoice = !isMultiSelect && staged === c.id
                          const isCorrectChoice = !!c.isCorrect
                          let bg = 'bg-transparent'
                          if (showFeedback && answered) {
                            if (isCorrectChoice) bg = 'bg-green-50 dark:bg-green-900/25'
                            else if (isSelected && !isCorrectChoice) bg = 'bg-red-50 dark:bg-red-900/25'
                          } else if (isStagedChoice) {
                            bg = 'bg-primary text-primary-foreground'
                          } else if (answered && isSelected) {
                            bg = 'bg-primary text-primary-foreground'
                          } else if (isMultiSelect && isSelected) {
                            bg = 'bg-primary text-primary-foreground'
                          }
                          return (
                            <li key={c.id}>
                              <button
                                onClick={() => {
                                  if (isFinished || questionLocked) return
                                  if (isMultiSelect) {
                                    // If already answered, move old answer into pending so user can adjust
                                    if (answered && !multiSelectPending[q.id]) {
                                      const prev = Array.isArray(chosen) ? (chosen as string[]) : []
                                      setMultiSelectPending((p) => ({ ...p, [q.id]: prev }))
                                      // clear the committed answer so the UI shows pending state
                                      setSelectedAnswers((sa) => { const next = { ...sa }; delete next[q.id]; return next })
                                      return
                                    }
                                    setMultiSelectPending((prev) => {
                                      const cur = prev[q.id] ?? []
                                      const next = cur.includes(c.id) ? cur.filter((x) => x !== c.id) : [...cur, c.id]
                                      return { ...prev, [q.id]: next }
                                    })
                                    return
                                  }
                                  // Single-select: in immediate mode, stage instead of submitting
                                  if (immediateMode && !answered) {
                                    setStagedAnswer((prev) => ({ ...prev, [q.id]: c.id }))
                                    return
                                  }
                                  submitAnswer(q, c.id)
                                }}
                                className={`w-full text-left px-3 py-2.5 rounded-lg border ${showFeedback && answered ? (isCorrectChoice ? 'border-green-400/40 dark:border-green-500/30' : isSelected && !isCorrectChoice ? 'border-red-400/40 dark:border-red-500/30' : 'border-border/60 dark:border-border/60') : isStagedChoice ? 'border-primary dark:border-primary' : isSelected ? 'border-primary dark:border-primary' : 'border-border/60 dark:border-border/60'} ${bg} ${(isStagedChoice || isSelected) && !showFeedback ? 'hover:bg-primary/90' : 'hover:bg-muted'} flex items-start gap-3 transition-colors`}
                              >
                                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold flex-shrink-0 mt-0.5 ${showFeedback && answered ? (isCorrectChoice ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' : isSelected && !isCorrectChoice ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' : 'bg-muted text-muted-foreground') : isStagedChoice ? 'bg-primary text-primary-foreground' : isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}> 
                                  {String.fromCharCode(65 + i)}
                                </span>
                                <span className="flex-1 min-w-0">
                                  <span className="flex items-center gap-2">
                                    {isMultiSelect && !answered && (
                                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded border-2 flex-shrink-0 ${isSelected ? 'border-primary bg-primary text-white' : 'border-muted-foreground'}`}>
                                        {isSelected && <Check className="w-3 h-3" />}
                                      </span>
                                    )}
                                    <span className={`${isSelected ? 'font-semibold' : ''}`}>{renderChoiceContent(c, q, true)}</span>
                                  </span>
                                </span>
                                <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                                                  {showFeedback && answered && isCorrectChoice && <span className="text-xs text-green-400">Correct</span>}
                                                  {showFeedback && answered && isSelected && !isCorrectChoice && <span className="text-xs text-red-300">Incorrect</span>}
                                </div>
                              </button>

                              {showFeedback && answered && c.explanation && (
                                <div className="mt-1 text-sm text-muted-foreground p-2 rounded">
                                  {c.explanation}
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ol>

                      {/* Single-select Submit Answer button (immediate reveal mode) */}
                      {immediateMode && !isMultiSelect && hasStaged && !answered && !isFinished && (
                        <div className="mt-3">
                          <button
                            className="px-4 py-2 rounded-md font-semibold text-sm bg-primary text-white hover:bg-primary/80 transition-colors"
                            onClick={async () => {
                              await submitAnswer(q, staged!)
                              setRevealedQuestions((prev) => new Set(prev).add(q.id))
                              setStagedAnswer((prev) => { const next = { ...prev }; delete next[q.id]; return next })
                            }}
                          >
                            ✅ Submit Answer
                          </button>
                        </div>
                      )}

                      {/* Multi-select confirm button */}
                      {isMultiSelect && !answered && pending.length > 0 && (
                        <div className="mt-3 flex items-center gap-3">
                          <button
                            className={`px-4 py-2 rounded-md font-semibold text-sm ${pending.length === (q.selectCount ?? 2) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground cursor-not-allowed'}`}
                            disabled={pending.length !== (q.selectCount ?? 2)}
                            onClick={async () => {
                              await submitAnswer(q, pending)
                              if (immediateMode) {
                                setRevealedQuestions((prev) => new Set(prev).add(q.id))
                              }
                            }}
                          >
                            Confirm ({pending.length}/{q.selectCount ?? 2} selected)
                          </button>
                          <button
                            className="px-3 py-1 rounded bg-muted text-sm text-muted-foreground"
                            onClick={() => setMultiSelectPending((p) => ({ ...p, [q.id]: [] }))}
                          >Clear</button>
                        </div>
                      )}

                      {/* Navigation buttons */}
                      {!isFinished && (
                        <div className="mt-3 flex items-center gap-2 border-t border-border/40 dark:border-border/40 pt-3">
                          <button
                            onClick={() => setCurrentQuestionIndex((i) => Math.max(0, i - 1))}
                            disabled={currentQuestionIndex <= 0}
                            className="px-3 py-1.5 rounded bg-accent text-sm disabled:opacity-40"
                          >← Prev</button>
                          {immediateMode && showFeedback && answered ? (
                            <button
                              onClick={() => setCurrentQuestionIndex((i) => Math.min(displayQuestions.length - 1, i + 1))}
                              disabled={currentQuestionIndex >= displayQuestions.length - 1}
                              className="px-4 py-1.5 rounded-md bg-primary text-white text-sm font-semibold disabled:opacity-40 hover:bg-primary/80 transition-colors"
                            >Next Question →</button>
                          ) : (
                            <button
                              onClick={() => setCurrentQuestionIndex((i) => Math.min(displayQuestions.length - 1, i + 1))}
                              disabled={currentQuestionIndex >= displayQuestions.length - 1}
                              className="px-3 py-1.5 rounded bg-accent text-sm disabled:opacity-40"
                            >Next →</button>
                          )}
                        </div>
                      )}

                      {showFeedback && answered && (
                        <div className="mt-3 text-sm space-y-2">
                          {q.explanation && (
                            <div className="p-2 rounded bg-muted/50 dark:bg-card text-foreground">
                              <div className="flex items-start justify-between gap-4">
                                <div className="pr-2"><strong>Explanation:</strong> {q.explanation}</div>
                                {q.docs && (
                                  <div className="flex-shrink-0">
                                    <a href={q.docs} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-1 rounded bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors">
                                      <ExternalLink className="w-4 h-4" />
                                      <span>Docs</span>
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })
              })()}
            </div>

            )}

      {/* Pause overlay */}
      {paused && examStarted && timed && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative text-center">
            <div className="text-4xl font-bold mb-4">⏸ Paused</div>
            <div className="text-sm text-muted-foreground mb-6">Questions are hidden while paused</div>
            <button
              className="px-6 py-2 rounded-lg bg-primary/90 text-white text-lg font-semibold hover:bg-primary transition-colors"
              onClick={() => setPaused(false)}
            >
              Resume
            </button>
          </div>
        </div>
      )}

      {/* Cancel confirmation modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCancelConfirm(false)} />
          <div className="relative bg-card p-6 rounded max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Cancel attempt?</h3>
            <div className="text-sm text-muted-foreground mb-4">Are you sure you want to cancel this in-progress attempt? This will clear the local attempt state.</div>
              <div className="flex items-center justify-end gap-3">
              <button className="px-3 py-1 rounded-md bg-accent text-muted-foreground inline-flex items-center gap-2 hover:bg-accent transition" onClick={() => setShowCancelConfirm(false)}>No, keep</button>
              <button className="px-3 py-1 rounded-md bg-red-600 text-white inline-flex items-center gap-2 hover:bg-red-700 transition" onClick={async () => {
                // Attempt to delete the server-side attempt if it has no answers
                try {
                  if (attemptId) {
                    await authFetch(`/attempts/${attemptId}`, { method: 'DELETE' })
                  }
                } catch (e) {
                  // ignore delete errors (e.g., attempt has answers)
                }
                try { if (selected) localStorage.removeItem(`attempt:${selected}`) } catch {}
                try { if (selected) localStorage.removeItem(`examProgress:${selected}`) } catch {}
                setAttemptId(null)
                setAttemptData(null)
                setExamStarted(false)
                setSelectedAnswers({})
                setMultiSelectPending({})
                setFlaggedQuestions(new Set())
                setCurrentQuestionIndex(0)
                setTimeLeft(null)
                setPaused(false)
                setShowCancelConfirm(false)
                setShowSubmitConfirm(false)
                setShowCompleteEarlyConfirm(false)
                // clear transient filters so the start form shows defaults
                setServiceFilterText('')
                setSelectedServices([])
                // refresh attempts list if panel open
                if (showAttempts) {
                  try {
                    const r = await authFetch('/attempts')
                    const dd = await r.json()
                    setAttemptsList(dd.attempts ?? [])
                  } catch {}
                }
                showToast('Attempt cancelled')
              }}>Yes, cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Submit Exam confirmation modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSubmitConfirm(false)} />
          <div className="relative bg-card p-6 rounded max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Submit exam?</h3>
            <div className="text-sm text-muted-foreground mb-2">
              You have answered all {displayQuestions.length} questions.
            </div>
            {displayQuestions.filter(q => flaggedQuestions.has(q.id)).length > 0 && (
              <div className="text-sm text-primary mb-2">
                🚩 You have {displayQuestions.filter(q => flaggedQuestions.has(q.id)).length} flagged question(s). Review them before submitting?
              </div>
            )}
            <div className="text-sm text-muted-foreground mb-4">Once submitted, you cannot change your answers.</div>
            <div className="flex items-center justify-end gap-3">
              <button className="px-3 py-1 rounded bg-accent text-muted-foreground hover:bg-accent" onClick={() => setShowSubmitConfirm(false)}>Review answers</button>
              <button className="px-4 py-1.5 rounded bg-primary text-white font-semibold hover:bg-primary/80" onClick={() => handleSubmitExam(false)}>Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Early confirmation modal */}
      {showCompleteEarlyConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCompleteEarlyConfirm(false)} />
          <div className="relative bg-card p-6 rounded max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Complete exam early?</h3>
            {(() => {
              const answered = Object.keys(selectedAnswers).filter(id => displayQuestions.some(q => q.id === id)).length
              const total = displayQuestions.length
              const unanswered = total - answered
              return (
                <>
                  <div className="text-sm text-muted-foreground mb-2">
                    You have answered <strong>{answered}</strong> of <strong>{total}</strong> questions.
                    {unanswered > 0 && <span className="text-primary"> {unanswered} question{unanswered > 1 ? 's' : ''} will not be scored.</span>}
                  </div>
                  <div className="text-sm text-muted-foreground mb-4">
                    Your score will be calculated from the <strong>{answered}</strong> answered questions only — unanswered questions won't count against you.
                  </div>
                </>
              )
            })()}
            <div className="flex items-center justify-end gap-3">
              <button className="px-3 py-1 rounded bg-accent text-muted-foreground hover:bg-accent" onClick={() => setShowCompleteEarlyConfirm(false)}>Keep going</button>
              <button className="px-4 py-1.5 rounded bg-primary text-white font-semibold hover:bg-primary/80" onClick={() => handleSubmitExam(true)}>Complete &amp; Score</button>
            </div>
          </div>
        </div>
      )}

      {/* Return to Practice Exams button below pre-start form */}
      {!examStarted && selected && !isFinished && route === 'home' && (
        <div className="container px-4 mt-3 md:col-span-4">
          <div className="mb-6 flex justify-center">
            <button className="px-4 py-2 rounded bg-accent text-sm" onClick={() => { setRoute('practice'); setSelected(null); setShowAttempts(false); setAttemptsList(null); }}>
              Return to Practice Exams
            </button>
          </div>
        </div>
      )}

      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-60 flex flex-col items-end space-y-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              onClick={() => setToasts((s) => s.filter((x) => x.id !== t.id))}
              className={`max-w-sm w-full px-3 py-2 rounded shadow-lg cursor-pointer transition-opacity hover:opacity-90 ${t.type === 'error' ? 'bg-red-600 text-white' : 'bg-card text-white'}`}
            >
              <div className="text-sm">{t.msg}</div>
            </div>
          ))}
        </div>
      )}

      {/* Debug panel */}
      <div className="mt-6 p-4 rounded bg-black/5 dark:bg-card/5 text-sm">
        <details>
          <summary className="cursor-pointer font-medium">Debug</summary>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div><strong>attemptId:</strong> {attemptId ?? '—'}</div>
              <div><strong>lastError:</strong> <pre className="inline">{lastError ?? '—'}</pre></div>
              <div className="mt-2">
                <button
                  className="px-2 py-1 rounded bg-accent"
                  onClick={async () => {
                    if (!attemptId) return setLastError('no attemptId')
                    try {
                      const res = await authFetch(`/attempts/${attemptId}`)
                      const d = await res.json()
                      setAttemptData(d)
                    } catch (err) {
                      console.error(err)
                      setLastError(String(err))
                    }
                  }}
                >
                  Fetch attempt
                </button>
              </div>
            </div>
            <div>
              <div><strong>selectedAnswers</strong></div>
              <pre className="overflow-auto max-h-48">{JSON.stringify(selectedAnswers, null, 2)}</pre>
              {/* savedMap removed — only server attempt data is shown */}
            </div>
          </div>
          <div className="mt-3">
            <strong>Attempt data (server):</strong>
            <pre className="overflow-auto max-h-80">{attemptData ? JSON.stringify(attemptData, null, 2) : '—'}</pre>
          </div>
        </details>
      </div>

      {/* Confetti overlay */}
      {showConfetti && <Confetti duration={3500} onDone={() => setShowConfetti(false)} />}

      {/* Reward modal */}
      {rewardModal && (
        <RewardModal
          title={rewardModal.title}
          subtitle={rewardModal.subtitle}
          xpGained={rewardModal.xpGained}
          badges={rewardModal.badges}
          onClose={() => setRewardModal(null)}
        />
      )}
          </div>
        </div>
      </main>
    </div>
  )
}


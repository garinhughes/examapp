import React, { useEffect, useMemo, useState, useCallback } from 'react'
import CodeBlock from './components/CodeBlock'
import { Confetti, RewardModal } from './components/Confetti'
import AccountPage from './components/AccountPage'
import Leaderboard from './components/Leaderboard'
import { useAuth } from './auth/AuthContext'
import { useAuthFetch } from './auth/useAuthFetch'
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
type Question = {
  id: number
  question: string
  choices: string[]
  answerIndex?: number
  answerIndices?: number[]
  selectCount?: number
  format?: string
  domain?: string
  tip?: string
  explanation?: string
  docs?: string
  choiceExplanations?: string[]
}

export default function App() {
  const { user, loading: authLoading, login, logout } = useAuth()
  const authFetch = useAuthFetch()
  const { state: gamState, recordAttemptFinish, recordPracticeDay } = useGamification()
  const gamLevel = levelFromXP(gamState.xp)

  // Confetti / reward modal state
  const [showConfetti, setShowConfetti] = useState(false)
  const [rewardModal, setRewardModal] = useState<{ title: string; subtitle?: string; xpGained: number; badges: { icon: string; name: string }[] } | null>(null)

  // simple client-side route: 'home' | 'practice' | 'analytics' | 'account'
  const [route, setRoute] = useState<'home' | 'practice' | 'analytics' | 'account'>('home')
  const [exams, setExams] = useState<Exam[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
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

  // map of questionId -> selectedChoiceIndex
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number | number[]>>({})
  // pending multi-select choices (not yet confirmed)
  const [multiSelectPending, setMultiSelectPending] = useState<Record<number, number[]>>({})
  // map of questionId -> whether tip is visible (tips shown before answering when user requests)
  const [showTipMap, setShowTipMap] = useState<Record<number, boolean>>({})
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
      return <div className="text-sm text-slate-400">No finished scores yet</div>
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
  // and a matching `total` (fallback for cases where finishedAt or answers array are missing)
  const isFinished = !!attemptData?.finishedAt || (
    typeof attemptData?.score === 'number' &&
    typeof attemptData?.total === 'number' &&
    attemptData.total >= questions.length
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

    // per-question detail
    rows.push('Question,Domain,Your Answer,Correct Answer,Result')
    const qs = Array.isArray(attemptData.questions) && attemptData.questions.length > 0 ? attemptData.questions : questions
    for (const q of qs as Question[]) {
      const ansRec = Array.isArray(attemptData.answers) ? attemptData.answers.find((a: any) => a.questionId === q.id) : undefined
      const chosenIdxs = ansRec?.selectedIndices ?? (typeof ansRec?.selectedIndex === 'number' ? [ansRec.selectedIndex] : [])
      const yourAnswer = chosenIdxs.map((i: number) => q.choices?.[i] ?? '').join('; ')
      const correctIdxs = Array.isArray(q.answerIndices) ? q.answerIndices : (typeof q.answerIndex === 'number' ? [q.answerIndex] : [])
      const correctAnswer = correctIdxs.map((i: number) => q.choices?.[i] ?? '').join('; ')
      const result = ansRec ? (ansRec.correct ? 'Correct' : 'Incorrect') : 'Unanswered'
      rows.push(`${esc(q.question)},${esc(q.domain ?? '')},${esc(yourAnswer)},${esc(correctAnswer)},${result}`)
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
      const chosenIdxs: number[] = ansRec?.selectedIndices ?? (typeof ansRec?.selectedIndex === 'number' ? [ansRec.selectedIndex] : [])
      const correctIdxs = Array.isArray(q.answerIndices) ? q.answerIndices : (typeof q.answerIndex === 'number' ? [q.answerIndex] : [])
      const isCorrect = ansRec ? !!ansRec.correct : false
      const statusIcon = ansRec ? (isCorrect ? '✅' : '❌') : '⬜'

      questionsHTML += `<div class="q"><div class="q-header">${statusIcon} <strong>${q.question.replace(/</g, '&lt;')}</strong></div>`
      if (q.domain) questionsHTML += `<div class="q-domain">Domain: ${q.domain}</div>`

      questionsHTML += `<ol>`
      for (let ci = 0; ci < (q.choices?.length ?? 0); ci++) {
        const isChosen = chosenIdxs.includes(ci)
        const isCorrectChoice = correctIdxs.includes(ci)
        const cls = isChosen && isCorrectChoice ? 'correct' : isChosen ? 'wrong' : isCorrectChoice ? 'correct-not-chosen' : ''
        questionsHTML += `<li class="${cls}">${(q.choices[ci] ?? '').replace(/</g, '&lt;')}${isChosen ? ' ◀ your answer' : ''}${isCorrectChoice && !isChosen ? ' ◀ correct' : ''}</li>`
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

    const latestByQ = new Map<number, any>()
    if (Array.isArray(attemptObj.answers)) {
      for (const ans of attemptObj.answers) {
        const qid = Number(ans?.questionId)
        if (!Number.isFinite(qid)) continue
        const prev = latestByQ.get(qid)
        const prevT = prev?.createdAt ? String(prev.createdAt) : ''
        const currT = ans?.createdAt ? String(ans.createdAt) : ''
        if (!prev || currT >= prevT) latestByQ.set(qid, ans)
      }
    }

    const total = qSet.length
    let correctCount = 0
    const perDomain: Record<string, { total: number; correct: number; score: number }> = {}
    for (const q of qSet) {
      const domain = q.domain ?? 'General'
      if (!perDomain[domain]) perDomain[domain] = { total: 0, correct: 0, score: 0 }
      perDomain[domain].total += 1
      const latestAns = latestByQ.get(q.id)
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
    return { ...attemptObj, total, correctCount, score, perDomain }
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
    const key = `attempt:${selected}`
      try {
        // do not persist pre-start prefs; start with current form values

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
                if (keywords.some((kw) => String(c || '').toLowerCase().includes(kw))) return true
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
            try { localStorage.setItem(key, data.attemptId) } catch {}
            setAttemptData(attemptFull)
            // if attempt contains questions (filtered set), use them
            if (Array.isArray(attemptFull.questions)) setQuestions(attemptFull.questions)
            setExamStarted(true)
            if (timed) setTimeLeft(durationMinutes * 60)
          } else {
            // fallback: set attempt id and start
            setAttemptId(data.attemptId)
            try { localStorage.setItem(key, data.attemptId) } catch {}
            setExamStarted(true)
            if (timed) setTimeLeft(durationMinutes * 60)
          }
        } catch (err) {
          // if follow-up fetch fails, still start with attempt id
          setAttemptId(data.attemptId)
          try { localStorage.setItem(key, data.attemptId) } catch {}
          setExamStarted(true)
          if (timed) setTimeLeft(durationMinutes * 60)
        }
      }
    } catch (err) {
      console.error('createAttempt error', err)
      setLastError(String(err))
    }
  }

  // helper to submit an answer programmatically (used by buttons and keyboard shortcuts)
  async function submitAnswer(q: Question, i: number | number[]) {
    if (selectedAnswers[q.id] !== undefined) return
    if (!examStarted) {
      setLastError('Start the exam before answering')
      return
    }
    let aid = attemptId
    if (!aid) {
      setLastError('No active attempt. Click Start to begin the exam.')
      return
    }

    const newSelected = { ...selectedAnswers, [q.id]: i }
    setSelectedAnswers(newSelected)
    // clear any pending multi-select state
    setMultiSelectPending((p) => { const next = { ...p }; delete next[q.id]; return next })

    const isMulti = Array.isArray(i)
    try {
      const res = await authFetch(`/attempts/${aid}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: q.id,
          ...(isMulti ? { selectedIndices: i } : { selectedIndex: i }),
          timeMs: 0,
          showTip: !!showTipMap[q.id]
        })
      })
      if (!res.ok) {
        const text = await res.text()
        console.error('save answer failed', text)
        setLastError(text)
        return
      }

      // auto-finish if complete
      if (Object.keys(newSelected).length >= displayQuestions.length) {
        try {
          const fin = await authFetch(`/attempts/${aid}/finish`, { method: 'PATCH' })
          const finData = await fin.json()
          if ('attemptId' in finData) {
            setAttemptData(finData)
            handleGamificationReward(finData)
            if (showAttempts) {
              try {
                const r2 = await authFetch('/attempts')
                const dd = await r2.json()
                setAttemptsList(dd.attempts ?? [])
              } catch {}
            }
          } else {
            setLastError(JSON.stringify(finData))
          }
        } catch (err) {
          console.error('auto-finish error', err)
          setLastError(String(err))
        }
      }
    } catch (err) {
      console.error('submit answer error', err)
      setLastError(String(err))
    }
  }

  // finish attempt helper
  async function finishAttempt(aid: string) {
    try {
      const fin = await authFetch(`/attempts/${aid}/finish`, { method: 'PATCH' })
      const finData = await fin.json()
      if ('attemptId' in finData) {
        setAttemptData(finData)
        setExamStarted(false)
        setTimeLeft(null)
        handleGamificationReward(finData)
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
    fetch('/exams')
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
    return result
  }, [exams])

  useEffect(() => {
    if (!selected) return
    // If the current attempt already carries its own questions, skip the fetch
    if (Array.isArray(attemptData?.questions) && attemptData.questions.length > 0) return
    fetch(`/exams/${selected}/questions`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load questions (${r.status})`)
        return r.json()
      })
      .then((qs) => { if (Array.isArray(qs)) setQuestions(qs) })
      .catch((e) => {
        console.error(e)
        setLastError(String(e))
      })
  }, [selected])

  // Ensure when navigating to the Home pre-start view for a selected exam
  // we apply per-exam duration defaults (or saved prefs) deterministically.
  useEffect(() => {
    if (route !== 'home' || !selected) return
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
    if (!examStarted || !timed) return
    if (timeLeft === null) return
    if (paused) return // don't tick while paused
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (!t || t <= 1) {
          clearInterval(id)
          if (attemptId) finishAttempt(attemptId)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [examStarted, timed, timeLeft, attemptId, paused])

  // when exam selected, check for an existing attempt but DO NOT auto-create one — user must Start
  useEffect(() => {
    if (!selected) {
      setAttemptId(null)
      setExamStarted(false)
      return
    }
    const key = `attempt:${selected}`
    const existing = (() => {
      try {
        return localStorage.getItem(key)
      } catch {
        return null
      }
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

  // helper to render choice content (plain text, JSON, or CLI snippets)
  const renderChoiceContent = (val: any, q?: Question, inline = false) => {
    const s = typeof val === 'string' ? val : (val == null ? '' : String(val))
    const isLikelyJson = (q?.format === 'json') || s.trim().startsWith('{') || s.trim().startsWith('[')
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

    if (isLikelyCli) {
      return <CodeBlock code={s} language="bash" inline={false} />
    }

    // otherwise respect inline preference for compact one-line choices
    return inline ? <code className="text-sm font-mono">{s}</code> : <span>{s}</span>
  }

  return (
    <div className="min-h-screen py-8">
      <div className="container px-4">
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-extrabold">Exam App</h1>
            <nav className="hidden sm:flex items-center gap-2">
              <button
                onClick={() => { setRoute('home'); setSelected(null); setExamStarted(false); setAttemptData(null); setShowAttempts(false); setAttemptsList(null); }}
                title="Home"
                className={`px-3 py-1 rounded text-sm ${route === 'home' ? 'bg-sky-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              >
                <svg aria-hidden className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 11.5L12 4l9 7.5" />
                  <path d="M5 21V11h14v10" />
                </svg>
                <span className="sr-only">Home</span>
              </button>
              <button
                onClick={() => setRoute('practice')}
                title="Practice Exams"
                className={`px-3 py-1 rounded text-sm ${route === 'practice' ? 'bg-sky-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              >
                <svg aria-hidden className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="8" y="2" width="8" height="4" rx="1" />
                  <path d="M6 7h12v13H6z" />
                  <path d="M9 11h6M9 15h6" />
                </svg>
                <span className="sr-only">Practice Exams</span>
              </button>
              <button
                onClick={() => { if (selected) setRoute('analytics') }}
                disabled={!selected}
                className={`px-3 py-1 rounded text-sm ${route === 'analytics' ? 'bg-sky-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'} ${!selected ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={selected ? `Analytics for ${selected}` : 'Select an exam first'}
              >
                <svg aria-hidden className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v18h18" />
                  <rect x="7" y="12" width="3" height="6" />
                  <rect x="12" y="8" width="3" height="10" />
                  <rect x="17" y="4" width="3" height="14" />
                </svg>
                <span className="sr-only">Analytics</span>
              </button>
              <button
                onClick={() => setRoute('account')}
                title="Account"
                className={`px-3 py-1 rounded text-sm ${route === 'account' ? 'bg-sky-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
              >
                <svg aria-hidden className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="3" />
                  <path d="M5.5 20a6.5 6.5 0 0113 0" />
                </svg>
                <span className="sr-only">Account</span>
              </button>
            </nav>
          </div>
            <div className="flex items-center gap-3">
            {/* Gamification badges in header */}
            {gamState.streak > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-300 text-xs font-semibold" title={`${gamState.streak}-day streak`}>
                🔥 {gamState.streak}
              </span>
            )}
            <button
              onClick={() => setRoute('account')}
              className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 text-xs font-semibold hover:ring-1 hover:ring-amber-400 transition-all"
              title={`Level ${gamLevel.level} · ${gamState.xp} XP`}
            >
              ⚡ {gamState.xp} XP · Lv{gamLevel.level}
            </button>
            {/* User auth indicator */}
            {user ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300 hidden md:inline">{user.name}</span>
                <button onClick={logout} className="px-2 py-1 rounded text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700" title="Sign out">
                  Sign out
                </button>
              </div>
            ) : !authLoading ? (
              <button onClick={login} className="px-3 py-1 rounded text-sm bg-sky-500 text-white hover:bg-sky-600">Sign in</button>
            ) : null}
            <label className="text-sm">Theme</label>
            <select value={themePreset} onChange={(e) => setThemePreset(e.target.value)} className="px-2 py-1 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-sm">
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="colourblind">Colourblind</option>
              <option value="custom">Custom</option>
            </select>
            {themePreset === 'custom' && (
              <div className="flex items-center gap-2">
                <label className="text-xs">Correct</label>
                <input type="color" value={customCorrect} onChange={(e) => setCustomCorrect(e.target.value)} className="w-8 h-8 p-0" />
                <label className="text-xs">Correct 2</label>
                <input type="color" value={customCorrect2} onChange={(e) => setCustomCorrect2(e.target.value)} className="w-8 h-8 p-0" />
                <label className="text-xs">Incorrect</label>
                <input type="color" value={customIncorrect} onChange={(e) => setCustomIncorrect(e.target.value)} className="w-8 h-8 p-0" />
                <label className="text-xs">Incorrect 2</label>
                <input type="color" value={customIncorrect2} onChange={(e) => setCustomIncorrect2(e.target.value)} className="w-8 h-8 p-0" />
              </div>
            )}
            {/* hamburger menu for small screens */}
            <div className="sm:hidden ml-2">
              <button
                onClick={() => setMobileOpen((v) => !v)}
                aria-label="Open menu"
                className="p-2 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
              </button>
            </div>
          </div>
        </header>

        {/* Mobile slide-over drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
            <aside className="absolute right-0 top-0 h-full w-72 bg-white dark:bg-slate-900 p-4 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Menu</h3>
                <button className="p-2 rounded bg-slate-200 dark:bg-slate-800" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>

              <div className="flex flex-col gap-3">
                <button onClick={() => { setRoute('home'); setSelected(null); setExamStarted(false); setAttemptData(null); setShowAttempts(false); setAttemptsList(null); setMobileOpen(false); }} title="Home" className={`text-left px-3 py-2 rounded ${route === 'home' ? 'bg-sky-500 text-white' : 'bg-slate-100 dark:bg-slate-800'}`} aria-label="Home">
                  <svg className="w-5 h-5 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11.5L12 4l9 7.5" /><path d="M5 21V11h14v10" /></svg>
                </button>
                <button onClick={() => { setRoute('practice'); setSelected(null); setExamStarted(false); setAttemptData(null); setShowAttempts(false); setAttemptsList(null); setMobileOpen(false); }} title="Practice Exams" className={`text-left px-3 py-2 rounded ${route === 'practice' ? 'bg-sky-500 text-white' : 'bg-slate-100 dark:bg-slate-800'}`} aria-label="Practice Exams">
                  <svg className="w-5 h-5 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M6 7h12v13H6z" /><path d="M9 11h6M9 15h6" /></svg>
                </button>
                <button onClick={() => { if (selected) { setRoute('analytics'); setMobileOpen(false) } }} title={selected ? `Analytics for ${selected}` : 'Select an exam first'} disabled={!selected} className={`text-left px-3 py-2 rounded ${route === 'analytics' ? 'bg-sky-500 text-white' : 'bg-slate-100 dark:bg-slate-800'} ${!selected ? 'opacity-50 cursor-not-allowed' : ''}`} aria-label="Analytics">
                  <svg className="w-5 h-5 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="4" width="3" height="14" /></svg>
                </button>
                <button onClick={() => { setRoute('account'); setMobileOpen(false) }} title="Account" className={`text-left px-3 py-2 rounded ${route === 'account' ? 'bg-sky-500 text-white' : 'bg-slate-100 dark:bg-slate-800'}`} aria-label="Account">
                  <svg className="w-5 h-5 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3" /><path d="M5.5 20a6.5 6.5 0 0113 0" /></svg>
                </button>
              </div>

              {/* Gamification stats in mobile menu */}
              <div className="flex items-center gap-2 mb-3">
                {gamState.streak > 0 && <span className="text-sm">🔥 {gamState.streak}d streak</span>}
                <span className="text-sm text-amber-500 font-semibold">⚡ {gamState.xp} XP · Lv{gamLevel.level}</span>
              </div>

              <hr className="my-4 border-slate-200 dark:border-slate-700" />

              {/* User auth in mobile menu */}
              {user ? (
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">{user.name}</span>
                  <button onClick={() => { setMobileOpen(false); logout() }} className="px-2 py-1 rounded text-xs bg-slate-100 dark:bg-slate-800">Sign out</button>
                </div>
              ) : !authLoading ? (
                <button onClick={() => { setMobileOpen(false); login() }} className="w-full mb-3 px-3 py-2 rounded bg-sky-500 text-white text-sm">Sign in</button>
              ) : null}

              <div>
                <label className="text-sm">Theme</label>
                <div className="mt-2">
                  <select value={themePreset} onChange={(e) => setThemePreset(e.target.value)} className="w-full px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                    <option value="colourblind">Colourblind</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                

                {themePreset === 'custom' && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="flex flex-col">
                      <label className="text-xs">Correct</label>
                      <input type="color" value={customCorrect} onChange={(e) => setCustomCorrect(e.target.value)} className="w-full h-8 p-0" />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs">Correct 2</label>
                      <input type="color" value={customCorrect2} onChange={(e) => setCustomCorrect2(e.target.value)} className="w-full h-8 p-0" />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs">Incorrect</label>
                      <input type="color" value={customIncorrect} onChange={(e) => setCustomIncorrect(e.target.value)} className="w-full h-8 p-0" />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs">Incorrect 2</label>
                      <input type="color" value={customIncorrect2} onChange={(e) => setCustomIncorrect2(e.target.value)} className="w-full h-8 p-0" />
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <main className="md:col-span-4">
            {route === 'practice' && (
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-4">Practice Exams</h2>
                <div className="space-y-6">
                  {providers.map((p) => (
                    <div key={p.provider}>
                      <h3 className="font-semibold mb-2">{p.provider}</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {p.exams.map((ex: any) => (
                          <div key={ex.code} className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 shadow-sm dark:shadow-none relative">
                            <div>
                              <div className="font-medium">{ex.title ?? ex.code}</div>
                              <div className="text-sm text-slate-500">{ex.version}</div>
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                              <button
                                className="px-3 py-1 rounded bg-gradient-to-r from-sky-500 to-indigo-500 text-white"
                                onClick={() => {
                                  setupExamFromMeta(ex)
                                }}
                              >
                                Setup Exam
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setSelected(ex.code); setRoute('analytics') }}
                                title={`View analytics for ${ex.title ?? ex.code}`}
                                className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-sm inline-flex items-center gap-2"
                                aria-label={`Analytics for ${ex.title ?? ex.code}`}
                              >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                  <path d="M3 3v18h18" />
                                  <rect x="7" y="10" width="2" height="7" />
                                  <rect x="11" y="6" width="2" height="11" />
                                  <rect x="15" y="13" width="2" height="4" />
                                </svg>
                                <span className="sr-only">Analytics</span>
                              </button>
                              {/* Gamification: badge count for this exam area */}
                              {gamState.streak > 0 && (
                                <span className="px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-300 text-[10px] font-semibold" title={`${gamState.streak}-day streak`}>🔥{gamState.streak}</span>
                              )}
                            </div>

                            {ex.logo && (
                              ex.logoHref ? (
                                <a
                                  href={ex.logoHref}
                                  title="Amazon.com Inc., Apache License 2.0 <http://www.apache.org/licenses/LICENSE-2.0>, via Wikimedia Commons"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="absolute bottom-2 right-2 inline-flex items-center justify-center bg-white rounded-full p-1 shadow-sm"
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
                                <div className="absolute bottom-2 right-2 inline-flex items-center justify-center bg-white rounded-full p-1 shadow-sm" aria-hidden>
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
                    <div className="text-sm text-slate-500">
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
                    <button className="px-3 py-1 rounded bg-slate-200 dark:bg-slate-800 text-sm" onClick={() => setRoute('practice')}>
                      Back
                    </button>
                    {selected && (
                      <>
                        <button
                          className="px-3 py-1 rounded bg-slate-200 dark:bg-slate-800 text-sm inline-flex items-center gap-1.5 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                          onClick={downloadAnalyticsCSV}
                          title="Download analytics as CSV"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          CSV
                        </button>
                        <button
                          className="px-3 py-1 rounded bg-gradient-to-r from-sky-500 to-indigo-500 text-white text-sm"
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
                    <div className="p-4 rounded bg-white/60 dark:bg-slate-800/60">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold">Score history</div>
                        <button
                          className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-sm"
                          onClick={() => void fetchScoreHistory(selected)}
                        >
                          Refresh
                        </button>
                      </div>
                      {loadingScoreHistory ? (
                        <div className="text-sm text-slate-400">Loading…</div>
                      ) : (
                        <ScoreHistoryChart data={scoreHistory || []} passMark={passMark} showEmptyText={false} />
                      )}

                      <div className="mt-2 text-xs text-slate-500 flex flex-wrap items-center gap-3">
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
                          <div className="p-3 rounded bg-white/60 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                            <div className="text-xs text-slate-500">{label}</div>
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
                        <div className="p-4 rounded bg-white/60 dark:bg-slate-800/60">
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
                                    <div className="text-xs text-slate-500 sm:ml-4">{avgScore}% ({correct}/{total} across {attemptCount} attempt{attemptCount !== 1 ? 's' : ''})</div>
                                  </div>
                                  <div className="w-full h-2 sm:h-3 bg-slate-200/60 dark:bg-slate-700/40 rounded overflow-hidden">
                                    <div className="h-full rounded transition-all" style={{ width: `${avgScore}%`, background: barBg }} />
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })()}

                    <div className="p-4 rounded bg-white/60 dark:bg-slate-800/60">
                      <div className="font-semibold mb-2">Attempts</div>
                      {analyticsAttempts === null ? (
                        <div className="text-sm text-slate-500">Loading…</div>
                      ) : analyticsAttempts.length === 0 ? (
                        <div className="text-sm text-slate-500">No attempts yet for this exam.</div>
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
                                  <div className="text-xs text-slate-500">
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
                                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                        <path d="M10 11v6" />
                                        <path d="M14 11v6" />
                                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                      </svg>
                                      <span className="sr-only">Delete</span>
                                    </button>
                                  )}

                                  <button
                                    className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-sm"
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
                <AccountPage />
                <div className="mt-6">
                  <Leaderboard />
                </div>
              </div>
            )}

            {/* Homepage hero when no exam selected */}
            {route === 'home' && !selected && (
              <div className="mb-8 p-8 rounded-lg bg-gradient-to-r from-white to-slate-100 dark:from-slate-800/60 dark:to-slate-900/60 border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none">
                <div className="max-w-4xl mx-auto text-center">
                  <h2 className="text-3xl sm:text-4xl font-extrabold mb-3">Practice smarter. Pass faster.</h2>
                  <p className="text-slate-500 dark:text-slate-400 mb-6">Timed or casual practice exams, focused by domain, with per-question explanations and review sessions to help you improve.</p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-transparent">
                      <div className="text-2xl">⏱️</div>
                      <div className="font-semibold mt-2">Timed & Casual</div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">Practice under exam-like timing or take a relaxed walkthrough.</div>
                    </div>
                    <div className="p-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-transparent">
                      <div className="text-2xl">🧭</div>
                      <div className="font-semibold mt-2">Domain Focus</div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">Choose specific domains to drill into weaker areas.</div>
                    </div>
                    <div className="p-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-transparent">
                      <div className="text-2xl">📈</div>
                      <div className="font-semibold mt-2">Review & Insights</div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">View per-domain scores and detailed explanations after each attempt.</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-4">
                    <button onClick={() => setRoute('practice')} className="px-4 py-2 rounded bg-gradient-to-r from-sky-500 to-indigo-500 text-white font-semibold">Browse Practice Exams</button>
                    {/* Get Started removed per design */}
                  </div>
                </div>
                <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-transparent">
                    <div className="h-40 flex items-center justify-center text-slate-400">
                      <svg role="img" aria-label="Exam checklist" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className="w-40 h-40" preserveAspectRatio="xMidYMid meet">
                        <defs>
                          <linearGradient id="g1" x1="0" x2="1" y1="0" y2="1">
                            <stop offset="0" stopColor="#06b6d4"/>
                            <stop offset="1" stopColor="#8b5cf6"/>
                          </linearGradient>
                        </defs>
                        <rect x="6" y="8" width="40" height="48" rx="3" className="fill-slate-200 dark:fill-slate-800" stroke="url(#g1)" strokeWidth="1.5" />
                        <path d="M16 18h20M16 26h20M16 34h20" className="stroke-slate-400 dark:stroke-slate-500" strokeWidth="2" strokeLinecap="round" />
                        <rect x="46" y="6" width="12" height="12" rx="2" fill="url(#g1)" />
                        <path d="M50 10l2.5 2.5L58 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        <circle cx="18" cy="18" r="2.5" fill="#06b6d4" />
                        <circle cx="18" cy="26" r="2.5" fill="#06b6d4" />
                        <circle cx="18" cy="34" r="2.5" fill="#06b6d4" />
                      </svg>
                    </div>
                    <div className="mt-3">
                      <div className="font-semibold">Exam Checklists</div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">Organise your study with focused checklists and topic goals.</div>
                    </div>
                  </div>

                    <div className="p-4 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-transparent">
                      <div className="h-40 flex items-center justify-center text-slate-400">
                        <svg role="img" aria-label="Filter exams" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-32 h-32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 3H2l7 9v7l6-4v-6z" />
                          <path d="M10 13V6" strokeOpacity="0.6" />
                          <path d="M14 13v-4" strokeOpacity="0.6" />
                        </svg>
                      </div>
                      <div className="mt-3">
                        <div className="font-semibold">Advanced Question Filtering</div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">Filter question sets by services or keywords.</div>
                      </div>
                    </div>
                </div>
              </div>
            )}
            {route === 'home' && selected ? (
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Questions</h2>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-slate-500">{selected}{selectedMeta?.title ? ` — ${selectedMeta.title}` : ''}</div>
                  <button
                    className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-sm"
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
                    <button
                      className="px-2 py-1 rounded bg-red-600 text-white text-sm"
                      onClick={() => setShowCancelConfirm(true)}
                    >
                      Cancel
                    </button>
                  )}
                  {examStarted && timed && timeLeft !== null && (
                    <div className="flex items-center gap-2">
                      <button
                        className={`px-2 py-1 rounded text-sm ${paused ? 'bg-sky-600 text-white' : 'bg-slate-200 dark:bg-slate-800'}`}
                        onClick={() => setPaused((p) => !p)}
                        title={paused ? 'Resume timer' : 'Pause timer'}
                      >
                        {paused ? (
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                        ) : (
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                        )}
                      </button>
                      <div className={`text-sm ${paused ? 'text-yellow-500 dark:text-yellow-400 animate-pulse' : 'text-slate-600 dark:text-slate-300'}`}>{Math.floor(timeLeft/60).toString().padStart(2,'0')}:{(timeLeft%60).toString().padStart(2,'0')}{paused ? ' (paused)' : ''}</div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
            

            {/* Attempts list panel */}
            {showAttempts && selected && (
              <div className="mb-4 p-3 rounded bg-white/60 dark:bg-slate-800/60">
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
                          <div className="text-xs text-slate-500">{a.attemptId} — {a.startedAt ? new Date(a.startedAt).toLocaleString() : '—'}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {a.score !== null && <div className="text-sm font-semibold">{a.score}%</div>}
                          <button
                            className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-sm"
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
                  <div className="text-sm text-slate-500">Loading…</div>
                )}
              </div>
            )}

            {/* Results moved here (top) */}
            {attemptData && typeof attemptData.score === 'number' && route === 'home' && (
              <div className="mb-4 p-4 rounded bg-white/60 dark:bg-slate-800/60">
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
                        <div className="text-sm text-slate-500">{attemptData.correctCount ?? 0} / {attemptData.total ?? 0} correct</div>
                        <div className="mt-1 text-xs text-slate-500">Completed: {attemptData.finishedAt ? new Date(attemptData.finishedAt).toLocaleString() : '—'}</div>
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
                                <div className="text-xs text-slate-500">{vscore}% ({correct}/{total})</div>
                              </div>
                              <div className="w-full h-3 bg-slate-200/60 dark:bg-slate-700/40 rounded overflow-hidden">
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
                      className="px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-800 text-sm inline-flex items-center gap-2 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                      onClick={downloadAttemptCSV}
                      title="Download report as CSV"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      CSV
                    </button>
                    <button
                      className="px-3 py-1.5 rounded bg-slate-200 dark:bg-slate-800 text-sm inline-flex items-center gap-2 hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
                      onClick={downloadAttemptPDF}
                      title="Open printable report (Save as PDF)"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
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
                  <div>
                    <button
                      className="px-3 py-1 rounded bg-slate-200 dark:bg-slate-800 text-sm"
                      onClick={() => { setRoute('practice'); setSelected(null); setShowAttempts(false); setAttemptsList(null); }}
                    >
                      Back to Practice Exams
                    </button>
                  </div>
                </div>

                <div className="mb-3">
                  {(() => {
                    const domains: string[] = attemptData?.perDomain ? Object.keys(attemptData.perDomain) : Array.from(new Set(questions.map((q) => (q as any).domain)))
                    const allSelected = reviewDomains.includes('All')
                    return (
                      <div className="w-full md:w-96">
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Domains</label>
                        {/* Dropdown toggle */}
                        <div className="relative">
                          <button
                            ref={reviewDomainToggleRef}
                            onClick={() => setReviewDomainOpen((v) => !v)}
                            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700/40 border border-slate-300 dark:border-slate-600/50 text-sm text-left hover:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition"
                          >
                            <span className={!allSelected && reviewDomains.length > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-500'}>
                              {allSelected ? 'All domains' : reviewDomains.length === 0 ? 'Select domains…' : `${reviewDomains.length} domain${reviewDomains.length > 1 ? 's' : ''} selected`}
                            </span>
                            <svg className={`w-4 h-4 text-slate-400 transition-transform ${reviewDomainOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
                          </button>

                          {/* Dropdown panel */}
                          {reviewDomainOpen && (
                            <div ref={reviewDomainRef} className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600/60 shadow-xl">
                              {/* Quick actions */}
                              <div className="flex gap-2 px-2 py-1.5 border-b border-slate-200 dark:border-slate-700/40">
                                <button className="text-[10px] text-sky-600 dark:text-sky-400 hover:text-sky-500 dark:hover:text-sky-300 transition" onClick={() => { setReviewDomains([...domains]); setReviewDomainOpen(false); setReviewIndex(0) }}>Select all individually</button>
                                <button className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition" onClick={() => { setReviewDomains(['All']); setReviewDomainOpen(false); setReviewIndex(0) }}>All (default)</button>
                              </div>
                              {/* All option */}
                              <button
                                onClick={() => { setReviewDomains(['All']); setReviewDomainOpen(false); setReviewIndex(0) }}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-700/50 transition ${allSelected ? 'text-sky-600 dark:text-sky-300' : 'text-slate-600 dark:text-slate-300'}`}
                              >
                                <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${allSelected ? 'bg-sky-500 border-sky-400 text-white' : 'border-slate-300 dark:border-slate-500'}`}>
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
                                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-700/50 transition ${checked ? 'text-sky-600 dark:text-sky-300' : 'text-slate-600 dark:text-slate-300'}`}
                                  >
                                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${checked ? 'bg-sky-500 border-sky-400 text-white' : 'border-slate-300 dark:border-slate-500'}`}>
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
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 text-xs font-medium border border-sky-200 dark:border-sky-500/30 cursor-pointer hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-300 hover:border-red-300 dark:hover:border-red-400/40 transition"
                                onClick={() => { setReviewDomains((prev) => { const next = prev.filter((x) => x !== d); return next.length === 0 ? ['All'] : next }); setReviewIndex(0) }}
                                title={`Remove ${d}`}
                              >
                                {d}
                                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                              </span>
                            ))}
                            <button className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 ml-1 transition" onClick={() => { setReviewDomains(['All']); setReviewIndex(0) }}>Clear all</button>
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 mb-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={incorrectOnly} onChange={(e) => setIncorrectOnly(e.target.checked)} />
                      <span className="text-sm text-slate-500 dark:text-slate-400">Show incorrect only</span>
                    </label>
                    <div className="ml-auto text-sm text-slate-500">{questions.length} total</div>
                  </div>

                  {(() => {
                    const domainFiltered = (reviewDomains.includes('All') || reviewDomains.length === 0)
                      ? questions
                      : questions.filter((q) => reviewDomains.includes((q as any).domain))
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
                      const chosen = answerRecord?.selectedIndices ?? answerRecord?.selectedIndex ?? selectedAnswers[q.id]
                      const isCorrect = typeof answerRecord?.correct === 'boolean' ? answerRecord.correct : (
                        Array.isArray(q.answerIndices)
                          ? (Array.isArray(chosen) && q.answerIndices.length === chosen.length && q.answerIndices.every((v: number) => chosen.includes(v)))
                          : (typeof chosen === 'number' && typeof q.answerIndex === 'number' ? chosen === q.answerIndex : false)
                      )
                      return { answerRecord, chosen, isCorrect }
                    }

                    // apply incorrectOnly filter
                    const visibleAll = domainFiltered.map((q) => ({ q, ...deriveRecord(q) }))
                    const visible = incorrectOnly ? visibleAll.filter((v) => !v.isCorrect) : visibleAll

                    if (visible.length === 0) return <div className="text-sm text-slate-500 p-3">No questions to review.</div>

                    // clamp index
                    const idx = Math.max(0, Math.min(reviewIndex, visible.length - 1))
                    const item = visible[idx]

                    return (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm text-slate-400">Question {idx + 1} / {visible.length}</div>
                          <div className="flex items-center gap-2">
                            <button
                              className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-sm"
                              onClick={() => setReviewIndex((i) => Math.max(0, i - 1))}
                              disabled={idx === 0}
                            >Prev</button>
                            <button
                              className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-sm"
                              onClick={() => setReviewIndex((i) => Math.min(visible.length - 1, i + 1))}
                              disabled={idx >= visible.length - 1}
                            >Next</button>
                          </div>
                        </div>

                        <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-white/5 to-slate-50/5">
                          <div className="flex items-start justify-between">
                            <div className="font-medium text-lg">{item.q.question}</div>
                            <div className="text-sm">
                              {item.isCorrect ? <span className="text-green-400">Correct</span> : <span className="text-red-300">Incorrect</span>}
                            </div>
                          </div>

                          {item.q.domain && (
                            <div className="mt-2 text-xs text-slate-400">Domain: {item.q.domain}</div>
                          )}

                          <div className="mt-3 text-sm">
                            <div className="font-semibold">Your answer:</div>
                            {(() => {
                              const isCorrect = item.isCorrect
                                if (isCorrect) {
                                  const badgeBg = 'var(--color-correct)'
                                  const badgeBg2 = 'var(--color-correct-2)'
                                  const badgeShadow = 'var(--color-correct-shadow)'
                                  return (
                                    <div className="mt-2">
                                      <div style={{ background: `linear-gradient(90deg, ${badgeBg}, ${badgeBg2})`, boxShadow: `0 0 14px ${badgeShadow}`, color: 'var(--color-correct-text)' }} className={`inline-flex items-center gap-3 px-3 py-2 rounded-md font-medium`}>
                                        <span style={{ backgroundColor: 'var(--color-correct-muted)', color: 'var(--color-correct-text)' }} className="inline-flex items-center justify-center w-6 h-6 rounded-full">
                                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                                        </span>
                                        <span className="break-words max-w-full">
                                          {Array.isArray(item.chosen)
                                            ? (item.chosen as number[]).map((ci) => item.q.choices[ci]).join(', ')
                                            : renderChoiceContent(typeof item.chosen === 'number' ? item.q.choices[item.chosen] : '—', item.q, true)}
                                        </span>
                                      </div>
                                    </div>
                                  )
                                }

                                // Incorrect: show red X icon with neutral answer box (no red pill)
                                return (
                                  <div className="mt-2 flex items-start gap-3">
                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-500">
                                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                    </span>
                                    <div className="flex-1">
                                      <div className="px-3 py-2 rounded-md bg-slate-700/10 dark:bg-slate-800/40 text-sm break-words max-w-full whitespace-normal">
                                        {Array.isArray(item.chosen)
                                          ? (item.chosen as number[]).map((ci) => item.q.choices[ci]).join(', ')
                                          : renderChoiceContent(typeof item.chosen === 'number' ? item.q.choices[item.chosen] : '—', item.q, true)}
                                      </div>
                                    </div>
                                  </div>
                                )
                            })()}

                            {(typeof item.q.answerIndex === 'number' || Array.isArray(item.q.answerIndices)) && (
                              <div className="mt-3 font-semibold flex items-center gap-3">
                                <div className="inline-flex items-center gap-2" style={{ color: 'var(--color-correct-2)' }}>
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full" style={{ backgroundColor: 'var(--color-correct-muted)', color: 'var(--color-correct-text)' }}>
                                    <svg className="w-3 h-3" style={{ color: 'var(--color-correct-2)' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                                  </span>
                                  <span>Correct answer{Array.isArray(item.q.answerIndices) ? 's' : ''}:</span>
                                </div>
                                <div className="mt-0">
                                  {Array.isArray(item.q.answerIndices)
                                    ? item.q.answerIndices.map((ai) => item.q.choices[ai]).join(', ')
                                    : renderChoiceContent(item.q.choices[item.q.answerIndex!], item.q, false)}
                                </div>
                              </div>
                            )}
                          </div>

                          {item.q.explanation && (
                            <div className="mt-3 text-sm p-3 rounded bg-yellow-50 dark:bg-slate-800">
                              <div className="flex items-start justify-between gap-4">
                                <div className="pr-2"><strong>Explanation:</strong> {item.q.explanation}</div>
                                {item.q.docs && (
                                  <div className="flex-shrink-0">
                                    <a href={item.q.docs} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-white text-sm hover:bg-slate-300 dark:hover:bg-slate-600 transition">
                                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>
                                      <span>Docs</span>
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            ) : null}

            {/* progress bar intentionally only shown on the Analytics page now */}
            {/* Hide pre-start form when an attempt is finished (we're in Review mode) */}
            {!examStarted && selected && !isFinished && route === 'home' && (
              <div className="mb-6 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 shadow-sm dark:shadow-none flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">Start exam</h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-300 text-[11px] font-semibold">
                      ⚡ Lv{gamLevel.level} · {gamState.xp} XP
                    </span>
                  </div>
                  {/* removed available count */}
                </div>

                <div className="mb-4">
                  {(() => {
                    const domains: string[] = attemptData?.perDomain ? Object.keys(attemptData.perDomain) : Array.from(new Set(questions.map((q) => (q as any).domain)))
                    const allSelected = takeDomains.includes('All')
                    const locked = !!attemptId && !isFinished
                    return (
                      <div className="w-full md:w-96">
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Domains</label>
                        {/* Dropdown toggle */}
                        <div className="relative">
                          <button
                            ref={domainToggleRef}
                            onClick={() => setDomainOpen((v) => !v)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700/40 border border-slate-300 dark:border-slate-600/50 text-sm text-left hover:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={locked}
                          >
                            <span className={!allSelected && takeDomains.length > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-500'}>
                              {allSelected ? 'All domains' : takeDomains.length === 0 ? 'Select domains…' : `${takeDomains.length} domain${takeDomains.length > 1 ? 's' : ''} selected`}
                            </span>
                            <svg className={`w-4 h-4 text-slate-400 transition-transform ${domainOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
                          </button>

                          {/* Dropdown panel */}
                          {domainOpen && !locked && (
                            <div ref={domainRef} className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600/60 shadow-xl">
                              {/* Quick actions */}
                              <div className="flex gap-2 px-2 py-1.5 border-b border-slate-200 dark:border-slate-700/40">
                                <button className="text-[10px] text-sky-600 dark:text-sky-400 hover:text-sky-500 dark:hover:text-sky-300 transition" onClick={() => { setTakeDomains([...domains]); setDomainOpen(false) }}>Select all individually</button>
                                <button className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition" onClick={() => { setTakeDomains(['All']); setDomainOpen(false) }}>All (default)</button>
                              </div>
                              {/* All option */}
                              <button
                                onClick={() => { setTakeDomains(['All']); setDomainOpen(false) }}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-700/50 transition ${allSelected ? 'text-sky-600 dark:text-sky-300' : 'text-slate-600 dark:text-slate-300'}`}
                              >
                                <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${allSelected ? 'bg-sky-500 border-sky-400 text-white' : 'border-slate-300 dark:border-slate-500'}`}>
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
                                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-700/50 transition ${checked ? 'text-sky-600 dark:text-sky-300' : 'text-slate-600 dark:text-slate-300'}`}
                                  >
                                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${checked ? 'bg-sky-500 border-sky-400 text-white' : 'border-slate-300 dark:border-slate-500'}`}>
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
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 text-xs font-medium border border-sky-200 dark:border-sky-500/30 cursor-pointer hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-300 hover:border-red-300 dark:hover:border-red-400/40 transition"
                                onClick={() => !locked && setTakeDomains((prev) => { const next = prev.filter((x) => x !== d); return next.length === 0 ? ['All'] : next })}
                                title={`Remove ${d}`}
                              >
                                {d}
                                <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                              </span>
                            ))}
                            {!locked && <button className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 ml-1 transition" onClick={() => setTakeDomains(['All'])}>Clear all</button>}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
                  <div className="md:col-span-2">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setTimed(false)}
                        disabled={!!attemptId && !isFinished}
                        className={`inline-flex items-center gap-3 px-3 py-2 rounded-lg border ${!timed ? 'border-sky-400 bg-sky-50 dark:bg-sky-900/30' : 'border-transparent bg-transparent hover:bg-slate-100 dark:hover:bg-slate-700/20'} text-sm`}
                        aria-pressed={!timed}
                        title="Casual mode"
                      >
                        <svg className="w-5 h-5 text-sky-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h6L3 12h6" />
                          <path d="M8 10h6L8 16h6" />
                        </svg>
                        <span>Casual</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (!selected) { setTimed(true); return }
                          try {
                            const meta = exams.find((e: any) => e.code === selected)
                            if (typeof meta?.defaultDuration === 'number') setDurationMinutes(meta.defaultDuration)
                          } catch {}
                          setTimed(true)
                        }}
                        disabled={!!attemptId && !isFinished}
                        className={`inline-flex items-center gap-3 px-3 py-2 rounded-lg border ${timed ? 'border-sky-400 bg-sky-50 dark:bg-sky-900/30' : 'border-transparent bg-transparent hover:bg-slate-100 dark:hover:bg-slate-700/20'} text-sm`}
                        aria-pressed={timed}
                        title="Timed mode"
                      >
                        <svg className="w-5 h-5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
                        <span>Timed</span>
                      </button>
                    </div>

                    {timed && (
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
                            className="w-28 px-2 py-1 rounded bg-slate-100 dark:bg-slate-700/40 text-slate-900 dark:text-white border border-slate-300 dark:border-transparent"
                            disabled={!!attemptId && !isFinished}
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-3">
                      <label className="block text-sm font-medium mb-1">Questions</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={1}
                          max={Math.max(questions.length || 1, 200)}
                          step={1}
                          value={numQuestions}
                          onChange={(e) => setNumQuestions(Number(e.target.value) || 1)}
                          className="flex-1"
                          disabled={!!attemptId && !isFinished}
                        />
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={numQuestions}
                          onChange={(e) => setNumQuestions(Number(e.target.value) || 1)}
                          className="w-28 px-2 py-1 rounded bg-slate-100 dark:bg-slate-700/40 text-slate-900 dark:text-white border border-slate-300 dark:border-transparent"
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
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Services</label>
                      {/* Dropdown toggle */}
                      <div className="relative">
                        <button
                          ref={serviceDropToggleRef}
                          onClick={() => { setServiceDropOpen((v) => !v); setServiceSearchText('') }}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700/40 border border-slate-300 dark:border-slate-600/50 text-sm text-left hover:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition"
                        >
                          <span className={selectedServices.length ? 'text-slate-900 dark:text-white' : 'text-slate-500'}>
                            {selectedServices.length ? `${selectedServices.length} service${selectedServices.length > 1 ? 's' : ''} selected` : 'Select services…'}
                          </span>
                          <svg className={`w-4 h-4 text-slate-400 transition-transform ${serviceDropOpen ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd"/></svg>
                        </button>

                        {/* Dropdown panel */}
                        {serviceDropOpen && (
                          <div ref={serviceDropRef} className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600/60 shadow-xl">
                            {/* Search inside dropdown */}
                            <div className="sticky top-0 bg-white dark:bg-slate-800 p-2 border-b border-slate-200 dark:border-slate-700/60">
                              <input
                                autoFocus
                                value={serviceSearchText}
                                onChange={(e) => setServiceSearchText(e.target.value)}
                                placeholder="Search services…"
                                className="w-full px-2 py-1.5 rounded bg-slate-100 dark:bg-slate-700/60 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500/40 placeholder:text-slate-500"
                              />
                            </div>
                            {/* Quick actions */}
                            <div className="flex gap-2 px-2 py-1.5 border-b border-slate-200 dark:border-slate-700/40">
                              <button className="text-[10px] text-sky-600 dark:text-sky-400 hover:text-sky-500 dark:hover:text-sky-300 transition" onClick={() => { setSelectedServices([...availableServices]); setServiceDropOpen(false) }}>Select all</button>
                              <button className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition" onClick={() => setSelectedServices([])}>Clear</button>
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
                                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-700/50 transition ${checked ? 'text-sky-600 dark:text-sky-300' : 'text-slate-600 dark:text-slate-300'}`}
                                  >
                                    <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] ${checked ? 'bg-sky-500 border-sky-400 text-white' : 'border-slate-300 dark:border-slate-500'}`}>
                                      {checked && '✓'}
                                    </span>
                                    {svc}
                                  </button>
                                )
                              })
                            }
                            {availableServices.filter((svc) => !serviceSearchText || svc.toLowerCase().includes(serviceSearchText.toLowerCase())).length === 0 && (
                              <div className="px-3 py-2 text-xs text-slate-500">No matching services</div>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Selected chips below */}
                      {selectedServices.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {selectedServices.map((svc) => (
                            <span key={svc}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 text-xs font-medium border border-sky-200 dark:border-sky-500/30 cursor-pointer hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-600 dark:hover:text-red-300 hover:border-red-300 dark:hover:border-red-400/40 transition"
                              onClick={() => setSelectedServices((prev) => prev.filter((s) => s !== svc))}
                              title={`Remove ${svc}`}
                            >
                              {svc}
                              <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            </span>
                          ))}
                          <button className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 ml-1 transition" onClick={() => setSelectedServices([])}>Clear all</button>
                        </div>
                      )}
                      </div>
                    )}

                    {/* Keyword input (mobile: shown below services) */}
                    <div className="md:hidden mt-3">
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Keywords (comma-separated)</label>
                      <input
                        value={serviceFilterText}
                        onChange={(e) => setServiceFilterText(e.target.value)}
                        placeholder="e.g. s3, lambda, iam"
                        className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700/40 border border-slate-300 dark:border-slate-600/50 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/50 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition"
                      />
                    </div>

                    {/* Keyword input (md+) */}
                    <div className="hidden md:flex-1 md:block mt-3 md:mt-0">
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">Keywords (comma-separated)</label>
                      <input
                        value={serviceFilterText}
                        onChange={(e) => setServiceFilterText(e.target.value)}
                        placeholder="e.g. s3, lambda, iam"
                        className="w-full px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700/40 border border-slate-300 dark:border-slate-600/50 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/50 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition"
                      />
                    </div>
                  </div>

                  <div className="text-xs text-slate-500">Filters narrow down which questions appear. Leave blank for all questions.</div>
                  {lastError && (
                    <div className="mt-1 text-sm text-red-400">{lastError}</div>
                  )}
                </div>

                <div className="mt-4 md:mt-0 flex items-center justify-end gap-3 md:self-end">
                  
                  <button className="px-3 py-2 rounded-md bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-white hover:bg-slate-300 dark:hover:bg-slate-500 transition" onClick={() => { 
                    setTakeDomains(['All']); setTimed(false);
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
                  <button className="px-4 py-2 rounded-md bg-gradient-to-r from-sky-500 to-indigo-500 text-white font-semibold" onClick={() => createAttempt()}>Start exam</button>
                </div>
              </div>
            )}
            <div className="mb-3">
              {!isFinished && examStarted && displayQuestions.length > 0 && (
                (() => {
                  const answeredCount = Object.keys(selectedAnswers).length
                  const current = Math.min(answeredCount + 1, displayQuestions.length)
                  const pct = Math.round((answeredCount / Math.max(1, displayQuestions.length)) * 100)
                  return (
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <div>Question {current}/{displayQuestions.length}</div>
                        <div className="text-xs text-slate-500">{pct}%</div>
                      </div>
                      <div className="w-full h-2 bg-slate-200/60 rounded overflow-hidden">
                        <div className="h-2 bg-sky-400 dark:bg-sky-600" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })()
              )}
            </div>

            {!isFinished && examStarted && (
            <div className="space-y-4">
              {(() => {
                const firstUnansweredIndex = displayQuestions.findIndex((qq) => selectedAnswers[qq.id] === undefined)
                const visible = firstUnansweredIndex >= 0 ? [displayQuestions[firstUnansweredIndex]] : displayQuestions
                return visible.map((q) => {
                  const chosen = selectedAnswers[q.id]
                  const answered = chosen !== undefined
                  const isMultiSelect = typeof q.selectCount === 'number' && q.selectCount > 1
                  const pending = multiSelectPending[q.id] ?? []
                  const correct = answered && (
                    isMultiSelect
                      ? (Array.isArray(q.answerIndices) && Array.isArray(chosen) && q.answerIndices.length === (chosen as number[]).length && q.answerIndices.every((v) => (chosen as number[]).includes(v)))
                      : (typeof q.answerIndex === 'number' && chosen === q.answerIndex)
                  )
                  return (
                    <article
                      key={q.id}
                      className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-white/40 to-slate-50/40 dark:from-slate-800/40 dark:to-slate-900/40"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {q.question}
                          {isMultiSelect && <span className="ml-2 text-xs font-medium text-sky-400">(Select {q.selectCount})</span>}
                        </div>
                        <div className="ml-4">
                          {!answered && (
                            <button
                              onClick={() => setShowTipMap((s) => ({ ...s, [q.id]: !s[q.id] }))}
                              className="text-sm px-2 py-1 rounded bg-yellow-50 dark:bg-slate-700"
                              aria-label="Show Tip"
                              title="Show Tip"
                            >
                              💡 Show Tip
                            </button>
                          )}
                        </div>
                      </div>

                      <ol className="list-none pl-0 space-y-2">
                        {q.choices.map((c, i) => {
                          const isSelectedSingle = !isMultiSelect && chosen === i
                          const isSelectedMulti = isMultiSelect && (answered ? (Array.isArray(chosen) && (chosen as number[]).includes(i)) : pending.includes(i))
                          const isSelected = isSelectedSingle || isSelectedMulti
                          const isCorrectChoice = isMultiSelect
                            ? (Array.isArray(q.answerIndices) && q.answerIndices.includes(i))
                            : (typeof q.answerIndex === 'number' && q.answerIndex === i)
                          let bg = 'bg-transparent'
                          if (answered) {
                            if (isCorrectChoice) bg = 'bg-gradient-to-r from-neon-cyan/10 to-neon-pink/10'
                            else if (isSelected && !isCorrectChoice) bg = 'bg-red-600/10'
                          } else if (isMultiSelect && isSelected) {
                            bg = 'bg-sky-500/10'
                          }
                          return (
                            <li key={i}>
                              <button
                                onClick={async () => {
                                  if (answered) return
                                  if (!examStarted) {
                                    setLastError('Start the exam before answering')
                                    return
                                  }
                                  let aid = attemptId
                                  if (!aid) {
                                    setLastError('No active attempt. Click Start to begin the exam.')
                                    return
                                  }

                                  if (isMultiSelect) {
                                    // toggle this choice in the pending set
                                    setMultiSelectPending((prev) => {
                                      const cur = prev[q.id] ?? []
                                      const next = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]
                                      return { ...prev, [q.id]: next }
                                    })
                                    return
                                  }

                                  // single-select: submit immediately
                                  const newSelected = { ...selectedAnswers, [q.id]: i }
                                  setSelectedAnswers(newSelected)

                                  try {
                                    if (aid) {
                                      const res = await authFetch(`/attempts/${aid}/answer`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ questionId: q.id, selectedIndex: i, timeMs: 0, showTip: !!showTipMap[q.id] })
                                      })
                                      if (res.ok) {
                                        if (Object.keys(newSelected).length >= displayQuestions.length) {
                                          try {
                                            const fin = await authFetch(`/attempts/${aid}/finish`, { method: 'PATCH' })
                                            const finData = await fin.json()
                                            if ('attemptId' in finData) {
                                              setAttemptData(finData)
                                              handleGamificationReward(finData)
                                              if (showAttempts) {
                                                try { const r2 = await authFetch('/attempts'); const dd = await r2.json(); setAttemptsList(dd.attempts ?? []) } catch {}
                                              }
                                            } else {
                                              setLastError(JSON.stringify(finData))
                                            }
                                          } catch (err) { console.error('auto-finish error', err); setLastError(String(err)) }
                                        }
                                      } else {
                                        const text = await res.text()
                                        console.error('save answer failed', text)
                                        setLastError(text)
                                      }
                                    }
                                  } catch (err) {
                                    console.error('submit answer error', err)
                                    setLastError(String(err))
                                  }
                                }}
                                className={`w-full text-left px-3 py-2 rounded ${bg} hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-between`}
                              >
                                <span className="flex items-center gap-2">
                                  {isMultiSelect && !answered && (
                                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded border-2 ${isSelected ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-400'}`}>
                                      {isSelected && <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>}
                                    </span>
                                  )}
                                  <span className={`${isSelected ? 'font-semibold' : ''}`}>{renderChoiceContent(c, q, true)}</span>
                                </span>
                                <div className="flex items-center gap-2">
                                                  {isFinished && answered && isCorrectChoice && <span className="text-xs text-green-400">Correct</span>}
                                                  {isFinished && answered && isSelected && !isCorrectChoice && <span className="text-xs text-red-300">Incorrect</span>}
                                </div>
                              </button>

                              {isFinished && answered && q.choiceExplanations && (
                                <div className="mt-1 text-sm text-slate-600 dark:text-slate-300 p-2 rounded">
                                  {q.choiceExplanations[i]}
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ol>

                      {/* Multi-select confirm button */}
                      {isMultiSelect && !answered && pending.length > 0 && (
                        <div className="mt-3 flex items-center gap-3">
                          <button
                            className={`px-4 py-2 rounded-md font-semibold text-sm ${pending.length === (q.selectCount ?? 2) ? 'bg-gradient-to-r from-sky-500 to-indigo-500 text-white' : 'bg-slate-600 text-slate-300 cursor-not-allowed'}`}
                            disabled={pending.length !== (q.selectCount ?? 2)}
                            onClick={() => submitAnswer(q, pending)}
                          >
                            Confirm ({pending.length}/{q.selectCount ?? 2} selected)
                          </button>
                          <button
                            className="px-3 py-1 rounded bg-slate-700 text-sm text-slate-300"
                            onClick={() => setMultiSelectPending((p) => ({ ...p, [q.id]: [] }))}
                          >Clear</button>
                        </div>
                      )}

                      {/* Show tip before answering only when user requested it */}
                      {!answered && showTipMap[q.id] && q.tip && (
                        <div className="mt-3 text-sm">
                          <div className="p-2 rounded bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                            <strong>Tip:</strong> {q.tip}
                          </div>
                        </div>
                      )}

                      {isFinished && answered && (
                        <div className="mt-3 text-sm space-y-2">
                          {q.explanation && (
                            <div className="p-2 rounded bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                              <div className="flex items-start justify-between gap-4">
                                <div className="pr-2"><strong>Explanation:</strong> {q.explanation}</div>
                                {q.docs && (
                                  <div className="flex-shrink-0">
                                    <a href={q.docs} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-1 rounded bg-slate-700 text-white text-sm">
                                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>
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
          </main>
        </div>
      </div>

      {/* Pause overlay */}
      {paused && examStarted && timed && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative text-center">
            <div className="text-4xl font-bold mb-4">⏸ Paused</div>
            <div className="text-sm text-slate-400 mb-6">Questions are hidden while paused</div>
            <button
              className="px-6 py-2 rounded-lg bg-sky-600 text-white text-lg font-semibold hover:bg-sky-500 transition-colors"
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
          <div className="relative bg-white dark:bg-slate-800 p-6 rounded max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Cancel attempt?</h3>
            <div className="text-sm text-slate-600 dark:text-slate-300 mb-4">Are you sure you want to cancel this in-progress attempt? This will clear the local attempt state.</div>
            <div className="flex items-center justify-end gap-3">
              <button className="px-3 py-1 rounded bg-slate-200 text-slate-500 hover:bg-slate-300" onClick={() => setShowCancelConfirm(false)}>No, keep</button>
              <button className="px-3 py-1 rounded bg-red-600 text-white hover:bg-red-700" onClick={async () => {
                // Attempt to delete the server-side attempt if it has no answers
                try {
                  if (attemptId) {
                    await authFetch(`/attempts/${attemptId}`, { method: 'DELETE' })
                  }
                } catch (e) {
                  // ignore delete errors (e.g., attempt has answers)
                }
                try { if (selected) localStorage.removeItem(`attempt:${selected}`) } catch {}
                setAttemptId(null)
                setAttemptData(null)
                setExamStarted(false)
                setSelectedAnswers({})
                setMultiSelectPending({})
                setTimeLeft(null)
                setPaused(false)
                setShowCancelConfirm(false)
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

      {/* Return to Practice Exams button below pre-start form */}
      {!examStarted && selected && !isFinished && route === 'home' && (
        <div className="container px-4 mt-3 md:col-span-4">
          <div className="mb-6 flex justify-center">
            <button className="px-4 py-2 rounded bg-slate-200 dark:bg-slate-800 text-sm" onClick={() => { setRoute('practice'); setSelected(null); setShowAttempts(false); setAttemptsList(null); }}>
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
              className={`max-w-sm w-full px-3 py-2 rounded shadow-lg cursor-pointer transition-opacity hover:opacity-90 ${t.type === 'error' ? 'bg-red-600 text-white' : 'bg-slate-800 text-white'}`}
            >
              <div className="text-sm">{t.msg}</div>
            </div>
          ))}
        </div>
      )}

      {/* Debug panel */}
      <div className="mt-6 p-4 rounded bg-black/5 dark:bg-white/5 text-sm">
        <details>
          <summary className="cursor-pointer font-medium">Debug</summary>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div><strong>attemptId:</strong> {attemptId ?? '—'}</div>
              <div><strong>lastError:</strong> <pre className="inline">{lastError ?? '—'}</pre></div>
              <div className="mt-2">
                <button
                  className="px-2 py-1 rounded bg-slate-200 dark:bg-slate-800"
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
  )
}


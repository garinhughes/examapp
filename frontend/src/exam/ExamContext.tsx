import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react'
import { PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useAuth } from '../auth/AuthContext'
import { useAuthFetch } from '../auth/useAuthFetch'
import { useIsAdmin } from '../auth/useIsAdmin'
import { useGamification } from '../gamification/GamificationContext'
import { levelFromXP } from '../gamification/types'
import { BADGES } from '../gamification/badges'
import { apiUrl } from '../apiBase'
import { isAnswerCorrect, computeDerivedAttempt } from './utils'
import { downloadAttemptCSV as dlCSV, downloadAttemptPDF as dlPDF, downloadAnalyticsCSV as dlAnalyticsCSV } from './downloads'
import type { Exam, Question, QuestionType, ExamMode, RevealMode, AppRoute } from './types'

// ═══════════════════════════════════════════════
// Context type
// ═══════════════════════════════════════════════
export interface ExamContextType {
  // Auth
  user: any
  authLoading: boolean
  login: () => void
  logout: () => void
  authFetch: (url: string, opts?: RequestInit) => Promise<Response>
  isAdmin: () => boolean
  gamState: any
  gamLevel: any
  dndSensors: any

  // Navigation
  route: AppRoute
  setRoute: React.Dispatch<React.SetStateAction<AppRoute>>

  // Exams
  exams: Exam[]
  selected: string | null
  setSelected: React.Dispatch<React.SetStateAction<string | null>>
  selectedMeta: any
  providers: { provider: string; exams: any[] }[]
  questions: Question[]
  setQuestions: React.Dispatch<React.SetStateAction<Question[]>>
  examTier: string | null
  userTier: string | null
  examTotalAvailable: number
  examLimited: boolean
  examShowcase: boolean
  trialDaysRemaining: number | null

  // Theme
  dark: boolean
  setDark: React.Dispatch<React.SetStateAction<boolean>>
  themePreset: string
  setThemePreset: React.Dispatch<React.SetStateAction<string>>
  customCorrect: string
  setCustomCorrect: React.Dispatch<React.SetStateAction<string>>
  customCorrect2: string
  setCustomCorrect2: React.Dispatch<React.SetStateAction<string>>
  customIncorrect: string
  setCustomIncorrect: React.Dispatch<React.SetStateAction<string>>
  customIncorrect2: string
  setCustomIncorrect2: React.Dispatch<React.SetStateAction<string>>

  // Answers
  selectedAnswers: Record<string, string | string[]>
  setSelectedAnswers: React.Dispatch<React.SetStateAction<Record<string, string | string[]>>>
  multiSelectPending: Record<string, string[]>
  setMultiSelectPending: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
  matchingAnswers: Record<string, Record<string, string>>
  setMatchingAnswers: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>
  orderingAnswers: Record<string, string[]>
  setOrderingAnswers: React.Dispatch<React.SetStateAction<Record<string, string[]>>>
  flaggedQuestions: Set<string>
  setFlaggedQuestions: React.Dispatch<React.SetStateAction<Set<string>>>
  currentQuestionIndex: number
  setCurrentQuestionIndex: React.Dispatch<React.SetStateAction<number>>

  // UI state
  showSubmitConfirm: boolean
  setShowSubmitConfirm: React.Dispatch<React.SetStateAction<boolean>>
  showCompleteEarlyConfirm: boolean
  setShowCompleteEarlyConfirm: React.Dispatch<React.SetStateAction<boolean>>
  showCancelConfirm: boolean
  setShowCancelConfirm: React.Dispatch<React.SetStateAction<boolean>>
  showTipMap: Record<string, boolean>
  setShowTipMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  paused: boolean
  setPaused: React.Dispatch<React.SetStateAction<boolean>>
  lastError: string | null
  setLastError: React.Dispatch<React.SetStateAction<string | null>>
  toasts: Array<{ id: string; msg: string; type?: 'info' | 'error' }>
  setToasts: React.Dispatch<React.SetStateAction<Array<{ id: string; msg: string; type?: 'info' | 'error' }>>>
  showToast: (msg: string, type?: 'info' | 'error') => void
  showConfetti: boolean
  setShowConfetti: React.Dispatch<React.SetStateAction<boolean>>
  rewardModal: any
  setRewardModal: React.Dispatch<React.SetStateAction<any>>
  mobileOpen: boolean
  setMobileOpen: React.Dispatch<React.SetStateAction<boolean>>

  // Attempt
  attemptId: string | null
  setAttemptId: React.Dispatch<React.SetStateAction<string | null>>
  attemptData: any
  setAttemptData: React.Dispatch<React.SetStateAction<any>>
  showAttempts: boolean
  setShowAttempts: React.Dispatch<React.SetStateAction<boolean>>
  attemptsList: any[] | null
  setAttemptsList: React.Dispatch<React.SetStateAction<any[] | null>>
  isFinished: boolean

  // Review
  reviewDomains: string[]
  setReviewDomains: React.Dispatch<React.SetStateAction<string[]>>
  reviewDomainOpen: boolean
  setReviewDomainOpen: React.Dispatch<React.SetStateAction<boolean>>
  reviewIndex: number
  setReviewIndex: React.Dispatch<React.SetStateAction<number>>
  incorrectOnly: boolean
  setIncorrectOnly: React.Dispatch<React.SetStateAction<boolean>>
  reviewDomainRef: React.RefObject<HTMLDivElement>
  reviewDomainToggleRef: React.RefObject<HTMLButtonElement>

  // Exam setup
  takeDomains: string[]
  setTakeDomains: React.Dispatch<React.SetStateAction<string[]>>
  domainOpen: boolean
  setDomainOpen: React.Dispatch<React.SetStateAction<boolean>>
  domainRef: React.RefObject<HTMLDivElement>
  domainToggleRef: React.RefObject<HTMLButtonElement>
  examStarted: boolean
  setExamStarted: React.Dispatch<React.SetStateAction<boolean>>
  timed: boolean
  setTimed: React.Dispatch<React.SetStateAction<boolean>>
  durationMinutes: number
  setDurationMinutes: React.Dispatch<React.SetStateAction<number>>
  examMode: ExamMode
  setExamMode: React.Dispatch<React.SetStateAction<ExamMode>>
  revealAnswers: RevealMode
  setRevealAnswers: React.Dispatch<React.SetStateAction<RevealMode>>
  revealedQuestions: Set<string>
  setRevealedQuestions: React.Dispatch<React.SetStateAction<Set<string>>>
  stagedAnswer: Record<string, string>
  setStagedAnswer: React.Dispatch<React.SetStateAction<Record<string, string>>>
  weakestLinkInfo: any
  setWeakestLinkInfo: React.Dispatch<React.SetStateAction<any>>
  loadingWeakestLink: boolean
  timeLeft: number | null
  setTimeLeft: React.Dispatch<React.SetStateAction<number | null>>
  numQuestions: number
  setNumQuestions: React.Dispatch<React.SetStateAction<number>>

  // Filters
  serviceFilterText: string
  setServiceFilterText: React.Dispatch<React.SetStateAction<string>>
  homeExamFilter: string
  setHomeExamFilter: React.Dispatch<React.SetStateAction<string>>
  selectedServices: string[]
  setSelectedServices: React.Dispatch<React.SetStateAction<string[]>>
  availableServices: string[]
  serviceDropOpen: boolean
  setServiceDropOpen: React.Dispatch<React.SetStateAction<boolean>>
  serviceSearchText: string
  setServiceSearchText: React.Dispatch<React.SetStateAction<string>>
  serviceDropRef: React.RefObject<HTMLDivElement>
  serviceDropToggleRef: React.RefObject<HTMLButtonElement>

  // Analytics
  scoreHistory: any[] | null
  loadingScoreHistory: boolean
  analyticsAttempts: any[] | null
  analyticsDomains: Record<string, { total: number; correct: number; avgScore: number; attemptCount: number }> | null
  deletingAttemptId: string | null
  setDeletingAttemptId: React.Dispatch<React.SetStateAction<string | null>>

  // Derived
  filteredByDomain: Question[]
  availableFilteredCount: number
  displayQuestions: Question[]
  savedProgress: { answeredCount: number; timestamp: number; total: number } | null
  anySavedExam: { code: string; title: string; answeredCount: number; total: number } | null

  // Actions
  setupExamFromMeta: (ex: any) => void
  fetchScoreHistory: (code: string) => Promise<void>
  createAttempt: () => Promise<void>
  submitAnswer: (q: Question, i: string | string[]) => Promise<void>
  submitMatchingAnswer: (q: Question, mappings: Record<string, string>) => Promise<void>
  submitOrderingAnswer: (q: Question, order: string[]) => Promise<void>
  finishAttempt: (aid: string) => Promise<void>
  handleSubmitExam: (earlyComplete?: boolean) => Promise<void>
  resumeExam: (examCode?: string) => void
  downloadAttemptCSV: () => void
  downloadAttemptPDF: () => void
  downloadAnalyticsCSV: () => void
}

const ExamContext = createContext<ExamContextType | null>(null)

export function useExam(): ExamContextType {
  const ctx = useContext(ExamContext)
  if (!ctx) throw new Error('useExam must be used inside <ExamProvider>')
  return ctx
}

// ═══════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════
export function ExamProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, login, logout } = useAuth()
  const authFetch = useAuthFetch()
  const { state: gamState, recordAttemptFinish, recordPracticeDay } = useGamification()
  const gamLevel = levelFromXP(gamState.xp)
  const isAdmin = useIsAdmin()
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  )

  // ── Confetti / reward ──
  const [showConfetti, setShowConfetti] = useState(false)
  const [rewardModal, setRewardModal] = useState<{ title: string; subtitle?: string; xpGained: number; badges: { icon: string; name: string }[] } | null>(null)

  // ── Route & exam selection ──
  const [route, setRoute] = useState<AppRoute>('home')
  const [exams, setExams] = useState<Exam[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [examTier, setExamTier] = useState<string | null>(null)
  const [userTier, setUserTier] = useState<string | null>(null)
  const [examTotalAvailable, setExamTotalAvailable] = useState<number>(0)
  const [examLimited, setExamLimited] = useState<boolean>(false)
  const [examShowcase, setExamShowcase] = useState<boolean>(false)
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number | null>(null)

  const selectedMeta = useMemo(() => {
    if (!selected) return null
    const sel = String(selected).toLowerCase()
    return (exams.find((e) => String(e.code).toLowerCase() === sel) as any) || null
  }, [exams, selected])

  // ── Theme ──
  const [dark, setDark] = useState<boolean>(() => {
    try { const stored = localStorage.getItem('theme'); if (stored) return stored === 'dark' } catch {}
    return true
  })
  const [themePreset, setThemePreset] = useState<string>(() => {
    try { const raw = localStorage.getItem('themePrefs'); if (raw) return JSON.parse(raw).preset || 'dark' } catch {}
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

  // ── Answers ──
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string | string[]>>({})
  const [multiSelectPending, setMultiSelectPending] = useState<Record<string, string[]>>({})
  const [matchingAnswers, setMatchingAnswers] = useState<Record<string, Record<string, string>>>({})
  const [orderingAnswers, setOrderingAnswers] = useState<Record<string, string[]>>({})
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(new Set())
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0)

  // ── UI state ──
  const [showSubmitConfirm, setShowSubmitConfirm] = useState<boolean>(false)
  const [showCompleteEarlyConfirm, setShowCompleteEarlyConfirm] = useState<boolean>(false)
  const [showTipMap, setShowTipMap] = useState<Record<string, boolean>>({})
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [paused, setPaused] = useState<boolean>(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Array<{ id: string; msg: string; type?: 'info' | 'error' }>>([])
  const showToast = (msg: string, type: 'info' | 'error' = 'info') => {
    const id = String(Date.now()) + Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, msg, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500)
  }
  const [attemptData, setAttemptData] = useState<any | null>(null)
  const [showAttempts, setShowAttempts] = useState(false)
  const [attemptsList, setAttemptsList] = useState<any[] | null>(null)
  const [mobileOpen, setMobileOpen] = useState<boolean>(false)

  // ── Review ──
  const [reviewDomains, setReviewDomains] = useState<string[]>(['All'])
  const [reviewDomainOpen, setReviewDomainOpen] = useState<boolean>(false)
  const [reviewIndex, setReviewIndex] = useState<number>(0)
  const reviewDomainRef = useRef<HTMLDivElement>(null)
  const reviewDomainToggleRef = useRef<HTMLButtonElement>(null)
  const [incorrectOnly, setIncorrectOnly] = useState<boolean>(false)

  useEffect(() => {
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

  // ── Domain filter (take exam) ──
  const [takeDomains, setTakeDomains] = useState<string[]>(['All'])
  const [domainOpen, setDomainOpen] = useState<boolean>(false)
  const domainRef = useRef<HTMLDivElement>(null)
  const domainToggleRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
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

  // ── Exam mode & timing ──
  const [examStarted, setExamStarted] = useState<boolean>(false)
  const [timed, setTimed] = useState<boolean>(false)
  const [durationMinutes, setDurationMinutes] = useState<number>(15)
  const [examMode, setExamMode] = useState<ExamMode>('casual')
  const [revealAnswers, setRevealAnswers] = useState<RevealMode>('immediately')
  const [revealedQuestions, setRevealedQuestions] = useState<Set<string>>(new Set())
  const [stagedAnswer, setStagedAnswer] = useState<Record<string, string>>({})
  const [weakestLinkInfo, setWeakestLinkInfo] = useState<{
    domainWeights: Record<string, number>
    domainStats: Record<string, { total: number; correct: number; avgScore: number; attemptCount: number }>
    wrongQuestionCount: number
  } | null>(null)
  const [loadingWeakestLink, setLoadingWeakestLink] = useState<boolean>(false)
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [numQuestions, setNumQuestions] = useState<number>(0)
  const [showCancelConfirm, setShowCancelConfirm] = useState<boolean>(false)

  // ── Filters ──
  const [serviceFilterText, setServiceFilterText] = useState<string>('')
  const [homeExamFilter, setHomeExamFilter] = useState<string>('')
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [availableServices, setAvailableServices] = useState<string[]>([])
  const [serviceDropOpen, setServiceDropOpen] = useState<boolean>(false)
  const [serviceSearchText, setServiceSearchText] = useState<string>('')
  const serviceDropRef = useRef<HTMLDivElement>(null)
  const serviceDropToggleRef = useRef<HTMLButtonElement>(null)
  const resumingRef = useRef<boolean>(false)

  useEffect(() => {
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

  // ── Analytics ──
  const [scoreHistory, setScoreHistory] = useState<any[] | null>(null)
  const [loadingScoreHistory, setLoadingScoreHistory] = useState<boolean>(false)
  const [analyticsAttempts, setAnalyticsAttempts] = useState<any[] | null>(null)
  const [analyticsDomains, setAnalyticsDomains] = useState<Record<string, { total: number; correct: number; avgScore: number; attemptCount: number }> | null>(null)
  const [deletingAttemptId, setDeletingAttemptId] = useState<string | null>(null)

  // ═══════════════════════════════════════════════
  // Derived values
  // ═══════════════════════════════════════════════
  const isFinished = !!attemptData?.finishedAt || (
    typeof attemptData?.score === 'number' &&
    typeof attemptData?.total === 'number' &&
    attemptData.total > 0
  )

  const filteredByDomain = (takeDomains.includes('All') || takeDomains.length === 0)
    ? questions
    : questions.filter((q) => takeDomains.includes((q as any).domain))

  const availableFilteredCount = useMemo(() => {
    let pool = filteredByDomain
    if (selectedServices.length > 0) {
      const lowerServices = selectedServices.map((s) => s.toLowerCase())
      pool = pool.filter((q: any) => {
        const qServices: string[] = Array.isArray(q.services) ? q.services.map((s: string) => s.toLowerCase()) : []
        return lowerServices.some((s) => qServices.includes(s))
      })
    }
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

  const displayQuestions = (typeof numQuestions === 'number' && numQuestions > 0)
    ? filteredByDomain.slice(0, numQuestions)
    : filteredByDomain

  const savedProgress = useMemo(() => {
    if (!selected || examStarted) return null
    try {
      const raw = localStorage.getItem(`examProgress:${selected}`)
      if (!raw) return null
      const saved = JSON.parse(raw)
      const answeredCount = Object.keys(saved.answers || {}).length
      if (answeredCount === 0) return null
      const age = Date.now() - (saved.timestamp || 0)
      if (age > 24 * 60 * 60 * 1000) { localStorage.removeItem(`examProgress:${selected}`); return null }
      return { answeredCount, timestamp: saved.timestamp, total: saved.numQuestions || 0 }
    } catch { return null }
  }, [selected, examStarted])

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

  const providers = useMemo(() => {
    const byProvider: Record<string, any[]> = {}
    exams.forEach((e: any) => {
      let prov = e.provider
      if (!prov) {
        const title = (e.title || '').toUpperCase()
        const code = (e.code || '').toUpperCase()
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
    const result: { provider: string; exams: any[] }[] = []
    for (const prov of Object.keys(byProvider)) {
      const list = byProvider[prov]
      const byName: Record<string, any[]> = {}
      list.forEach((it) => {
        const name = it.title ?? it.code
        byName[name] = byName[name] || []
        byName[name].push(it)
      })
      const cards = Object.entries(byName).map(([_name, arr]) => {
        const sorted = arr.slice().sort((a: any, b: any) => {
          const va = parseFloat(String(a.version).replace(/[^0-9.]/g, '')) || 0
          const vb = parseFloat(String(b.version).replace(/[^0-9.]/g, '')) || 0
          return vb - va
        })
        return sorted[0]
      })
      result.push({ provider: prov, exams: cards })
    }
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

  // ═══════════════════════════════════════════════
  // Handler functions
  // ═══════════════════════════════════════════════

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
    } catch { setNumQuestions(10) }
    setRoute('home')
  }

  async function fetchScoreHistory(code: string) {
    setLoadingScoreHistory(true)
    try {
      const res = await authFetch(`/analytics/exam/${encodeURIComponent(code)}/scores`)
      if (!res.ok) {
        try {
          const r2 = await authFetch('/attempts')
          if (r2.ok) {
            const dd = await r2.json()
            const all = Array.isArray(dd.attempts) ? dd.attempts : []
            const filtered = all.filter((a: any) => String(a.examCode || '').toLowerCase() === String(code || '').toLowerCase())
            setAnalyticsAttempts(filtered.map((a: any) => ({
              attemptId: a.attemptId, startedAt: a.startedAt, finishedAt: a.finishedAt,
              score: (typeof a.score === 'number' ? Math.max(0, Math.min(100, Math.round(a.score))) : null),
              answersCount: Array.isArray(a.answers) ? a.answers.length : 0
            })))
            const scoresFallback = filtered
              .filter((a: any) => a.finishedAt && typeof a.score === 'number')
              .map((a: any) => ({
                attemptId: a.attemptId, startedAt: a.startedAt, finishedAt: a.finishedAt,
                score: Math.max(0, Math.min(100, Math.round(a.score)))
              }))
              .sort((x: any, y: any) => String(x.finishedAt || x.startedAt || '').localeCompare(String(y.finishedAt || y.startedAt || '')))
            setScoreHistory(scoresFallback)
          } else { setScoreHistory([]); setAnalyticsAttempts([]); setAnalyticsDomains(null) }
        } catch (err) { console.error('fallback /attempts fetch failed', err); setScoreHistory([]); setAnalyticsAttempts([]); setAnalyticsDomains(null) }
        return
      }
      const d = await res.json()
      setScoreHistory(Array.isArray(d.scores) ? d.scores : [])
      setAnalyticsAttempts(Array.isArray(d.attempts) ? d.attempts : [])
      setAnalyticsDomains(d.domains && typeof d.domains === 'object' ? d.domains : null)
    } catch (err) { console.error('fetchScoreHistory', err); setScoreHistory([]); setAnalyticsAttempts([]); setAnalyticsDomains(null) }
    finally { setLoadingScoreHistory(false) }
  }

  /** Extract a human-readable message from an error response body (JSON or plain text). */
  async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
    try {
      const text = await res.text()
      try { const j = JSON.parse(text); return j?.message ?? j?.error ?? text } catch { return text || fallback }
    } catch { return fallback }
  }

  async function createAttempt() {
    if (!selected) return
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

    // Visitor (unauthenticated) — run exam client-side
    if (!user) {
      if (examMode === 'weakest-link') { setLastError('Sign in to use Weakest Link mode — it needs your attempt history.'); return }
      const localId = `visitor-${Date.now()}`
      setAttemptId(localId)
      setExamStarted(true)
      if (examMode === 'timed') setTimeLeft(durationMinutes * 60)
      return
    }

    try {
      // Weakest Link mode
      if (examMode === 'weakest-link') {
        setLoadingWeakestLink(true)
        try {
          const wlRes = await authFetch(`/exams/${encodeURIComponent(selected)}/weakest-link?count=${numQuestions}`)
          if (!wlRes.ok) { setLastError(await extractErrorMessage(wlRes, 'weakest-link fetch failed')); return }
          const wlData = await wlRes.json()
          const wlQuestions = wlData.questions || []
          if (wlQuestions.length === 0) { setLastError('No questions available for Weakest Link mode. Complete some attempts first!'); return }
          setWeakestLinkInfo({ domainWeights: wlData.domainWeights, domainStats: wlData.domainStats, wrongQuestionCount: wlData.wrongQuestionCount })
          const res = await authFetch('/attempts', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              examCode: selected, questionIds: wlQuestions.map((q: any) => q.id), questions: wlQuestions,
              metadata: { mode: 'weakest-link', domainWeights: wlData.domainWeights, wrongQuestionCount: wlData.wrongQuestionCount }
            })
          })
          if (!res.ok) { setLastError(await extractErrorMessage(res, 'create attempt failed')); return }
          const data = await res.json()
          if (data?.attemptId) {
            recordPracticeDay()
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
            } catch {}
            setAttemptId(data.attemptId)
            try { localStorage.setItem(key, JSON.stringify({ attemptId: data.attemptId, examVersion: null, attemptSchemaVersion: 1 })) } catch {}
            setQuestions(wlQuestions)
            setAttemptData({ questions: wlQuestions, attemptId: data.attemptId, examCode: selected })
            setNumQuestions(wlQuestions.length)
            setExamStarted(true)
          }
        } finally { setLoadingWeakestLink(false) }
        return
      }

      // Normal (casual / timed) mode
      const keywords = serviceFilterText.split(',').map((s) => s.trim()).filter(Boolean)
      const domainFilterList = (takeDomains.includes('All') || takeDomains.length === 0) ? [] : takeDomains
      const hasAnyFilter = keywords.length > 0 || domainFilterList.length > 0 || selectedServices.length > 0
      if (hasAnyFilter) {
        const lowerServices = selectedServices.map((s) => s.toLowerCase())
        const localMatches = (questions || []).filter((q: any) => {
          if (domainFilterList.length > 0 && !domainFilterList.includes((q as any).domain)) return false
          if (lowerServices.length > 0) {
            const qServices: string[] = Array.isArray(q.services) ? q.services.map((s: string) => s.toLowerCase()) : []
            if (!lowerServices.some((s) => qServices.includes(s))) return false
          }
          if (keywords.length > 0) {
            const text = String(q.question || '').toLowerCase()
            if (keywords.some((kw) => text.includes(kw))) return true
            if (Array.isArray(q.choices)) { for (const c of q.choices) { const ct = typeof c === 'string' ? c : (c?.text ?? ''); if (keywords.some((kw) => String(ct).toLowerCase().includes(kw))) return true } }
            return false
          }
          return true
        })
        if (!localMatches || localMatches.length === 0) { setLastError('No questions match the requested filters'); return }
      }

      const res = await authFetch('/attempts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examCode: selected,
          numQuestions: numQuestions > 0 ? numQuestions : (availableFilteredCount > 0 ? availableFilteredCount : (questions.length > 0 ? questions.length : undefined)),
          metadata: { serviceKeywords: keywords, domains: domainFilterList, services: selectedServices }
        })
      })
      if (!res.ok) { setLastError(await extractErrorMessage(res, 'create attempt failed')); return }
      const data = await res.json()
      if (data?.attemptId) {
        recordPracticeDay()
        try {
          const r2 = await authFetch(`/attempts/${data.attemptId}`)
          if (r2.ok) {
            const attemptFull = await r2.json()
            setAttemptId(data.attemptId)
            try { localStorage.setItem(key, JSON.stringify({ attemptId: data.attemptId, examVersion: attemptFull?.examVersion ?? attemptFull?.version ?? null, attemptSchemaVersion: 1 })) } catch {}
            setAttemptData(attemptFull)
            if (Array.isArray(attemptFull.questions)) { setQuestions(attemptFull.questions); setNumQuestions(attemptFull.questions.length) }
            setExamStarted(true)
            if (examMode === 'timed') setTimeLeft(durationMinutes * 60)
          } else {
            setAttemptId(data.attemptId)
            try { localStorage.setItem(key, JSON.stringify({ attemptId: data.attemptId, examVersion: null, attemptSchemaVersion: 1 })) } catch {}
            setExamStarted(true)
            if (examMode === 'timed') setTimeLeft(durationMinutes * 60)
          }
        } catch {
          setAttemptId(data.attemptId)
          try { localStorage.setItem(key, JSON.stringify({ attemptId: data.attemptId, examVersion: null, attemptSchemaVersion: 1 })) } catch {}
          setExamStarted(true)
          if (examMode === 'timed') setTimeLeft(durationMinutes * 60)
        }
      }
    } catch (err) { console.error('createAttempt error', err); setLastError(String(err)) }
  }

  function autoAdvance(newSelected: Record<string, string | string[]>) {
    if (revealAnswers === 'immediately') return
    const nextIdx = displayQuestions.findIndex((qq, idx) => idx > currentQuestionIndex && newSelected[qq.id] === undefined)
    if (nextIdx >= 0) setCurrentQuestionIndex(nextIdx)
    else {
      const wrap = displayQuestions.findIndex((qq) => newSelected[qq.id] === undefined)
      if (wrap >= 0) setCurrentQuestionIndex(wrap)
    }
  }

  async function sendAnswerToServer(qId: string, payload: Record<string, any>) {
    if (!user || !attemptId) return
    try {
      const res = await authFetch(`/attempts/${attemptId}/answer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: qId, ...payload, timeMs: 0, showTip: !!showTipMap[qId] })
      })
      if (!res.ok) { const msg = await extractErrorMessage(res, 'save answer failed'); console.error('save answer failed', msg); setLastError(msg) }
    } catch (err) { console.error('submit answer error', err); setLastError(String(err)) }
  }

  async function submitAnswer(q: Question, i: string | string[]) {
    if (isFinished || !examStarted || !attemptId) return
    const isReAnswer = selectedAnswers[q.id] !== undefined
    const newSelected = { ...selectedAnswers, [q.id]: i }
    setSelectedAnswers(newSelected)
    setMultiSelectPending((p) => { const next = { ...p }; delete next[q.id]; return next })
    if (!isReAnswer) autoAdvance(newSelected)
    const isMulti = Array.isArray(i)
    await sendAnswerToServer(q.id, isMulti ? { selectedChoiceIds: i } : { selectedChoiceId: i })
  }

  async function submitMatchingAnswer(q: Question, mappings: Record<string, string>) {
    if (isFinished || !examStarted || !attemptId) return
    const isReAnswer = selectedAnswers[q.id] !== undefined
    setMatchingAnswers((p) => ({ ...p, [q.id]: mappings }))
    const newSelected = { ...selectedAnswers, [q.id]: JSON.stringify(mappings) }
    setSelectedAnswers(newSelected)
    if (!isReAnswer) autoAdvance(newSelected)
    await sendAnswerToServer(q.id, { selectedMappings: mappings })
  }

  async function submitOrderingAnswer(q: Question, order: string[]) {
    if (isFinished || !examStarted || !attemptId) return
    const isReAnswer = selectedAnswers[q.id] !== undefined
    setOrderingAnswers((p) => ({ ...p, [q.id]: order }))
    const newSelected = { ...selectedAnswers, [q.id]: JSON.stringify(order) }
    setSelectedAnswers(newSelected)
    if (!isReAnswer) autoAdvance(newSelected)
    await sendAnswerToServer(q.id, { selectedOrder: order })
  }

  async function finishAttempt(aid: string) {
    if (!user) { setExamStarted(false); setTimeLeft(null); return }
    try {
      const fin = await authFetch(`/attempts/${aid}/finish`, { method: 'PATCH' })
      const finData = await fin.json()
      if ('attemptId' in finData) {
        let fullAttempt = finData
        try { const r2 = await authFetch(`/attempts/${finData.attemptId}`); if (r2.ok) fullAttempt = await r2.json() } catch {}
        const computed = computeDerivedAttempt(fullAttempt, Array.isArray(fullAttempt.questions) ? fullAttempt.questions : questions)
        setAttemptData(computed)
        if (Array.isArray(fullAttempt.questions)) setQuestions(fullAttempt.questions)
        setExamStarted(false)
        setTimeLeft(null)
        handleGamificationReward(computed)
      } else { setLastError(finData?.message ?? finData?.error ?? 'Failed to finish attempt') }
    } catch (err) { console.error('finishAttempt error', err); setLastError(String(err)) }
  }

  function handleGamificationReward(finData: any) {
    if (typeof finData?.score !== 'number') return
    try {
      const examCode = finData.examCode ?? selected ?? ''
      const allAttemptScores = (attemptsList ?? [])
        .filter((a: any) => a.finishedAt && typeof a.score === 'number')
        .map((a: any) => a.score as number)
      allAttemptScores.push(finData.score)
      const finCount = allAttemptScores.length
      const pm = selectedMeta?.passMark ?? 70

      // Compute average difficulty from the questions in this attempt
      const diffs = (displayQuestions as any[]).map((q) => q.difficulty).filter((d) => typeof d === 'number')
      const avgDifficulty = diffs.length > 0 ? diffs.reduce((a: number, b: number) => a + b, 0) / diffs.length : undefined

      // Previous scores for this specific exam (excluding the current attempt)
      const prevScoresForExam = (attemptsList ?? [])
        .filter((a: any) => a.finishedAt && typeof a.score === 'number' && a.examCode === examCode)
        .map((a: any) => a.score as number)

      const event = recordAttemptFinish({
        examCode, score: finData.score,
        correctCount: finData.correctCount ?? 0, total: finData.total ?? 0,
        perDomain: finData.perDomain, allScores: allAttemptScores,
        finishedCount: finCount, passMark: pm,
        avgDifficulty,
        examLevel: selectedMeta?.level != null ? String(selectedMeta.level) : undefined,
        provider: selectedMeta?.provider != null ? String(selectedMeta.provider) : undefined,
        prevScoresForExam,
      })
      const passed = finData.score >= pm
      if (passed || event.newLevel !== null || event.newBadges.length > 0) {
        setShowConfetti(true)
        const badgeInfo = event.newBadges.map((eb: any) => {
          const def = BADGES.find((b) => b.id === eb.id)
          return { icon: def?.icon ?? '🏅', name: def?.name ?? eb.id }
        })
        const title = event.newLevel !== null ? `Level Up! Level ${event.newLevel}` : passed ? 'Exam Passed! 🎉' : 'New Badges Unlocked!'
        const subtitle = passed && event.newLevel === null ? `You scored ${finData.score}%` : event.newLevel !== null ? `You scored ${finData.score}%` : undefined
        setRewardModal({ title, subtitle, xpGained: event.xpGained, badges: badgeInfo })
      } else if (event.xpGained > 0) { showToast(`+${event.xpGained} XP earned!`, 'info') }
      authFetch('/gamification/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xp: gamState.xp + event.xpGained, level: event.newLevel ?? gamState.level, streak: gamState.streak, leaderboardOptIn: gamState.leaderboardOptIn, displayName: user?.name ?? 'Anonymous', cmr: gamState.cmr + event.cmrGained }),
      }).catch(() => {})
    } catch (err) { console.error('gamification reward error', err) }
  }

  async function handleSubmitExam(earlyComplete = false) {
    if (!selected || !attemptId) return
    const answeredCount = Object.keys(selectedAnswers).filter(id => displayQuestions.some(q => q.id === id)).length
    const totalQuestions = displayQuestions.length
    try { localStorage.removeItem(`examProgress:${selected}`) } catch {}

    // Visitor — compute locally
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
        const isRight = isAnswerCorrect(qn, sel)
        if (isRight) { correct++; perDomain[dom].correct++ }
      }
      for (const k of Object.keys(perDomain)) { const e = perDomain[k]; e.score = e.total > 0 ? Math.round((e.correct / e.total) * 100) : 0 }
      const denom = earlyComplete ? answeredCount : totalQuestions
      const score = denom > 0 ? Math.round((correct / denom) * 100) : 0
      setAttemptData({
        attemptId, examCode: selected, score, correctCount: correct,
        total: denom, answeredCount, totalQuestions, earlyComplete, perDomain,
        finishedAt: new Date().toISOString(),
        questions: qs.map((qn) => ({ ...qn, selectedChoiceId: Array.isArray(selectedAnswers[qn.id]) ? undefined : selectedAnswers[qn.id] as string, selectedChoiceIds: Array.isArray(selectedAnswers[qn.id]) ? selectedAnswers[qn.id] : undefined })),
      })
      setExamStarted(false); setTimeLeft(null)
      setShowSubmitConfirm(false); setShowCompleteEarlyConfirm(false)
      return
    }

    // Authenticated — call server finish
    try {
      const finOpts: RequestInit = { method: 'PATCH' }
      if (earlyComplete) { finOpts.headers = { 'Content-Type': 'application/json' }; finOpts.body = JSON.stringify({ earlyComplete: true }) }
      const fin = await authFetch(`/attempts/${attemptId}/finish`, finOpts)
      const finData = await fin.json()
      if ('attemptId' in finData) {
        let fullAttempt = finData
        try { const r2 = await authFetch(`/attempts/${finData.attemptId}`); if (r2.ok) fullAttempt = await r2.json() } catch {}
        const computed = computeDerivedAttempt(fullAttempt, Array.isArray(fullAttempt.questions) ? fullAttempt.questions : questions)
        setAttemptData(computed)
        if (Array.isArray(fullAttempt.questions)) setQuestions(fullAttempt.questions)
        handleGamificationReward(computed)
        setExamStarted(false); setTimeLeft(null)
        if (showAttempts) { try { const r3 = await authFetch('/attempts'); const dd = await r3.json(); setAttemptsList(dd.attempts ?? []) } catch {} }
      } else { setLastError(finData?.message ?? finData?.error ?? 'Failed to submit exam') }
    } catch (err) { console.error('handleSubmitExam error', err); setLastError(String(err)) }
    setShowSubmitConfirm(false); setShowCompleteEarlyConfirm(false)
  }

  function resumeExam(examCode?: string) {
    const code = examCode ?? selected
    if (!code) return
    const key = `examProgress:${code}`
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return
      const saved = JSON.parse(raw)
      resumingRef.current = true
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
      if (saved.attemptId) { setAttemptId(saved.attemptId) }
      else if (!user) { setAttemptId(`visitor-${Date.now()}`) }
      setExamStarted(true)
      setTimeout(() => { resumingRef.current = false }, 100)
    } catch (err) { console.error('resumeExam error', err); resumingRef.current = false }
  }

  // ═══════════════════════════════════════════════
  // Effects
  // ═══════════════════════════════════════════════

  // Theme preset effect
  useEffect(() => {
    let presetCorrect = customCorrect, presetCorrect2 = customCorrect2, presetIncorrect = customIncorrect, presetIncorrect2 = customIncorrect2
    let useDark = dark
    if (themePreset === 'dark') { useDark = true; presetCorrect = '#10b981'; presetCorrect2 = '#059669'; presetIncorrect = '#ef4444'; presetIncorrect2 = '#dc2626' }
    else if (themePreset === 'light') { useDark = false; presetCorrect = '#059669'; presetCorrect2 = '#047857'; presetIncorrect = '#ef4444'; presetIncorrect2 = '#b91c1c' }
    else if (themePreset === 'colourblind') { useDark = true; presetCorrect = '#2dd4bf'; presetCorrect2 = '#14b8a6'; presetIncorrect = '#ffb020'; presetIncorrect2 = '#fb923c' }
    else if (themePreset === 'custom') { useDark = true; presetCorrect = customCorrect; presetCorrect2 = customCorrect2; presetIncorrect = customIncorrect; presetIncorrect2 = customIncorrect2 }
    if (useDark) document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark')
    try { localStorage.setItem('theme', useDark ? 'dark' : 'light') } catch {}
    const toRgba = (hex: string, a = 0.45) => { const h = hex.replace('#',''); const bigint = parseInt(h.length===3? h.split('').map(c=>c+c).join(''): h, 16); const r = (bigint >> 16) & 255; const g = (bigint >> 8) & 255; const b = bigint & 255; return `rgba(${r},${g},${b},${a})` }
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

  useEffect(() => {
    if (dark) document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark')
    try { localStorage.setItem('theme', dark ? 'dark' : 'light') } catch {}
  }, [dark])

  // Fetch global user tier (paying / registered / visitor) — independent of any exam
  useEffect(() => {
    if (!user) { setUserTier(null); setTrialDaysRemaining(null); return }
    authFetch('/auth/me')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.tier) setUserTier(data.tier)
        setTrialDaysRemaining(typeof data?.trialDaysRemaining === 'number' ? data.trialDaysRemaining : null)
      })
      .catch(() => {})
  }, [user])

  // Fetch exams list
  useEffect(() => {
    fetch(apiUrl('/exams'))
      .then((r) => r.json())
      .then(setExams)
      .catch((e) => { console.error(e); setLastError(String(e)) })
  }, [])

  // Fetch available services when exam selected
  useEffect(() => {
    if (!selected) { setAvailableServices([]); setSelectedServices([]); return }
    fetch(`/exams/${selected}/services`)
      .then((r) => (r.ok ? r.json() : []))
      .then((svcs: string[]) => { setAvailableServices(Array.isArray(svcs) ? svcs : []); setSelectedServices([]) })
      .catch(() => setAvailableServices([]))
  }, [selected])

  // Fetch score history when exam selected
  useEffect(() => {
    if (selected) fetchScoreHistory(selected); else setScoreHistory(null)
  }, [selected])

  // Analytics page data
  useEffect(() => {
    if (route !== 'analytics') return
    if (!selected) return
    setAnalyticsAttempts(null); setAnalyticsDomains(null)
    void fetchScoreHistory(selected)
  }, [route, selected])

  // Fetch questions
  useEffect(() => {
    if (!selected) return
    if (Array.isArray(attemptData?.questions) && attemptData.questions.length > 0) return
    authFetch(`/exams/${selected}/questions`)
      .then((r) => { if (!r.ok) throw new Error(`Failed to load questions (${r.status})`); return r.json() })
      .then((data) => {
        if (Array.isArray(data)) { setQuestions(data); setExamTier(null); setExamTotalAvailable(data.length); setExamLimited(false); setExamShowcase(false) }
        else if (data && Array.isArray(data.questions)) { setQuestions(data.questions); setExamTier(data.tier ?? null); setExamTotalAvailable(data.totalAvailable ?? data.questions.length); setExamLimited(!!data.limited); setExamShowcase(!!data.showcase) }
      })
      .catch((e) => { console.error(e); setLastError(String(e)) })
  }, [selected, user])

  // Pre-start defaults
  useEffect(() => {
    if (route !== 'home' || !selected) return
    if (examStarted || resumingRef.current) return
    try {
      const meta = exams.find((e: any) => e.code === selected)
      const defDur = typeof meta?.defaultDuration === 'number' ? meta.defaultDuration : 15
      const defQ = meta?.defaultQuestions ?? meta?.defaultQuestionCount ?? (meta?.provider === 'AWS' ? 65 : (questions.length || 10))
      setTakeDomains(['All']); setTimed(false); setDurationMinutes(defDur); setNumQuestions(defQ)
    } catch {}
  }, [route, selected, exams])

  // Timer
  useEffect(() => {
    if (!examStarted || examMode !== 'timed') return
    if (timeLeft === null) return
    if (paused) return
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (!t || t <= 1) { clearInterval(id); handleSubmitExam(false); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [examStarted, examMode, timeLeft, attemptId, paused])

  // Auto-save progress
  useEffect(() => {
    if (!examStarted || !selected || isFinished) return
    const key = `examProgress:${selected}`
    try {
      localStorage.setItem(key, JSON.stringify({
        answers: selectedAnswers, flagged: Array.from(flaggedQuestions), currentIndex: currentQuestionIndex,
        numQuestions, timed, timeLeft, durationMinutes, attemptId: attemptId ?? null,
        examMode: examMode ?? 'casual', revealAnswers: revealAnswers ?? 'immediately', timestamp: Date.now(),
      }))
    } catch {}
  }, [selectedAnswers, flaggedQuestions, currentQuestionIndex, examStarted, selected, isFinished, timeLeft])

  // Auto-cap numQuestions
  useEffect(() => {
    if (examStarted || isFinished) return
    if (availableFilteredCount > 0 && numQuestions > availableFilteredCount) setNumQuestions(availableFilteredCount)
  }, [availableFilteredCount, examStarted, isFinished])

  // Validate existing attempt
  useEffect(() => {
    if (resumingRef.current) return
    if (!selected) { setAttemptId(null); setExamStarted(false); return }
    const key = `attempt:${selected}`
    const existingRaw = (() => { try { return localStorage.getItem(key) } catch { return null } })()
    const existing = (() => {
      if (!existingRaw) return null
      try { const parsed = JSON.parse(existingRaw); if (parsed && parsed.attemptId) return parsed.attemptId } catch {}
      return existingRaw
    })()
    if (!existing) { setAttemptId(null); setExamStarted(false); return }
    ;(async () => {
      try {
        const r = await authFetch(`/attempts/${existing}`)
        if (!r.ok) { try { localStorage.removeItem(key) } catch {}; setAttemptId(null); setExamStarted(false); return }
        const data = await r.json()
        if (data?.finishedAt) { try { localStorage.removeItem(key) } catch {}; setAttemptId(null); setExamStarted(false); return }
        setAttemptId(existing); setAttemptData(data)
        if (Array.isArray(data.questions)) setQuestions(data.questions)
        setExamStarted(true)
      } catch (err) { console.error('validate existing attempt error', err); setAttemptId(null); setExamStarted(false) }
    })()
    try {
      if (!existing) {
        const meta = exams.find((e: any) => e.code === selected)
        const def = meta?.defaultQuestions ?? meta?.defaultQuestionCount ?? (meta?.provider === 'AWS' ? 65 : (questions.length || 10))
        const defDur = typeof meta?.defaultDuration === 'number' ? meta.defaultDuration : 15
        setTakeDomains(['All']); setTimed(false); setNumQuestions(def); setDurationMinutes(defDur)
      }
    } catch {}
  }, [selected])

  // ═══════════════════════════════════════════════
  // Wrapper download functions
  // ═══════════════════════════════════════════════
  const downloadAttemptCSV = () => dlCSV(attemptData, selectedMeta, questions)
  const downloadAttemptPDF = () => dlPDF(attemptData, selectedMeta, questions)
  const downloadAnalyticsCSV = () => dlAnalyticsCSV(selected, selectedMeta, analyticsAttempts, analyticsDomains)

  // ═══════════════════════════════════════════════
  // Context value
  // ═══════════════════════════════════════════════
  const value: ExamContextType = {
    user, authLoading, login, logout, authFetch, isAdmin, gamState, gamLevel, dndSensors,
    route, setRoute,
    exams, selected, setSelected, selectedMeta, providers, questions, setQuestions, examTier, userTier, examTotalAvailable, examLimited, examShowcase, trialDaysRemaining,
    dark, setDark, themePreset, setThemePreset, customCorrect, setCustomCorrect, customCorrect2, setCustomCorrect2, customIncorrect, setCustomIncorrect, customIncorrect2, setCustomIncorrect2,
    selectedAnswers, setSelectedAnswers, multiSelectPending, setMultiSelectPending, matchingAnswers, setMatchingAnswers, orderingAnswers, setOrderingAnswers, flaggedQuestions, setFlaggedQuestions, currentQuestionIndex, setCurrentQuestionIndex,
    showSubmitConfirm, setShowSubmitConfirm, showCompleteEarlyConfirm, setShowCompleteEarlyConfirm, showCancelConfirm, setShowCancelConfirm, showTipMap, setShowTipMap, paused, setPaused, lastError, setLastError, toasts, setToasts, showToast, showConfetti, setShowConfetti, rewardModal, setRewardModal, mobileOpen, setMobileOpen,
    attemptId, setAttemptId, attemptData, setAttemptData, showAttempts, setShowAttempts, attemptsList, setAttemptsList, isFinished,
    reviewDomains, setReviewDomains, reviewDomainOpen, setReviewDomainOpen, reviewIndex, setReviewIndex, incorrectOnly, setIncorrectOnly, reviewDomainRef, reviewDomainToggleRef,
    takeDomains, setTakeDomains, domainOpen, setDomainOpen, domainRef, domainToggleRef, examStarted, setExamStarted, timed, setTimed, durationMinutes, setDurationMinutes, examMode, setExamMode, revealAnswers, setRevealAnswers, revealedQuestions, setRevealedQuestions, stagedAnswer, setStagedAnswer, weakestLinkInfo, setWeakestLinkInfo, loadingWeakestLink, timeLeft, setTimeLeft, numQuestions, setNumQuestions,
    serviceFilterText, setServiceFilterText, homeExamFilter, setHomeExamFilter, selectedServices, setSelectedServices, availableServices, serviceDropOpen, setServiceDropOpen, serviceSearchText, setServiceSearchText, serviceDropRef, serviceDropToggleRef,
    scoreHistory, loadingScoreHistory, analyticsAttempts, analyticsDomains, deletingAttemptId, setDeletingAttemptId,
    filteredByDomain, availableFilteredCount, displayQuestions, savedProgress, anySavedExam,
    setupExamFromMeta, fetchScoreHistory, createAttempt, submitAnswer, submitMatchingAnswer, submitOrderingAnswer, finishAttempt, handleSubmitExam, resumeExam,
    downloadAttemptCSV, downloadAttemptPDF, downloadAnalyticsCSV,
  }

  return <ExamContext.Provider value={value}>{children}</ExamContext.Provider>
}

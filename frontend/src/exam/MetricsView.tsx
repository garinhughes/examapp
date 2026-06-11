import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { useAuthFetch } from '@/auth/useAuthFetch'
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, RefreshCw, AlertTriangle, CheckCircle2, Lightbulb, FlaskConical } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface OverviewData {
  totalAttempts: number
  finishedAttempts: number
  startedAttempts: number
  abandonedAttempts: number
  avgScore: number
  overallPassRate: number
  labAttempts: number
  labStartedAttempts: number
  labPassRate: number
  active30dAttempts: number
  examCount: number
  labCount: number
  dailyTrend: {
    date: string
    attempts: number
    finished: number
    labAttempts: number
    examStarts?: number
    labStarts?: number
    examAbandons?: number
    pageViewsExams?: number
    pageViewsLabs?: number
    pageViewsPricing?: number
    newVisitors?: number
    signupCompletes?: number
    upgradeClicks?: number
    checkoutStarts?: number
    checkoutCompletes?: number
  }[]
  funnel30d?: {
    pageViewsExams: number
    pageViewsLabs: number
    pageViewsPricing: number
    newVisitors: number
    examStarts: number
    labStarts: number
    examAbandons: number
    examFinishes: number
    signupStarts: number
    signupCompletes: number
    logins: number
    upgradeClicks: number
    checkoutStarts: number
    checkoutCompletes: number
  }
  conversion30d?: {
    visitorToSignup: number
    signupStartToComplete: number
    pricingToCheckout: number
    checkoutStartToComplete: number
    examStartToFinish: number
  }
  topReferrers30d?: { host: string; count: number }[]
}

interface ExamSummary {
  examCode: string
  totalAttempts: number
  finishedAttempts: number
  finishRate: number
  avgScore: number
  passRate: number
  modeBreakdown: Record<string, number>
}

interface QuestionStat {
  questionId: string
  domain: string
  totalAnswered: number
  correctCount: number
  correctRate: number
  avgTimeMs: number | null
  avgTimeSecs: number | null
}

interface DomainStat {
  domain: string
  totalAnswered: number
  correctCount: number
  avgScore: number
}

interface LabStat {
  labId: string
  labType: string
  totalAttempts: number
  passCount: number
  passRate: number
  avgTimeSecs: number
}

interface Suggestion {
  type: 'question_too_hard' | 'question_too_easy' | 'domain_weak' | 'lab_low_pass'
  examCode?: string
  questionId?: string
  domain?: string
  labId?: string
  labType?: string
  correctRate?: number
  avgScore?: number
  passRate?: number
  sampleSize: number
  message: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS = ['Overview', 'Exam Activity', 'Lab Activity', 'Questions', 'Labs', 'Usage & Modes', 'Suggestions'] as const
type Tab = typeof TABS[number]

const RANGES = ['7d', '30d', '90d', '6m', '12m'] as const
type RangeKey = typeof RANGES[number]

const USER_TYPE_COLORS: Record<string, string> = {
  visitor: '#64748b',
  registered: '#6366f1',
  pro: '#22c55e',
  pro_plus: '#a855f7',
}

const STATUS_COLORS: Record<string, string> = {
  'in-progress': '#f59e0b',
  finished: '#22c55e',
  abandoned: '#ef4444',
  in_progress: '#f59e0b',
  completed: '#22c55e',
}

interface ExamActivityRow {
  attemptId: string
  examCode: string
  startedAt: string
  finishedAt: string | null
  status: string
  score: number | null
  mode: string
  country: string | null
  userType: string
  userId: string
  userLabel: string | null
  questionsAnswered: number | null
  durationSecs: number | null
}

interface LabActivityRow {
  attemptId: string
  labId: string
  labType: string
  startedAt: string | null
  endedAt: string | null
  status: string
  correct: boolean | null
  timed: boolean
  timeTakenSecs: number | null
  country: string | null
  userType: string
  userId: string
  userLabel: string | null
}

interface ActivityResponse<T> {
  from: string
  to: string
  total: number
  rows: T[]
  truncated: boolean
}

const MODE_COLORS: Record<string, string> = {
  timed: '#6366f1',
  casual: '#22c55e',
  'weakest-link': '#f59e0b',
}
const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6']

function correctRateColor(rate: number): string {
  if (rate < 40) return 'text-red-500'
  if (rate < 60) return 'text-amber-500'
  if (rate < 80) return 'text-blue-500'
  return 'text-green-500'
}

function correctRateLabel(rate: number): string {
  if (rate < 40) return 'Too Hard'
  if (rate < 60) return 'Challenging'
  if (rate < 80) return 'Healthy'
  return 'Too Easy'
}

function correctRateBadge(rate: number) {
  const color = rate < 40 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    : rate < 60 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    : rate < 80 ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {rate}% - {correctRateLabel(rate)}
    </span>
  )
}

function formatSecs(secs: number | null): string {
  if (secs === null) return '-'
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">{label}</div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewTab({ overview, exams }: { overview: OverviewData; exams: ExamSummary[] }) {
  const [sortKey, setSortKey] = useState<'totalAttempts' | 'passRate' | 'avgScore'>('totalAttempts')
  const [sortAsc, setSortAsc] = useState(false)

  const sorted = [...exams].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey]
    return sortAsc ? diff : -diff
  })

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortAsc((v) => !v)
    else { setSortKey(key); setSortAsc(false) }
  }

  const SortIcon = ({ k }: { k: typeof sortKey }) =>
    sortKey === k ? (sortAsc ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />) : null

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Attempts" value={overview.totalAttempts.toLocaleString()} />
        <KpiCard label="Finished" value={overview.finishedAttempts.toLocaleString()} sub={overview.totalAttempts > 0 ? `${Math.round(overview.finishedAttempts / overview.totalAttempts * 100)}% finish rate` : undefined} />
        <KpiCard label="Avg Score" value={`${overview.avgScore}%`} />
        <KpiCard label="Pass Rate" value={`${overview.overallPassRate}%`} />
        <KpiCard label="Lab Attempts" value={overview.labAttempts.toLocaleString()} sub={`${overview.labPassRate}% pass rate`} />
        <KpiCard label="30-day Attempts" value={overview.active30dAttempts.toLocaleString()} />
      </div>

      {/* Daily trend chart */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold mb-3 text-foreground">Daily Activity - Last 30 Days</h3>
        <ResponsiveContainer width="100%" height={200} minWidth={0}>
          <AreaChart data={overview.dailyTrend} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradAttempts" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradFinished" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={(v) => v.slice(5)} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
            <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px' }} />
            <Area type="monotone" dataKey="attempts" stroke="#6366f1" fill="url(#gradAttempts)" strokeWidth={2} name="Started" />
            <Area type="monotone" dataKey="finished" stroke="#22c55e" fill="url(#gradFinished)" strokeWidth={2} name="Finished" />
            <Area type="monotone" dataKey="labAttempts" stroke="#f59e0b" fill="none" strokeWidth={1.5} strokeDasharray="4 2" name="Lab Attempts" />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Acquisition funnel — last 30 days */}
      {overview.funnel30d && overview.conversion30d && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold mb-3 text-foreground">Acquisition Funnel — Last 30 Days</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard label="Exam Page Views" value={overview.funnel30d.pageViewsExams.toLocaleString()} sub={`${overview.funnel30d.newVisitors.toLocaleString()} new visitors`} />
            <KpiCard label="Lab Page Views" value={overview.funnel30d.pageViewsLabs.toLocaleString()} />
            <KpiCard label="Exam Starts" value={overview.funnel30d.examStarts.toLocaleString()} sub={`${overview.conversion30d.examStartToFinish}% → finish`} />
            <KpiCard label="Lab Starts" value={overview.funnel30d.labStarts.toLocaleString()} />
            <KpiCard label="Exam Abandons" value={overview.funnel30d.examAbandons.toLocaleString()} />
            <KpiCard label="Logins" value={overview.funnel30d.logins.toLocaleString()} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-3">
            <KpiCard label="Pricing Views" value={overview.funnel30d.pageViewsPricing.toLocaleString()} sub={`${overview.conversion30d.pricingToCheckout}% → checkout`} />
            <KpiCard label="Upgrade Clicks" value={overview.funnel30d.upgradeClicks.toLocaleString()} />
            <KpiCard label="Signup Starts" value={overview.funnel30d.signupStarts.toLocaleString()} sub={`${overview.conversion30d.signupStartToComplete}% complete`} />
            <KpiCard label="Signups" value={overview.funnel30d.signupCompletes.toLocaleString()} sub={`${overview.conversion30d.visitorToSignup}% of visitors`} />
            <KpiCard label="Checkout Starts" value={overview.funnel30d.checkoutStarts.toLocaleString()} sub={`${overview.conversion30d.checkoutStartToComplete}% complete`} />
            <KpiCard label="Checkout Completes" value={overview.funnel30d.checkoutCompletes.toLocaleString()} />
          </div>
        </div>
      )}

      {/* Top referrers — last 30 days */}
      {overview.topReferrers30d && overview.topReferrers30d.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold mb-3 text-foreground">Top Referrers — Last 30 Days (first-visit only)</h3>
          <div className="flex flex-wrap gap-2">
            {overview.topReferrers30d.map((r) => (
              <span key={r.host} className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                <span className="font-medium text-foreground">{r.host}</span> · {r.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Exam summary table */}
      <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Exam Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground text-xs">
                <th className="text-left px-4 py-2">Exam</th>
                <th className="text-right px-4 py-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort('totalAttempts')}>Attempts <SortIcon k="totalAttempts" /></th>
                <th className="text-right px-4 py-2">Finish Rate</th>
                <th className="text-right px-4 py-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort('avgScore')}>Avg Score <SortIcon k="avgScore" /></th>
                <th className="text-right px-4 py-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort('passRate')}>Pass Rate <SortIcon k="passRate" /></th>
                <th className="text-right px-4 py-2">Mode Split</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((exam) => {
                const total = Object.values(exam.modeBreakdown).reduce((s, n) => s + n, 0)
                return (
                  <tr key={exam.examCode} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2 font-mono font-medium text-foreground">{exam.examCode}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{exam.totalAttempts.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{exam.finishRate}%</td>
                    <td className={`px-4 py-2 text-right font-semibold ${correctRateColor(exam.avgScore)}`}>{exam.avgScore}%</td>
                    <td className={`px-4 py-2 text-right font-semibold ${exam.passRate >= 60 ? 'text-green-500' : exam.passRate >= 40 ? 'text-amber-500' : 'text-red-500'}`}>{exam.passRate}%</td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {Object.entries(exam.modeBreakdown).map(([mode, count]) => (
                          <span key={mode} className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: MODE_COLORS[mode] ? MODE_COLORS[mode] + '22' : '#88888822', color: MODE_COLORS[mode] ?? '#888' }}>
                            {mode}: {total > 0 ? Math.round(count / total * 100) : 0}%
                          </span>
                        ))}
                        {Object.keys(exam.modeBreakdown).length === 0 && <span className="text-xs text-muted-foreground">-</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">No exam data yet - data accumulates as users complete attempts.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Questions tab ──────────────────────────────────────────────────────────────

function QuestionsTab({ exams }: { exams: ExamSummary[] }) {
  const authFetch = useAuthFetch()
  const [selectedExam, setSelectedExam] = useState(exams[0]?.examCode ?? '')
  const [questions, setQuestions] = useState<QuestionStat[]>([])
  const [domains, setDomains] = useState<DomainStat[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedDomains, setSelectedDomains] = useState<string[]>([])
  const [minSample, setMinSample] = useState(5)
  const [sortKey, setSortKey] = useState<'correctRate' | 'avgTimeSecs' | 'totalAnswered'>('correctRate')
  const [sortAsc, setSortAsc] = useState(true)

  const load = useCallback(async (code: string) => {
    if (!code) return
    setLoading(true)
    try {
      const [qRes, dRes] = await Promise.all([
        authFetch(`/admin/metrics/exams/${code}/questions`),
        authFetch(`/admin/metrics/exams/${code}/domains`),
      ])
      const [qData, dData] = await Promise.all([qRes.json(), dRes.json()])
      setQuestions(Array.isArray(qData) ? qData : [])
      setDomains(Array.isArray(dData) ? dData : [])
      setSelectedDomains([])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => { if (selectedExam) load(selectedExam) }, [selectedExam, load])

  const allDomains = [...new Set(questions.map((q) => q.domain))].sort()

  const filtered = questions
    .filter((q) => q.totalAnswered >= minSample)
    .filter((q) => selectedDomains.length === 0 || selectedDomains.includes(q.domain))
    .sort((a, b) => {
      const av = a[sortKey] ?? 0
      const bv = b[sortKey] ?? 0
      return sortAsc ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) setSortAsc((v) => !v)
    else { setSortKey(key); setSortAsc(key === 'correctRate') }
  }

  const SortIcon = ({ k }: { k: typeof sortKey }) =>
    sortKey === k ? (sortAsc ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />) : null

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground font-medium">Exam</label>
          <select
            className="text-sm rounded border border-border bg-card px-2 py-1 text-foreground"
            value={selectedExam}
            onChange={(e) => setSelectedExam(e.target.value)}
          >
            {exams.map((e) => <option key={e.examCode} value={e.examCode}>{e.examCode}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground font-medium">Min Answers</label>
          <input
            type="number" min={1} max={100}
            className="text-sm rounded border border-border bg-card px-2 py-1 w-16 text-foreground"
            value={minSample}
            onChange={(e) => setMinSample(Math.max(1, Number(e.target.value)))}
          />
        </div>
        <button
          className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => load(selectedExam)}
        >
          <RefreshCw className="w-3 h-3 inline mr-1" />Refresh
        </button>
      </div>

      {/* Domain filter pills */}
      {allDomains.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allDomains.map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDomains((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${selectedDomains.includes(d) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}
            >
              {d}
            </button>
          ))}
          {selectedDomains.length > 0 && (
            <button onClick={() => setSelectedDomains([])} className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground transition-colors">
              Clear
            </button>
          )}
        </div>
      )}

      {/* Domain score bars */}
      {domains.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold mb-3 text-foreground">Domain Avg Scores</h3>
          <ResponsiveContainer width="100%" height={Math.max(120, domains.length * 36)} minWidth={0}>
            <BarChart data={domains} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="domain" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} width={160} />
              <Tooltip
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px' }}
                formatter={(v: any) => [`${v}%`, 'Avg Score']}
              />
              <Bar dataKey="avgScore" radius={[0, 3, 3, 0]}>
                {domains.map((d) => (
                  <Cell key={d.domain} fill={d.avgScore < 45 ? '#ef4444' : d.avgScore < 65 ? '#f59e0b' : '#22c55e'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Questions table */}
      <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            Questions {loading ? <span className="text-muted-foreground font-normal text-xs">(loading…)</span> : <span className="text-muted-foreground font-normal text-xs">({filtered.length} shown)</span>}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground text-xs">
                <th className="text-left px-4 py-2">Question ID</th>
                <th className="text-left px-4 py-2">Domain</th>
                <th className="text-right px-4 py-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort('correctRate')}>% Correct <SortIcon k="correctRate" /></th>
                <th className="text-right px-4 py-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort('avgTimeSecs')}>Avg Time <SortIcon k="avgTimeSecs" /></th>
                <th className="text-right px-4 py-2 cursor-pointer hover:text-foreground" onClick={() => toggleSort('totalAnswered')}>Answers <SortIcon k="totalAnswered" /></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((q) => (
                <tr key={q.questionId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2 font-mono text-xs text-foreground">{q.questionId}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground max-w-[200px] truncate">{q.domain}</td>
                  <td className="px-4 py-2 text-right">{correctRateBadge(q.correctRate)}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground text-xs">{formatSecs(q.avgTimeSecs)}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground text-xs">{q.totalAnswered.toLocaleString()}</td>
                </tr>
              ))}
              {filtered.length === 0 && !loading && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">No question data yet - data accumulates as users finish attempts.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Labs tab ──────────────────────────────────────────────────────────────────

function LabsTab({ labs }: { labs: LabStat[] }) {
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const labTypes = [...new Set(labs.map((l) => l.labType))].sort()
  const filtered = typeFilter === 'all' ? labs : labs.filter((l) => l.labType === typeFilter)

  const chartData = filtered.slice(0, 20).map((l) => ({
    name: l.labId.length > 20 ? l.labId.slice(0, 18) + '…' : l.labId,
    fullName: l.labId,
    passRate: l.passRate,
    attempts: l.totalAttempts,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground font-medium">Lab Type</label>
        <select
          className="text-sm rounded border border-border bg-card px-2 py-1 text-foreground"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All Types</option>
          {labTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {chartData.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold mb-3 text-foreground">Pass Rate by Lab</h3>
          <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 32)} minWidth={0}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 50, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} width={140} />
              <Tooltip
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px' }}
                formatter={(v: any, _name: any, props: any) => [`${v}%`, `Pass Rate (${props.payload.attempts} attempts)`]}
                labelFormatter={(l) => chartData.find((d) => d.name === l)?.fullName ?? l}
              />
              <Bar dataKey="passRate" radius={[0, 3, 3, 0]}>
                {chartData.map((d) => (
                  <Cell key={d.fullName} fill={d.passRate < 50 ? '#ef4444' : d.passRate < 70 ? '#f59e0b' : '#22c55e'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Lab Stats</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground text-xs">
                <th className="text-left px-4 py-2">Lab ID</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-right px-4 py-2">Attempts</th>
                <th className="text-right px-4 py-2">Pass Rate</th>
                <th className="text-right px-4 py-2">Avg Time</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((lab) => (
                <tr key={lab.labId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2 font-mono text-xs text-foreground">{lab.labId}</td>
                  <td className="px-4 py-2 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{lab.labType}</span>
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground text-xs">{lab.totalAttempts.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`font-semibold text-xs ${lab.passRate >= 70 ? 'text-green-500' : lab.passRate >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                      {lab.passRate}%
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-muted-foreground text-xs">{formatSecs(lab.avgTimeSecs)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-sm">No lab data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Usage & Modes tab ─────────────────────────────────────────────────────────

function ModesTab({ exams }: { exams: ExamSummary[] }) {
  const [selectedExam, setSelectedExam] = useState<string>('all')

  const examsWithModes = exams.filter((e) => Object.keys(e.modeBreakdown).length > 0)

  function getPieData(exam: ExamSummary) {
    return Object.entries(exam.modeBreakdown).map(([mode, count]) => ({ name: mode, value: count }))
  }

  // Overall bar chart: attempts by exam
  const attemptsData = exams.map((e) => ({ name: e.examCode, attempts: e.totalAttempts, finished: e.finishedAttempts }))

  const displayExams = selectedExam === 'all' ? examsWithModes : examsWithModes.filter((e) => e.examCode === selectedExam)

  return (
    <div className="space-y-4">
      {/* Attempts by exam */}
      {attemptsData.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold mb-3 text-foreground">Total Attempts by Exam</h3>
          <ResponsiveContainer width="100%" height={200} minWidth={0}>
            <BarChart data={attemptsData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
              <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px' }} />
              <Bar dataKey="attempts" fill="#6366f1" name="Started" radius={[3, 3, 0, 0]} />
              <Bar dataKey="finished" fill="#22c55e" name="Finished" radius={[3, 3, 0, 0]} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Mode pie charts */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground font-medium">Exam</label>
        <select
          className="text-sm rounded border border-border bg-card px-2 py-1 text-foreground"
          value={selectedExam}
          onChange={(e) => setSelectedExam(e.target.value)}
        >
          <option value="all">All Exams</option>
          {examsWithModes.map((e) => <option key={e.examCode} value={e.examCode}>{e.examCode}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayExams.map((exam) => {
          const data = getPieData(exam)
          const total = data.reduce((s, d) => s + d.value, 0)
          return (
            <div key={exam.examCode} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <h3 className="text-sm font-semibold mb-2 text-foreground font-mono">{exam.examCode}</h3>
              <p className="text-xs text-muted-foreground mb-2">{total} total attempts</p>
              <ResponsiveContainer width="100%" height={160} minWidth={0}>
                <PieChart>
                  <Pie data={data} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={2}>
                    {data.map((entry, i) => (
                      <Cell key={entry.name} fill={MODE_COLORS[entry.name] ?? PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px' }}
                    formatter={(v: any, name: any) => [`${v} (${total > 0 ? Math.round(v / total * 100) : 0}%)`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )
        })}
        {displayExams.length === 0 && (
          <div className="col-span-3 py-8 text-center text-muted-foreground text-sm">No mode data yet.</div>
        )}
      </div>
    </div>
  )
}

// ── Suggestions tab ───────────────────────────────────────────────────────────

const SUGGESTION_CONFIG = {
  question_too_hard: {
    icon: TrendingDown,
    iconClass: 'text-red-500',
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    label: 'Too Hard',
  },
  question_too_easy: {
    icon: TrendingUp,
    iconClass: 'text-green-500',
    badgeClass: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    label: 'Too Easy',
  },
  domain_weak: {
    icon: AlertTriangle,
    iconClass: 'text-amber-500',
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    label: 'Weak Domain',
  },
  lab_low_pass: {
    icon: FlaskConical,
    iconClass: 'text-purple-500',
    badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    label: 'Low Lab Pass',
  },
} as const

function SuggestionsTab() {
  const authFetch = useAuthFetch()
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [thresholds, setThresholds] = useState({ tooHard: 35, tooEasy: 85, domainWeak: 45, labLowPass: 50 })
  const [showThresholds, setShowThresholds] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        tooHard: String(thresholds.tooHard),
        tooEasy: String(thresholds.tooEasy),
        domainWeak: String(thresholds.domainWeak),
        labLowPass: String(thresholds.labLowPass),
      })
      const res = await authFetch(`/admin/metrics/suggestions?${params}`)
      const data = await res.json()
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [authFetch, thresholds])

  useEffect(() => { load() }, [load])

  const filtered = typeFilter === 'all' ? suggestions : suggestions.filter((s) => s.type === typeFilter)
  const counts = suggestions.reduce((acc, s) => { acc[s.type] = (acc[s.type] ?? 0) + 1; return acc }, {} as Record<string, number>)

  return (
    <div className="space-y-4">
      {/* Filter + threshold controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-1.5">
          {(['all', 'question_too_hard', 'question_too_easy', 'domain_weak', 'lab_low_pass'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${typeFilter === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'}`}
            >
              {t === 'all' ? `All (${suggestions.length})` : `${SUGGESTION_CONFIG[t]?.label} (${counts[t] ?? 0})`}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowThresholds((v) => !v)}
            className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Lightbulb className="w-3 h-3" />Thresholds {showThresholds ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <button onClick={load} className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className="w-3 h-3 inline mr-1" />Refresh
          </button>
        </div>
      </div>

      {showThresholds && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold mb-3 text-foreground">Threshold Settings</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { key: 'tooHard', label: 'Too Hard below %' },
              { key: 'tooEasy', label: 'Too Easy above %' },
              { key: 'domainWeak', label: 'Weak Domain below %' },
              { key: 'labLowPass', label: 'Low Lab Pass below %' },
            ].map(({ key, label }) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{label}</span>
                <input
                  type="number" min={0} max={100}
                  className="text-sm rounded border border-border bg-background px-2 py-1 text-foreground w-full"
                  value={thresholds[key as keyof typeof thresholds]}
                  onChange={(e) => setThresholds((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="py-8 text-center text-muted-foreground text-sm">Analysing metrics…</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-8 text-center shadow-sm">
          <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No suggestions - either no data yet or all metrics look healthy with the current thresholds.</p>
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((s, i) => {
          const config = SUGGESTION_CONFIG[s.type]
          const Icon = config.icon
          return (
            <div key={i} className="rounded-lg border border-border bg-card p-4 shadow-sm flex items-start gap-3">
              <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.iconClass}`} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${config.badgeClass}`}>{config.label}</span>
                  {s.examCode && <span className="text-xs font-mono text-muted-foreground">{s.examCode}</span>}
                  {s.questionId && <span className="text-xs font-mono text-foreground">{s.questionId}</span>}
                  {s.domain && !s.questionId && <span className="text-xs text-muted-foreground">"{s.domain}"</span>}
                  {s.labId && <span className="text-xs font-mono text-foreground">{s.labId}</span>}
                  <span className="text-xs text-muted-foreground ml-auto">{s.sampleSize} answers</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.message}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Root component ────────────────────────────────────────────────────────────

export function MetricsView() {
  const authFetch = useAuthFetch()
  const [activeTab, setActiveTab] = useState<Tab>('Overview')
  const [range, setRange] = useState<RangeKey>('30d')
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [exams, setExams] = useState<ExamSummary[]>([])
  const [labs, setLabs] = useState<LabStat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [ovRes, exRes, labRes] = await Promise.all([
          authFetch(`/admin/metrics/overview?range=${range}`),
          authFetch('/admin/metrics/exams'),
          authFetch('/admin/metrics/labs'),
        ])
        const [ovData, exData, labData] = await Promise.all([ovRes.json(), exRes.json(), labRes.json()])
        setOverview(ovData)
        setExams(Array.isArray(exData) ? exData : [])
        setLabs(Array.isArray(labData) ? labData : [])
      } catch (err) {
        setError(String(err))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [authFetch, range])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground text-sm animate-pulse">Loading metrics…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/10 p-4 text-red-600 dark:text-red-400 text-sm">
        Failed to load metrics: {error}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Tab bar + range selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-0.5 rounded-lg bg-muted/40 p-1 w-fit">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {/* Tab content */}
      {activeTab === 'Overview' && overview && (
        <OverviewTab overview={overview} exams={exams} />
      )}
      {activeTab === 'Exam Activity' && (
        <ExamActivityTab range={range} exams={exams} />
      )}
      {activeTab === 'Lab Activity' && (
        <LabActivityTab range={range} labs={labs} />
      )}
      {activeTab === 'Questions' && (
        <QuestionsTab exams={exams} />
      )}
      {activeTab === 'Labs' && (
        <LabsTab labs={labs} />
      )}
      {activeTab === 'Usage & Modes' && (
        <ModesTab exams={exams} />
      )}
      {activeTab === 'Suggestions' && (
        <SuggestionsTab />
      )}
    </div>
  )
}

// ── Range selector ────────────────────────────────────────────────────────────

function RangeSelector({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) {
  return (
    <div className="flex gap-0.5 rounded-lg bg-muted/40 p-1">
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
            value === r ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

// ── Activity tabs ─────────────────────────────────────────────────────────────

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—'
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return iso
  const diff = Date.now() - then
  const m = 60 * 1000, h = 60 * m, d = 24 * h
  if (diff < m) return 'just now'
  if (diff < h) return `${Math.floor(diff / m)}m ago`
  if (diff < d) return `${Math.floor(diff / h)}h ago`
  if (diff < 30 * d) return `${Math.floor(diff / d)}d ago`
  return new Date(then).toISOString().slice(0, 10)
}

function formatDuration(secs: number | null): string {
  if (secs === null || secs === undefined) return '—'
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
}

function downloadCsv(filename: string, headers: string[], rows: any[][]) {
  const escape = (v: any) => {
    const s = v === null || v === undefined ? '' : String(v)
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function UserTypePill({ type, label, userId }: { type: string; label?: string | null; userId?: string }) {
  const colour = USER_TYPE_COLORS[type] ?? '#888'
  const title = label ?? (type === 'visitor' ? 'Anonymous visitor' : (userId ?? ''))
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full cursor-help"
      style={{ background: colour + '22', color: colour }}
      title={title}
    >
      {type}
    </span>
  )
}

function StatusPill({ status }: { status: string }) {
  const colour = STATUS_COLORS[status] ?? '#888'
  return (
    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: colour + '22', color: colour }}>
      {status}
    </span>
  )
}

function ExamActivityTab({ range, exams }: { range: RangeKey; exams: ExamSummary[] }) {
  const authFetch = useAuthFetch()
  const [data, setData] = useState<ActivityResponse<ExamActivityRow> | null>(null)
  const [loading, setLoading] = useState(false)
  const [filterExam, setFilterExam] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterUserType, setFilterUserType] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ range, limit: '1000' })
        if (filterExam) params.set('exam', filterExam)
        if (filterStatus) params.set('status', filterStatus)
        if (filterUserType) params.set('userType', filterUserType)
        const r = await authFetch(`/admin/metrics/exam-activity?${params}`)
        const d = (await r.json()) as ActivityResponse<ExamActivityRow>
        if (!cancelled) setData(d)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [authFetch, range, filterExam, filterStatus, filterUserType])

  const rows = data?.rows ?? []
  const breakdown = useMemoBreakdown(rows)

  function exportCsv() {
    downloadCsv(
      `exam-activity-${range}.csv`,
      ['startedAt', 'examCode', 'userType', 'mode', 'status', 'score', 'questionsAnswered', 'durationSecs', 'country', 'userId', 'attemptId'],
      rows.map((r) => [r.startedAt, r.examCode, r.userType, r.mode, r.status, r.score, r.questionsAnswered, r.durationSecs, r.country, r.userId, r.attemptId]),
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters + summary */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <Filter label="Exam" value={filterExam} onChange={setFilterExam} options={[{ value: '', label: 'All' }, ...exams.map((e) => ({ value: e.examCode, label: e.examCode }))]} />
        <Filter label="Status" value={filterStatus} onChange={setFilterStatus} options={[{ value: '', label: 'All' }, { value: 'in-progress', label: 'In progress' }, { value: 'finished', label: 'Finished' }, { value: 'abandoned', label: 'Abandoned' }]} />
        <Filter label="User Type" value={filterUserType} onChange={setFilterUserType} options={[{ value: '', label: 'All' }, { value: 'visitor', label: 'Visitor' }, { value: 'registered', label: 'Registered' }, { value: 'pro', label: 'Pro' }, { value: 'pro_plus', label: 'Pro+' }]} />
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{loading ? 'Loading…' : `${rows.length} of ${data?.total ?? 0} attempts`}</span>
          <button onClick={exportCsv} disabled={rows.length === 0} className="text-xs px-3 py-1.5 rounded-md border border-border bg-background hover:bg-muted disabled:opacity-50">Export CSV</button>
        </div>
      </div>

      {/* Quick breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Started" value={rows.length.toLocaleString()} />
        <KpiCard label="Finished" value={breakdown.finished.toLocaleString()} sub={rows.length > 0 ? `${Math.round(breakdown.finished / rows.length * 100)}%` : undefined} />
        <KpiCard label="Abandoned" value={breakdown.abandoned.toLocaleString()} sub={rows.length > 0 ? `${Math.round(breakdown.abandoned / rows.length * 100)}%` : undefined} />
        <KpiCard label="Visitors" value={breakdown.visitors.toLocaleString()} sub={rows.length > 0 ? `${Math.round(breakdown.visitors / rows.length * 100)}%` : undefined} />
      </div>

      {/* Rows */}
      <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground text-xs">
                <th className="text-left px-4 py-2">When</th>
                <th className="text-left px-4 py-2">Exam</th>
                <th className="text-left px-4 py-2">Who</th>
                <th className="text-left px-4 py-2">Mode</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Score</th>
                <th className="text-right px-4 py-2">Reached</th>
                <th className="text-right px-4 py-2">Duration</th>
                <th className="text-left px-4 py-2">Country</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.attemptId} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap" title={r.startedAt}>{formatRelative(r.startedAt)}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.examCode}</td>
                  <td className="px-4 py-2"><UserTypePill type={r.userType} label={r.userLabel} userId={r.userId} /></td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{r.mode}</td>
                  <td className="px-4 py-2"><StatusPill status={r.status} /></td>
                  <td className={`px-4 py-2 text-right font-semibold ${typeof r.score === 'number' ? correctRateColor(r.score) : 'text-muted-foreground'}`}>{typeof r.score === 'number' ? `${r.score}%` : '—'}</td>
                  <td className="px-4 py-2 text-right text-xs text-muted-foreground">{r.questionsAnswered ?? '—'}</td>
                  <td className="px-4 py-2 text-right text-xs text-muted-foreground">{formatDuration(r.durationSecs)}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{r.country ?? '—'}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-sm">No attempts in this window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {data?.truncated && (
        <div className="text-xs text-muted-foreground text-center">Showing first {rows.length} attempts. Narrow the filters or shorten the range to see more.</div>
      )}
    </div>
  )
}

function useMemoBreakdown(rows: { status: string; userType: string }[]) {
  return {
    finished: rows.filter((r) => r.status === 'finished').length,
    abandoned: rows.filter((r) => r.status === 'abandoned').length,
    visitors: rows.filter((r) => r.userType === 'visitor').length,
  }
}

function LabActivityTab({ range, labs }: { range: RangeKey; labs: LabStat[] }) {
  const authFetch = useAuthFetch()
  const [data, setData] = useState<ActivityResponse<LabActivityRow> | null>(null)
  const [loading, setLoading] = useState(false)
  const [filterLab, setFilterLab] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterUserType, setFilterUserType] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ range, limit: '1000' })
        if (filterLab) params.set('lab', filterLab)
        if (filterStatus) params.set('status', filterStatus)
        if (filterUserType) params.set('userType', filterUserType)
        const r = await authFetch(`/admin/metrics/lab-activity?${params}`)
        const d = (await r.json()) as ActivityResponse<LabActivityRow>
        if (!cancelled) setData(d)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [authFetch, range, filterLab, filterStatus, filterUserType])

  const rows = data?.rows ?? []
  const completed = rows.filter((r) => r.status === 'completed').length
  const passed = rows.filter((r) => r.correct === true).length
  const visitors = rows.filter((r) => r.userType === 'visitor').length

  function exportCsv() {
    downloadCsv(
      `lab-activity-${range}.csv`,
      ['startedAt', 'labId', 'labType', 'userType', 'status', 'correct', 'timeTakenSecs', 'country', 'userId', 'attemptId'],
      rows.map((r) => [r.startedAt, r.labId, r.labType, r.userType, r.status, r.correct, r.timeTakenSecs, r.country, r.userId, r.attemptId]),
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <Filter label="Lab" value={filterLab} onChange={setFilterLab} options={[{ value: '', label: 'All' }, ...labs.map((l) => ({ value: l.labId, label: l.labId }))]} />
        <Filter label="Status" value={filterStatus} onChange={setFilterStatus} options={[{ value: '', label: 'All' }, { value: 'in_progress', label: 'In progress' }, { value: 'completed', label: 'Completed' }, { value: 'abandoned', label: 'Abandoned' }]} />
        <Filter label="User Type" value={filterUserType} onChange={setFilterUserType} options={[{ value: '', label: 'All' }, { value: 'registered', label: 'Registered' }, { value: 'pro', label: 'Pro' }, { value: 'pro_plus', label: 'Pro+' }]} />
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{loading ? 'Loading…' : `${rows.length} of ${data?.total ?? 0} attempts`}</span>
          <button onClick={exportCsv} disabled={rows.length === 0} className="text-xs px-3 py-1.5 rounded-md border border-border bg-background hover:bg-muted disabled:opacity-50">Export CSV</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Total Started" value={rows.length.toLocaleString()} />
        <KpiCard label="Completed" value={completed.toLocaleString()} sub={rows.length > 0 ? `${Math.round(completed / rows.length * 100)}%` : undefined} />
        <KpiCard label="Correct" value={passed.toLocaleString()} sub={completed > 0 ? `${Math.round(passed / completed * 100)}% of completed` : undefined} />
        <KpiCard label="Visitors" value={visitors.toLocaleString()} />
      </div>

      <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground text-xs">
                <th className="text-left px-4 py-2">When</th>
                <th className="text-left px-4 py-2">Lab</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-left px-4 py-2">Who</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Correct</th>
                <th className="text-right px-4 py-2">Time taken</th>
                <th className="text-left px-4 py-2">Country</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.attemptId} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap" title={r.startedAt ?? ''}>{formatRelative(r.startedAt)}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.labId}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{r.labType}</td>
                  <td className="px-4 py-2"><UserTypePill type={r.userType} label={r.userLabel} userId={r.userId} /></td>
                  <td className="px-4 py-2"><StatusPill status={r.status} /></td>
                  <td className="px-4 py-2 text-xs">{r.correct === true ? '✓' : r.correct === false ? '✗' : '—'}</td>
                  <td className="px-4 py-2 text-right text-xs text-muted-foreground">{formatDuration(r.timeTakenSecs)}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{r.country ?? '—'}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">No lab attempts in this window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {data?.truncated && (
        <div className="text-xs text-muted-foreground text-center">Showing first {rows.length} attempts. Narrow the filters or shorten the range to see more.</div>
      )}
    </div>
  )
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm rounded-md border border-border bg-background px-2 py-1.5 min-w-[120px]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}

import { useExam } from './ExamContext'
import { ApiErrorMessage } from '@/components/ApiErrorMessage'
import { ProviderLogo } from '@/components/ProviderLogo'
import { Info, ChevronDown, ChevronRight, Search, BookOpen, SlidersHorizontal, ListOrdered, TrendingUp } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTourContext } from '@/components/TourProvider'
import { apiUrl } from '@/apiBase'

type AttemptSummary = {
  examCode: string
  lastScore: number | null
  bestScore: number | null
  lastAttemptAt: string | null
  attemptCount: number
}

function formatRelative(iso: string | null): string {
  if (!iso) return ''
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const diff = Date.now() - then
  const day = 24 * 60 * 60 * 1000
  if (diff < 60 * 60 * 1000) return 'just now'
  if (diff < day) return `${Math.round(diff / (60 * 60 * 1000))}h ago`
  if (diff < 30 * day) return `${Math.round(diff / day)}d ago`
  if (diff < 365 * day) return `${Math.round(diff / (30 * day))}mo ago`
  return `${Math.round(diff / (365 * day))}y ago`
}

export function PracticeExams() {
  const {
    providers, examStarted, anySavedExam, selected, savedProgress,
    setupExamFromMeta, examsFetchError,
    user, authLoading, authFetch,
  } = useExam()
  const tour = useTourContext()
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [summaries, setSummaries] = useState<Map<string, AttemptSummary>>(new Map())

  useEffect(() => {
    if (authLoading || !user) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await authFetch(apiUrl('/attempts?summary=1'))
        if (!r.ok) return
        const d = await r.json()
        if (cancelled) return
        const list = Array.isArray(d?.summaries) ? (d.summaries as AttemptSummary[]) : []
        setSummaries(new Map(list.map((s) => [s.examCode, s])))
      } catch { /* non-critical — card just hides the footer */ }
    })()
    return () => { cancelled = true }
  }, [authLoading, user, authFetch])

  function toggleProvider(name: string) {
    setCollapsedProviders(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function allCollapsed() {
    return providers.length > 0 && providers.every(p => collapsedProviders.has(p.provider))
  }

  // useEffect(() => {
  //   if (!authLoading && !user && !tour.active && !tour.completed && providers.length > 0) {
  //     tour.start()
  //   }
  // }, [authLoading, user, providers.length])

  if (examsFetchError) return <ApiErrorMessage context="practice exams" />

  return (
    <div className="mb-6">
      <div className="space-y-6">
        <div className="flex items-start gap-0 mb-2 -mx-1">
          {[
            { icon: BookOpen,          label: 'Pick an exam',   desc: 'Choose a certification below' },
            { icon: SlidersHorizontal, label: 'Configure',      desc: 'Set mode, domains & length'   },
            { icon: ListOrdered,       label: 'Practice',       desc: 'Answer at your own pace'      },
            { icon: TrendingUp,        label: 'Track progress', desc: 'Review scores in Analytics'   },
          ].map(({ icon: Icon, label, desc }, i, arr) => (
            <div key={label} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center flex-1 min-w-0 px-1">
                <Icon className="w-6 h-6 text-primary flex-shrink-0" />
                <span className="mt-1.5 text-sm font-semibold text-foreground text-center leading-tight">{label}</span>
                <span className="text-xs text-muted-foreground text-center leading-tight mt-0.5 hidden sm:block">{desc}</span>
              </div>
              {i < arr.length - 1 && (
                <div className="flex-shrink-0 flex flex-col items-center">
                  <ChevronRight className="w-3.5 h-3.5 text-primary" />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="relative mb-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search by title or code…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex items-center justify-end -mt-1 mb-1">
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => {
              if (allCollapsed()) setCollapsedProviders(new Set())
              else setCollapsedProviders(new Set(providers.map(p => p.provider)))
            }}
          >
            {allCollapsed() ? 'Expand all' : 'Collapse all'}
          </button>
        </div>
        {providers.map((p, pIndex) => {
          const q = searchQuery.toLowerCase()
          const filteredExams = q
            ? p.exams.filter((ex: any) => (ex.title ?? '').toLowerCase().includes(q) || ex.code.toLowerCase().includes(q))
            : p.exams
          if (filteredExams.length === 0) return null
          const collapsed = !q && collapsedProviders.has(p.provider)
          return (
          <div key={p.provider}>
            <button
              className="flex items-center gap-1 font-semibold mb-2 hover:text-primary transition-colors w-full text-left"
              onClick={() => toggleProvider(p.provider)}
              aria-expanded={!collapsed}
            >
              {collapsed ? <ChevronRight className="w-4 h-4 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 flex-shrink-0" />}
              {p.provider}
            </button>
            {!collapsed && <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {filteredExams.map((ex: any, exIndex) => {
                const cardDisabled = !!(examStarted || anySavedExam || (selected && savedProgress))
                const handleCardActivate = () => { if (cardDisabled) return; setupExamFromMeta(ex) }
                const summary = summaries.get(ex.code)
                return (
                <div
                  key={ex.code}
                  ref={pIndex === 0 && exIndex === 0 ? (el) => tour.registerTarget('setup-exam-btn', el) : undefined}
                  role="button"
                  tabIndex={cardDisabled ? -1 : 0}
                  aria-disabled={cardDisabled}
                  data-testid="exam-card"
                  data-exam-code={ex.code}
                  title={cardDisabled ? 'Complete or cancel your current exam first' : `Setup ${ex.title ?? ex.code}`}
                  onClick={handleCardActivate}
                  onKeyDown={(e) => { if (!cardDisabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleCardActivate() } }}
                  className={`rounded-lg border border-border bg-card text-card-foreground shadow-sm overflow-hidden flex flex-col transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${cardDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-primary hover:bg-primary/5'}`}
                >
                  <ProviderLogo provider={ex.provider} size="md" />
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="font-medium leading-tight">{ex.title ?? ex.code}</div>
                    <div className="text-xs text-muted-foreground mt-1">{ex.code}</div>
                    {typeof ex.questionCount === 'number' && ex.questionCount > 0 && (
                      <div className="mt-auto pt-3">
                        <span className="bg-primary text-primary-foreground text-xs font-semibold px-2 py-0.5 rounded-full shadow-sm">
                          {ex.questionCount} questions
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )})}
            </div>}
          </div>
          )
        })}
      </div>

      <div role="note" className="mt-6 p-3 rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground flex items-start gap-3">
        <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-primary" aria-hidden />
        <div className="leading-snug">These products are not affiliated with or endorsed by any certification provider. All questions are original and created for practice purposes only.</div>
      </div>
    </div>
  )
}

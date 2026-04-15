import { useExam } from './ExamContext'
import { Play, Info, Activity, ChevronDown, ChevronRight, X, Search } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useTourContext } from '@/components/TourProvider'

export function PracticeExams() {
  const {
    providers, examStarted, anySavedExam, selected, savedProgress,
    setupExamFromMeta, resumeExam, setSelected, setRoute,
    user, authLoading, setShowCancelConfirm, showToast,
  } = useExam()
  const tour = useTourContext()
  const [collapsedProviders, setCollapsedProviders] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

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

  useEffect(() => {
    if (!authLoading && !user && !tour.active && !tour.completed && providers.length > 0) {
      tour.start()
    }
  }, [authLoading, user, providers.length])

  return (
    <div className="mb-6">
      {/* Resume banner */}
      {anySavedExam && !examStarted && (
        <div className="mb-4 p-4 rounded-lg bg-card border border-border shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-md flex items-center justify-center bg-primary/10 text-primary text-lg flex-shrink-0">
              <Play className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-foreground">Exam in progress</div>
              <div className="text-sm text-muted-foreground">{anySavedExam.title} - {anySavedExam.answeredCount}/{anySavedExam.total} answered</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="px-3 py-1 rounded-md bg-primary text-white text-sm inline-flex items-center gap-2 shadow-sm hover:opacity-95 transition" onClick={() => resumeExam(anySavedExam.code)}>
              <Play className="w-4 h-4" /> Resume
            </button>
            <button className="px-3 py-1 rounded-md bg-muted text-muted-foreground border border-border text-sm inline-flex items-center gap-1.5 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition" onClick={() => setShowCancelConfirm(true)}>
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-6">
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
              {filteredExams.map((ex: any, exIndex) => (
                <div key={ex.code} className="p-4 rounded-lg border border-border bg-card text-card-foreground shadow-sm relative flex flex-col">
                  <div className="flex-1">
                    <div className="font-medium">{ex.title ?? ex.code}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{ex.code}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      ref={pIndex === 0 && exIndex === 0 ? (el) => tour.registerTarget('setup-exam-btn', el) : undefined}
                      className={`h-7 px-2 rounded font-medium text-sm inline-flex items-center gap-2 transition-colors ${examStarted || anySavedExam || (selected && savedProgress) ? 'bg-muted/60 text-muted-foreground/60 border border-border cursor-not-allowed' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
                      disabled={!!(examStarted || anySavedExam || (selected && savedProgress))}
                      title={examStarted || anySavedExam || (selected && savedProgress) ? 'Complete or cancel your current exam first' : 'Setup this exam'}
                      onClick={() => { if (examStarted || anySavedExam || (selected && savedProgress)) return; setupExamFromMeta(ex) }}
                    >
                      Setup Exam
                    </button>
                    <button
                      ref={pIndex === 0 && exIndex === 0 ? (el) => tour.registerTarget('analytics-btn', el) : undefined}
                      onClick={(e) => { e.stopPropagation(); setSelected(ex.code); setRoute('analytics') }}
                      title={`View analytics for ${ex.title ?? ex.code}`}
                      className="h-7 w-7 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 text-sm inline-flex items-center justify-center"
                      aria-label={`Analytics for ${ex.title ?? ex.code}`}
                    >
                      <Activity className="w-4 h-4" aria-hidden />
                      <span className="sr-only">Analytics</span>
                    </button>
                  </div>
                  {ex.logo && (
                    ex.logoHref ? (
                      <a href={ex.logoHref} title="Amazon.com Inc., Apache License 2.0 <http://www.apache.org/licenses/LICENSE-2.0>, via Wikimedia Commons" target="_blank" rel="noopener noreferrer" className="absolute bottom-2 right-2 inline-flex items-center justify-center bg-background rounded-full p-1 shadow-sm" aria-label={`${ex.provider ?? 'Provider'} logo link`}>
                        <img src={ex.logo} alt={`${ex.provider ?? 'Provider'} logo`} className="h-6 w-auto" style={{ objectFit: 'contain' }} />
                      </a>
                    ) : (
                      <div className="absolute bottom-2 right-2 inline-flex items-center justify-center bg-background rounded-full p-1 shadow-sm" aria-hidden>
                        <img src={ex.logo} alt={`${ex.provider ?? 'Provider'} logo`} className="h-6 w-auto" style={{ objectFit: 'contain' }} />
                      </div>
                    )
                  )}
                </div>
              ))}
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

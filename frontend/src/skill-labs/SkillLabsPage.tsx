import { useState, useEffect, useMemo, useCallback } from 'react'
import Loader from '@/components/Loader'
import { useExam } from '@/exam/ExamContext'
import { Clock, Timer, Coffee, ChevronLeft, ChevronRight, RotateCcw, CheckCircle2, Heart, Bookmark, Search, ArrowRight, X, Lock, ExternalLink, Play } from 'lucide-react'
import { clarityEvent, clarityTag } from '@/clarity'
import type { LabSummary, SkillLevel } from './types'
import { apiUrl } from '@/apiBase'
import { SearchableFilter } from './SearchableFilter'
import { getBookmarkedLabs, toggleBookmark, getInProgressLabs, clearLabProgress } from './labs/shared'

const DIFFICULTY_LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'advanced']

const SL_SESSION_KEY = 'skill-labs-session'
function readLabsSession(): Record<string, unknown> {
  try {
    const raw = sessionStorage.getItem(SL_SESSION_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
const DIFFICULTY_COLORS: Record<SkillLevel, string> = {
  beginner: 'bg-green-500/15 text-green-700 dark:text-green-400',
  intermediate: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  advanced: 'bg-red-500/15 text-red-700 dark:text-red-400',
}
const LABS_PER_PAGE = 12 // 3 cols × 4 rows

export function SkillLabsPage() {
  const { setRoute, authFetch, user } = useExam()
  const [labs, setLabs] = useState<LabSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Timed/casual toggle (default to casual)
  const [timed, setTimed] = useState(() => {
    const ss = readLabsSession()
    return typeof ss.timed === 'boolean' ? ss.timed : false
  })

  // Search query for titles & descriptions
  const [searchQuery, setSearchQuery] = useState(() => {
    const ss = readLabsSession()
    return typeof ss.searchQuery === 'string' ? ss.searchQuery : ''
  })

  // Filters
  const [selectedDifficulty, setSelectedDifficulty] = useState<SkillLevel | null>(() => {
    const ss = readLabsSession()
    return DIFFICULTY_LEVELS.includes(ss.selectedDifficulty as SkillLevel) ? ss.selectedDifficulty as SkillLevel : null
  })
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(() => {
    const ss = readLabsSession()
    return Array.isArray(ss.selectedPlatforms) ? new Set(ss.selectedPlatforms as string[]) : new Set()
  })
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(() => {
    const ss = readLabsSession()
    return Array.isArray(ss.selectedCategories) ? new Set(ss.selectedCategories as string[]) : new Set()
  })
  const [selectedTechnologies, setSelectedTechnologies] = useState<Set<string>>(() => {
    const ss = readLabsSession()
    return Array.isArray(ss.selectedTechnologies) ? new Set(ss.selectedTechnologies as string[]) : new Set()
  })

  // Completion tracking
  const [completedLabIds, setCompletedLabIds] = useState<Set<string>>(new Set())
  const [completionFilter, setCompletionFilter] = useState<'all' | 'incomplete' | 'completed'>(() => {
    try {
      const v = localStorage.getItem('skill-labs-completion-filter')
      return (v === 'incomplete' || v === 'completed') ? v : 'all'
    } catch {
      return 'all'
    }
  })

  // In-progress labs (from localStorage, read once on mount)
  const [inProgressLabs, setInProgressLabs] = useState<Map<string, { timed: boolean | null }>>(() =>
    new Map(getInProgressLabs().map((e) => [e.labId, { timed: e.timed }]))
  )
  const [confirmCancelLabId, setConfirmCancelLabId] = useState<string | null>(null)

  useEffect(() => {
    if (!confirmCancelLabId) return
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') setConfirmCancelLabId(null) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [confirmCancelLabId])

  function cancelLabProgress(labId: string) {
    clearLabProgress(labId)
    setInProgressLabs((prev) => { const next = new Map(prev); next.delete(labId); return next })
    setConfirmCancelLabId(null)
  }

  // Bookmarks
  const [bookmarkedLabIds, setBookmarkedLabIds] = useState<Set<string>>(() => getBookmarkedLabs())
  const [showSavedOnly, setShowSavedOnly] = useState(() => {
    const ss = readLabsSession()
    return typeof ss.showSavedOnly === 'boolean' ? ss.showSavedOnly : false
  })

  const handleToggleBookmark = useCallback((labId: string) => {
    const updated = toggleBookmark(labId)
    setBookmarkedLabIds(updated)
    clarityEvent('lab_bookmarked')
    clarityTag('lab_id', labId)
  }, [])

  // Pagination
  const [page, setPage] = useState(() => {
    const ss = readLabsSession()
    return typeof ss.page === 'number' && ss.page > 0 ? ss.page : 1
  })

  useEffect(() => {
    let cancelled = false
    async function fetchLabs() {
      try {
        const res = await authFetch(apiUrl('/skill-labs'))
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json()
        if (!cancelled) setLabs(data)
      } catch {
        if (!cancelled) setError('Unable to load skill labs. Please try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchLabs()

    // Re-fetch on tab focus so locked state reflects any entitlement changes
    // (e.g. lab access expiring or a purchase completing in another tab).
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') fetchLabs()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  // Load completed lab IDs from localStorage + backend
  useEffect(() => {
    const stored: string[] = JSON.parse(localStorage.getItem('skill-labs-completed') || '[]')
    const ids = new Set<string>(stored)
    if (user) {
      authFetch(apiUrl('/skill-labs/my-attempts'))
        .then((res: Response) => res.json())
        .then((data: { completedLabIds: string[] }) => {
          for (const id of data.completedLabIds) ids.add(id)
          setCompletedLabIds(new Set(ids))
        })
        .catch(() => setCompletedLabIds(ids))
    } else {
      setCompletedLabIds(ids)
    }
  }, [user])

  // persist completion filter preference
  useEffect(() => {
    try {
      localStorage.setItem('skill-labs-completion-filter', completionFilter)
    } catch {}
  }, [completionFilter])

  // Persist filter/page state to sessionStorage so returning from a lab restores position
  useEffect(() => {
    try {
      sessionStorage.setItem(SL_SESSION_KEY, JSON.stringify({
        timed,
        searchQuery,
        selectedDifficulty,
        selectedPlatforms: [...selectedPlatforms],
        selectedCategories: [...selectedCategories],
        selectedTechnologies: [...selectedTechnologies],
        showSavedOnly,
        page,
      }))
    } catch {}
  }, [timed, searchQuery, selectedDifficulty, selectedPlatforms, selectedCategories, selectedTechnologies, showSavedOnly, page])

  // Derive unique filter options from lab data
  const filterOptions = useMemo(() => {
    const platforms = new Set<string>()
    const categories = new Set<string>()
    const techs = new Set<string>()
    for (const lab of labs) {
      if (lab.platform) platforms.add(lab.platform)
      if (lab.category) categories.add(lab.category)
      for (const t of lab.technologies || []) techs.add(t)
    }
    return {
      platforms: [...platforms].sort(),
      categories: [...categories].sort(),
      technologies: [...techs].sort(),
    }
  }, [labs])

  // Filtered labs — showcase labs always sorted first by showcaseOrder, then the rest
  const filtered = useMemo(() => {
    const result = labs.filter((lab) => {
      if (completionFilter === 'completed' && !completedLabIds.has(lab.id)) return false
      if (completionFilter === 'incomplete' && completedLabIds.has(lab.id)) return false

      // Search query: match title, description, or technologies
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const title = (lab.title || '').toLowerCase()
        const desc = (lab.description || '').toLowerCase()
        const techs = (lab.technologies || []).join(' ').toLowerCase()
        if (!title.includes(q) && !desc.includes(q) && !techs.includes(q)) return false
      }

      if (showSavedOnly && !bookmarkedLabIds.has(lab.id)) return false
      if (selectedDifficulty && lab.difficulty !== selectedDifficulty) return false
      if (selectedPlatforms.size > 0 && !selectedPlatforms.has(lab.platform)) return false
      if (selectedCategories.size > 0 && !selectedCategories.has(lab.category)) return false
      if (selectedTechnologies.size > 0) {
        const labTechs = lab.technologies || []
        if (!labTechs.some((t) => selectedTechnologies.has(t))) return false
      }
      return true
    })
    result.sort((a, b) => {
      const aS = a.showcase ? 1 : 0
      const bS = b.showcase ? 1 : 0
      if (aS !== bS) return bS - aS
      if (aS && bS) return (a.showcaseOrder ?? 99) - (b.showcaseOrder ?? 99)
      return 0
    })
    return result
  }, [labs, selectedDifficulty, selectedPlatforms, selectedCategories, selectedTechnologies, completionFilter, completedLabIds, showSavedOnly, bookmarkedLabIds, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filtered.length / LABS_PER_PAGE))
  const paginated = filtered.slice((page - 1) * LABS_PER_PAGE, page * LABS_PER_PAGE)

  const hasActiveFilters = Boolean(selectedDifficulty) || selectedPlatforms.size > 0 || selectedCategories.size > 0 || selectedTechnologies.size > 0 || searchQuery.trim().length > 0

  const clearFilters = () => {
    setSelectedDifficulty(null)
    setSelectedPlatforms(new Set())
    setSelectedCategories(new Set())
    setSelectedTechnologies(new Set())
    setPage(1)
  }
  // Clear filters and search
  const clearAllFilters = () => {
    clearFilters()
    setSearchQuery('')
    // setPage(1) already called in clearFilters
  }

  if (loading) return <Loader text="Loading skill labs…" />
  if (error) return <div className="text-destructive">{error}</div>

  return (
    <div className="space-y-5">
      {/* Controls bar: timed toggle + filters */}
      <div className="flex flex-col gap-3">
        {/* Top row: mode toggle + clear */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {/* Timed / Casual toggle + Search */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border">
                <button
                  onClick={() => setTimed(false)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                    !timed ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Coffee className="w-3.5 h-3.5" />
                  Casual
                </button>
                <button
                  onClick={() => setTimed(true)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                    timed ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Timer className="w-3.5 h-3.5" />
                  Timed
                </button>
              </div>

              <div className="relative flex-1 sm:flex-none">
                <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                  <Search className="w-4 h-4 text-muted-foreground" />
                </div>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
                  placeholder="Search labs..."
                  className="ml-1 pl-8 w-full sm:w-64 md:w-80 px-3 py-1.5 rounded-md border border-border bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              {filtered.length} lab{filtered.length !== 1 ? 's' : ''}
            </div>
          </div>

        {/* Filter row */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Difficulty: radio-style buttons */}
          <div className="flex items-center gap-1 p-0.5 rounded-md border border-border bg-card">
            {DIFFICULTY_LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => { setSelectedDifficulty(selectedDifficulty === level ? null : level); setPage(1) }}
                className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition ${
                  selectedDifficulty === level
                    ? DIFFICULTY_COLORS[level]
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {level}
              </button>
            ))}
          </div>

          <div className="w-px h-6 bg-border" />

          <SearchableFilter
            label="Platform"
            options={filterOptions.platforms}
            selected={selectedPlatforms}
            onChange={(v) => { setSelectedPlatforms(v); setPage(1) }}
          />
          <SearchableFilter
            label="Category"
            options={filterOptions.categories}
            selected={selectedCategories}
            onChange={(v) => { setSelectedCategories(v); setPage(1) }}
          />
          <SearchableFilter
            label="Technology"
            options={filterOptions.technologies}
            selected={selectedTechnologies}
            onChange={(v) => { setSelectedTechnologies(v); setPage(1) }}
          />

          <div className="w-px h-6 bg-border" />

          <div className="flex items-center gap-1 p-0.5 rounded-md border border-border bg-card">
            {(['all', 'incomplete', 'completed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setCompletionFilter(f); setPage(1) }}
                className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition ${
                  completionFilter === f
                    ? 'bg-muted text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <button
            onClick={() => { setShowSavedOnly(!showSavedOnly); setPage(1) }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition border ${
              showSavedOnly
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <Bookmark className="w-3 h-3" />
            Saved{bookmarkedLabIds.size > 0 ? ` (${bookmarkedLabIds.size})` : ''}
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition"
            >
              <RotateCcw className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Resume banner - shown when a visible lab has saved progress */}
      {(() => {
        const resumable = filtered.find((l) => inProgressLabs.has(l.id))
        if (!resumable) return null
        return (
          <div className="mb-4 p-4 rounded-lg bg-card border border-border shadow-sm flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-md flex items-center justify-center bg-primary/10 text-primary text-lg flex-shrink-0">
                <Play className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-foreground">Lab in progress</div>
                <div className="text-sm text-muted-foreground">{resumable.title}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                className="px-3 py-1 rounded-md bg-primary text-white text-sm inline-flex items-center gap-2 shadow-sm hover:opacity-95 transition"
                onClick={() => {
                  const savedTimed = inProgressLabs.get(resumable.id)?.timed
                  const mode = savedTimed !== null && savedTimed !== undefined ? (savedTimed ? 'timed' : 'casual') : (timed ? 'timed' : 'casual')
                  clarityEvent('lab_resumed')
                  clarityTag('lab_id', resumable.id)
                  clarityTag('lab_mode', mode)
                  setRoute(`skill-lab:${resumable.id}:${mode}` as any)
                }}
              >
                <Play className="w-4 h-4" /> Resume
              </button>
              <button
                className="px-3 py-1 rounded-md bg-muted text-muted-foreground border border-border text-sm inline-flex items-center gap-1.5 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition"
                onClick={() => setConfirmCancelLabId(resumable.id)}
                title="Cancel lab progress"
              >
                <X className="w-4 h-4" /> Cancel
              </button>
            </div>
          </div>
        )
      })()}

      {/* Lab cards grid: 3 across × 4 down */}
      {paginated.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          No labs match the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginated.map((lab) => (
            <div
              key={lab.id}
              className={`group relative p-5 rounded-lg border bg-card shadow-sm flex flex-col justify-between transition-all ${
                lab.locked
                  ? 'border-border opacity-70'
                  : 'border-border hover:border-primary/30 hover:shadow-md'
              }`}
            >
              <div>
                {/* Title row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-base leading-snug">{lab.title}</h3>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {lab.locked && (
                      <span title="Premium lab">
                        <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                      </span>
                    )}
                    {!lab.locked && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleBookmark(lab.id) }}
                        className="p-1 rounded hover:bg-muted/60 transition"
                        title={bookmarkedLabIds.has(lab.id) ? 'Remove bookmark' : 'Save for later'}
                      >
                        <Heart
                          className={`w-4 h-4 transition ${
                            bookmarkedLabIds.has(lab.id) ? 'fill-red-500 text-red-500' : 'text-muted-foreground'
                          }`}
                        />
                      </button>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{lab.description}</p>

                {/* Tags row */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${DIFFICULTY_COLORS[lab.difficulty]}`}>
                    {lab.difficulty}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    {lab.platform}
                  </span>
                </div>

                {/* Tech pills */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {(lab.technologies || []).map((tech) => (
                    <span key={tech} className="px-1.5 py-0.5 rounded bg-muted/70 text-xs text-muted-foreground">
                      {tech}
                    </span>
                  ))}
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {typeof lab.timeLimit === 'number' && lab.timeLimit > 0 ? `${Math.floor(lab.timeLimit / 60)} min` : '-'}
                    </span>
                  <span className="capitalize">{lab.category}</span>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {lab.locked && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Purchase required to access this lab.
                  </p>
                )}
                <div className="flex items-center gap-2">
                {(() => {
                  const anyInProgress = inProgressLabs.size > 0
                  const thisInProgress = inProgressLabs.has(lab.id)
                  const blockedByOther = anyInProgress && !thisInProgress && !lab.locked
                  return (
                    <button
                      className={`flex-1 px-4 py-2 rounded-md font-medium text-sm inline-flex items-center gap-2 transition justify-center ${
                        blockedByOther
                          ? 'bg-muted/60 text-muted-foreground/60 border border-border cursor-not-allowed'
                          : 'bg-primary text-primary-foreground hover:bg-primary/90'
                      }`}
                      disabled={blockedByOther}
                      title={blockedByOther ? 'Complete or cancel your current lab first' : undefined}
                      onClick={() => {
                        if (blockedByOther) return
                        clarityEvent('lab_visited')
                        clarityTag('lab_id', lab.id)
                        setRoute(`skill-lab-detail:${lab.id}` as any)
                      }}
                    >
                      <ExternalLink className="w-4 h-4" />
                      Visit Lab
                    </button>
                  )
                })()}
                {inProgressLabs.has(lab.id) && !lab.locked && (
                  <button
                    onClick={() => setConfirmCancelLabId(lab.id)}
                    title="Cancel lab progress"
                    className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {completedLabIds.has(lab.id) && !inProgressLabs.has(lab.id) && !lab.locked && (
                  <span title="Completed" className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-600 text-white text-sm shadow-md">
                    <CheckCircle2 className="w-5 h-5" />
                  </span>
                )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cancel lab confirmation modal */}
      {confirmCancelLabId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmCancelLabId(null)} />
          <div className="relative bg-card p-6 rounded max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Cancel lab?</h3>
            <div className="text-sm text-muted-foreground mb-4">Your progress will be discarded and cannot be recovered.</div>
            <div className="flex items-center justify-end gap-3">
              <button className="px-3 py-1 rounded-md bg-accent text-muted-foreground hover:bg-accent transition" onClick={() => setConfirmCancelLabId(null)}>Keep going</button>
              <button className="px-3 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 transition" onClick={() => cancelLabProgress(confirmCancelLabId)}>Yes, cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-1.5 rounded-md border border-border hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-md text-sm font-medium transition ${
                p === page
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border hover:bg-muted/50'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-1.5 rounded-md border border-border hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}


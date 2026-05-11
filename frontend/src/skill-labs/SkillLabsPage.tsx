import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import Loader from '@/components/Loader'
import { ApiErrorMessage } from '@/components/ApiErrorMessage'
import { useExam } from '@/exam/ExamContext'
import { Clock, ChevronLeft, ChevronRight, RotateCcw, CheckCircle2, Bookmark, Search, X, Lock, Play } from 'lucide-react'
import { clarityEvent, clarityTag } from '@/clarity'
import type { LabSummary, SkillLevel } from './types'
import { LAB_TIME_LIMITS } from './types'
import { apiUrl } from '@/apiBase'
import { captureError } from '@/lib/sentry'
import { SearchableFilter } from './SearchableFilter'
import { getBookmarkedLabs, toggleBookmark, clearLabProgress } from './labs/shared'
import { useSkillLab } from './SkillLabContext'
import { DIFFICULTY_COLORS } from './platformMeta'
import { ProviderLogo } from '@/components/ProviderLogo'
import { getProviderLogo } from '@/lib/providerLogos'

const DIFFICULTY_LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'advanced']

const SL_SESSION_KEY = 'skill-labs-session'
function readLabsSession(): Record<string, unknown> {
  try {
    const raw = sessionStorage.getItem(SL_SESSION_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}
const PER_PAGE_OPTIONS = [12, 24, 48, 96] as const

function inlineMarkdown(text: string) {
  return text.split(/(`[^`]+`)/).map((part, i) =>
    part.startsWith('`') && part.endsWith('`')
      ? <code key={i} className="text-[0.82em] bg-zinc-100 dark:bg-zinc-800 text-rose-700 dark:text-rose-300 px-1 py-px rounded font-mono border border-zinc-200 dark:border-zinc-700">{part.slice(1, -1)}</code>
      : part
  )
}

export function SkillLabsPage() {
  const { setRoute, authFetch, user } = useExam()
  const { inProgressLab, cancelActive } = useSkillLab()
  const topRef = useRef<HTMLDivElement>(null)

  function scrollToTop() {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const [labs, setLabs] = useState<LabSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  const [confirmCancelLabId, setConfirmCancelLabId] = useState<string | null>(null)

  useEffect(() => {
    if (!confirmCancelLabId) return
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') setConfirmCancelLabId(null) }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [confirmCancelLabId])

  function cancelLabProgress(labId: string) {
    clearLabProgress(labId)
    void cancelActive()
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
  const [perPage, setPerPage] = useState<typeof PER_PAGE_OPTIONS[number]>(() => {
    const ss = readLabsSession()
    const v = ss.perPage
    return typeof v === 'number' && (PER_PAGE_OPTIONS as readonly number[]).includes(v)
      ? (v as typeof PER_PAGE_OPTIONS[number])
      : 12
  })
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
      } catch (err) {
        captureError(err, { tags: { surface: 'skill-labs', action: 'fetch-list' } })
        if (!cancelled) setError('failed')
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
        searchQuery,
        selectedDifficulty,
        selectedPlatforms: [...selectedPlatforms],
        selectedCategories: [...selectedCategories],
        selectedTechnologies: [...selectedTechnologies],
        showSavedOnly,
        page,
        perPage,
      }))
    } catch {}
  }, [searchQuery, selectedDifficulty, selectedPlatforms, selectedCategories, selectedTechnologies, showSavedOnly, page, perPage])

  // Derive unique filter options from lab data
  const filterOptions = useMemo(() => {
    const platforms = new Set<string>()
    const categories = new Set<string>()
    const techs = new Set<string>()
    for (const lab of labs) {
      if (lab.platform) platforms.add(getProviderLogo(lab.platform)?.displayName ?? lab.platform)
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
      if (selectedPlatforms.size > 0 && !selectedPlatforms.has(getProviderLogo(lab.platform)?.displayName ?? lab.platform)) return false
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  let paginated = filtered.slice((page - 1) * perPage, page * perPage)
  const isLocked = inProgressLab !== null
  if (isLocked) {
    const activeLab = labs.find((l) => l.id === inProgressLab.labId)
    paginated = activeLab ? [activeLab] : []
  }

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
  if (error) return <ApiErrorMessage context="skill labs" />

  return (
    <div ref={topRef} className="space-y-5">
      {/* Controls bar: search + filters */}
      <div className="flex flex-col gap-3">
        {/* Top row: search + saved + count */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-muted-foreground" />
              </div>
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
                placeholder="Search labs..."
                disabled={isLocked}
                className="pl-8 w-full sm:w-64 md:w-80 px-3 py-1.5 rounded-md border border-border bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <button
              onClick={() => { setShowSavedOnly(!showSavedOnly); setPage(1) }}
              disabled={isLocked}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition border disabled:opacity-50 disabled:cursor-not-allowed ${
                showSavedOnly
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Bookmark className="w-3 h-3" />
              Saved{bookmarkedLabIds.size > 0 ? ` (${bookmarkedLabIds.size})` : ''}
            </button>
          </div>
          <div className="text-sm text-muted-foreground">
            {filtered.length} lab{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Filter row */}
        <div className={`flex items-center gap-2 flex-wrap ${isLocked ? 'opacity-50 pointer-events-none' : ''}`} aria-disabled={isLocked}>
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
            label="Provider"
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


      {isLocked && (
        <div className="text-xs text-muted-foreground">
          You have a lab in progress. Complete or cancel it to access other labs.
        </div>
      )}

      {/* Lab cards grid: 3 across × 4 down */}
      {paginated.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">
          No labs match the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginated.map((lab) => {
            const anyInProgress = inProgressLab !== null
            const thisInProgress = inProgressLab?.labId === lab.id
            const isCompleted = completedLabIds.has(lab.id) && !thisInProgress
            const blockedByOther = anyInProgress && !thisInProgress && !lab.locked
            const cardDisabled = blockedByOther
            const handleCardActivate = () => {
              if (cardDisabled) return
              clarityEvent('lab_visited')
              clarityTag('lab_id', lab.id)
              setRoute(`skill-lab-detail:${lab.id}` as any)
            }
            return (
              <div
                key={lab.id}
                data-testid="lab-card"
                data-lab-id={lab.id}
                role="button"
                tabIndex={cardDisabled ? -1 : 0}
                aria-disabled={cardDisabled}
                title={cardDisabled ? 'Complete or cancel your current lab first' : `Open ${lab.title}`}
                onClick={handleCardActivate}
                onKeyDown={(e) => {
                  if (!cardDisabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleCardActivate() }
                }}
                className={`group relative rounded-lg border border-border bg-card text-card-foreground shadow-sm overflow-hidden flex flex-col transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  cardDisabled
                    ? 'opacity-60 cursor-not-allowed'
                    : lab.locked
                      ? 'opacity-80 cursor-pointer hover:border-primary/30'
                      : 'cursor-pointer hover:border-primary hover:bg-primary/5'
                }`}
              >
                {/* Logo strip */}
                <div className="relative">
                  <ProviderLogo provider={lab.platform} size="md" />

                  {/* Top-right overlay: bookmark + status */}
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                    {lab.locked && (
                      <span title="Premium lab" className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/90 dark:bg-gray-900/80 border border-border shadow-sm">
                        <Lock className="w-3.5 h-3.5 text-orange-500" />
                      </span>
                    )}
                    {!lab.locked && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleBookmark(lab.id) }}
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/90 dark:bg-gray-900/80 border border-border shadow-sm hover:bg-white transition"
                        title={bookmarkedLabIds.has(lab.id) ? 'Remove bookmark' : 'Save for later'}
                      >
                        <Bookmark
                          className={`w-3.5 h-3.5 transition ${
                            bookmarkedLabIds.has(lab.id) ? 'fill-primary text-primary' : 'text-muted-foreground'
                          }`}
                        />
                      </button>
                    )}
                    {thisInProgress && !lab.locked && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmCancelLabId(lab.id) }}
                        title="Cancel lab progress"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/90 dark:bg-gray-900/80 border border-border shadow-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isCompleted && !lab.locked && (
                      <span title="Completed" className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-600 text-white shadow-sm">
                        <CheckCircle2 className="w-4 h-4" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 flex-1 flex flex-col">
                  <div className="font-medium leading-tight">{lab.title}</div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{inlineMarkdown(lab.description)}</p>

                  {/* Tech pills */}
                  {(lab.technologies || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {(lab.technologies || []).map((tech) => (
                        <span key={tech} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/70 text-xs text-muted-foreground">
                          {tech}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Meta — bottom-aligned: level, type, duration */}
                  <div className="mt-auto pt-3 flex items-center gap-1.5 flex-wrap text-xs">
                    <span className={`px-2 py-0.5 rounded-full font-medium capitalize ${DIFFICULTY_COLORS[lab.difficulty]}`}>
                      {lab.difficulty}
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium capitalize">
                      {lab.labCategory}
                    </span>
                    <span className="flex items-center gap-1 text-muted-foreground ml-auto">
                      <Clock className="w-3 h-3" />
                      {Math.floor(LAB_TIME_LIMITS[lab.difficulty] / 60)} min
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Cancel lab confirmation modal — portalled to body so it can't be obscured by stacking contexts */}
      {confirmCancelLabId && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmCancelLabId(null)} />
          <div className="relative bg-card p-6 rounded max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Cancel lab?</h3>
            <div className="text-sm text-muted-foreground mb-4">Your progress will be discarded and cannot be recovered.</div>
            <div className="flex items-center justify-end gap-3">
              <button className="px-3 py-1 rounded-md bg-accent text-muted-foreground hover:bg-accent transition" onClick={() => setConfirmCancelLabId(null)}>Keep going</button>
              <button className="px-3 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 transition" onClick={() => cancelLabProgress(confirmCancelLabId)}>Yes, cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Pagination + per-page selector */}
      {!isLocked && (totalPages > 1 || filtered.length > 12) && (
        <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
          {totalPages > 1 && (
            <>
              <button
                onClick={() => { setPage((p) => Math.max(1, p - 1)); scrollToTop() }}
                disabled={page === 1}
                className="p-1.5 rounded-md border border-border hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => { setPage(p); scrollToTop() }}
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
                onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); scrollToTop() }}
                disabled={page === totalPages}
                className="p-1.5 rounded-md border border-border hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="w-px h-5 bg-border mx-1" />
            </>
          )}
          <select
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value) as typeof PER_PAGE_OPTIONS[number])
              setPage(1)
              scrollToTop()
            }}
            className="text-sm border border-border rounded-md px-2 py-1 bg-background text-foreground hover:bg-muted/50 transition cursor-pointer"
            aria-label="Labs per page"
          >
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n} per page</option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}


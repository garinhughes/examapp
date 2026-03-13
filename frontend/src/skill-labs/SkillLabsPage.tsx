import { useState, useEffect, useMemo, useCallback } from 'react'
import { useExam } from '@/exam/ExamContext'
import { Play, Clock, Timer, Coffee, ChevronLeft, ChevronRight, RotateCcw, CheckCircle2, Heart, Bookmark, Search } from 'lucide-react'
import type { LabSummary, SkillLevel } from './types'
import { apiUrl } from '@/apiBase'
import { SearchableFilter } from './SearchableFilter'
import { getBookmarkedLabs, toggleBookmark } from './labs/shared'

const DIFFICULTY_LEVELS: SkillLevel[] = ['beginner', 'intermediate', 'advanced']
const DIFFICULTY_COLORS: Record<SkillLevel, string> = {
  beginner: 'bg-green-500/15 text-green-700 dark:text-green-400',
  intermediate: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  advanced: 'bg-red-500/15 text-red-700 dark:text-red-400',
}
const TYPE_ICON: Record<string, string> = {
  diagnose: '🔍',
  cli: '💻',
  'policy-fix': '🛠️',
  'architecture-builder': '🧩',
  'log-analysis': '📋',
  'network-path': '🔧',
  ordering: '🧱',
  'config-toggle': '🎛️',
  'cost-optimization': '🧠',
  'security-hardening': '🔐',
  'performance-optimization': '⚡',
  'policy-simulation': '🧪',
  'service-limits': '📡',
}
const LABS_PER_PAGE = 12 // 3 cols × 4 rows

export function SkillLabsPage() {
  const { setRoute, authFetch, user } = useExam()
  const [labs, setLabs] = useState<LabSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Timed/casual toggle (default to casual)
  const [timed, setTimed] = useState(false)

  // Search query for titles & descriptions
  const [searchQuery, setSearchQuery] = useState('')

  // Filters
  const [selectedDifficulty, setSelectedDifficulty] = useState<SkillLevel | null>(null)
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set())
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [selectedTechnologies, setSelectedTechnologies] = useState<Set<string>>(new Set())

  // Completion tracking
  const [completedLabIds, setCompletedLabIds] = useState<Set<string>>(new Set())
  const [showCompleted, setShowCompleted] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('skill-labs-show-completed')
      return v ? JSON.parse(v) : false
    } catch {
      return false
    }
  })

  // Bookmarks
  const [bookmarkedLabIds, setBookmarkedLabIds] = useState<Set<string>>(() => getBookmarkedLabs())
  const [showSavedOnly, setShowSavedOnly] = useState(false)

  const handleToggleBookmark = useCallback((labId: string) => {
    const updated = toggleBookmark(labId)
    setBookmarkedLabIds(updated)
  }, [])

  // Pagination
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    async function fetchLabs() {
      try {
        const res = await fetch(apiUrl('/skill-labs'))
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
    return () => { cancelled = true }
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

  // persist show/hide completed preference
  useEffect(() => {
    try {
      localStorage.setItem('skill-labs-show-completed', JSON.stringify(showCompleted))
    } catch {}
  }, [showCompleted])

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

  // Filtered labs
  const filtered = useMemo(() => {
    return labs.filter((lab) => {
      // When "Show Completed" is active, only include completed labs.
      // Otherwise hide completed labs from the main list.
      if (showCompleted) {
        if (!completedLabIds.has(lab.id)) return false
      } else {
        if (completedLabIds.has(lab.id)) return false
      }

      // Search query: match title or description
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const title = (lab.title || '').toLowerCase()
        const desc = (lab.description || '').toLowerCase()
        if (!title.includes(q) && !desc.includes(q)) return false
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
  }, [labs, selectedDifficulty, selectedPlatforms, selectedCategories, selectedTechnologies, showCompleted, completedLabIds, showSavedOnly, bookmarkedLabIds, searchQuery])

  // Reset page when filters change (including search)
  useEffect(() => { setPage(1) }, [selectedDifficulty, selectedPlatforms, selectedCategories, selectedTechnologies, showCompleted, showSavedOnly, searchQuery])

  const totalPages = Math.max(1, Math.ceil(filtered.length / LABS_PER_PAGE))
  const paginated = filtered.slice((page - 1) * LABS_PER_PAGE, page * LABS_PER_PAGE)

  const hasActiveFilters = Boolean(selectedDifficulty) || selectedPlatforms.size > 0 || selectedCategories.size > 0 || selectedTechnologies.size > 0 || searchQuery.trim().length > 0

  const clearFilters = () => {
    setSelectedDifficulty(null)
    setSelectedPlatforms(new Set())
    setSelectedCategories(new Set())
    setSelectedTechnologies(new Set())
  }
  // Clear filters and search
  const clearAllFilters = () => {
    clearFilters()
    setSearchQuery('')
  }

  if (loading) return <div className="text-muted-foreground">Loading skill labs…</div>
  if (error) return <div className="text-destructive">{error}</div>

  return (
    <div className="space-y-5">
      {/* Controls bar: timed toggle + filters */}
      <div className="flex flex-col gap-3">
        {/* Top row: mode toggle + clear */}
          <div className="flex items-center justify-between">
            {/* Timed / Casual toggle + Search */}
            <div className="flex items-center gap-2">
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

              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                  <Search className="w-4 h-4 text-muted-foreground" />
                </div>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search labs..."
                  className="ml-1 pl-8 w-64 sm:w-80 px-3 py-1.5 rounded-md border border-border bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
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
                onClick={() => setSelectedDifficulty(selectedDifficulty === level ? null : level)}
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
            onChange={setSelectedPlatforms}
          />
          <SearchableFilter
            label="Category"
            options={filterOptions.categories}
            selected={selectedCategories}
            onChange={setSelectedCategories}
          />
          <SearchableFilter
            label="Technology"
            options={filterOptions.technologies}
            selected={selectedTechnologies}
            onChange={setSelectedTechnologies}
          />

          <div className="w-px h-6 bg-border" />

          <button
            onClick={() => setShowCompleted((s) => !s)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition border ${
              showCompleted
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <CheckCircle2 className="w-3 h-3" />
            {showCompleted ? 'Hide Completed' : 'Show Completed'}
          </button>

          <button
            onClick={() => setShowSavedOnly(!showSavedOnly)}
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
              className="group relative p-5 rounded-lg border border-border bg-card shadow-sm flex flex-col justify-between hover:border-primary/30 hover:shadow-md transition-all"
            >
              <div>
                {/* Title row */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-semibold text-base leading-snug">{lab.title}</h3>
                  <div className="flex items-center gap-1.5 shrink-0">
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
                    <span className="text-lg" title={lab.type}>{TYPE_ICON[lab.type] || '📋'}</span>
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
                    {Math.floor(lab.timeLimit / 60)} min
                  </span>
                  <span className="capitalize">{lab.category}</span>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <button
                  className="flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm inline-flex items-center gap-2 hover:bg-primary/90 transition justify-center"
                  onClick={() => setRoute(`skill-lab:${lab.id}:${timed ? 'timed' : 'casual'}` as any)}
                >
                  <Play className="w-4 h-4" />
                  Start Lab
                </button>
                {completedLabIds.has(lab.id) && (
                  <span title="Completed" className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-600 text-white text-sm shadow-md">
                    <CheckCircle2 className="w-5 h-5" />
                  </span>
                )}
              </div>
            </div>
          ))}
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


import { useState, useEffect } from 'react'
import { ChevronLeft, Clock, Hourglass, Coffee, Lock, ArrowRight, X, Play } from 'lucide-react'
import Loader from '@/components/Loader'
import { useExam } from '@/exam/ExamContext'
import { clarityEvent, clarityTag } from '@/clarity'
import { apiUrl } from '@/apiBase'
import type { LabSummary, SkillLevel } from './types'
import { getInProgressLabs, clearLabProgress } from './labs/shared'
import { MarkdownText } from '@/exam/utils'

const DIFFICULTY_COLORS: Record<SkillLevel, string> = {
  beginner: 'bg-green-500/15 text-green-700 dark:text-green-400',
  intermediate: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  advanced: 'bg-red-500/15 text-red-700 dark:text-red-400',
}

interface SkillLabDetailPageProps {
  labId: string
}

export function SkillLabDetailPage({ labId }: SkillLabDetailPageProps) {
  const { setRoute, authFetch } = useExam()
  const [lab, setLab] = useState<LabSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timed, setTimed] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  const inProgressEntry = lab
    ? getInProgressLabs().find((e) => e.labId === labId) ?? null
    : null

  useEffect(() => {
    let cancelled = false
    async function fetchLab() {
      try {
        const res = await authFetch(apiUrl('/skill-labs'))
        if (!res.ok) throw new Error('Failed to fetch')
        const data: LabSummary[] = await res.json()
        if (!cancelled) {
          const found = data.find((l) => l.id === labId)
          if (found) {
            setLab(found)
            // Pre-select timed mode if the in-progress session was timed
            const entry = getInProgressLabs().find((e) => e.labId === labId)
            if (entry?.timed !== null && entry?.timed !== undefined) setTimed(entry.timed)
          } else {
            setError('Lab not found.')
          }
        }
      } catch {
        if (!cancelled) setError('Unable to load lab. Please try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchLab()
    return () => { cancelled = true }
  }, [labId])

  useEffect(() => {
    if (!confirmCancel) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setConfirmCancel(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [confirmCancel])

  function handleCancelProgress() {
    clearLabProgress(labId)
    setConfirmCancel(false)
    // Force re-render to clear in-progress state
    setLab((l) => l ? { ...l } : l)
  }

  function handleStart() {
    const mode = timed ? 'timed' : 'casual'
    clarityEvent(inProgressEntry ? 'lab_resumed' : 'lab_started')
    clarityTag('lab_id', labId)
    clarityTag('lab_mode', mode)
    setRoute(`skill-lab:${labId}:${mode}` as any)
  }

  if (loading) return <Loader text="Loading lab…" />
  if (error || !lab) return (
    <div className="flex flex-col items-start gap-3 p-4">
      <p className="text-destructive">{error || 'Lab not found'}</p>
      <button
        onClick={() => setRoute('skill-labs')}
        className="px-4 py-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted/50 transition"
      >
        Back to Skill Labs
      </button>
    </div>
  )

  const isInProgress = inProgressEntry !== null

  return (
    <div className="max-w-2xl space-y-4">
      {/* Back link */}
      <div className="flex justify-end">
        <button
          onClick={() => setRoute('skill-labs')}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ChevronLeft className="w-4 h-4" />
          Skill Labs
        </button>
      </div>

      {/* Lab info card */}
      <div className="p-5 rounded-lg border border-border bg-card shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold leading-snug">{lab.title}</h1>
          {lab.locked && (
            <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-muted border border-border text-xs font-medium text-muted-foreground">
              <Lock className="w-3 h-3" />
              Premium
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${DIFFICULTY_COLORS[lab.difficulty]}`}>
            {lab.difficulty}
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
            {lab.platform}
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium capitalize">
            {lab.labCategory}
          </span>
          {typeof lab.timeLimit === 'number' && lab.timeLimit > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
              <Clock className="w-3 h-3" />
              {Math.floor(lab.timeLimit / 60)} min
            </span>
          )}
        </div>

        {lab.description && (
          <MarkdownText text={lab.description} className="text-muted-foreground leading-relaxed" />
        )}

        {(lab.technologies ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {lab.technologies.map((tech) => (
              <span key={tech} className="px-2 py-0.5 rounded bg-muted/70 text-xs text-muted-foreground">
                {tech}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Action area */}
      <div className="p-5 rounded-lg border border-border bg-card shadow-sm space-y-4">
        {lab.locked ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Lock className="w-4 h-4 shrink-0" />
              <span>This is a premium lab. Upgrade your plan to access it.</span>
            </div>
            <button
              onClick={() => setRoute('pricing')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition"
            >
              View Plans <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            {/* Mode toggle */}
            <div>
              <p className="text-sm font-medium mb-2">Mode</p>
              <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border">
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
                  <Hourglass className="w-3.5 h-3.5" />
                  Timed
                </button>
              </div>
            </div>

            {/* CTA */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleStart}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition"
              >
                <Play className="w-4 h-4" />
                {isInProgress ? 'Resume Lab' : 'Start Lab'}
              </button>
              {isInProgress && (
                <button
                  onClick={() => setConfirmCancel(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition border border-border"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel progress
                </button>
              )}
            </div>

            {isInProgress && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                You have saved progress for this lab.
              </p>
            )}
          </>
        )}
      </div>

      {/* Cancel progress confirmation modal */}
      {confirmCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmCancel(false)} />
          <div className="relative bg-card p-6 rounded max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Cancel lab progress?</h3>
            <p className="text-sm text-muted-foreground mb-4">Your saved progress will be discarded and cannot be recovered.</p>
            <div className="flex items-center justify-end gap-3">
              <button className="px-3 py-1 rounded-md bg-accent text-muted-foreground hover:bg-accent transition" onClick={() => setConfirmCancel(false)}>Keep going</button>
              <button className="px-3 py-1 rounded-md bg-red-600 text-white hover:bg-red-700 transition" onClick={handleCancelProgress}>Yes, cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

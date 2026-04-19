import { useState, useEffect } from 'react'
import { ChevronLeft, Clock, Hourglass, Coffee, Lock, ArrowRight, X, Play, CheckCircle2, Info, Target, Briefcase, BookOpen } from 'lucide-react'
import Loader from '@/components/Loader'
import { useExam } from '@/exam/ExamContext'
import { clarityEvent, clarityTag } from '@/clarity'
import { apiUrl } from '@/apiBase'
import type { LabSummary } from './types'
import { LAB_TIME_LIMITS } from './types'
import { getInProgressLabs, clearLabProgress } from './labs/shared'
import { MarkdownText } from '@/exam/utils'
import { DIFFICULTY_COLORS, getPlatformMeta, CloudIcon } from './platformMeta'
import { ProviderLogo } from '@/components/ProviderLogo'

interface ExamMeta {
  code: string
  title: string
  provider?: string
  questionCount?: number
}

interface SkillLabDetailPageProps {
  labId: string
}

export function SkillLabDetailPage({ labId }: SkillLabDetailPageProps) {
  const { setRoute, authFetch, setupExamFromMeta } = useExam()
  const [lab, setLab] = useState<LabSummary | null>(null)
  const [relatedExams, setRelatedExams] = useState<ExamMeta[]>([])
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
        const [labsRes, examsRes] = await Promise.all([
          authFetch(apiUrl('/skill-labs')),
          authFetch(apiUrl('/exams')).catch(() => null),
        ])
        if (!labsRes.ok) throw new Error('Failed to fetch')
        const data: LabSummary[] = await labsRes.json()
        if (cancelled) return
        const found = data.find((l) => l.id === labId)
        if (!found) {
          setError('Lab not found.')
          return
        }
        setLab(found)
        const entry = getInProgressLabs().find((e) => e.labId === labId)
        if (entry?.timed !== null && entry?.timed !== undefined) setTimed(entry.timed)

        if (examsRes && examsRes.ok && (found.relatedExamCodes ?? []).length > 0) {
          const exams: ExamMeta[] = await examsRes.json()
          const codes = new Set(found.relatedExamCodes!.map((c) => c.toLowerCase()))
          setRelatedExams(exams.filter((e) => codes.has(String(e.code).toLowerCase())))
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
  const platformMeta = getPlatformMeta(lab.platform)
  const learningOutcomes = lab.learningOutcomes ?? []
  const realWorldValue = (lab.realWorldValue ?? '').trim()

  return (
    <div className="max-w-3xl space-y-4">
      {/* Back link */}
      <div>
        <button
          onClick={() => setRoute('skill-labs')}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ChevronLeft className="w-4 h-4" />
          Skill Labs
        </button>
      </div>

      {/* Header card */}
      <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
        <ProviderLogo provider={lab.platform} size="md" />

        <div className="p-5 space-y-4">
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
              {platformMeta?.displayName ?? lab.platform}
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium capitalize">
              {lab.labCategory}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
              <Clock className="w-3 h-3" />
              {Math.floor(LAB_TIME_LIMITS[lab.difficulty] / 60)} min
            </span>
          </div>

          {lab.description && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">Scenario Preview</p>
              <MarkdownText text={lab.description} className="text-muted-foreground leading-relaxed" />
            </div>
          )}

          {(lab.technologies ?? []).length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Services, tools & techniques</p>
              <div className="flex flex-wrap gap-1.5">
                {lab.technologies.map((tech) => (
                  <span key={tech} className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-muted/70 text-xs text-muted-foreground">
                    <CloudIcon name={tech} className="w-7 h-7 shrink-0" />
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action card */}
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
            {/* Mode cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTimed(false)}
                className={`text-left p-4 rounded-xl border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  !timed ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-border hover:border-primary/40'
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`p-2 rounded-lg shrink-0 ${!timed ? 'bg-primary/10' : 'bg-muted/50'}`}>
                    <Coffee className={`w-5 h-5 ${!timed ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="min-w-0">
                    <span className="font-semibold text-sm">Casual</span>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Work at your own pace with hints available. No time pressure.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-border/40">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Time limit</div>
                    <div className="text-sm font-semibold">None</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Feedback</div>
                    <div className="text-sm font-semibold">On submit</div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTimed(true)}
                className={`text-left p-4 rounded-xl border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  timed ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-border hover:border-primary/40'
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className={`p-2 rounded-lg shrink-0 ${timed ? 'bg-primary/10' : 'bg-muted/50'}`}>
                    <Hourglass className={`w-5 h-5 ${timed ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <div className="min-w-0">
                    <span className="font-semibold text-sm">Timed</span>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Simulate real-world pressure. Complete within the time limit.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-border/40">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Time limit</div>
                    <div className="text-sm font-semibold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {Math.floor(LAB_TIME_LIMITS[lab.difficulty] / 60)} min
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Feedback</div>
                    <div className="text-sm font-semibold">On submit</div>
                  </div>
                </div>
              </button>
            </div>

            {/* CTA */}
            <div className="flex flex-wrap items-center gap-3">
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

      {/* What you'll demonstrate + On the job */}
      {(learningOutcomes.length > 0 || realWorldValue) && (
        <div className="p-5 rounded-lg border border-border bg-card shadow-sm space-y-3">
          {learningOutcomes.length > 0 && (
            <>
              <h2 className="text-base font-semibold inline-flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                What you'll demonstrate
              </h2>
              <ul className="space-y-2">
                {learningOutcomes.map((o, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <MarkdownText
                      text={o}
                      className="[&_p]:!my-0 [&_code]:!bg-muted [&_code]:!px-1 [&_code]:!py-0.5 [&_code]:!rounded"
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
          {realWorldValue && (
            <div className="pt-3 border-t border-border/50 space-y-2">
              <h3 className="text-sm font-semibold inline-flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-primary" />
                On the job
              </h3>
              <MarkdownText text={realWorldValue} className="text-sm text-muted-foreground leading-relaxed" />
            </div>
          )}
        </div>
      )}

      {/* Related practice exams */}
      {relatedExams.length > 0 && (
        <div className="p-5 rounded-lg border border-border bg-card shadow-sm space-y-3">
          <h2 className="text-base font-semibold inline-flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            Related practice exams
          </h2>
          <p className="text-xs text-muted-foreground">This lab helps you prepare for:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {relatedExams.map((ex) => {
              const handleClick = () => { setupExamFromMeta(ex) }
              return (
                <div
                  key={ex.code}
                  role="button"
                  tabIndex={0}
                  onClick={handleClick}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } }}
                  title={`Setup ${ex.title}`}
                  className="rounded-lg border border-border bg-card overflow-hidden flex flex-col cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <ProviderLogo provider={ex.provider} size="sm" />
                  <div className="p-3 pt-4">
                    <div className="text-sm font-medium leading-tight">{ex.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{ex.code}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Simulation notice */}
      <div role="note" className="p-4 rounded-lg border border-border bg-muted/30 text-sm text-muted-foreground flex items-start gap-3">
        <Info className="w-5 h-5 flex-shrink-0 mt-0.5 text-primary" aria-hidden />
        <p>
          These labs are <strong>interactive simulations</strong>. They run entirely in your browser and don't spin up real cloud resources or VMs, so there are no charges when you use them.
        </p>
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

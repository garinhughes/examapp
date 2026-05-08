import { useState, useEffect, useMemo, Suspense, lazy, ComponentType } from 'react'
import { Lock, ArrowRight } from 'lucide-react'
import Loader from '@/components/Loader'
import { apiUrl } from '@/apiBase'
import { useExam } from '@/exam/ExamContext'
import type { LabDefinition, SkillLabType } from './types'

interface SkillLabRunnerPageProps {
  labId: string
  timed?: boolean
}

// Provider-specific overrides - add entries here when a lab type needs genuinely different
// UI behaviour per provider (e.g. 'azure:cli'). Most labs will never need this.
const providerRunnerImports: Partial<Record<string, () => Promise<{ default: ComponentType<any> }>>> = {
  // e.g. 'azure:cli': () => import('./labs/providers/azure/cli').then(m => ({ default: m.CliLabRunner })),
}

// Generic fallback runners - one file per type, shared across all providers
const genericRunnerImports: Record<SkillLabType, () => Promise<{ default: ComponentType<any> }>> = {
  'cli':                   () => import('./labs/runners/cli').then(m => ({ default: m.CliLabRunner })),
  'policy-fix':            () => import('./labs/runners/policy-fix').then(m => ({ default: m.PolicyFixLabRunner })),
  'architecture-builder':  () => import('./labs/runners/architecture-builder').then(m => ({ default: m.ArchitectureBuilderRunner })),
  'log-analysis':          () => import('./labs/runners/log-analysis').then(m => ({ default: m.LogAnalysisRunner })),
  'network-path':          () => import('./labs/runners/network-path').then(m => ({ default: m.NetworkPathRunner })),
  'ordering':              () => import('./labs/runners/ordering').then(m => ({ default: m.OrderingRunner })),
  'config-toggle':         () => import('./labs/runners/config-toggle').then(m => ({ default: m.ConfigToggleRunner })),
  'cost-optimization':     () => import('./labs/runners/cost-optimization').then(m => ({ default: m.CostOptimizationRunner })),
  'security-hardening':    () => import('./labs/runners/security-hardening').then(m => ({ default: m.SecurityHardeningRunner })),
  'performance-optimization': () => import('./labs/runners/performance-optimization').then(m => ({ default: m.PerformanceOptRunner })),
  'service-limits':        () => import('./labs/runners/service-limits').then(m => ({ default: m.ServiceLimitsRunner })),
  'code-fix':              () => import('./labs/runners/code-fix').then(m => ({ default: m.CodeFixLabRunner })),
  'fill-command':          () => import('./labs/runners/fill-command').then(m => ({ default: m.FillCommandRunner })),
  'drag-match':            () => import('./labs/runners/drag-match').then(m => ({ default: m.DragMatchRunner })),
  'diagram-label':         () => import('./labs/runners/diagram-label').then(m => ({ default: m.DiagramLabelRunner })),
  'incident-response':    () => import('./labs/runners/incident-response').then(m => ({ default: m.IncidentResponseRunner })),
  'drift-detection':      () => import('./labs/runners/drift-detection').then(m => ({ default: m.DriftDetectionRunner })),
  'phased-pipeline':      () => import('./labs/runners/phased-pipeline').then(m => ({ default: m.PhasedPipelineRunner })),
  'terminal-replay':      () => import('./labs/runners/terminal-replay').then(m => ({ default: m.TerminalReplayRunner })),
  'command-terminal':     () => import('./labs/runners/command-terminal').then(m => ({ default: m.CommandTerminalRunner })),
}

export function SkillLabRunnerPage({ labId, timed = false }: SkillLabRunnerPageProps) {
  const { authFetch, setRoute, user } = useExam()
  const [lab, setLab] = useState<LabDefinition | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchLab() {
      try {
        const res = await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(labId)}`))
        if (!res.ok) { setErrorStatus(res.status); throw new Error('Failed to load') }
        const data = await res.json()
        if (!cancelled) setLab(data)
      } catch {
        if (!cancelled) setError('Unable to load skill lab. Please try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchLab()
    return () => { cancelled = true }
  }, [labId])

  const platform = (lab?.platform ?? '').toLowerCase()
  const labType = lab?.type
  const runnerKey = labType ? `${platform}:${labType}` : null
  const LazyRunner = useMemo(() => {
    if (!labType || !runnerKey) return null
    const importer = providerRunnerImports[runnerKey] ?? genericRunnerImports[labType]
    if (!importer) return null
    return lazy(importer)
  }, [runnerKey, labType])

  if (loading) return <Loader text="Loading lab…" />

  if (error || !lab) {
    const isLocked = errorStatus === 403 || errorStatus === 401
    return (
      <div className="flex items-center justify-center min-h-[40vh] p-6">
        <div className="max-w-sm w-full rounded-xl border border-border bg-card shadow-sm p-6 space-y-4 text-center">
          {isLocked ? (
            <>
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mx-auto">
                <Lock className="w-6 h-6 text-primary" />
              </div>
              <div className="space-y-1">
                <h2 className="font-semibold text-foreground">Premium lab</h2>
                <p className="text-sm text-muted-foreground">
                  {user
                    ? 'Your current plan does not include access to this lab.'
                    : 'Sign in or upgrade your plan to access this lab.'}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setRoute('pricing')}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition"
                >
                  View Plans <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setRoute('skill-labs')}
                  className="text-sm text-muted-foreground hover:text-foreground transition"
                >
                  Back to Skill Labs
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <h2 className="font-semibold text-foreground">Unable to load lab</h2>
                <p className="text-sm text-muted-foreground">Something went wrong. Please try again.</p>
              </div>
              <button
                onClick={() => setRoute('skill-labs')}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition"
              >
                Back to Skill Labs
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (!LazyRunner) {
    return <div className="text-destructive p-4">Unknown lab type: {(lab as any).type}</div>
  }

  return (
    <Suspense fallback={<Loader text="Loading runner…" />}>
      <LazyRunner lab={lab} timed={timed} />
    </Suspense>
  )
}

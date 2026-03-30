import { useState, useEffect, Suspense, lazy, ComponentType } from 'react'
import { apiUrl } from '@/apiBase'
import { useExam } from '@/exam/ExamContext'
import type { LabDefinition, SkillLabType } from './types'

interface SkillLabRunnerPageProps {
  labId: string
  timed?: boolean
}

// Provider-specific overrides — add entries here when a lab type needs genuinely different
// UI behaviour per provider (e.g. 'azure:cli'). Most labs will never need this.
const providerRunnerImports: Partial<Record<string, () => Promise<{ default: ComponentType<any> }>>> = {
  // e.g. 'azure:cli': () => import('./labs/providers/azure/cli').then(m => ({ default: m.CliLabRunner })),
}

// Generic fallback runners — one file per type, shared across all providers
const genericRunnerImports: Record<SkillLabType, () => Promise<{ default: ComponentType<any> }>> = {
  'diagnose':              () => import('./labs/runners/diagnose').then(m => ({ default: m.DiagnoseLabRunner })),
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
  'policy-simulation':     () => import('./labs/runners/policy-simulation').then(m => ({ default: m.PolicySimulationRunner })),
  'service-limits':        () => import('./labs/runners/service-limits').then(m => ({ default: m.ServiceLimitsRunner })),
  'code-fix':              () => import('./labs/runners/code-fix').then(m => ({ default: m.CodeFixLabRunner })),
  'fill-command':          () => import('./labs/runners/fill-command').then(m => ({ default: m.FillCommandRunner })),
  'drag-match':            () => import('./labs/runners/drag-match').then(m => ({ default: m.DragMatchRunner })),
  'diagram-label':         () => import('./labs/runners/diagram-label').then(m => ({ default: m.DiagramLabelRunner })),
  'incident-response':    () => import('./labs/runners/incident-response').then(m => ({ default: m.IncidentResponseRunner })),
  'drift-detection':      () => import('./labs/runners/drift-detection').then(m => ({ default: m.DriftDetectionRunner })),
}

export function SkillLabRunnerPage({ labId, timed = true }: SkillLabRunnerPageProps) {
  const { authFetch, setRoute } = useExam()
  const [lab, setLab] = useState<LabDefinition | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchLab() {
      try {
        const res = await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(labId)}`))
        if (!res.ok) throw new Error('Failed to load')
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

  if (loading) return <div className="text-muted-foreground p-4">Loading lab…</div>
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

  const platform = (lab.platform ?? '').toLowerCase()
  const importer = providerRunnerImports[`${platform}:${lab.type}`] ?? genericRunnerImports[lab.type]
  if (!importer) {
    return <div className="text-destructive p-4">Unknown lab type: {(lab as any).type}</div>
  }

  const LazyRunner = lazy(importer)

  return (
    <Suspense fallback={<div className="text-muted-foreground p-4">Loading runner…</div>}>
      <LazyRunner lab={lab} timed={timed} />
    </Suspense>
  )
}

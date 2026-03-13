import { useState, useEffect, Suspense, lazy, ComponentType } from 'react'
import { apiUrl } from '@/apiBase'
import type { LabDefinition, SkillLabType } from './types'

interface SkillLabRunnerPageProps {
  labId: string
  timed?: boolean
}

/**
 * Map lab type → dynamic import of runner component.
 * Each entry returns a Promise<{ default: ComponentType }> shape for React.lazy.
 * Vite will code-split each runner (and its deps like Monaco) into separate chunks.
 */
const runnerImports: Record<SkillLabType, () => Promise<{ default: ComponentType<any> }>> = {
  'diagnose': () =>
    import('./labs/aws/diagnose-cloudfront-403').then(m => ({ default: m.DiagnoseLabRunner })),
  'cli': () =>
    import('./labs/aws/cli-s3-access-denied').then(m => ({ default: m.CliLabRunner })),
  'policy-fix': () =>
    import('./labs/aws/policy-fix-s3-iam').then(m => ({ default: m.PolicyFixLabRunner })),
  'architecture-builder': () =>
    import('./labs/aws/architecture-builder-ha-web-app').then(m => ({ default: m.ArchitectureBuilderRunner })),
  'log-analysis': () =>
    import('./labs/aws/log-analysis-lambda-timeout').then(m => ({ default: m.LogAnalysisRunner })),
  'network-path': () =>
    import('./labs/aws/network-path-api-debug').then(m => ({ default: m.NetworkPathRunner })),
  'ordering': () =>
    import('./labs/aws/ordering-incident-response').then(m => ({ default: m.OrderingRunner })),
  'config-toggle': () =>
    import('./labs/aws/config-toggle-alb-health-check').then(m => ({ default: m.ConfigToggleRunner })),
  'cost-optimization': () =>
    import('./labs/aws/cost-optimization-monthly-spend').then(m => ({ default: m.CostOptimizationRunner })),
  'security-hardening': () =>
    import('./labs/aws/security-hardening-s3-app').then(m => ({ default: m.SecurityHardeningRunner })),
  'performance-optimization': () =>
    import('./labs/aws/performance-optimization-api-latency').then(m => ({ default: m.PerformanceOptRunner })),
  'policy-simulation': () =>
    import('./labs/aws/policy-simulation-s3-readonly').then(m => ({ default: m.PolicySimulationRunner })),
  'service-limits': () =>
    import('./labs/aws/service-limits-traffic-spike').then(m => ({ default: m.ServiceLimitsRunner })),
}

export function SkillLabRunnerPage({ labId, timed = true }: SkillLabRunnerPageProps) {
  const [lab, setLab] = useState<LabDefinition | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchLab() {
      try {
        const res = await fetch(apiUrl(`/skill-labs/${encodeURIComponent(labId)}`))
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
  if (error || !lab) return <div className="text-destructive p-4">{error || 'Lab not found'}</div>

  const importer = runnerImports[lab.type]
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

import { useState, useEffect } from 'react'
import { apiUrl } from '@/apiBase'
import type { LabDefinition } from './types'
import { DiagnoseLabRunner } from './labs/aws/diagnose-cloudfront-403'
import { CliLabRunner } from './labs/aws/cli-s3-access-denied'
import { PolicyFixLabRunner } from './labs/aws/policy-fix-s3-iam'
import { ArchitectureBuilderRunner } from './labs/aws/architecture-builder-ha-web-app'
import { LogAnalysisRunner } from './labs/aws/log-analysis-lambda-timeout'
import { NetworkPathRunner } from './labs/aws/network-path-api-debug'
import { OrderingRunner } from './labs/aws/ordering-incident-response'
import { ConfigToggleRunner } from './labs/aws/config-toggle-alb-health-check'
import { CostOptimizationRunner } from './labs/aws/cost-optimization-monthly-spend'
import { SecurityHardeningRunner } from './labs/aws/security-hardening-s3-app'
import { PerformanceOptRunner } from './labs/aws/performance-optimization-api-latency'
import { PolicySimulationRunner } from './labs/aws/policy-simulation-s3-readonly'
import { ServiceLimitsRunner } from './labs/aws/service-limits-traffic-spike'

interface SkillLabRunnerPageProps {
  labId: string
  timed?: boolean
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

  switch (lab.type) {
    case 'diagnose':
      return <DiagnoseLabRunner lab={lab} timed={timed} />
    case 'cli':
      return <CliLabRunner lab={lab} timed={timed} />
    case 'policy-fix':
      return <PolicyFixLabRunner lab={lab} timed={timed} />
    case 'architecture-builder':
      return <ArchitectureBuilderRunner lab={lab} timed={timed} />
    case 'log-analysis':
      return <LogAnalysisRunner lab={lab} timed={timed} />
    case 'network-path':
      return <NetworkPathRunner lab={lab} timed={timed} />
    case 'ordering':
      return <OrderingRunner lab={lab} timed={timed} />
    case 'config-toggle':
      return <ConfigToggleRunner lab={lab} timed={timed} />
    case 'cost-optimization':
      return <CostOptimizationRunner lab={lab} timed={timed} />
    case 'security-hardening':
      return <SecurityHardeningRunner lab={lab} timed={timed} />
    case 'performance-optimization':
      return <PerformanceOptRunner lab={lab} timed={timed} />
    case 'policy-simulation':
      return <PolicySimulationRunner lab={lab} timed={timed} />
    case 'service-limits':
      return <ServiceLimitsRunner lab={lab} timed={timed} />
    default:
      return <div className="text-destructive p-4">Unknown lab type: {(lab as any).type}</div>
  }
}

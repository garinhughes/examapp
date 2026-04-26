import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
  type Connection,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { ArchitectureBuilderLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { LabDiagram } from '../LabDiagram'
import { useLabSession } from '../useLabSession'
import { LabCheckActions } from '../LabCheckActions'
import { useExam } from '@/exam/ExamContext'
import { ExplanationBlock } from '../ExplanationBlock'

interface ArchProgress {
  placedComponents: string[]
  nodes: Node[]
  edges: Edge[]
  timeLeft: number
}

interface Props {
  lab: ArchitectureBuilderLabDefinition
  timed?: boolean
}

export function ArchitectureBuilderRunner(props: Props) {
  return (
    <ReactFlowProvider>
      <ArchitectureBuilderInner {...props} />
    </ReactFlowProvider>
  )
}

function ArchitectureBuilderInner({ lab, timed = true }: Props) {
  const { setRoute } = useExam()
  const reactFlowInstance = useReactFlow()
  const session = useLabSession<ArchProgress>({ lab, timed })

  const [placedComponents, setPlacedComponents] = useState<Set<string>>(
    () => new Set(session.savedProgress?.placedComponents ?? [])
  )
  const [nodes, setNodes, onNodesChange] = useNodesState(session.savedProgress?.nodes ?? [])
  const [edges, setEdges, onEdgesChange] = useEdgesState(session.savedProgress?.edges ?? [])
  const nodeCountRef = useRef(session.savedProgress?.nodes?.length ?? 0)
  const [validationResults, setValidationResults] = useState<{ check: string; pass: boolean }[]>([])
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (session.restartKey === 0) return
    setPlacedComponents(new Set())
    setNodes([])
    setEdges([])
    nodeCountRef.current = 0
    setValidationResults([])
    setChecked(false)
  }, [session.restartKey])

  // Fit view when nodes are added
  const prevNodeCount = useRef(nodes.length)
  useEffect(() => {
    if (nodes.length > prevNodeCount.current) {
      setTimeout(() => reactFlowInstance.fitView({ padding: 0.25, duration: 200 }), 50)
    }
    prevNodeCount.current = nodes.length
  }, [nodes.length])

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ placedComponents: [...placedComponents], nodes, edges, timeLeft: session.timeLeft })
  }, [placedComponents, nodes, edges, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !checked) handleCheck()
  }, [session.timeLeft])

  const removeComponent = useCallback((id: string) => {
    setPlacedComponents((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setNodes((prev) => prev.filter((n) => n.id !== id))
    setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id))
  }, [setNodes, setEdges])

  const toggleComponent = useCallback((comp: typeof lab.availableComponents[0]) => {
    if (checked) return
    session.markDirty()
    if (placedComponents.has(comp.id)) {
      removeComponent(comp.id)
      return
    }
    setPlacedComponents((prev) => new Set([...prev, comp.id]))
    const n = nodeCountRef.current++
    const col = n % 3
    const row = Math.floor(n / 3)
    const newNode: Node = {
      id: comp.id,
      position: { x: 50 + col * 220, y: 40 + row * 130 },
      data: { label: `${comp.icon} ${comp.label}` },
      style: {
        background: 'hsl(var(--card))',
        color: 'hsl(var(--card-foreground))',
        border: '2px solid hsl(var(--border))',
        borderRadius: '8px',
        padding: '10px 16px',
        fontWeight: 600,
        fontSize: '13px',
      },
    }
    setNodes((prev) => [...prev, newNode])
  }, [placedComponents, checked, removeComponent, setNodes])

  const onNodesDelete = useCallback((deleted: Node[]) => {
    if (checked) return
    for (const n of deleted) removeComponent(n.id)
  }, [checked, removeComponent])

  const onConnect = useCallback((connection: Connection) => {
    if (checked) return
    session.markDirty()
    setEdges((prev) => addEdge({ ...connection, animated: true }, prev))
  }, [checked, setEdges])

  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    if (checked) return
    session.markDirty()
    setEdges((prev) => prev.filter((e) => e.id !== edge.id))
  }, [checked, setEdges])

  const handleCheck = useCallback(() => {
    if (checked) return
    const results: { check: string; pass: boolean }[] = []

    const missingComps = lab.requiredComponents.filter((id) => !placedComponents.has(id))
    results.push({
      check: 'All required components placed',
      pass: missingComps.length === 0,
    })

    for (const req of lab.requiredConnections) {
      const found = edges.some(
        (e) => (e.source === req.from && e.target === req.to) ||
               (e.source === req.to && e.target === req.from)
      )
      const fromLabel = lab.availableComponents.find((c) => c.id === req.from)?.label || req.from
      const toLabel = lab.availableComponents.find((c) => c.id === req.to)?.label || req.to
      results.push({
        check: `${fromLabel} → ${toLabel} connected`,
        pass: found,
      })
    }

    for (const check of lab.validationChecks) {
      results.push({ check, pass: missingComps.length === 0 && edges.length >= lab.requiredConnections.length })
    }

    setValidationResults(results)
    setChecked(true)
  }, [checked, lab, placedComponents, edges])

  const handleComplete = useCallback(async () => {
    const allPass = validationResults.every((r) => r.pass)
    await session.finalize(allPass)
  }, [session.finalize, validationResults])

  const allPass = validationResults.length > 0 && validationResults.every((r) => r.pass)

  const grouped = useMemo(() => {
    const map: Record<string, typeof lab.availableComponents> = {}
    for (const c of lab.availableComponents) {
      ;(map[c.category] ??= []).push(c)
    }
    return map
  }, [lab.availableComponents])

  const displayScenario = `${lab.scenario} Your design must remain available if a single Availability Zone fails. Prefer managed, multi-AZ services with automated failover (single-AZ read-replicas alone are not sufficient for AZ-failure resilience). Consider serving static assets via a CDN, using an autoscaling web tier spread across AZs behind a load balancer, caching for read-heavy workloads, and durable object storage for static content.`

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader title={lab.title} timed={timed} timeLeft={session.timeLeft} subtitle={displayScenario} labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ placedComponents: [...placedComponents], nodes, edges, timeLeft: session.timeLeft })}
        onRatingClose={() => setRoute('skill-labs')} />
      {session.resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

      {lab.mermaidCode && <LabDiagram code={lab.mermaidCode} idHint={lab.id} />}

      <div className="flex gap-4 min-h-[500px]">
        {/* Component palette */}
        <div className="w-56 shrink-0 rounded-lg border border-border bg-card p-3 overflow-y-auto flex flex-col gap-4">
          <div>
            <h3 className="font-semibold text-sm mb-3">Components</h3>
            {Object.entries(grouped).map(([cat, comps]) => (
              <div key={cat} className="mb-3">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{cat}</div>
                <div className="space-y-1">
                  {comps.map((comp) => {
                    const placed = placedComponents.has(comp.id)
                    return (
                      <button
                        key={comp.id}
                        onClick={() => toggleComponent(comp)}
                        disabled={checked}
                        title={placed ? 'Click to remove from canvas' : 'Click to add to canvas'}
                        className={`w-full flex items-center justify-between gap-2 text-left px-2.5 py-1.5 rounded-md text-sm transition ${
                          placed
                            ? 'bg-primary/10 text-primary border border-primary/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30'
                            : 'border border-border hover:bg-muted/50 cursor-pointer'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <span className="truncate">{comp.icon} {comp.label}</span>
                        {placed && (
                          <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-destructive/15 text-destructive text-sm font-bold leading-none">
                            ×
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">Tip: Click a component to add or remove it. Drag from a node's edge handle to connect it to another node. Click a connection line, or select a node and press Delete, to remove it. Click "Validate Architecture" when ready.</p>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 rounded-lg border border-border bg-card overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={onEdgeClick}
            onNodesDelete={onNodesDelete}
            deleteKeyCode={['Delete', 'Backspace']}
            fitView
            proOptions={{ hideAttribution: true }}
            nodesConnectable={!checked}
            nodesDraggable={!checked}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>

      {checked && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-3">
          <div className={`inline-flex items-center gap-1.5 font-semibold text-sm ${allPass ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
            {allPass ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {allPass ? 'Architecture validated successfully!' : 'Some checks failed'}
          </div>
          <div className="space-y-1.5">
            {validationResults.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className={r.pass ? 'text-green-600 dark:text-green-400' : 'text-destructive'}>{r.pass ? '✓' : '✗'}</span>
                <span className={r.pass ? '' : 'text-muted-foreground'}>{r.check}</span>
              </div>
            ))}
          </div>
          <ExplanationBlock text={lab.explanation} className="mt-2" />
        </div>
      )}

      <LabCheckActions
        checked={checked}
        isCorrect={allPass}
        submitted={session.submitted}
        canCheck={nodes.length > 0}
        onCheck={handleCheck}
        onComplete={handleComplete}
        onRetry={session.restart}
        onCancel={session.handleCancelLab}
      />
    </div>
  )
}

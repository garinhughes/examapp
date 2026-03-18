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
  type Connection,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useExam } from '@/exam/ExamContext'
import { apiUrl } from '@/apiBase'
import type { ArchitectureBuilderLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabComplete } from '../shared'

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
  const { authFetch, user } = useExam()
  const reactFlowInstance = useReactFlow()
  const completeWithGamification = useLabComplete(lab)

  const [placedComponents, setPlacedComponents] = useState<Set<string>>(new Set())
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const nodeCountRef = useRef(0)
  const [submitted, setSubmitted] = useState(false)
  const [validationResults, setValidationResults] = useState<{ check: string; pass: boolean }[]>([])
  const [timeLeft, setTimeLeft] = useState(lab.timeLimit)
  const [labPaused, setLabPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    if (submitted || !timed || labPaused) return
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [submitted, timed, labPaused])

  useEffect(() => {
    if (timed && timeLeft === 0 && !submitted) handleValidate()
  }, [timeLeft])

  const addComponent = useCallback((comp: typeof lab.availableComponents[0]) => {
    if (placedComponents.has(comp.id) || submitted) return
    setPlacedComponents((prev) => new Set([...prev, comp.id]))
    const n = nodeCountRef.current++
    const col = n % 3
    const row = Math.floor(n / 3)
    // Place in a grid that maps to viewport flow coordinates
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
    setNodes((prev) => {
      const next = [...prev, newNode]
      // Fit viewport to show all nodes after a tick
      requestAnimationFrame(() => reactFlowInstance.fitView({ padding: 0.25, duration: 200 }))
      return next
    })
  }, [placedComponents, submitted, reactFlowInstance])

  const onConnect = useCallback((connection: Connection) => {
    if (submitted) return
    setEdges((prev) => addEdge({ ...connection, animated: true }, prev))
  }, [submitted, setEdges])

  const handleValidate = useCallback(async () => {
    if (submitted) return
    setSubmitted(true)
    if (timerRef.current) clearInterval(timerRef.current)

    const results: { check: string; pass: boolean }[] = []

    // Check required components
    const missingComps = lab.requiredComponents.filter((id) => !placedComponents.has(id))
    results.push({
      check: 'All required components placed',
      pass: missingComps.length === 0,
    })

    // Check required connections (accept either direction since handles are on all sides)
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

    // Additional validation checks
    for (const check of lab.validationChecks) {
      results.push({ check, pass: missingComps.length === 0 && edges.length >= lab.requiredConnections.length })
    }

    setValidationResults(results)
    const allPass = results.every((r) => r.pass)
    completeWithGamification(allPass)

    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000)
    if (user) {
      try {
        await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selectedAnswer: '', correct: allPass, timeTaken }),
        })
      } catch { /* non-critical */ }
    }
  }, [submitted, lab, placedComponents, edges, authFetch, user])

  const allPass = validationResults.length > 0 && validationResults.every((r) => r.pass)

  // Group components by category
  const grouped = useMemo(() => {
    const map: Record<string, typeof lab.availableComponents> = {}
    for (const c of lab.availableComponents) {
      ;(map[c.category] ??= []).push(c)
    }
    return map
  }, [lab.availableComponents])

  // Expand scenario text with extra guidance so learners understand constraints
  const displayScenario = `${lab.scenario} Your design must remain available if a single Availability Zone fails. Prefer managed, multi-AZ services with automated failover (single-AZ read-replicas alone are not sufficient for AZ-failure resilience). Consider serving static assets via a CDN, using an autoscaling web tier spread across AZs behind a load balancer, caching for read-heavy workloads, and durable object storage for static content.`

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader title={lab.title} timed={timed} timeLeft={timeLeft} subtitle={displayScenario} labId={lab.id} onPauseChange={setLabPaused} />

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Component palette */}
        <div className="w-56 shrink-0 rounded-lg border border-border bg-card p-3 overflow-y-auto flex flex-col gap-4">
          <div>
            <h3 className="font-semibold text-sm mb-3">Components</h3>
            {Object.entries(grouped).map(([cat, comps]) => (
              <div key={cat} className="mb-3">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{cat}</div>
                <div className="space-y-1">
                  {comps.map((comp) => (
                    <button
                      key={comp.id}
                      onClick={() => addComponent(comp)}
                      disabled={placedComponents.has(comp.id) || submitted}
                      className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm transition ${
                        placedComponents.has(comp.id)
                          ? 'bg-primary/10 text-primary border border-primary/30'
                          : 'border border-border hover:bg-muted/50 cursor-pointer'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      {comp.icon} {comp.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">Tip: Drag from a node's edge handle to connect it to another node. Click "Validate Architecture" when ready to evaluate your design.</p>
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
            fitView
            proOptions={{ hideAttribution: true }}
            nodesConnectable={!submitted}
            nodesDraggable={!submitted}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>

      {/* Validation / Submit */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        {!submitted ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Place components and connect them, then validate your architecture.
            </p>
            <button
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50"
              disabled={nodes.length === 0}
              onClick={handleValidate}
            >
              Validate Architecture
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className={`font-semibold text-sm ${allPass ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {allPass ? '✓ Architecture validated successfully!' : '✗ Some checks failed'}
            </div>
            <div className="space-y-1.5">
              {validationResults.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className={r.pass ? 'text-green-600 dark:text-green-400' : 'text-destructive'}>
                    {r.pass ? '✓' : '✗'}
                  </span>
                  <span className={r.pass ? '' : 'text-muted-foreground'}>{r.check}</span>
                </div>
              ))}
            </div>
            <div className="text-sm text-muted-foreground mt-2">{lab.explanation}</div>
          </div>
        )}
      </div>
    </div>
  )
}

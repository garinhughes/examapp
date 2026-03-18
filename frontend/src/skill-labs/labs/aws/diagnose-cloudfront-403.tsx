import { useState, useCallback, useRef, useEffect } from 'react'
import ReactFlow, {
  Background,
  Controls,
  type Node,
  type Edge,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useExam } from '@/exam/ExamContext'
import { apiUrl } from '@/apiBase'
import type { DiagnoseLabDefinition, Inspection } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabComplete } from '../shared'

interface DiagnoseLabRunnerProps {
  lab: DiagnoseLabDefinition
  timed?: boolean
}

export function DiagnoseLabRunner({ lab, timed = true }: DiagnoseLabRunnerProps) {
  const { authFetch, user } = useExam()
  const completeWithGamification = useLabComplete(lab)

  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [timeLeft, setTimeLeft] = useState(lab.timeLimit)
  const [labPaused, setLabPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(Date.now())

  // Timer
  useEffect(() => {
    if (submitted || !timed || labPaused) return
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [submitted, timed, labPaused])

  useEffect(() => {
    if (timed && timeLeft === 0 && !submitted) handleSubmit()
  }, [timeLeft])

  const handleSubmit = useCallback(async () => {
    if (submitted) return
    setSubmitted(true)
    if (timerRef.current) clearInterval(timerRef.current)

    const correctAnswer = lab.answers.find((a) => a.correct)
    const correct = selectedAnswer === correctAnswer?.id
    setIsCorrect(correct)
    completeWithGamification(correct)

    const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000)

    if (user) {
      try {
        await authFetch(apiUrl(`/skill-labs/${encodeURIComponent(lab.id)}/attempt`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selectedAnswer: selectedAnswer || '',
            correct,
            timeTaken,
          }),
        })
      } catch {
        // Non-critical
      }
    }
  }, [submitted, lab, selectedAnswer, authFetch, user])

  // Build React Flow nodes and edges
  const rfNodes: Node[] = lab.nodes.map((n) => ({
    id: n.id,
    position: { x: n.x, y: n.y },
    data: { label: n.label },
    style: {
      background: selectedNode === n.id ? 'hsl(var(--primary))' : 'hsl(var(--card))',
      color: selectedNode === n.id ? 'hsl(var(--primary-foreground))' : 'hsl(var(--card-foreground))',
      border: `2px solid ${selectedNode === n.id ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
      borderRadius: '8px',
      padding: '12px 20px',
      fontWeight: 600,
      fontSize: '14px',
      cursor: 'pointer',
    },
  }))

  const rfEdges: Edge[] = lab.edges.map((e, i) => ({
    id: `e-${i}`,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: true,
    style: { stroke: 'hsl(var(--muted-foreground))' },
    labelStyle: { fontSize: '12px', fill: 'hsl(var(--muted-foreground))' },
  }))

  const inspection: Inspection | null = selectedNode ? lab.inspections[selectedNode] ?? null : null

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader title={lab.title} timed={timed} timeLeft={timeLeft} labId={lab.id} onPauseChange={setLabPaused} />

      {/* Main layout: diagram + inspection panel */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Diagram */}
        <div className="flex-1 rounded-lg border border-border bg-card overflow-hidden">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            onNodeClick={(_event, node) => setSelectedNode(node.id)}
            fitView
            proOptions={{ hideAttribution: true }}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={true}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>

        {/* Inspection panel */}
        <div className="w-80 shrink-0 rounded-lg border border-border bg-card p-4 overflow-y-auto">
          {inspection ? (
            <div>
              <h3 className="font-semibold text-base mb-3">{inspection.title}</h3>
              <div className="space-y-3">
                {inspection.details.map((d, i) => (
                  <div key={i}>
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{d.label}</div>
                    <div className="text-sm mt-0.5 font-mono bg-muted/50 rounded px-2 py-1">{d.value}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground flex items-center justify-center h-full">
              Click a node in the diagram to inspect its diagnostics.
            </div>
          )}
        </div>
      </div>

      {/* Answer section */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h3 className="font-semibold text-sm mb-3">What is the root cause?</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {lab.answers.map((answer) => {
            let cls = 'border border-border rounded-md px-4 py-2.5 text-sm text-left transition '
            if (submitted) {
              if (answer.correct) {
                cls += 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
              } else if (answer.id === selectedAnswer && !answer.correct) {
                cls += 'border-destructive bg-destructive/10 text-destructive'
              } else {
                cls += 'bg-muted/30 text-muted-foreground'
              }
            } else if (answer.id === selectedAnswer) {
              cls += 'border-primary bg-primary/10 text-primary'
            } else {
              cls += 'hover:bg-muted/50 cursor-pointer'
            }
            return (
              <button
                key={answer.id}
                className={cls}
                disabled={submitted}
                onClick={() => !submitted && setSelectedAnswer(answer.id)}
              >
                {answer.text}
              </button>
            )
          })}
        </div>

        {!submitted ? (
          <button
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!selectedAnswer}
            onClick={handleSubmit}
          >
            Submit Answer
          </button>
        ) : (
          <div className="space-y-2">
            <div className={`font-semibold text-sm ${isCorrect ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {isCorrect ? '✓ Correct!' : '✗ Incorrect'}
            </div>
            <div className="text-sm text-muted-foreground">
              {lab.explanation}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

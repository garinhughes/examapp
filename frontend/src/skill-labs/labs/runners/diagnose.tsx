import { useState, useCallback, useEffect } from 'react'
import ReactFlow, {
  Background,
  Controls,
  type Node,
  type Edge,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useExam } from '@/exam/ExamContext'
import type { DiagnoseLabDefinition, Inspection } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabSession } from '../useLabSession'
import { LabCompleteModal } from '../LabCompleteModal'
import { ExplanationBlock } from '../ExplanationBlock'

interface DiagnoseLabRunnerProps {
  lab: DiagnoseLabDefinition
  timed?: boolean
}

interface DiagnoseProgress {
  selectedNode: string | null
  selectedAnswer: string | null
  timeLeft: number
}

export function DiagnoseLabRunner({ lab, timed = true }: DiagnoseLabRunnerProps) {
  const { setRoute } = useExam()
  const session = useLabSession<DiagnoseProgress>({ lab, timed })

  const [selectedNode, setSelectedNode] = useState<string | null>(session.savedProgress?.selectedNode ?? null)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(session.savedProgress?.selectedAnswer ?? null)
  const [isCorrect, setIsCorrect] = useState(false)

  // Auto-save progress
  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ selectedNode, selectedAnswer, timeLeft: session.timeLeft })
  }, [selectedNode, selectedAnswer, session.timeLeft, session.submitted])

  // Auto-submit when timer expires
  useEffect(() => {
    if (timed && session.timeLeft === 0 && !session.submitted) doSubmit()
  }, [session.timeLeft])

  const doSubmit = useCallback(async () => {
    const correctAnswer = lab.answers.find((a) => a.correct)
    const correct = selectedAnswer === correctAnswer?.id
    setIsCorrect(correct)
    await session.finalize(correct, selectedAnswer || '')
  }, [lab, selectedAnswer, session.finalize])

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
      {session.showConfirmModal && (
        <LabCompleteModal
          title={lab.title}
          timeTaken={lab.timeLimit - session.timeLeft}
          timed={timed}
          onConfirm={() => { session.setShowConfirmModal(false); doSubmit() }}
          onCancel={() => session.setShowConfirmModal(false)}
        />
      )}

      <LabHeader
        title={lab.title}
        timed={timed}
        timeLeft={session.timeLeft}
        labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ selectedNode, selectedAnswer, timeLeft: session.timeLeft })}
        onCancelLab={session.submitted ? undefined : session.handleCancelLab}
      />

      {session.resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

      {/* Main layout: diagram + inspection panel */}
      <div className="flex gap-4 min-h-[500px]">
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
            if (session.submitted) {
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
                disabled={session.submitted}
                onClick={() => !session.submitted && setSelectedAnswer(answer.id)}
              >
                {answer.text}
              </button>
            )
          })}
        </div>

        {!session.submitted ? (
          <button
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!selectedAnswer}
            onClick={() => session.setShowConfirmModal(true)}
          >
            Submit Answer
          </button>
        ) : (
          <div className="space-y-3">
            <div className={`font-semibold text-sm ${isCorrect ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {isCorrect ? '✓ Correct!' : '✗ Incorrect'}
            </div>
            <ExplanationBlock text={lab.explanation} />
            <button
              onClick={() => setRoute('skill-labs')}
              className="mt-2 px-4 py-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted/50 transition"
            >
              Back to Skill Labs
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

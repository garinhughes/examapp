import { useState, useCallback, useEffect, useRef } from 'react'
import {
  DndContext, DragOverlay,
  PointerSensor, useSensor, useSensors,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, arrayMove, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Lightbulb, Play, Plus, RotateCcw, Terminal, X } from 'lucide-react'
import { ExplanationBlock } from '../ExplanationBlock'
import { MarkdownText } from '@/exam/utils'
import type { TerminalReplayLabDefinition, TerminalReplayCommand } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabSession } from '../useLabSession'
import { useExam } from '@/exam/ExamContext'

type TerminalLine = { type: 'input' | 'output' | 'error' | 'success'; text: string }
type AnimState = 'idle' | 'running' | 'failed' | 'complete'

interface TerminalReplayProgress {
  pool: string[]
  queue: string[]
  timeLeft: number
}

interface Props {
  lab: TerminalReplayLabDefinition
  timed?: boolean
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function SortableChip({ id, command, label, disabled, onAdd }: {
  id: string; command: string; label?: string; disabled: boolean; onAdd?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const interactive = !disabled
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(interactive ? listeners : {})}
      {...(interactive ? attributes : {})}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm font-mono transition select-none touch-none ${isDragging ? 'opacity-30' : 'hover:bg-muted/40'} ${interactive ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {interactive && (
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      )}
      <MarkdownText
        text={label ?? `\`${command}\``}
        className="flex-1 break-all leading-snug [&_p]:inline [&_p]:!mb-0 [&_code]:bg-zinc-100 [&_code]:dark:bg-zinc-800 [&_code]:text-rose-700 [&_code]:dark:text-rose-300 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:border [&_code]:border-zinc-200 [&_code]:dark:border-zinc-700"
      />
      {interactive && onAdd && (
        <button
          type="button"
          aria-label="Add to queue"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onAdd() }}
          className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

function QueueChip({ id, command, label, idx, disabled, onRemove }: {
  id: string; command: string; label?: string; idx: number; disabled: boolean; onRemove?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const interactive = !disabled
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(interactive ? listeners : {})}
      {...(interactive ? attributes : {})}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card text-sm font-mono transition select-none touch-none ${isDragging ? 'opacity-30' : 'hover:bg-muted/40'} ${interactive ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <span className="text-muted-foreground w-4 shrink-0 text-right">{idx + 1}.</span>
      {interactive && (
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
      )}
      <MarkdownText
        text={label ?? `\`${command}\``}
        className="flex-1 break-all leading-snug [&_p]:inline [&_p]:!mb-0 [&_code]:bg-zinc-100 [&_code]:dark:bg-zinc-800 [&_code]:text-rose-700 [&_code]:dark:text-rose-300 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:border [&_code]:border-zinc-200 [&_code]:dark:border-zinc-700"
      />
      {interactive && onRemove && (
        <button
          type="button"
          aria-label="Remove from queue"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}

function CommandPool({ items, cmdMap, disabled, onAdd }: {
  items: string[]
  cmdMap: TerminalReplayCommand[]
  disabled: boolean
  onAdd: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool' })
  return (
    <div className={`rounded-lg border ${isOver ? 'border-primary ring-1 ring-primary/20' : 'border-border'} bg-card flex flex-col transition`}>
      <div className="px-3 py-2 border-b border-border">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Available Commands</h3>
      </div>
      <div ref={setNodeRef} className="p-2">
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <div className="grid gap-1.5 grid-cols-1 md:grid-cols-2">
            {items.map((id) => {
              const cmd = cmdMap.find((c) => c.id === id)!
              return <SortableChip key={id} id={id} command={cmd.command} label={cmd.label} disabled={disabled} onAdd={() => onAdd(id)} />
            })}
          </div>
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground italic text-center py-4">All commands queued</p>
          )}
        </SortableContext>
      </div>
    </div>
  )
}

function CommandQueue({ items, cmdMap, disabled, onRemove }: {
  items: string[]
  cmdMap: TerminalReplayCommand[]
  disabled: boolean
  onRemove: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'queue' })
  return (
    <div className={`rounded-lg border ${isOver ? 'border-primary ring-1 ring-primary/20' : 'border-border'} bg-card flex flex-col transition`}>
      <div className="px-3 py-2 border-b border-border flex items-center gap-2">
        <Terminal className="w-3.5 h-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Command Queue</h3>
        <span className="ml-auto text-xs text-muted-foreground">{items.length} queued</span>
      </div>
      <div ref={setNodeRef} className="p-2">
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5 min-h-[56px]">
            {items.map((id, idx) => {
              const cmd = cmdMap.find((c) => c.id === id)!
              return (
                <QueueChip
                  key={id}
                  id={id}
                  command={cmd.command}
                  label={cmd.label}
                  idx={idx}
                  disabled={disabled}
                  onRemove={() => onRemove(id)}
                />
              )
            })}
            {items.length === 0 && (
              <div className="text-xs text-muted-foreground italic text-center py-6 border border-dashed border-border/60 rounded-md">
                Drag commands here to queue them
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}

export function TerminalReplayRunner({ lab, timed = true }: Props) {
  const { setRoute } = useExam()
  const session = useLabSession<TerminalReplayProgress>({ lab, timed })
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const cancelRef = useRef(false)
  const terminalEndRef = useRef<HTMLDivElement>(null)

  const [containers, setContainers] = useState(() => {
    if (session.savedProgress) {
      return { pool: session.savedProgress.pool, queue: session.savedProgress.queue }
    }
    return { pool: shuffleArray(lab.commands.map((c) => c.id)), queue: [] as string[] }
  })
  const [activeId, setActiveId] = useState<string | null>(null)
  const [termLines, setTermLines] = useState<TerminalLine[]>([])
  const [animState, setAnimState] = useState<AnimState>('idle')
  const [attempts, setAttempts] = useState(0)
  const [tipOpen, setTipOpen] = useState(false)

  useEffect(() => {
    if (session.restartKey === 0) return
    setContainers({ pool: shuffleArray(lab.commands.map((c) => c.id)), queue: [] })
    setActiveId(null)
    setTermLines([])
    setAnimState('idle')
    setAttempts(0)
    setTipOpen(false)
    cancelRef.current = false
  }, [session.restartKey])

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ pool: containers.pool, queue: containers.queue, timeLeft: session.timeLeft })
  }, [containers, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !session.submitted) {
      cancelRef.current = true
      session.finalize(false, containers.queue.join(','))
    }
  }, [session.timeLeft])

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [termLines])

  const findContainer = useCallback((id: string) => {
    if (id === 'pool' || id === 'queue') return id
    if (containers.pool.includes(id)) return 'pool'
    if (containers.queue.includes(id)) return 'queue'
    return undefined
  }, [containers])

  const onDragStart = useCallback((e: DragStartEvent) => setActiveId(String(e.active.id)), [])

  const onDragEnd = useCallback((e: DragEndEvent) => {
    setActiveId(null)
    if (animState === 'running' || session.submitted) return
    // Clear terminal output when user edits the queue after a failed run
    if (animState === 'failed') {
      setTermLines([])
      setAnimState('idle')
    }
    const { active, over } = e
    if (!over) return

    const activeId = String(active.id)
    const overId   = String(over.id)
    if (activeId === overId) return

    const src = findContainer(activeId)
    if (!src) return
    const dst = (overId === 'pool' || overId === 'queue') ? overId : findContainer(overId)
    if (!dst) return
    session.markDirty()

    setContainers((prev) => {
      const pool  = [...prev.pool]
      const queue = [...prev.queue]
      const getArr = (k: string) => k === 'pool' ? pool : queue

      if (src === dst) {
        const arr = getArr(src)
        const oldIdx = arr.indexOf(activeId)
        const newIdx = arr.indexOf(overId)
        if (oldIdx !== newIdx) {
          const moved = arrayMove(arr, oldIdx, newIdx)
          if (src === 'pool') pool.splice(0, pool.length, ...moved)
          else queue.splice(0, queue.length, ...moved)
        }
      } else {
        const srcArr = getArr(src).filter((id) => id !== activeId)
        const dstArr = [...getArr(dst)]
        if (overId === 'pool' || overId === 'queue') {
          dstArr.push(activeId)
        } else {
          const idx = dstArr.indexOf(overId)
          dstArr.splice(idx >= 0 ? idx : dstArr.length, 0, activeId)
        }
        if (src === 'pool') pool.splice(0, pool.length, ...srcArr); else queue.splice(0, queue.length, ...srcArr)
        if (dst === 'pool') pool.splice(0, pool.length, ...dstArr); else queue.splice(0, queue.length, ...dstArr)
      }
      return { pool, queue }
    })
  }, [animState, findContainer, session.submitted])

  const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

  const runAnimation = useCallback(async () => {
    if (animState !== 'idle' || containers.queue.length === 0 || session.submitted) return
    cancelRef.current = false
    setAnimState('running')
    setAttempts((a) => a + 1)
    session.setLabPaused(true)

    const lines: TerminalLine[] = []
    let failed = false
    const seen = new Set<string>()

    for (let i = 0; i < containers.queue.length; i++) {
      if (cancelRef.current) return
      const cmdId = containers.queue[i]
      const cmd = lab.commands.find((c) => c.id === cmdId)!

      lines.push({ type: 'input', text: `${lab.prompt} ${cmd.command}` })
      setTermLines([...lines])
      await delay(250)
      if (cancelRef.current) return

      const depsmet = !cmd.mustFollowIds || cmd.mustFollowIds.every((dep) => seen.has(dep))
      const isCorrect = !cmd.isDistractor && depsmet
      seen.add(cmdId)
      if (isCorrect) {
        for (const line of cmd.successOutput.split('\n').filter(Boolean)) {
          lines.push({ type: 'output', text: line })
          setTermLines([...lines])
          await delay(80)
          if (cancelRef.current) return
        }
        await delay(150)
      } else {
        lines.push({ type: 'error', text: cmd.errorOutput })
        setTermLines([...lines])
        failed = true
        break
      }
    }

    session.setLabPaused(false)
    if (!failed) {
      const requiredIds = new Set(lab.commands.filter((c) => !c.isDistractor).map((c) => c.id))
      const missingId = [...requiredIds].find((id) => !seen.has(id))
      if (missingId) {
        const missing = lab.commands.find((c) => c.id === missingId)!
        lines.push({ type: 'error', text: `Incomplete: \`${missing.command}\` was not in the queue but is required.` })
        setTermLines([...lines])
        setAnimState('failed')
      } else {
        lines.push({ type: 'success', text: '✓ All commands completed successfully.' })
        setTermLines([...lines])
        setAnimState('complete')
      }
    } else {
      setAnimState('failed')
    }
  }, [animState, containers.queue, lab, session])

  const handleReset = useCallback(() => {
    cancelRef.current = true
    setTermLines([])
    setAnimState('idle')
    setTipOpen(false)
    session.setLabPaused(false)
    setContainers((prev) => ({
      pool: shuffleArray([...prev.pool, ...prev.queue]),
      queue: [],
    }))
  }, [session])

  const activeCmd = activeId ? lab.commands.find((c) => c.id === activeId) : null

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader
        title={lab.title}
        timed={timed}
        timeLeft={session.timeLeft}
        subtitle={lab.scenario}
        labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ pool: containers.pool, queue: containers.queue, timeLeft: session.timeLeft })}
        onRatingClose={() => setRoute('skill-labs')}
      />
      {session.resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-y-auto">
          <CommandPool
            items={containers.pool}
            cmdMap={lab.commands}
            disabled={animState === 'running' || session.submitted}
            onAdd={(id) => {
              if (animState === 'running' || session.submitted) return
              if (animState === 'failed') { setTermLines([]); setAnimState('idle') }
              setContainers((prev) => ({
                pool: prev.pool.filter((p) => p !== id),
                queue: [...prev.queue, id],
              }))
            }}
          />
          <CommandQueue
            items={containers.queue}
            cmdMap={lab.commands}
            disabled={animState === 'running' || session.submitted}
            onRemove={(id) => {
              if (animState === 'running' || session.submitted) return
              if (animState === 'failed') { setTermLines([]); setAnimState('idle') }
              setContainers((prev) => ({
                pool: [...prev.pool, id],
                queue: prev.queue.filter((q) => q !== id),
              }))
            }}
          />
        </div>

        <DragOverlay>
          {activeCmd && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary bg-primary/10 text-xs font-mono shadow-lg cursor-grabbing">
              <GripVertical className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>{activeCmd.command}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Terminal output */}
      {termLines.length > 0 && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-4 font-mono text-xs max-h-44 overflow-y-auto">
          {termLines.map((line, i) => {
            const colorCls =
              line.type === 'input'   ? 'text-green-400' :
              line.type === 'error'   ? 'text-red-400' :
              line.type === 'success' ? 'text-emerald-400 font-semibold mt-1' :
              'text-zinc-300'
            // Input lines (the prompt + typed command) stay verbatim — markdown would mangle shell syntax.
            // Output/error/success lines render markdown so command definitions can use **bold**, `inline code`, etc.
            if (line.type === 'input') {
              return <div key={i} className={colorCls}>{line.text}</div>
            }
            return (
              <MarkdownText
                key={i}
                text={line.text}
                className={`${colorCls} [&_p]:!mb-0 [&_strong]:!text-inherit [&_code]:!bg-zinc-800 [&_code]:!text-rose-300 [&_code]:!border-zinc-700 [&_ul]:!mb-0 [&_ol]:!mb-0`}
              />
            )
          })}
          <div ref={terminalEndRef} />
        </div>
      )}

      {session.submitted && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-3">
          <div className={`font-semibold text-sm ${animState === 'complete' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
            {animState === 'complete' ? '✓ All commands executed in the correct order!' : '✗ Time expired before completing'}
          </div>
          <ExplanationBlock text={lab.explanation} />
        </div>
      )}

      {!session.submitted && animState === 'failed' && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-destructive font-medium">
              Command failed. Rearrange the queue and try again{attempts > 1 ? ` (attempt ${attempts})` : ''}.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-card font-medium text-sm hover:bg-muted/50 transition text-muted-foreground"
                onClick={() => setTipOpen((o) => !o)}
              >
                <Lightbulb className="w-4 h-4" />
                {tipOpen ? 'Hide tip' : 'Show tip'}
              </button>
              <button
                className="flex items-center gap-2 px-4 py-2 rounded-md border border-border bg-card font-medium text-sm hover:bg-muted/50 transition"
                onClick={handleReset}
              >
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
            </div>
          </div>
          {tipOpen && (
            <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-medium">Things to check:</p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Read the error output in the terminal — it describes what was missing at that point.</li>
                <li>Is the failed command in the right position, or does something else need to run first?</li>
                <li>Have you included any distractors? Not every listed command should be in the queue.</li>
                <li>Dependencies must be satisfied before you run a command that relies on them.</li>
              </ul>
            </div>
          )}
        </div>
      )}

      {!session.submitted && animState === 'running' && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <p className="text-sm text-muted-foreground animate-pulse">Running commands…</p>
        </div>
      )}

      {!session.submitted && animState !== 'complete' && (
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <span className="text-xs text-muted-foreground mr-auto">
            {containers.queue.length === 0
              ? 'Drag commands into the queue, in order.'
              : `${containers.queue.length} command${containers.queue.length !== 1 ? 's' : ''} queued.`}
          </span>
          <button
            onClick={session.handleCancelLab}
            className="px-3 py-2 rounded-md text-sm border border-border bg-card text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition"
          >
            Cancel Lab
          </button>
          <button
            onClick={runAnimation}
            disabled={containers.queue.length === 0 || animState === 'running'}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Play className="w-4 h-4" />
            {animState === 'running' ? 'Running…' : 'Run'}
          </button>
        </div>
      )}

      {!session.submitted && animState === 'complete' && (
        <div className="flex items-center justify-end gap-2 flex-wrap pt-1">
          <button
            onClick={session.handleCancelLab}
            className="px-3 py-2 rounded-md text-sm border border-border bg-card text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition"
          >
            Cancel Lab
          </button>
          <button
            onClick={() => session.finalize(true, containers.queue.join(','))}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition inline-flex items-center gap-1.5"
          >
            <Play className="w-4 h-4" />
            Complete Lab
          </button>
        </div>
      )}
    </div>
  )
}

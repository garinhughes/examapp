import { useState, useRef, useEffect, useCallback } from 'react'
import { Lightbulb } from 'lucide-react'
import { useExam } from '@/exam/ExamContext'
import { MarkdownText } from '@/exam/utils'
import type {
  CommandTerminalLabDefinition,
  CommandTerminalStep,
} from '../../types'
import { LabHeader } from '../LabHeader'
import { ExplanationBlock } from '../ExplanationBlock'
import { useLabSession } from '../useLabSession'
import { LabCompleteModal } from '../LabCompleteModal'

interface Line {
  kind: 'input' | 'output' | 'error' | 'success' | 'info'
  text: string
}

interface Progress {
  stepIndex: number
  lines: Line[]
  history: string[]
  timeLeft: number
}

function tokenize(raw: string, shortFlagsWithValue: Set<string> = new Set()): string[] {
  const tokens: string[] = []
  for (const p of raw.trim().split(/\s+/).filter(Boolean)) {
    if (p.startsWith('--') && p.includes('=')) {
      const eq = p.indexOf('=')
      tokens.push(p.slice(0, eq), p.slice(eq + 1))
    } else if (p.length > 2 && p.startsWith('-') && !p.startsWith('--')) {
      if (shortFlagsWithValue.has(p.slice(0, 2))) {
        // `-n50` -> `-n`, `50`
        tokens.push(p.slice(0, 2), p.slice(2))
      } else {
        // `-aG` -> `-a`, `-G`
        for (const ch of p.slice(1)) tokens.push(`-${ch}`)
      }
    } else {
      tokens.push(p)
    }
  }
  return tokens
}

type ValidationResult = { ok: true } | { ok: false; reason: string }

function validate(input: string, step: CommandTerminalStep): ValidationResult {
  const shortFlagsWithValue = new Set<string>()
  for (const req of step.requirements) {
    if (req.kind === 'flag-value') {
      for (const v of req.variants) {
        if (v.length === 2 && v.startsWith('-') && !v.startsWith('--')) shortFlagsWithValue.add(v)
      }
    }
  }
  const tokens = tokenize(input, shortFlagsWithValue)
  if (tokens.length === 0) return { ok: false, reason: 'No command entered.' }
  if (tokens[0] !== step.program) {
    return { ok: false, reason: `Expected the command to start with \`${step.program}\`.` }
  }
  const remaining = tokens.slice(1)
  const consumed = new Set<number>()

  for (const req of step.requirements) {
    let matched = false
    for (let i = 0; i < remaining.length; i++) {
      if (consumed.has(i)) continue
      const tok = remaining[i]
      if (req.kind === 'flag' || req.kind === 'positional') {
        if (req.variants.includes(tok)) {
          consumed.add(i); matched = true; break
        }
      } else {
        // flag-value
        if (req.variants.includes(tok)) {
          const nextIdx = i + 1
          if (nextIdx < remaining.length && !consumed.has(nextIdx) && remaining[nextIdx] === req.value) {
            consumed.add(i); consumed.add(nextIdx); matched = true; break
          }
        }
      }
    }
    if (!matched) {
      return { ok: false, reason: `Missing required argument: ${req.description}` }
    }
  }

  for (let i = 0; i < remaining.length; i++) {
    if (!consumed.has(i)) {
      return { ok: false, reason: `Unexpected token \`${remaining[i]}\`. Remove flags or arguments that the task does not need.` }
    }
  }
  return { ok: true }
}

interface Props {
  lab: CommandTerminalLabDefinition
  timed?: boolean
}

export function CommandTerminalRunner({ lab, timed = true }: Props) {
  const { setRoute } = useExam()
  const session = useLabSession<Progress>({ lab, timed })

  const defaultLines: Line[] = [
    { kind: 'info', text: '# RHEL 10 practice terminal. Type each command to complete the task.' },
    { kind: 'info', text: '# Tip: type `<command> --help` to list available flags. Not every flag you see is needed.' },
    { kind: 'output', text: '' },
  ]

  const [lines, setLines] = useState<Line[]>(session.savedProgress?.lines ?? defaultLines)
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>(session.savedProgress?.history ?? [])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const [stepIndex, setStepIndex] = useState<number>(session.savedProgress?.stepIndex ?? 0)
  const [hintOpen, setHintOpen] = useState(false)

  const finalizedRef = useRef(false)
  const termEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const allDone = stepIndex >= lab.steps.length
  const currentStep = allDone ? undefined : lab.steps[stepIndex]

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ stepIndex, lines, history, timeLeft: session.timeLeft })
  }, [stepIndex, lines, history, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !session.submitted && !finalizedRef.current) {
      finalizedRef.current = true
      session.finalize(false, `timeout@step${stepIndex + 1}`)
    }
  }, [session.timeLeft])

  useEffect(() => {
    termEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const printHelp = useCallback((out: Line[], step: CommandTerminalStep) => {
    out.push({ kind: 'output', text: `Usage: ${step.program} [OPTIONS] ...` })
    out.push({ kind: 'output', text: '' })
    out.push({ kind: 'output', text: 'Options:' })
    const merged = [
      ...step.requirements.map((r) => r.description),
      ...step.distractors.map((d) => d.description),
    ].sort()
    for (const desc of merged) {
      out.push({ kind: 'output', text: `  ${desc}` })
    }
    out.push({ kind: 'output', text: '' })
    out.push({ kind: 'info', text: '# Only a subset of these flags is required for the current task.' })
    out.push({ kind: 'output', text: '' })
  }, [])

  const handleSubmit = useCallback((raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed || !currentStep || session.submitted) return
    setHistory((h) => [...h, trimmed])
    setHistoryIdx(-1)
    setInput('')

    if (trimmed === 'clear') {
      setLines(defaultLines)
      return
    }

    const newLines: Line[] = [{ kind: 'input', text: `${lab.prompt} ${trimmed}` }]
    const toks = tokenize(trimmed)

    if (toks[0] === currentStep.program && toks.includes('--help')) {
      printHelp(newLines, currentStep)
      setLines((prev) => [...prev, ...newLines])
      return
    }

    const result = validate(trimmed, currentStep)
    if (result.ok) {
      for (const out of currentStep.successOutput.split('\n')) {
        newLines.push({ kind: 'output', text: out })
      }
      const nextIdx = stepIndex + 1
      const isLast = nextIdx >= lab.steps.length
      newLines.push({
        kind: 'success',
        text: isLast
          ? `✓ Step ${stepIndex + 1} complete.`
          : `✓ Step ${stepIndex + 1} complete. The next step is available above.`,
      })
      newLines.push({ kind: 'output', text: '' })
      if (isLast) {
        newLines.push({ kind: 'success', text: '✓ All steps complete. Well done!' })
        setLines((prev) => [...prev, ...newLines])
        setStepIndex(nextIdx)
        if (!finalizedRef.current) {
          finalizedRef.current = true
          session.finalize(true, 'all-steps-complete')
        }
      } else {
        setLines((prev) => [...prev, ...newLines])
        setStepIndex(nextIdx)
        setHintOpen(false)
      }
    } else {
      newLines.push({ kind: 'error', text: result.reason })
      newLines.push({ kind: 'info', text: `# Try again. Use \`${currentStep.program} --help\` to list available flags.` })
      newLines.push({ kind: 'output', text: '' })
      setLines((prev) => [...prev, ...newLines])
    }
  }, [currentStep, stepIndex, lab.prompt, lab.steps.length, printHelp, session])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit(input)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.length > 0) {
        const ni = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1)
        setHistoryIdx(ni); setInput(history[ni])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIdx === -1) return
      const ni = historyIdx + 1
      if (ni >= history.length) { setHistoryIdx(-1); setInput('') }
      else { setHistoryIdx(ni); setInput(history[ni]) }
    }
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {session.showConfirmModal && (
        <LabCompleteModal
          title={lab.title}
          timeTaken={session.timeLimit - session.timeLeft}
          timed={timed}
          onConfirm={() => {
            session.setShowConfirmModal(false)
            if (!finalizedRef.current) {
              finalizedRef.current = true
              session.finalize(allDone, allDone ? 'all-steps-complete' : `gave-up@step${stepIndex + 1}`)
            }
          }}
          onCancel={() => session.setShowConfirmModal(false)}
        />
      )}

      <LabHeader
        title={lab.title}
        timed={timed}
        timeLeft={session.timeLeft}
        subtitle={lab.scenario}
        labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ stepIndex, lines, history, timeLeft: session.timeLeft })}
        onCancelLab={session.submitted ? undefined : session.handleCancelLab}
      />

      {session.resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

      {currentStep && !session.submitted && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs font-semibold text-primary">Step {stepIndex + 1} of {lab.steps.length}</span>
            <span className="text-xs text-muted-foreground">Flags can be supplied in any order.</span>
            {currentStep.hint && (
              <button
                onClick={() => setHintOpen((v) => !v)}
                className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted/50 transition"
              >
                <Lightbulb className="w-3 h-3" /> {hintOpen ? 'Hide hint' : 'Show hint'}
              </button>
            )}
          </div>
          <MarkdownText
            text={currentStep.task}
            className="text-sm [&_p]:!my-0 [&_code]:!bg-muted [&_code]:!px-1 [&_code]:!py-0.5 [&_code]:!rounded"
          />
          {hintOpen && currentStep.hint && (
            <div className="mt-3 p-3 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/40 text-xs text-amber-800 dark:text-amber-300">
              <MarkdownText
                text={currentStep.hint}
                className="[&_p]:!my-0 [&_code]:!bg-amber-100 dark:[&_code]:!bg-amber-900/40 [&_code]:!px-1 [&_code]:!py-0.5 [&_code]:!rounded [&_code]:!text-inherit"
              />
            </div>
          )}
        </div>
      )}

      <div
        className="flex-1 min-h-[320px] rounded-lg border border-border bg-[#1e1e1e] text-green-300 font-mono text-sm overflow-y-auto p-4 cursor-text"
        onClick={() => { if (!window.getSelection()?.toString()) inputRef.current?.focus() }}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap ${
              line.kind === 'input' ? 'text-cyan-400' :
              line.kind === 'error' ? 'text-red-400' :
              line.kind === 'success' ? 'text-emerald-400' :
              line.kind === 'info' ? 'text-zinc-500' :
              'text-green-300'
            }`}
          >
            {line.text}
          </div>
        ))}
        {!session.submitted && !allDone && (
          <div className="flex items-center">
            <span className="text-cyan-400 whitespace-pre">{lab.prompt} </span>
            <input
              ref={inputRef}
              className="flex-1 bg-transparent outline-none border-none text-green-300 font-mono text-sm caret-green-300"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
            />
          </div>
        )}
        <div ref={termEndRef} />
      </div>

      {session.submitted && (
        <div className="rounded-lg border border-border bg-card p-4 shadow-sm space-y-3">
          <div className={`font-semibold text-sm ${allDone ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
            {allDone ? '✓ Lab complete' : `Lab ended at step ${stepIndex + 1} of ${lab.steps.length}`}
          </div>
          {!allDone && (
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="font-semibold">Reference answers:</div>
              {lab.steps.map((s, i) => (
                <div key={s.id} className="font-mono">
                  {i + 1}. <span className="text-foreground">{s.canonicalCommand}</span>
                </div>
              ))}
            </div>
          )}
          <ExplanationBlock text={lab.explanation} />
          <button
            onClick={() => setRoute('skill-labs')}
            className="mt-2 px-4 py-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition"
          >
            Back to Skill Labs
          </button>
        </div>
      )}
    </div>
  )
}

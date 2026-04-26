import { useState, useRef, useEffect, useCallback } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { CliLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { ExplanationBlock } from '../ExplanationBlock'
import { useLabSession } from '../useLabSession'
import { LabCheckActions } from '../LabCheckActions'
import { useExam } from '@/exam/ExamContext'

interface CliLabRunnerProps {
  lab: CliLabDefinition
  timed?: boolean
}

interface TerminalLine {
  type: 'prompt' | 'output' | 'error'
  text: string
}

interface CliProgress {
  lines: TerminalLine[]
  commandHistory: string[]
  selectedAnswer: string | null
  input: string
  timeLeft: number
}

export function CliLabRunner({ lab, timed = true }: CliLabRunnerProps) {
  const { setRoute } = useExam()
  const session = useLabSession<CliProgress>({ lab, timed })

  const PROMPT = lab.prompt ?? 'aws-user@lab:~$ '

  const defaultLines: TerminalLine[] = [
    { type: 'output', text: '# This is not a real terminal. A limited set of commands is available.' },
    { type: 'output', text: "# Type 'help' to list commands, or 'clear' to reset the screen." },
    { type: 'output', text: '' },
  ]

  const [lines, setLines] = useState<TerminalLine[]>(session.savedProgress?.lines ?? defaultLines)
  const [input, setInput] = useState(session.savedProgress?.input ?? '')
  const [commandHistory, setCommandHistory] = useState<string[]>(session.savedProgress?.commandHistory ?? [])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(session.savedProgress?.selectedAnswer ?? null)
  const [checked, setChecked] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)

  const terminalEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const commandMap = useRef(
    new Map(lab.commands.map((c) => [c.command.trim().toLowerCase(), c.output]))
  ).current

  useEffect(() => {
    if (session.restartKey === 0) return
    setLines(defaultLines)
    setInput('')
    setCommandHistory([])
    setHistoryIndex(-1)
    setSelectedAnswer(null)
    setChecked(false)
    setIsCorrect(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.restartKey])

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ lines, commandHistory, selectedAnswer, input, timeLeft: session.timeLeft })
  }, [lines, commandHistory, selectedAnswer, input, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !checked) handleCheck()
  }, [session.timeLeft])

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  function applyJq(raw: string, jqArg: string): string {
    try {
      const parsed = JSON.parse(raw)
      if (jqArg === '' || jqArg === '.') return JSON.stringify(parsed, null, 4)
      const key = jqArg.startsWith('.') ? jqArg.slice(1) : jqArg
      if (key in parsed) {
        const val = parsed[key]
        return typeof val === 'object' ? JSON.stringify(val, null, 4) : String(val)
      }
      return 'null'
    } catch {
      return raw
    }
  }

  function resolveCommand(input: string): { baseCmd: string; output: string | undefined } {
    const pipeIdx = input.indexOf('|')
    if (pipeIdx === -1) {
      const base = input.toLowerCase()
      return { baseCmd: base, output: commandMap.get(base) }
    }
    const base = input.slice(0, pipeIdx).trim().toLowerCase()
    const pipeCmd = input.slice(pipeIdx + 1).trim().toLowerCase()
    const raw = commandMap.get(base)
    if (raw === undefined) return { baseCmd: base, output: undefined }
    if (pipeCmd.startsWith('jq')) {
      const jqArg = pipeCmd.slice(2).trim()
      return { baseCmd: base, output: applyJq(raw, jqArg) }
    }
    return { baseCmd: base, output: raw }
  }

  const handleCommand = useCallback((cmd: string) => {
    const trimmed = cmd.trim()
    if (!trimmed) return
    session.markDirty()

    setCommandHistory((prev) => [...prev, trimmed])
    setHistoryIndex(-1)

    const newLines: TerminalLine[] = [{ type: 'prompt', text: `${PROMPT}${trimmed}` }]

    if (trimmed.toLowerCase() === 'help') {
      const categorized = new Map<string, string[]>()
      const uncategorized: string[] = []
      for (const cmd of lab.commands) {
        if (cmd.category) {
          if (!categorized.has(cmd.category)) categorized.set(cmd.category, [])
          categorized.get(cmd.category)!.push(cmd.command)
        } else {
          uncategorized.push(cmd.command)
        }
      }
      const hasCategories = categorized.size > 0
      newLines.push({ type: 'output', text: hasCategories ? 'Available command categories:' : 'Available commands:' })
      newLines.push({ type: 'output', text: '' })
      for (const [cat, cmds] of categorized) {
        newLines.push({ type: 'output', text: `  ${cat}` })
        for (const cmd of cmds) newLines.push({ type: 'output', text: `    ${cmd}` })
        newLines.push({ type: 'output', text: '' })
      }
      if (uncategorized.length > 0) {
        if (hasCategories) newLines.push({ type: 'output', text: '  Other' })
        for (const cmd of uncategorized) newLines.push({ type: 'output', text: `  ${cmd}` })
        newLines.push({ type: 'output', text: '' })
      }
      newLines.push({ type: 'output', text: 'Builtins: help, clear' })
    } else if (trimmed.toLowerCase() === 'clear') {
      setLines(defaultLines)
      setInput('')
      return
    } else {
      const { output } = resolveCommand(trimmed)
      if (output !== undefined) {
        output.split('\n').forEach((line) => {
          newLines.push({ type: 'output', text: line })
        })
      } else {
        newLines.push({ type: 'error', text: `bash: ${trimmed.split(' ')[0]}: command not found or not available in this environment` })
        newLines.push({ type: 'output', text: '' })
      }
    }

    setLines((prev) => [...prev, ...newLines])
    setInput('')
  }, [commandMap, lab.commands])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCommand(input)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1)
        setHistoryIndex(newIndex)
        setInput(commandHistory[newIndex])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex === -1) return
      const newIndex = historyIndex + 1
      if (newIndex >= commandHistory.length) {
        setHistoryIndex(-1)
        setInput('')
      } else {
        setHistoryIndex(newIndex)
        setInput(commandHistory[newIndex])
      }
    }
  }

  const handleCheck = useCallback(() => {
    if (checked) return
    const correctAnswer = lab.answers.find((a) => a.correct)
    const correct = selectedAnswer === correctAnswer?.id
    setIsCorrect(correct)
    setChecked(true)
  }, [checked, lab, selectedAnswer])

  const handleComplete = useCallback(async () => {
    await session.finalize(isCorrect, selectedAnswer || '')
  }, [session.finalize, selectedAnswer, isCorrect])

  return (
    <div className="flex flex-col h-full gap-4">
      <LabHeader
        title={lab.title}
        timed={timed}
        timeLeft={session.timeLeft}
        subtitle={lab.scenario}
        labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ lines, commandHistory, selectedAnswer, input, timeLeft: session.timeLeft })}
        onRatingClose={() => setRoute('skill-labs')}
      />

      {session.resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

      {/* Terminal */}
      <div
        className="flex-1 min-h-0 rounded-lg border border-border bg-[#1e1e1e] text-green-400 font-mono text-sm overflow-y-auto p-4 cursor-text"
        onClick={() => { if (!window.getSelection()?.toString()) inputRef.current?.focus() }}
      >
        {lines.map((line, i) => (
          <div key={i} className={`whitespace-pre-wrap ${
            line.type === 'prompt' ? 'text-cyan-400' :
            line.type === 'error' ? 'text-red-400' :
            'text-green-300'
          }`}>
            {line.text}
          </div>
        ))}
        {!checked && (
          <div className="flex items-center">
            <span className="text-cyan-400 whitespace-pre">{PROMPT}</span>
            <input
              ref={inputRef}
              className="flex-1 bg-transparent outline-none border-none text-green-400 font-mono text-sm caret-green-400"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        )}
        <div ref={terminalEndRef} />
      </div>

      {/* Answer panel */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h3 className="font-semibold text-sm mb-3">What is the root cause?</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {lab.answers.map((answer) => {
            let cls = 'border border-border rounded-md px-4 py-2.5 text-sm text-left transition '
            if (checked) {
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
                disabled={checked}
                onClick={() => { if (!checked) { session.markDirty(); setSelectedAnswer(answer.id) } }}
              >
                {answer.text}
              </button>
            )
          })}
        </div>

        {checked && (
          <div className="space-y-3">
            <div className={`inline-flex items-center gap-1.5 font-semibold text-sm ${isCorrect ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
              {isCorrect ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
              {isCorrect ? 'Correct!' : 'Incorrect'}
            </div>
            <ExplanationBlock text={lab.explanation} />
          </div>
        )}
      </div>

      <LabCheckActions
        checked={checked}
        isCorrect={isCorrect}
        submitted={session.submitted}
        canCheck={!!selectedAnswer}
        onCheck={handleCheck}
        onComplete={handleComplete}
        onRetry={session.restart}
        onCancel={session.handleCancelLab}
      />
    </div>
  )
}

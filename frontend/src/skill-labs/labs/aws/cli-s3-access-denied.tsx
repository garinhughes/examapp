import { useState, useRef, useEffect, useCallback } from 'react'
import { useExam } from '@/exam/ExamContext'
import { apiUrl } from '@/apiBase'
import type { CliLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabComplete } from '../shared'
import { useLabProgress } from '../useLabProgress'
import { LabCompleteModal } from '../LabCompleteModal'

interface CliLabRunnerProps {
  lab: CliLabDefinition
  timed?: boolean
}

interface TerminalLine {
  type: 'prompt' | 'output' | 'error'
  text: string
}

const PROMPT = 'aws-user@lab:~$ '

interface CliProgress {
  lines: TerminalLine[]
  commandHistory: string[]
  selectedAnswer: string | null
  timeLeft: number
}

export function CliLabRunner({ lab, timed = true }: CliLabRunnerProps) {
  const { authFetch, user, setRoute } = useExam()
  const completeWithGamification = useLabComplete(lab)
  const { savedProgress, saveProgress, clearProgress } = useLabProgress<CliProgress>(lab.id, timed)

  const defaultLines: TerminalLine[] = [
    { type: 'output', text: `Lab: ${lab.title}` },
    { type: 'output', text: lab.scenario },
    { type: 'output', text: '' },
    { type: 'output', text: 'Type AWS CLI commands to investigate. Type "help" for available commands.' },
    { type: 'output', text: '' },
  ]

  // Terminal state
  const [lines, setLines] = useState<TerminalLine[]>(savedProgress?.lines ?? defaultLines)
  const [input, setInput] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>(savedProgress?.commandHistory ?? [])
  const [historyIndex, setHistoryIndex] = useState(-1)

  // Answer state
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(savedProgress?.selectedAnswer ?? null)
  const [submitted, setSubmitted] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [resumeNotice, setResumeNotice] = useState(savedProgress !== null)

  // Timer
  const [timeLeft, setTimeLeft] = useState(savedProgress?.timeLeft ?? lab.timeLimit)
  const [labPaused, setLabPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(Date.now())

  const terminalEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Build command lookup map
  const commandMap = useRef(
    new Map(lab.commands.map((c) => [c.command.trim().toLowerCase(), c.output]))
  ).current

  // Auto-dismiss resume notice
  useEffect(() => {
    if (!resumeNotice) return
    const t = setTimeout(() => setResumeNotice(false), 3000)
    return () => clearTimeout(t)
  }, [resumeNotice])

  // Auto-save progress
  useEffect(() => {
    if (submitted) return
    saveProgress({ lines, commandHistory, selectedAnswer, timeLeft })
  }, [lines, commandHistory, selectedAnswer, timeLeft, submitted])

  /** Simulate `| jq` piping: pretty-print JSON, optionally extract a top-level key */
  function applyJq(raw: string, jqArg: string): string {
    try {
      const parsed = JSON.parse(raw)
      if (jqArg === '' || jqArg === '.') {
        return JSON.stringify(parsed, null, 4)
      }
      const key = jqArg.startsWith('.') ? jqArg.slice(1) : jqArg
      if (key in parsed) {
        const val = parsed[key]
        return typeof val === 'object' ? JSON.stringify(val, null, 4) : String(val)
      }
      return `null`
    } catch {
      return raw
    }
  }

  /** Resolve a command string, handling `| jq` pipes */
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
    if (timed && timeLeft === 0 && !submitted) doSubmit()
  }, [timeLeft])

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const handleCommand = useCallback((cmd: string) => {
    const trimmed = cmd.trim()
    if (!trimmed) return

    setCommandHistory((prev) => [...prev, trimmed])
    setHistoryIndex(-1)

    const newLines: TerminalLine[] = [{ type: 'prompt', text: `${PROMPT}${trimmed}` }]

    if (trimmed.toLowerCase() === 'help') {
      newLines.push({ type: 'output', text: 'Available commands:' })
      for (const c of lab.commands) {
        newLines.push({ type: 'output', text: `  ${c.command}` })
      }
      newLines.push({ type: 'output', text: '' })
      newLines.push({ type: 'output', text: 'Other commands: help, clear' })
    } else if (trimmed.toLowerCase() === 'clear') {
      setLines([])
      setInput('')
      return
    } else {
      const { output } = resolveCommand(trimmed)
      if (output !== undefined) {
        output.split('\n').forEach((line) => {
          newLines.push({ type: 'output', text: line })
        })
      } else {
        newLines.push({ type: 'error', text: `bash: ${trimmed.split(' ')[0]}: command not found or not available in this lab` })
        newLines.push({ type: 'output', text: 'Type "help" to see available commands.' })
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

  const doSubmit = useCallback(async () => {
    if (submitted || !lab) return
    setSubmitted(true)
    clearProgress()
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
          body: JSON.stringify({ selectedAnswer: selectedAnswer || '', correct, timeTaken }),
        })
      } catch {
        // Non-critical
      }
    }
  }, [submitted, lab, selectedAnswer, authFetch, user])

  const handlePauseAndExit = useCallback(() => {
    saveProgress({ lines, commandHistory, selectedAnswer, timeLeft })
    setRoute('skill-labs')
  }, [lines, commandHistory, selectedAnswer, timeLeft])

  const handleCancelLab = useCallback(() => {
    clearProgress()
    setRoute('skill-labs')
  }, [])

  return (
    <div className="flex flex-col h-full gap-4">
      {showConfirmModal && (
        <LabCompleteModal
          title={lab.title}
          timeTaken={lab.timeLimit - timeLeft}
          timed={timed}
          onConfirm={() => { setShowConfirmModal(false); doSubmit() }}
          onCancel={() => setShowConfirmModal(false)}
        />
      )}

      <LabHeader
        title={lab.title}
        timed={timed}
        timeLeft={timeLeft}
        subtitle={lab.scenario}
        labId={lab.id}
        onPauseChange={setLabPaused}
        onPauseAndExit={submitted ? undefined : handlePauseAndExit}
        onCancelLab={submitted ? undefined : handleCancelLab}
      />

      {resumeNotice && (
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
        {!submitted && (
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
            onClick={() => setShowConfirmModal(true)}
          >
            Submit Answer
          </button>
        ) : (
          <div className="space-y-3">
            <div className={`font-semibold text-sm ${isCorrect ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
              {isCorrect ? '✓ Correct!' : '✗ Incorrect'}
            </div>
            <div className="text-sm text-muted-foreground">{lab.explanation}</div>
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

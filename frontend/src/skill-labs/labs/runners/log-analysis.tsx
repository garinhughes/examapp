import { useState, useCallback, useEffect, useMemo } from 'react'
import { Search } from 'lucide-react'
import { useExam } from '@/exam/ExamContext'
import type { LogAnalysisLabDefinition } from '../../types'
import { LabHeader } from '../LabHeader'
import { useLabSession } from '../useLabSession'
import { LabCompleteModal } from '../LabCompleteModal'

interface LogAnalysisProgress {
  highlightedLines: number[]
  selectedAnswer: string | null
  timeLeft: number
}

interface Props {
  lab: LogAnalysisLabDefinition
  timed?: boolean
}

const LEVEL_COLORS: Record<string, string> = {
  ERROR: 'text-red-500',
  WARN: 'text-amber-500',
  INFO: 'text-blue-400',
  DEBUG: 'text-gray-400',
}

export function LogAnalysisRunner({ lab, timed = true }: Props) {
  const { setRoute } = useExam()
  const session = useLabSession<LogAnalysisProgress>({ lab, timed })

  const [searchTerm, setSearchTerm] = useState('')
  const [levelFilter, setLevelFilter] = useState<string | null>(null)
  const [highlightedLines, setHighlightedLines] = useState<Set<number>>(
    () => new Set(session.savedProgress?.highlightedLines ?? [])
  )
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(session.savedProgress?.selectedAnswer ?? null)
  const [isCorrect, setIsCorrect] = useState(false)

  useEffect(() => {
    if (session.submitted) return
    session.saveProgress({ highlightedLines: [...highlightedLines], selectedAnswer, timeLeft: session.timeLeft })
  }, [highlightedLines, selectedAnswer, session.timeLeft, session.submitted])

  useEffect(() => {
    if (timed && session.timeLeft === 0 && !session.submitted) doSubmit()
  }, [session.timeLeft])

  const filteredLogs = useMemo(() => {
    return lab.logs.filter((log) => {
      if (levelFilter && log.level !== levelFilter) return false
      if (searchTerm) {
        const term = searchTerm.toLowerCase()
        return (
          log.message.toLowerCase().includes(term) ||
          log.source.toLowerCase().includes(term) ||
          log.timestamp.toLowerCase().includes(term)
        )
      }
      return true
    })
  }, [lab.logs, searchTerm, levelFilter])

  const toggleHighlight = useCallback((idx: number) => {
    if (session.submitted) return
    setHighlightedLines((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }, [session.submitted])

  const doSubmit = useCallback(async () => {
    const correctAnswer = lab.answers.find((a) => a.correct)
    const correct = selectedAnswer === correctAnswer?.id
    setIsCorrect(correct)
    await session.finalize(correct, selectedAnswer || '')
  }, [lab, selectedAnswer, session.finalize])

  const levels = useMemo(() => [...new Set(lab.logs.map((l) => l.level))], [lab.logs])

  return (
    <div className="flex flex-col h-full gap-4">
      {session.showConfirmModal && (
        <LabCompleteModal title={lab.title} timeTaken={lab.timeLimit - session.timeLeft} timed={timed}
          onConfirm={() => { session.setShowConfirmModal(false); doSubmit() }}
          onCancel={() => session.setShowConfirmModal(false)} />
      )}
      <LabHeader title={lab.title} timed={timed} timeLeft={session.timeLeft} subtitle={lab.scenario} labId={lab.id}
        onPauseChange={session.setLabPaused}
        onPauseAndExit={session.submitted ? undefined : () => session.handlePauseAndExit({ highlightedLines: [...highlightedLines], selectedAnswer, timeLeft: session.timeLeft })}
        onCancelLab={session.submitted ? undefined : session.handleCancelLab} />
      {session.resumeNotice && (
        <div className="px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-300/50 text-amber-800 dark:text-amber-300 text-xs font-medium">
          Resuming from saved progress
        </div>
      )}

      {/* Search + filter bar */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search logs…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 p-0.5 rounded-md border border-border bg-card">
            <button
              onClick={() => setLevelFilter(null)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition ${!levelFilter ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              All
            </button>
            {levels.map((level) => (
              <button
                key={level}
                onClick={() => setLevelFilter(levelFilter === level ? null : level)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition ${levelFilter === level ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {level}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground">{filteredLogs.length}/{lab.logs.length} entries</span>
        </div>
      </div>

      {/* Log viewer */}
      <div className="flex-1 rounded-lg border border-border overflow-y-auto font-mono text-xs" style={{ background: '#1e1e1e' }}>
        <table className="w-full">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-700 sticky top-0" style={{ background: '#1e1e1e' }}>
              <th className="px-3 py-2 w-44">Timestamp</th>
              <th className="px-3 py-2 w-16">Level</th>
              <th className="px-3 py-2 w-32">Source</th>
              <th className="px-3 py-2">Message</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log, i) => {
              const globalIdx = lab.logs.indexOf(log)
              const isHighlighted = highlightedLines.has(globalIdx)
              return (
                <tr
                  key={i}
                  onClick={() => toggleHighlight(globalIdx)}
                  className={`cursor-pointer transition-colors ${isHighlighted ? 'bg-amber-500/20' : 'hover:bg-white/5'}`}
                >
                  <td className="px-3 py-1 text-gray-400">{log.timestamp}</td>
                  <td className={`px-3 py-1 font-bold ${LEVEL_COLORS[log.level] || 'text-gray-400'}`}>{log.level}</td>
                  <td className="px-3 py-1 text-gray-300">{log.source}</td>
                  <td className="px-3 py-1 text-gray-200">{log.message}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Answer section */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h3 className="font-semibold text-sm mb-3">What is the root cause?</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
          {lab.answers.map((answer) => {
            let cls = 'border border-border rounded-md px-4 py-2.5 text-sm text-left transition '
            if (session.submitted) {
              if (answer.correct) cls += 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400'
              else if (answer.id === selectedAnswer && !answer.correct) cls += 'border-destructive bg-destructive/10 text-destructive'
              else cls += 'bg-muted/30 text-muted-foreground'
            } else if (answer.id === selectedAnswer) {
              cls += 'border-primary bg-primary/10 text-primary'
            } else {
              cls += 'hover:bg-muted/50 cursor-pointer'
            }
            return (
              <button key={answer.id} className={cls} disabled={session.submitted} onClick={() => !session.submitted && setSelectedAnswer(answer.id)}>
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
            <div className="text-sm text-muted-foreground">{lab.explanation}</div>
            <button onClick={() => setRoute('skill-labs')} className="mt-2 px-4 py-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted/50 transition">
              Back to Skill Labs
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
